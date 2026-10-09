import { createHash } from "node:crypto";

import {
    getRequestContext,
    updateRequestContext
} from "../middlewares/requestContext.js";
import * as auditRepository from "../repositories/auditRepository.js";
import {
    AUDIT_ACTIONS,
    AUDIT_EVENTS,
    AUDIT_METADATA_ALLOW_LIST,
    AUDIT_TARGET_SYSTEMS
} from "../utils/auditEvents.js";

const EVENT_TYPES = new Set(Object.values(AUDIT_EVENTS));
const ACTIONS = new Set(Object.values(AUDIT_ACTIONS));
const TARGET_SYSTEMS = new Set(Object.values(AUDIT_TARGET_SYSTEMS));

function filterMetadata(eventType, metadata = {}) {
    const allowedFields = AUDIT_METADATA_ALLOW_LIST[eventType] ?? [];
    const isSafeValue = (value) => (
        value === null
        || ["boolean", "number", "string"].includes(typeof value)
    );

    return Object.fromEntries(
        allowedFields
            .filter((field) => (
                metadata[field] !== undefined && isSafeValue(metadata[field])
            ))
            .map((field) => [field, metadata[field]])
    );
}

function createSessionReference(sessionId) {
    if (!sessionId) {
        return null;
    }

    return createHash("sha256").update(sessionId).digest("hex");
}

function normalizeText(value, maximumLength) {
    return typeof value === "string"
        ? value.slice(0, maximumLength)
        : null;
}

function validateEventDefinition(event) {
    if (!EVENT_TYPES.has(event.eventType)) {
        throw new TypeError("Tipo de evento de auditoria inválido.");
    }

    if (!ACTIONS.has(event.action)) {
        throw new TypeError("Ação de auditoria inválida.");
    }

    if (!TARGET_SYSTEMS.has(event.targetSystem)) {
        throw new TypeError("Sistema de destino da auditoria inválido.");
    }
}

function createAuditService(repository = auditRepository) {
    function registerRequestEvent(event) {
        validateEventDefinition(event);
        const context = getRequestContext();

        if (!context.requestId) {
            return;
        }

        context.auditEvent = {
            ...(context.auditEvent ?? {}),
            ...event,
            metadata: {
                ...(context.auditEvent?.metadata ?? {}),
                ...(event.metadata ?? {})
            }
        };
    }

    function setRequestActor({ userId, username, sessionId }) {
        updateRequestContext({ userId, sessionId });
        const context = getRequestContext();

        if (context.requestId) {
            context.auditUsername = normalizeText(username, 100);
        }
    }

    function getRequestEvent() {
        return getRequestContext().auditEvent ?? null;
    }

    function recordEvent(event) {
        validateEventDefinition(event);

        return repository.createAuditLog({
            requestId: event.requestId,
            userId: event.userId ?? null,
            username: normalizeText(event.username, 100),
            ipAddress: normalizeText(event.ipAddress, 64),
            userAgent: normalizeText(event.userAgent, 512),
            eventType: event.eventType,
            method: normalizeText(event.method, 10),
            route: normalizeText(event.route, 255),
            action: event.action,
            targetSystem: event.targetSystem,
            statusCode: event.statusCode,
            success: event.success,
            durationMs: Math.max(0, Math.round(event.durationMs)),
            responseCount: Number.isSafeInteger(event.responseCount)
                ? Math.max(0, event.responseCount)
                : null,
            errorCode: normalizeText(event.errorCode, 100),
            sessionReference: createSessionReference(event.sessionId),
            metadata: filterMetadata(event.eventType, event.metadata),
            createdAt: new Date()
        });
    }

    return {
        getRequestEvent,
        recordEvent,
        registerRequestEvent,
        setRequestActor
    };
}

const auditService = createAuditService();

export {
    createAuditService,
    createSessionReference,
    filterMetadata
};
export default auditService;
