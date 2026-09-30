import { Router } from "express";

import { login, register, resetPassword } from "../controllers/authController.js";
import { authenticate, requireAdmin } from "../middlewares/authMiddleware.js";
import validateRequest from "../middlewares/validateRequestMiddleware.js";
import {
    authLoginBodySchema,
    authPasswordResetBodySchema,
    authRegisterBodySchema,
    protectedRouteHeadersSchema
} from "../validations/requestSchemas.js";

const router = Router();

router.post("/auth/login", validateRequest({ body: authLoginBodySchema }), login);
router.post(
    "/auth/register",
    validateRequest({ headers: protectedRouteHeadersSchema, body: authRegisterBodySchema }),
    authenticate,
    requireAdmin,
    register
);
router.post(
    "/auth/password-reset",
    validateRequest({ headers: protectedRouteHeadersSchema, body: authPasswordResetBodySchema }),
    authenticate,
    requireAdmin,
    resetPassword
);

export default router;
