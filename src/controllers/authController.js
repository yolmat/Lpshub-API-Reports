import { getAuthCookieConfig } from "../config/auth.js";
import authService from "../services/authService.js";

async function register(req, res, next) {
    try {
        const user = await authService.registerUser(req.validated.body);

        return res.status(201).json({ success: true, data: user });
    } catch (error) {
        return next(error);
    }
}

async function login(req, res, next) {
    try {
        const { token, user } = await authService.loginUser(req.validated.body);
        const { name, options } = getAuthCookieConfig();

        res.cookie(name, token, options);
        return res.status(200).json({ success: true, data: user });
    } catch (error) {
        return next(error);
    }
}

async function resetPassword(req, res, next) {
    try {
        const user = await authService.resetUserPassword(req.validated.body);

        return res.status(200).json({ success: true, data: user });
    } catch (error) {
        return next(error);
    }
}

export { login, register, resetPassword };
