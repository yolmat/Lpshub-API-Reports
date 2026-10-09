import {
    AUTH_COOKIE_NAME,
    getAuthCookieClearConfig,
    getAuthSecurityConfig
} from "../config/auth.js";
import authService from "../services/authService.js";
import AppError from "../utils/AppError.js";
import { verifyAuthToken } from "../utils/jwtUtils.js";
import { updateRequestContext } from "./requestContext.js";

function getCookieValue(cookieHeader, name) {
    if (!cookieHeader) {
        return null;
    }

    const cookie = cookieHeader
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`));

    if (!cookie) {
        return null;
    }

    try {
        return decodeURIComponent(cookie.slice(name.length + 1));
    } catch {
        return null;
    }
}

function clearAuthCookie(res) {
    const { name, options } = getAuthCookieClearConfig();

    res.clearCookie(name, options);
}

async function authenticate(req, res, next) {
    try {
        const { jwtSecret } = getAuthSecurityConfig();
        const token = getCookieValue(req.headers.cookie, AUTH_COOKIE_NAME);
        const payload = jwtSecret && token ? verifyAuthToken(token, jwtSecret) : null;

        if (!payload) {
            throw new AppError("Autenticação obrigatória.", 401, "UNAUTHENTICATED");
        }

        const user = await authService.getAuthenticatedUser(payload.sub, payload.sid);

        if (!user) {
            clearAuthCookie(res);
            throw new AppError("Autenticação obrigatória.", 401, "UNAUTHENTICATED");
        }

        req.authenticatedUser = user;
        req.authenticatedSessionId = payload.sid;
        updateRequestContext({
            userId: user.id,
            sessionId: payload.sid
        });
        return next();
    } catch (error) {
        return next(error);
    }
}

function requireAdmin(req, res, next) {
    if (req.authenticatedUser?.role !== "ADM") {
        return next(new AppError("Acesso restrito a administradores.", 403, "FORBIDDEN"));
    }

    return next();
}

export { authenticate, requireAdmin };
