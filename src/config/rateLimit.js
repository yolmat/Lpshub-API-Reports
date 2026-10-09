import rateLimit from "express-rate-limit";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const GLOBAL_RATE_LIMIT = 50;
const AUTH_RATE_LIMIT = 15;
const PASSWORD_RESET_RATE_LIMIT = 5;

function createRateLimiter(limit) {
    return rateLimit({
        windowMs: RATE_LIMIT_WINDOW_MS,
        limit,
        standardHeaders: true,
        legacyHeaders: false,
        handler(req, res) {
            res.locals.errorCode = "RATE_LIMIT_EXCEEDED";
            res.locals.errorSource = "application";
            res.status(429).json({
                success: false,
                error: {
                    code: "RATE_LIMIT_EXCEEDED",
                    message: "Limite de requisições excedido. Tente novamente em instantes."
                }
            });
        }
    });
}

function createRateLimiters() {
    return Object.freeze({
        global: createRateLimiter(GLOBAL_RATE_LIMIT),
        login: createRateLimiter(AUTH_RATE_LIMIT),
        register: createRateLimiter(AUTH_RATE_LIMIT),
        passwordReset: createRateLimiter(PASSWORD_RESET_RATE_LIMIT)
    });
}

export {
    AUTH_RATE_LIMIT,
    GLOBAL_RATE_LIMIT,
    PASSWORD_RESET_RATE_LIMIT,
    RATE_LIMIT_WINDOW_MS,
    createRateLimiters
};
