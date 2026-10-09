import * as auditRepository from "../repositories/auditRepository.js";
import {
    AUDIT_EVENTS,
    AUDIT_METADATA_ALLOW_LIST
} from "../utils/auditEvents.js";

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

function createAuditService(repository = auditRepository) {
    return {
        recordEvent(event) {
            if (!Object.values(AUDIT_EVENTS).includes(event.eventType)) {
                throw new TypeError("Tipo de evento de auditoria inválido.");
            }

            return repository.createAuditLog({
                requestId: event.requestId,
                userId: event.userId ?? null,
                eventType: event.eventType,
                route: event.route,
                method: event.method,
                success: event.success,
                statusCode: event.statusCode,
                ipAddress: event.ipAddress ?? null,
                metadata: filterMetadata(event.eventType, event.metadata),
                createdAt: new Date()
            });
        }
    };
}

const auditService = createAuditService();

export { createAuditService, filterMetadata };
export default auditService;
