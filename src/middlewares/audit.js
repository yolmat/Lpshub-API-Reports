import { performance } from "node:perf_hooks";

import logger from "../config/logger.js";
import auditService from "../services/auditService.js";
import { AUDIT_EVENTS } from "../utils/auditEvents.js";
import { getRequestContext } from "./requestContext.js";
import { getPathWithoutQuery } from "./requestLogger.js";

function createAuditMiddleware(service = auditService) {
    return function audit(req, res, next) {
        const startedAt = performance.now();

        res.once("finish", () => {
            const context = getRequestContext();
            const statusCode = res.statusCode;
            const durationMs = Number((performance.now() - startedAt).toFixed(2));

            void service.recordEvent({
                requestId: context.requestId,
                userId: context.userId,
                eventType: AUDIT_EVENTS.HTTP_REQUEST_COMPLETED,
                route: getPathWithoutQuery(req.originalUrl),
                method: req.method,
                success: statusCode < 400,
                statusCode,
                ipAddress: context.ip,
                metadata: {
                    durationMs,
                    errorCode: res.locals.errorCode,
                    errorSource: res.locals.errorSource,
                    statusCode
                }
            }).catch((error) => {
                logger.error({
                    err: error,
                    event: "AUDIT_PERSISTENCE_FAILED"
                }, "Não foi possível persistir o evento de auditoria.");
            });
        });

        return next();
    };
}

const audit = createAuditMiddleware();

export { createAuditMiddleware };
export default audit;
