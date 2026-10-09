import { Router } from "express";
import { AUDITED_ROUTES } from "../config/auditRoutes.js";
import { listar } from "../controllers/filiaisController.js";
import { authenticate } from "../middlewares/authMiddleware.js";
import validateRequest from "../middlewares/validateRequestMiddleware.js";
import { protectedRouteHeadersSchema } from "../validations/requestSchemas.js";

const router = Router();

router.get(
    AUDITED_ROUTES.BRANCHES.path,
    validateRequest({ headers: protectedRouteHeadersSchema }),
    authenticate,
    listar
);

export default router;
