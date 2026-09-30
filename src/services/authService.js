import {
    AUTH_SESSION_ABSOLUTE_TIMEOUT_MS,
    AUTH_SESSION_INACTIVITY_TIMEOUT_MS,
    AUTH_TOKEN_EXPIRATION_SECONDS,
    getAuthSecurityConfig
} from "../config/auth.js";
import { randomUUID } from "node:crypto";
import * as defaultUserRepository from "../repository/userRepository.js";
import AppError from "../utils/AppError.js";
import { createAuthToken } from "../utils/jwtUtils.js";
import { hashPassword, verifyPassword } from "../utils/passwordUtils.js";

function getEmail(email) {
    if (typeof email !== "string") {
        throw new AppError("O campo EMAIL é obrigatório.", 400, "INVALID_EMAIL");
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        throw new AppError("O campo EMAIL é inválido.", 400, "INVALID_EMAIL");
    }

    return normalizedEmail;
}

function getPassword(password, fieldName = "SENHA") {
    if (typeof password !== "string" || password.length === 0) {
        throw new AppError(
            `O campo ${fieldName} é obrigatório.`,
            400,
            "INVALID_PASSWORD"
        );
    }

    return password;
}

function getLogin(login) {
    if (typeof login !== "string" || !login.trim()) {
        throw new AppError("O campo LOGIN é obrigatório.", 400, "INVALID_LOGIN");
    }

    return login.trim();
}

function toPublicUser(user) {
    return {
        id: user.id,
        login: user.login,
        email: user.email,
        status: user.status,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
    };
}

function createAuthService({
    userRepository = defaultUserRepository,
    getSecurityConfig = getAuthSecurityConfig,
    createSessionId = randomUUID,
    now = () => new Date()
} = {}) {
    function getJwtSecret() {
        const { jwtSecret } = getSecurityConfig();

        if (!jwtSecret || jwtSecret.length < 32) {
            throw new AppError(
                "A configuração de autenticação está incompleta.",
                500,
                "AUTH_CONFIGURATION_ERROR"
            );
        }

        return jwtSecret;
    }

    async function registerUser({ login, email, senha }) {
        const userLogin = getLogin(login);
        const normalizedEmail = getEmail(email);
        const passwordHash = await hashPassword(getPassword(senha));

        try {
            const user = await userRepository.createUser({
                login: userLogin,
                email: normalizedEmail,
                passwordHash,
                status: true,
                role: "USER"
            });

            return toPublicUser(user);
        } catch (error) {
            if (error.code === "P2002") {
                throw new AppError(
                    "Já existe um usuário com este login ou email.",
                    409,
                    "USER_ALREADY_EXISTS"
                );
            }

            throw error;
        }
    }

    async function loginUser({ login, senha }) {
        const userLogin = getLogin(login);
        const password = getPassword(senha);
        const user = await userRepository.findUserByLogin(userLogin);
        const isValidPassword = user
            ? await verifyPassword(password, user.passwordHash)
            : false;

        if (!user || !user.status || !isValidPassword) {
            throw new AppError(
                "Login ou senha inválidos.",
                401,
                "INVALID_CREDENTIALS"
            );
        }

        const sessionCreationDate = now();
        const session = await userRepository.createUserSession({
            id: createSessionId(),
            userId: user.id,
            createdAt: sessionCreationDate,
            lastActivityAt: sessionCreationDate
        });
        const token = createAuthToken(
            user,
            getJwtSecret(),
            AUTH_TOKEN_EXPIRATION_SECONDS,
            session.id
        );

        return { token, user: toPublicUser(user) };
    }

    async function resetUserPassword({ login, email }) {
        const user = await userRepository.findUserByLoginAndEmail(
            getLogin(login),
            getEmail(email)
        );

        if (!user) {
            throw new AppError("Usuário não encontrado.", 404, "USER_NOT_FOUND");
        }

        const { passwordResetDefault } = getSecurityConfig();
        const passwordHash = await hashPassword(
            getPassword(passwordResetDefault, "PASSWORD_RESET_DEFAULT")
        );
        const updatedUser = await userRepository.updateUserPassword(user.id, passwordHash);

        return toPublicUser(updatedUser);
    }

    async function logoutUser({ login, authenticatedUser, sessionId }) {
        const userLogin = getLogin(login);

        if (userLogin !== authenticatedUser.login) {
            throw new AppError(
                "Você só pode encerrar a própria sessão.",
                403,
                "FORBIDDEN"
            );
        }

        await userRepository.deleteUserSession(sessionId);
    }

    async function getAuthenticatedUser(id, sessionId) {
        const [user, session] = await Promise.all([
            userRepository.findUserById(id),
            userRepository.findUserSessionById(sessionId)
        ]);

        if (!user || !user.status || !session || session.userId !== user.id) {
            return null;
        }

        const currentDate = now();
        const elapsedMilliseconds = currentDate.getTime() - session.lastActivityAt.getTime();
        const sessionAgeMilliseconds = currentDate.getTime() - session.createdAt.getTime();

        if (
            elapsedMilliseconds >= AUTH_SESSION_INACTIVITY_TIMEOUT_MS
            || sessionAgeMilliseconds >= AUTH_SESSION_ABSOLUTE_TIMEOUT_MS
        ) {
            await userRepository.deleteUserSession(session.id);
            return null;
        }

        await userRepository.updateUserSessionActivity(session.id, currentDate);
        return user;
    }

    return {
        getAuthenticatedUser,
        loginUser,
        logoutUser,
        registerUser,
        resetUserPassword
    };
}

const authService = createAuthService();

export { createAuthService };
export default authService;
