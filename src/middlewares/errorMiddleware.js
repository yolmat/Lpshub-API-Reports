import AppError from "../utils/AppError.js";

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
