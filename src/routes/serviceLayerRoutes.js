import { Router } from "express";

import { AUDITED_ROUTES } from "../config/auditRoutes.js";
import { verificarConexao } from "../controllers/serviceLayerController.js";
import { authenticate } from "../middlewares/authMiddleware.js";
import validateRequest from "../middlewares/validateRequestMiddleware.js";
import { protectedRouteHeadersSchema } from "../validations/requestSchemas.js";

const router = Router();

router.get(
    AUDITED_ROUTES.SERVICE_LAYER.path,
    validateRequest({ headers: protectedRouteHeadersSchema }),
    authenticate,
    verificarConexao
);

export default router;
