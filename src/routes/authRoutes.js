import { Router } from "express";

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

    router.post("/auth/login", rateLimiters.login, validateRequest({ body: authLoginBodySchema }), login);
    router.post(
        "/auth/logout",
        validateRequest({ headers: protectedRouteHeadersSchema, body: authLogoutBodySchema }),
        authenticate,
        logout
    );
    router.post(
        "/auth/register",
        rateLimiters.register,
        validateRequest({ headers: protectedRouteHeadersSchema, body: authRegisterBodySchema }),
        authenticate,
        requireAdmin,
        register
    );
    router.post(
        "/auth/password-reset",
        rateLimiters.passwordReset,
        validateRequest({ headers: protectedRouteHeadersSchema, body: authPasswordResetBodySchema }),
        authenticate,
        requireAdmin,
        resetPassword
    );
    router.post(
        "/auth/deactivate",
        validateRequest({ headers: protectedRouteHeadersSchema, body: authDeactivateUserBodySchema }),
        authenticate,
        requireAdmin,
        deactivateUser
    );

    return router;
}

export default createAuthRoutes;
