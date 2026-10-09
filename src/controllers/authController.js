import { getAuthCookieClearConfig, getAuthCookieConfig } from "../config/auth.js";
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

async function getCurrentUser(req, res, next) {
    try {
        const { id, login, email } = req.authenticatedUser;

        return res.status(200).json({
            success: true,
            data: { id, login, email }
        });
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

async function listUsers(req, res, next) {
    try {
        const users = await authService.listUsers();

        return res.status(200).json({ success: true, data: users });
    } catch (error) {
        return next(error);
    }
}

async function logout(req, res, next) {
    try {
        await authService.logoutUser({
            sessionId: req.authenticatedSessionId
        });
        const { name, options } = getAuthCookieClearConfig();

        res.clearCookie(name, options);

        return res.status(200).json({ success: true });
    } catch (error) {
        return next(error);
    }
}

async function deactivateUser(req, res, next) {
    try {
        const user = await authService.deactivateUser(req.validated.body);

        if (user.id === req.authenticatedUser.id) {
            const { name, options } = getAuthCookieClearConfig();

            res.clearCookie(name, options);
        }

        return res.status(200).json({ success: true, data: user });
    } catch (error) {
        return next(error);
    }
}

export {
    deactivateUser,
    getCurrentUser,
    listUsers,
    login,
    logout,
    register,
    resetPassword
};
