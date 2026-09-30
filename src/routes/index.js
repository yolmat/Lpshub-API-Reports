import express from "express";
import createAuthRoutes from "./authRoutes.js";
import extratosBancariosRoutes from "./extratosBancariosRoutes.js";
import filiaisRoutes from "./filiaisRoutes.js";

function createRoutes(rateLimiters) {
    const router = express.Router();

    router.get("/", (req, res) => {
        res.json({
            message: "API funcionando"
        });
    });

    router.use("/v1", filiaisRoutes);
    router.use("/v1", extratosBancariosRoutes);
    router.use("/v1", createAuthRoutes(rateLimiters));

    return router;
}

export default createRoutes;
