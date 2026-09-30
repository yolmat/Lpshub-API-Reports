import { Router } from "express";
import { listar } from "../controllers/extratosBancariosController.js";
import validateRequest from "../middlewares/validateRequestMiddleware.js";
import { extratoBancarioBodySchema } from "../validations/requestSchemas.js";

const router = Router();

router.post("/extratos-bancarios", validateRequest({ body: extratoBancarioBodySchema }), listar);

export default router;
