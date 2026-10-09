import { Router } from "express";
import { AUDITED_ROUTES } from "../config/auditRoutes.js";
import { listar } from "../controllers/filiaisController.js";

const router = Router();

router.get(AUDITED_ROUTES.BRANCHES.path, listar);

export default router;
