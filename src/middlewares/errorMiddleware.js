import AppError from "../utils/AppError.js";

function errorMiddleware(error, req, res, next) {
    if (res.headersSent) {
        return next(error);
    }

    const isAppError = error instanceof AppError;
    const statusCode = isAppError ? error.statusCode : 500;
    const code = isAppError ? error.code : "INTERNAL_ERROR";
    const message = isAppError
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
