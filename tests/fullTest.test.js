import assert from "node:assert/strict";
import test from "node:test";

import {
    createFullTestUser,
    getFullTestUserConfig,
    startDevelopmentServer,
    verifyDatabase
} from "../scripts/fullTest.js";

test("exige as credenciais do administrador para o fullTest", () => {
    assert.throws(
        () => getFullTestUserConfig({}),
        /FULL_TEST_ADMIN_LOGIN/
    );

    assert.deepEqual(getFullTestUserConfig({
        FULL_TEST_ADMIN_LOGIN: "msaraiva ",
        FULL_TEST_ADMIN_EMAIL: "MSARAIVA@LOPES.COM.BR ",
        FULL_TEST_ADMIN_PASSWORD: "senha"
    }), {
        login: "msaraiva",
        email: "msaraiva@lopes.com.br",
        senha: "senha"
    });
});

test("verifica o banco e prepara o administrador de teste sem expor a senha", async () => {
    let queryExecuted = false;
    let receivedData;
    const client = {
        $queryRawUnsafe(query) {
            queryExecuted = query === "SELECT 1";
            return Promise.resolve();
        },
        user: {
            upsert(data) {
                receivedData = data;
                return Promise.resolve({
                    id: "usuario-1",
                    login: data.create.login,
                    email: data.create.email,
                    role: data.create.role,
                    status: data.create.status
                });
            }
        }
    };

    await verifyDatabase(client);
    const user = await createFullTestUser({
        login: "msaraiva",
        email: "msaraiva@lopes.com.br",
        senha: "senha"
    }, {
        client,
        createPasswordHash: async () => "hash-seguro"
    });

    assert.equal(queryExecuted, true);
    assert.equal(receivedData.create.passwordHash, "hash-seguro");
    assert.equal("senha" in receivedData.create, false);
    assert.equal(receivedData.create.role, "ADM");
    assert.deepEqual(user, {
        id: "usuario-1",
        login: "msaraiva",
        email: "msaraiva@lopes.com.br",
        role: "ADM",
        status: true
    });
});

test("inicia o ambiente de desenvolvimento pelo npm", () => {
    let receivedCommand;
    let receivedArguments;
    let receivedOptions;
    const child = {
        once() {}
    };

    const result = startDevelopmentServer((command, args, options) => {
        receivedCommand = command;
        receivedArguments = args;
        receivedOptions = options;
        return child;
    });

    assert.equal(result, child);
    assert.deepEqual(
        receivedArguments,
        process.platform === "win32"
            ? ["/d", "/s", "/c", "npm run dev"]
            : ["run", "dev"]
    );
    assert.equal(receivedOptions.stdio, "inherit");
    assert.equal(
        receivedCommand,
        process.platform === "win32" ? "cmd.exe" : "npm"
    );
});
