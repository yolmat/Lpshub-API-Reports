import { Router } from "express";
import { AUDITED_ROUTES } from "../config/auditRoutes.js";
import { listar } from "../controllers/extratosBancariosController.js";
import validateRequest from "../middlewares/validateRequestMiddleware.js";
import { extratoBancarioBodySchema } from "../validations/requestSchemas.js";

const router = Router();

router.post(
    AUDITED_ROUTES.BANK_STATEMENTS.path,
    validateRequest({ body: extratoBancarioBodySchema }),
    listar
);

export default router;
