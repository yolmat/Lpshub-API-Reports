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

    return res.status(statusCode).json({
        success: false,
        error: {
            code,
            message
        }
    });
}

export default errorMiddleware;
