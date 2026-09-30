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

    return {
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
        async updateUserPassword(id, passwordHash) {
            const user = users.find((item) => item.id === id);

            user.passwordHash = passwordHash;
            user.updatedAt = new Date();
            return user;
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
