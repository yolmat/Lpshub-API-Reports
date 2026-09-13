import { Router } from "express";
import { listar } from "../controllers/extratosBancariosController.js";
import validateExtratoBancario from "../middlewares/validateExtratoBancarioMiddleware.js";

const router = Router();

router.post("/extratos-bancarios", validateExtratoBancario, listar);

export default router;
