const AUTH_COOKIE_NAME = "lpshub_access_token";

function getAuthCookieConfig(env = process.env) {
    const isProduction = env.NODE_ENV === "production";

    return Object.freeze({
        name: AUTH_COOKIE_NAME,
        options: Object.freeze({
            httpOnly: true,
            secure: isProduction,
            sameSite: "lax",
            path: "/"
        })
    });
}

export { AUTH_COOKIE_NAME, getAuthCookieConfig };
