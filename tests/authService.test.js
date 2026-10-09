import assert from "node:assert/strict";
import test from "node:test";

import { createAuthService } from "../src/services/authService.js";
import { AUDIT_ACTIONS, AUDIT_EVENTS } from "../src/utils/auditEvents.js";
import { verifyAuthToken } from "../src/utils/jwtUtils.js";
import { hashPassword, verifyPassword } from "../src/utils/passwordUtils.js";

const securityConfig = {
    jwtSecret: "a".repeat(32),
    passwordResetDefault: "senha-padrao-de-teste"
};

function createUserRepository() {
    const users = [];
    const sessions = [];

    return {
        async createUserSession(data) {
            const session = {
                createdAt: new Date(),
                ...data
            };
            sessions.push(session);
            return session;
        },
        async createUser(data) {
            const user = {
                id: `user-${users.length + 1}`,
                createdAt: new Date(),
                updatedAt: new Date(),
                ...data
            };
            users.push(user);
            return user;
        },
        async findUserById(id) {
            return users.find((user) => user.id === id) || null;
        },
        async findAllUsers() {
            return [...users]
                .sort((first, second) => first.login.localeCompare(second.login))
                .map(({ passwordHash, ...user }) => user);
        },
        async findUserByLogin(login) {
            return users.find((user) => user.login === login) || null;
        },
        async findUserByLoginAndEmail(login, email) {
            return users.find((user) => user.login === login && user.email === email) || null;
        },
        async findUserSessionById(id) {
            return sessions.find((session) => session.id === id) || null;
        },
        async updateUserSessionActivity(id, lastActivityAt) {
            const session = sessions.find((item) => item.id === id);

            session.lastActivityAt = lastActivityAt;
            return session;
        },
        async updateUserPassword(id, passwordHash) {
            const user = users.find((item) => item.id === id);

            user.passwordHash = passwordHash;
            user.updatedAt = new Date();
            return user;
        },
        async deleteUserSession(id) {
            const index = sessions.findIndex((session) => session.id === id);

            if (index >= 0) {
                sessions.splice(index, 1);
            }
        },
        async deactivateUserAndDeleteSessions(id) {
            const user = users.find((item) => item.id === id);

            user.status = false;
            for (let index = sessions.length - 1; index >= 0; index -= 1) {
                if (sessions[index].userId === id) {
                    sessions.splice(index, 1);
                }
            }
            return user;
        },
        getSession(id) {
            return sessions.find((session) => session.id === id) || null;
        }
    };
}

function createAuditServiceSpy() {
    const actors = [];
    const events = [];

    return {
        actors,
        events,
        registerRequestEvent(event) {
            events.push(event);
        },
        setRequestActor(actor) {
            actors.push(actor);
        }
    };
}

test("gera hash scrypt com salt aleatório e valida a senha", async () => {
    const firstHash = await hashPassword("senha-de-teste");
    const secondHash = await hashPassword("senha-de-teste");

    assert.notEqual(firstHash, secondHash);
    assert.equal(await verifyPassword("senha-de-teste", firstHash), true);
    assert.equal(await verifyPassword("senha-incorreta", firstHash), false);
});

test("registra usuário USER, autentica e redefine a senha padrão", async () => {
    const userRepository = createUserRepository();
    const service = createAuthService({
        userRepository,
        getSecurityConfig: () => securityConfig
    });
    const registeredUser = await service.registerUser({
        login: "msaraiva",
        email: "MSARAIVA@TESTE.COM.BR",
        senha: "senha-inicial"
    });

    assert.equal(registeredUser.login, "msaraiva");
    assert.equal(registeredUser.email, "msaraiva@teste.com.br");
    assert.equal(registeredUser.status, true);
    assert.equal(registeredUser.role, "USER");
    assert.equal("passwordHash" in registeredUser, false);

    const loginResult = await service.loginUser({
        login: "msaraiva",
        senha: "senha-inicial"
    });
    const tokenPayload = verifyAuthToken(loginResult.token, securityConfig.jwtSecret);

    assert.equal(tokenPayload.sub, registeredUser.id);
    assert.equal(tokenPayload.role, "USER");
    assert.equal(typeof tokenPayload.sid, "string");

    await service.resetUserPassword({
        login: "msaraiva",
        email: "msaraiva@teste.com.br"
    });
    const storedUser = await userRepository.findUserByLogin("msaraiva");

    assert.equal(
        await verifyPassword(securityConfig.passwordResetDefault, storedUser.passwordHash),
        true
    );
    await assert.rejects(
        service.loginUser({ login: "msaraiva", senha: "senha-inicial" }),
        { code: "INVALID_CREDENTIALS" }
    );
});

