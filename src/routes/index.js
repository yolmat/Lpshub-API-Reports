import express from "express";
import { AUDITED_ROUTES } from "../config/auditRoutes.js";
import createAuthRoutes from "./authRoutes.js";
import extratosBancariosRoutes from "./extratosBancariosRoutes.js";
import filiaisRoutes from "./filiaisRoutes.js";
import serviceLayerRoutes from "./serviceLayerRoutes.js";

function createRoutes(rateLimiters) {
    const router = express.Router();

    router.get(AUDITED_ROUTES.API_STATUS.path, (req, res) => {
        res.json({
            message: "API funcionando"
        });
    });

    router.use("/v1", filiaisRoutes);
    router.use("/v1", extratosBancariosRoutes);
    router.use("/v1", serviceLayerRoutes);
    router.use("/v1", createAuthRoutes(rateLimiters));

    return router;
}

export default createRoutes;
