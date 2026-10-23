import { Router } from "express";
import { AUDITED_ROUTES } from "../config/auditRoutes.js";
import { consultar } from "../controllers/fbl5nController.js";
import { authenticate } from "../middlewares/authMiddleware.js";
import validateRequest from "../middlewares/validateRequestMiddleware.js";
import {
    fbl5nBodySchema,
    protectedRouteHeadersSchema
} from "../validations/requestSchemas.js";

const router = Router();

router.post(
    AUDITED_ROUTES.FBL5N.path,
    validateRequest({
        headers: protectedRouteHeadersSchema,
        body: fbl5nBodySchema
    }),
    authenticate,
    consultar
);

export default router;
