import assert from "node:assert/strict";
import test from "node:test";

import { createAuthService } from "../src/services/authService.js";
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
        getSession(id) {
            return sessions.find((session) => session.id === id) || null;
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
    let currentDate = new Date("2026-09-30T12:00:00.000Z");
    const service = createAuthService({
        userRepository,
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
});
