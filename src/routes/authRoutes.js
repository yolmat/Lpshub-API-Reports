import { Router } from "express";

import { login, register, resetPassword } from "../controllers/authController.js";
import { authenticate, requireAdmin } from "../middlewares/authMiddleware.js";

const router = Router();

router.post("/auth/login", login);
router.post("/auth/register", authenticate, requireAdmin, register);
router.post("/auth/password-reset", authenticate, requireAdmin, resetPassword);

export default router;