test("mantém a sessão ativa com uso contínuo e invalida após duas horas de inatividade", async () => {
    const userRepository = createUserRepository();
    const auditService = createAuditServiceSpy();
    let currentDate = new Date("2026-09-30T12:00:00.000Z");
    const service = createAuthService({
        userRepository,
        auditService,
        getSecurityConfig: () => securityConfig,
        createSessionId: () => "sessao-de-teste",
        now: () => currentDate
    });
    const user = await service.registerUser({
        login: "mteste",
        email: "mteste@teste.com.br",
        senha: "senha-inicial"
    });
    const { token } = await service.loginUser({
        login: "mteste",
        senha: "senha-inicial"
    });
    const { sid } = verifyAuthToken(token, securityConfig.jwtSecret);

    currentDate = new Date("2026-09-30T13:30:00.000Z");
    assert.equal((await service.getAuthenticatedUser(user.id, sid)).id, user.id);
    assert.equal(userRepository.getSession(sid).lastActivityAt.toISOString(), currentDate.toISOString());

    currentDate = new Date("2026-09-30T15:29:00.000Z");
    assert.equal((await service.getAuthenticatedUser(user.id, sid)).id, user.id);
    assert.equal(userRepository.getSession(sid).lastActivityAt.toISOString(), currentDate.toISOString());

    currentDate = new Date("2026-09-30T17:29:00.000Z");
    assert.equal(await service.getAuthenticatedUser(user.id, sid), null);
    assert.equal(userRepository.getSession(sid), null);
    assert.equal(
        auditService.events.at(-1).eventType,
        AUDIT_EVENTS.AUTH_SESSION_EXPIRED
    );
});

test("invalida a sessão após oito horas mesmo com atividade recente", async () => {
    const userRepository = createUserRepository();
    let currentDate = new Date("2026-09-30T12:00:00.000Z");
    const service = createAuthService({
        userRepository,
        getSecurityConfig: () => securityConfig,
        createSessionId: () => "sessao-com-timeout-absoluto",
        now: () => currentDate
    });
    const user = await service.registerUser({
        login: "mabsoluto",
        email: "mabsoluto@teste.com.br",
        senha: "senha-inicial"
    });
    const { token } = await service.loginUser({
        login: "mabsoluto",
        senha: "senha-inicial"
    });
    const { sid } = verifyAuthToken(token, securityConfig.jwtSecret);

    for (const time of ["13:59", "15:58", "17:57", "19:56"]) {
        currentDate = new Date(`2026-09-30T${time}:00.000Z`);
        assert.equal((await service.getAuthenticatedUser(user.id, sid)).id, user.id);
    }

    currentDate = new Date("2026-09-30T20:00:00.000Z");
    assert.equal(await service.getAuthenticatedUser(user.id, sid), null);
    assert.equal(userRepository.getSession(sid), null);
});

test("encerra somente a sessão do usuário autenticado", async () => {
    const userRepository = createUserRepository();
    const sessionIds = ["sessao-logout-1", "sessao-logout-2"];
    const service = createAuthService({
        userRepository,
        getSecurityConfig: () => securityConfig,
        createSessionId: () => sessionIds.shift()
    });
    const firstUser = await service.registerUser({
        login: "mlogout",
        email: "mlogout@teste.com.br",
        senha: "senha-inicial"
    });
    const secondUser = await service.registerUser({
        login: "moutra",
        email: "moutra@teste.com.br",
        senha: "senha-inicial"
    });
    const { token: firstToken } = await service.loginUser({
        login: "mlogout",
        senha: "senha-inicial"
    });
    const { token: secondToken } = await service.loginUser({
        login: "moutra",
        senha: "senha-inicial"
    });
    const { sid: firstSessionId } = verifyAuthToken(firstToken, securityConfig.jwtSecret);
    const { sid: secondSessionId } = verifyAuthToken(secondToken, securityConfig.jwtSecret);

    await service.logoutUser({
        sessionId: firstSessionId
    });

    assert.equal(firstUser.login, "mlogout");
    assert.equal(secondUser.login, "moutra");
    assert.equal(userRepository.getSession(firstSessionId), null);
    assert.notEqual(userRepository.getSession(secondSessionId), null);
});

