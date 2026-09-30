const AUTH_COOKIE_NAME = "lpshub_access_token";
const AUTH_TOKEN_EXPIRATION_SECONDS = 8 * 60 * 60;
const AUTH_SESSION_INACTIVITY_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const AUTH_SESSION_ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000;

function getAuthCookieConfig(env = process.env) {
    const isProduction = env.NODE_ENV === "production";

    return Object.freeze({
        name: AUTH_COOKIE_NAME,
        options: Object.freeze({
            httpOnly: true,
            secure: isProduction,
            sameSite: "strict",
            path: "/",
            maxAge: AUTH_TOKEN_EXPIRATION_SECONDS * 1000
        })
    });
}

function getAuthSecurityConfig(env = process.env) {
    return Object.freeze({
        jwtSecret: env.JWT_SECRET?.trim(),
        passwordResetDefault: env.PASSWORD_RESET_DEFAULT
    });
}

export {
    AUTH_COOKIE_NAME,
    AUTH_SESSION_ABSOLUTE_TIMEOUT_MS,
    AUTH_SESSION_INACTIVITY_TIMEOUT_MS,
    AUTH_TOKEN_EXPIRATION_SECONDS,
    getAuthCookieConfig,
    getAuthSecurityConfig
};
