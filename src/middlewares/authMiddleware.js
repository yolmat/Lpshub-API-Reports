import { AUTH_COOKIE_NAME, getAuthSecurityConfig } from "../config/auth.js";
import authService from "../services/authService.js";
import AppError from "../utils/AppError.js";
import { verifyAuthToken } from "../utils/jwtUtils.js";

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

async function authenticate(req, res, next) {
    try {
        const { jwtSecret } = getAuthSecurityConfig();
        const token = getCookieValue(req.headers.cookie, AUTH_COOKIE_NAME);
        const payload = jwtSecret && token ? verifyAuthToken(token, jwtSecret) : null;

        if (!payload) {
            throw new AppError("Autenticação obrigatória.", 401, "UNAUTHENTICATED");
        }

        const user = await authService.getAuthenticatedUser(payload.sub);

        if (!user) {
            throw new AppError("Autenticação obrigatória.", 401, "UNAUTHENTICATED");
        }

        req.authenticatedUser = user;
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