test("desativa o usuário, encerra suas sessões e rejeita usuário inativo", async () => {
    const userRepository = createUserRepository();
    const service = createAuthService({
        userRepository,
        getSecurityConfig: () => securityConfig,
        createSessionId: () => "sessao-desativacao"
    });
    const user = await service.registerUser({
        login: "mdesativar",
        email: "mdesativar@teste.com.br",
        senha: "senha-inicial"
    });
    const { token } = await service.loginUser({
        login: "mdesativar",
        senha: "senha-inicial"
    });
    const { sid } = verifyAuthToken(token, securityConfig.jwtSecret);

    const deactivatedUser = await service.deactivateUser({ login: "mdesativar" });

    assert.equal(deactivatedUser.status, false);
    assert.equal(userRepository.getSession(sid), null);

    await assert.rejects(
        service.loginUser({ login: "mdesativar", senha: "senha-inicial" }),
        { code: "INVALID_CREDENTIALS" }
    );

    const activeUser = await service.registerUser({
        login: "mstatus",
        email: "mstatus@teste.com.br",
        senha: "senha-inicial"
    });
    const { token: activeToken } = await service.loginUser({
        login: "mstatus",
        senha: "senha-inicial"
    });
    const { sid: activeSessionId } = verifyAuthToken(activeToken, securityConfig.jwtSecret);
    const storedActiveUser = await userRepository.findUserByLogin("mstatus");

    storedActiveUser.status = false;
    assert.equal(await service.getAuthenticatedUser(activeUser.id, activeSessionId), null);
    assert.equal(userRepository.getSession(activeSessionId), null);
});

test("registra eventos semânticos de login, falha e logout no authService", async () => {
    const userRepository = createUserRepository();
    const auditService = createAuditServiceSpy();
    const service = createAuthService({
        userRepository,
        auditService,
        getSecurityConfig: () => securityConfig,
        createSessionId: () => "sessao-auditada"
    });
    const user = await service.registerUser({
        login: "maudit",
        email: "maudit@teste.com.br",
        senha: "senha-inicial"
    });
    const { token } = await service.loginUser({
        login: "maudit",
        senha: "senha-inicial"
    });
    const { sid } = verifyAuthToken(token, securityConfig.jwtSecret);

    await assert.rejects(
        service.loginUser({ login: "maudit", senha: "senha-incorreta" }),
        { code: "INVALID_CREDENTIALS" }
    );
    await service.logoutUser({
        sessionId: sid
    });

    assert.deepEqual(
        auditService.events.map((event) => event.eventType),
        [
            AUDIT_EVENTS.USER_CREATED,
            AUDIT_EVENTS.AUTH_LOGIN_SUCCESS,
            AUDIT_EVENTS.AUTH_LOGIN_FAILED,
            AUDIT_EVENTS.AUTH_LOGOUT
        ]
    );
    assert.deepEqual(auditService.actors[0], {
        userId: user.id,
        username: "maudit",
        sessionId: "sessao-auditada"
    });
});

test("lista usuários sem expor hashes ou sessões e registra auditoria", async () => {
    const userRepository = createUserRepository();
    const auditService = createAuditServiceSpy();
    const service = createAuthService({
        userRepository,
        auditService,
        getSecurityConfig: () => securityConfig
    });

    await service.registerUser({
        login: "zusuario",
        email: "zusuario@teste.com.br",
        senha: "senha-inicial"
    });
    await service.registerUser({
        login: "ausuario",
        email: "ausuario@teste.com.br",
        senha: "senha-inicial"
    });
    const users = await service.listUsers();

    assert.deepEqual(users.map((user) => user.login), ["ausuario", "zusuario"]);
    assert.equal("passwordHash" in users[0], false);
    assert.equal("sessions" in users[0], false);
    assert.deepEqual(auditService.events.at(-1), {
        eventType: AUDIT_EVENTS.USER_LISTED,
        action: AUDIT_ACTIONS.LIST_USERS,
        targetSystem: "POSTGRESQL",
        responseCount: 2
    });
});
