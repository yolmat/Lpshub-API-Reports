import {
    AUTH_SESSION_ABSOLUTE_TIMEOUT_MS,
    AUTH_SESSION_INACTIVITY_TIMEOUT_MS,
    AUTH_TOKEN_EXPIRATION_SECONDS,
    getAuthSecurityConfig
} from "../config/auth.js";
import { randomUUID } from "node:crypto";
import * as defaultUserRepository from "../repositories/userRepository.js";
import defaultAuditService from "./auditService.js";
import AppError from "../utils/AppError.js";
import {
    AUDIT_ACTIONS,
    AUDIT_EVENTS,
    AUDIT_TARGET_SYSTEMS
} from "../utils/auditEvents.js";
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
    auditService = defaultAuditService,
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

            auditService.registerRequestEvent({
                eventType: AUDIT_EVENTS.USER_CREATED,
                action: AUDIT_ACTIONS.CREATE_USER,
                targetSystem: AUDIT_TARGET_SYSTEMS.POSTGRESQL,
                metadata: {
                    targetUserId: user.id,
                    targetUsername: user.login
                }
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
            auditService.registerRequestEvent({
                eventType: AUDIT_EVENTS.AUTH_LOGIN_FAILED,
                action: AUDIT_ACTIONS.AUTHENTICATE,
                targetSystem: AUDIT_TARGET_SYSTEMS.APPLICATION,
                username: userLogin,
                errorCode: "INVALID_CREDENTIALS",
                metadata: { reason: "INVALID_CREDENTIALS" }
            });
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

        auditService.setRequestActor({
            userId: user.id,
            username: user.login,
            sessionId: session.id
        });
        auditService.registerRequestEvent({
            eventType: AUDIT_EVENTS.AUTH_LOGIN_SUCCESS,
            action: AUDIT_ACTIONS.AUTHENTICATE,
            targetSystem: AUDIT_TARGET_SYSTEMS.APPLICATION
        });

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

        auditService.registerRequestEvent({
            eventType: AUDIT_EVENTS.USER_UPDATED,
            action: AUDIT_ACTIONS.RESET_USER_PASSWORD,
            targetSystem: AUDIT_TARGET_SYSTEMS.POSTGRESQL,
            metadata: {
                targetUserId: updatedUser.id,
                targetUsername: updatedUser.login
            }
        });

        return toPublicUser(updatedUser);
    }

    async function listUsers() {
        const users = await userRepository.findAllUsers();

        auditService.registerRequestEvent({
            eventType: AUDIT_EVENTS.USER_LISTED,
            action: AUDIT_ACTIONS.LIST_USERS,
            targetSystem: AUDIT_TARGET_SYSTEMS.POSTGRESQL,
            responseCount: users.length
        });

        return users.map(toPublicUser);
    }

    async function logoutUser({ sessionId }) {
        await userRepository.deleteUserSession(sessionId);
        auditService.registerRequestEvent({
            eventType: AUDIT_EVENTS.AUTH_LOGOUT,
            action: AUDIT_ACTIONS.LOGOUT,
            targetSystem: AUDIT_TARGET_SYSTEMS.POSTGRESQL
        });
    }

    async function deactivateUser({ login }) {
        const user = await userRepository.findUserByLogin(getLogin(login));

        if (!user) {
            throw new AppError("Usuário não encontrado.", 404, "USER_NOT_FOUND");
        }

        const deactivatedUser = await userRepository.deactivateUserAndDeleteSessions(user.id);

        auditService.registerRequestEvent({
            eventType: AUDIT_EVENTS.USER_DISABLED,
            action: AUDIT_ACTIONS.DISABLE_USER,
            targetSystem: AUDIT_TARGET_SYSTEMS.POSTGRESQL,
            metadata: {
                targetUserId: deactivatedUser.id,
                targetUsername: deactivatedUser.login
            }
        });

        return toPublicUser(deactivatedUser);
    }

    async function getAuthenticatedUser(id, sessionId) {
        const [user, session] = await Promise.all([
            userRepository.findUserById(id),
            userRepository.findUserSessionById(sessionId)
        ]);

        if (!user || !session || session.userId !== user.id) {
            return null;
        }

        auditService.setRequestActor({
            userId: user.id,
            username: user.login,
            sessionId: session.id
        });

        if (!user.status) {
            await userRepository.deleteUserSession(session.id);
            auditService.registerRequestEvent({
                eventType: AUDIT_EVENTS.ACCESS_DENIED,
                action: AUDIT_ACTIONS.AUTHORIZE_ACCESS,
                targetSystem: AUDIT_TARGET_SYSTEMS.APPLICATION,
                errorCode: "USER_INACTIVE",
                metadata: { reason: "USER_INACTIVE" }
            });
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
            auditService.registerRequestEvent({
                eventType: AUDIT_EVENTS.AUTH_SESSION_EXPIRED,
                action: AUDIT_ACTIONS.SESSION_EXPIRE,
                targetSystem: AUDIT_TARGET_SYSTEMS.POSTGRESQL,
                errorCode: "SESSION_EXPIRED",
                metadata: { reason: "SESSION_EXPIRED" }
            });
            return null;
        }

        await userRepository.updateUserSessionActivity(session.id, currentDate);
        return user;
    }

    return {
        getAuthenticatedUser,
        deactivateUser,
        loginUser,
        listUsers,
        logoutUser,
        registerUser,
        resetUserPassword
    };
}

const authService = createAuthService();

export { createAuthService };
export default authService;
