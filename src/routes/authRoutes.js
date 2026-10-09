import { Router } from "express";

import { AUDITED_ROUTES } from "../config/auditRoutes.js";
import { deactivateUser, login, logout, register, resetPassword } from "../controllers/authController.js";
import { authenticate, requireAdmin } from "../middlewares/authMiddleware.js";
import validateRequest from "../middlewares/validateRequestMiddleware.js";
import {
    authDeactivateUserBodySchema,
    authLoginBodySchema,
    authLogoutBodySchema,
    authPasswordResetBodySchema,
    authRegisterBodySchema,
    protectedRouteHeadersSchema
} from "../validations/requestSchemas.js";

function createAuthRoutes(rateLimiters) {
    const router = Router();

    router.post(
        AUDITED_ROUTES.AUTH_LOGIN.path,
        rateLimiters.login,
        validateRequest({ body: authLoginBodySchema }),
        login
    );
    router.post(
        AUDITED_ROUTES.AUTH_LOGOUT.path,
        validateRequest({ headers: protectedRouteHeadersSchema, body: authLogoutBodySchema }),
        authenticate,
        logout
    );
    router.post(
        AUDITED_ROUTES.AUTH_REGISTER.path,
        rateLimiters.register,
        validateRequest({ headers: protectedRouteHeadersSchema, body: authRegisterBodySchema }),
        authenticate,
        requireAdmin,
        register
    );
    router.post(
        AUDITED_ROUTES.AUTH_PASSWORD_RESET.path,
        rateLimiters.passwordReset,
        validateRequest({ headers: protectedRouteHeadersSchema, body: authPasswordResetBodySchema }),
        authenticate,
        requireAdmin,
        resetPassword
    );
    router.post(
        AUDITED_ROUTES.AUTH_DEACTIVATE.path,
        validateRequest({ headers: protectedRouteHeadersSchema, body: authDeactivateUserBodySchema }),
        authenticate,
        requireAdmin,
        deactivateUser
    );

    return router;
}

export default createAuthRoutes;
