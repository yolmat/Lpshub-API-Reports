import express from "express";
import extratosBancariosRoutes from "./extratosBancariosRoutes.js";
import filiaisRoutes from "./filiaisRoutes.js";

const router = express.Router();

router.get("/", (req, res) => {
    res.json({
        message: "API funcionando"
    });
});

router.use("/v1", filiaisRoutes);
router.use("/v1", extratosBancariosRoutes);

export default router;
