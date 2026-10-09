import AppError from "../utils/AppError.js";
import auditService from "../services/auditService.js";
import {
    AUDIT_ACTIONS,
    AUDIT_EVENTS,
    AUDIT_TARGET_SYSTEMS
} from "../utils/auditEvents.js";

function registerAuditError(error, code) {
    const currentEvent = auditService.getRequestEvent();
    let event = currentEvent ?? {
        eventType: AUDIT_EVENTS.HTTP_REQUEST_COMPLETED,
        action: AUDIT_ACTIONS.HTTP_REQUEST,
        targetSystem: AUDIT_TARGET_SYSTEMS.APPLICATION
    };

    if (code.startsWith("SAP_")) {
        event = {
            ...event,
            eventType: AUDIT_EVENTS.EXTERNAL_API_ERROR,
            action: currentEvent?.action ?? AUDIT_ACTIONS.EXTERNAL_API_CALL,
            targetSystem: AUDIT_TARGET_SYSTEMS.SAP_B1
        };
    } else if (
        ["FORBIDDEN", "UNAUTHENTICATED"].includes(code)
        && ![
            AUDIT_EVENTS.AUTH_SESSION_EXPIRED,
            AUDIT_EVENTS.ACCESS_DENIED
        ].includes(currentEvent?.eventType)
    ) {
        event = {
            ...event,
            eventType: AUDIT_EVENTS.ACCESS_DENIED,
            action: AUDIT_ACTIONS.AUTHORIZE_ACCESS,
            targetSystem: AUDIT_TARGET_SYSTEMS.APPLICATION,
            metadata: {
                ...(event.metadata ?? {}),
                reason: code
            }
        };
    } else if (["INVALID_REQUEST", "INVALID_JSON"].includes(code)) {
        event = {
            ...event,
            eventType: AUDIT_EVENTS.VALIDATION_FAILED,
            action: AUDIT_ACTIONS.VALIDATE_REQUEST,
            targetSystem: AUDIT_TARGET_SYSTEMS.APPLICATION,
            metadata: {
                ...(event.metadata ?? {}),
                issueCount: Array.isArray(error.details) ? error.details.length : 1
            }
        };
    }

    auditService.registerRequestEvent({
        ...event,
        errorCode: currentEvent?.errorCode ?? code
    });
}

function errorMiddleware(error, req, res, next) {
    if (res.headersSent) {
        return next(error);
    }

    const isPayloadTooLarge = error.type === "entity.too.large";
    const isMalformedJson = error instanceof SyntaxError && error.type === "entity.parse.failed";
    const isAppError = error instanceof AppError;
    const statusCode = isPayloadTooLarge
        ? 413
        : isMalformedJson
            ? 400
            : isAppError
                ? error.statusCode
                : 500;
    const code = isPayloadTooLarge
        ? "PAYLOAD_TOO_LARGE"
        : isMalformedJson
            ? "INVALID_JSON"
            : isAppError
                ? error.code
                : "INTERNAL_ERROR";
    const message = isPayloadTooLarge
        ? "O corpo da requisição excede o tamanho permitido."
        : isMalformedJson
            ? "O corpo da requisição deve conter um JSON válido."
            : isAppError
                ? error.message
                : "Ocorreu um erro interno ao processar a solicitação.";
    const errorSource = code.startsWith("SAP_") ? "sap" : "application";

    res.locals.errorCode = code;
    res.locals.errorSource = errorSource;
    registerAuditError(error, code);

    const logData = {
        err: error,
        event: "HTTP_REQUEST_ERROR",
        errorCode: code,
        errorSource,
        method: req.method,
        route: req.path,
        statusCode
    };

    if (statusCode >= 500) {
        req.log?.error(logData, "Erro ao processar a requisição.");
    } else {
        req.log?.warn(logData, "Requisição rejeitada.");
    }

    const errorResponse = {
        success: false,
        error: {
            code,
            message
        }
    };

    if (isAppError && error.details) {
        errorResponse.error.details = error.details;
    }

    return res.status(statusCode).json(errorResponse);
}

export default errorMiddleware;
