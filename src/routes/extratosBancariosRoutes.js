import { Router } from "express";
import { AUDITED_ROUTES } from "../config/auditRoutes.js";
import { listar } from "../controllers/extratosBancariosController.js";
import { authenticate } from "../middlewares/authMiddleware.js";
import validateRequest from "../middlewares/validateRequestMiddleware.js";
import {
    extratoBancarioBodySchema,
    protectedRouteHeadersSchema
} from "../validations/requestSchemas.js";

const router = Router();

router.post(
    AUDITED_ROUTES.BANK_STATEMENTS.path,
    validateRequest({
        headers: protectedRouteHeadersSchema,
        body: extratoBancarioBodySchema
    }),
    authenticate,
    listar
);

export default router;
