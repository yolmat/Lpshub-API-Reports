import { performance } from "node:perf_hooks";

import { findAuditedRoute } from "../config/auditRoutes.js";
import logger from "../config/logger.js";
import auditService from "../services/auditService.js";
import {
    AUDIT_ACTIONS,
    AUDIT_EVENTS,
    AUDIT_TARGET_SYSTEMS
} from "../utils/auditEvents.js";
import { getRequestContext } from "./requestContext.js";
import { getPathWithoutQuery } from "./requestLogger.js";

const FIRE_AND_FORGET_ROUTES = new Set([
    "/api/v1/auth/login",
    "/api/v1/auth/logout"
]);

function getChunkSize(chunk, encoding) {
    if (chunk === null || chunk === undefined) {
        return 0;
    }

    if (Buffer.isBuffer(chunk)) {
        return chunk.length;
    }

    if (typeof chunk === "string") {
        return Buffer.byteLength(chunk, encoding);
    }

    return ArrayBuffer.isView(chunk) ? chunk.byteLength : 0;
}

function createAuditMiddleware(service = auditService) {
    return function audit(req, res, next) {
        const startedAt = performance.now();
        const requestPath = getPathWithoutQuery(req.originalUrl);
        const auditedRoute = findAuditedRoute(req.method, requestPath);

        if (auditedRoute) {
            service.registerRequestEvent?.(auditedRoute.audit);
        }

        const originalWrite = res.write.bind(res);
        const originalEnd = res.end.bind(res);
        let responseSizeBytes = 0;
        let auditStarted = false;

        res.write = function auditedWrite(chunk, encoding, callback) {
            const selectedEncoding = typeof encoding === "string" ? encoding : undefined;
            const selectedCallback = typeof encoding === "function" ? encoding : callback;

            responseSizeBytes += getChunkSize(chunk, selectedEncoding);
            return originalWrite(chunk, selectedEncoding, selectedCallback);
        };

        res.end = function auditedEnd(chunk, encoding, callback) {
            if (auditStarted) {
                return res;
            }

            auditStarted = true;
            const selectedEncoding = typeof encoding === "string" ? encoding : undefined;
            const selectedCallback = typeof encoding === "function" ? encoding : callback;

            responseSizeBytes += getChunkSize(chunk, selectedEncoding);

            const context = getRequestContext();
            const registeredEvent = service.getRequestEvent?.() ?? null;
            const route = requestPath;
            const event = {
                requestId: context.requestId,
                userId: registeredEvent?.userId ?? context.userId,
                username: registeredEvent?.username
                    ?? context.auditUsername
                    ?? req.authenticatedUser?.login,
                ipAddress: context.ip,
                userAgent: req.headers["user-agent"],
                eventType: registeredEvent?.eventType
                    ?? AUDIT_EVENTS.HTTP_REQUEST_COMPLETED,
                method: req.method,
                route,
                action: registeredEvent?.action ?? AUDIT_ACTIONS.HTTP_REQUEST,
                targetSystem: registeredEvent?.targetSystem
                    ?? AUDIT_TARGET_SYSTEMS.APPLICATION,
                statusCode: res.statusCode,
                success: res.statusCode < 400,
                durationMs: performance.now() - startedAt,
                responseCount: registeredEvent?.responseCount,
                errorCode: res.locals.errorCode ?? registeredEvent?.errorCode,
                sessionId: registeredEvent?.sessionId ?? context.sessionId,
                metadata: {
                    ...(registeredEvent?.metadata ?? {}),
                    responseSizeBytes
                }
            };
            const persistAudit = Promise.resolve()
                .then(() => service.recordEvent(event));
            const finishResponse = () => originalEnd(
                chunk,
                selectedEncoding,
                selectedCallback
            );
            const handlePersistenceError = (error) => {
                logger.error({
                    err: error,
                    event: "AUDIT_PERSISTENCE_FAILED"
                }, "Não foi possível persistir o evento de auditoria.");
            };

            if (FIRE_AND_FORGET_ROUTES.has(route)) {
                const result = finishResponse();
                void persistAudit.catch(handlePersistenceError);
                return result;
            }

            void persistAudit
                .catch(handlePersistenceError)
                .finally(finishResponse);

            return res;
        };

        return next();
    };
}

const audit = createAuditMiddleware();

export { createAuditMiddleware, FIRE_AND_FORGET_ROUTES, getChunkSize };
export default audit;
