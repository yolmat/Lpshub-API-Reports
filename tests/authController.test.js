import assert from "node:assert/strict";
import test from "node:test";

import { getCurrentUser } from "../src/controllers/authController.js";

test("retorna somente id, login e email do usuário autenticado", async () => {
    const response = {
        status(statusCode) {
            this.statusCode = statusCode;
            return this;
        },
        json(payload) {
            this.payload = payload;
            return this;
        }
    };

    await getCurrentUser({
        authenticatedUser: {
            id: "usuario-1",
            login: "msaraiva",
            email: "msaraiva@lopes.com.br",
            passwordHash: "hash-que-nao-deve-ser-retornado"
        }
    }, response, (error) => {
        throw error;
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.payload, {
        success: true,
        data: {
            id: "usuario-1",
            login: "msaraiva",
            email: "msaraiva@lopes.com.br"
        }
    });
});
