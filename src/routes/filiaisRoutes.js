import { Router } from "express";
import { listar } from "../controllers/filiaisController.js";

const router = Router();

router.get("/filiais", listar);

export default router;
