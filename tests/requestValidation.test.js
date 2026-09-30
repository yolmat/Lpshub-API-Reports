import assert from "node:assert/strict";
import test from "node:test";

import { AUTH_COOKIE_NAME } from "../src/config/auth.js";
import validateRequest from "../src/middlewares/validateRequestMiddleware.js";
import {
    authRegisterBodySchema,
    emptyObjectSchema,
    extratoBancarioBodySchema,
    protectedRouteHeadersSchema
} from "../src/validations/requestSchemas.js";

function validate(schemas, request) {
    return new Promise((resolve) => {
        const req = request;
        validateRequest(schemas)(req, {}, (error) => resolve({ error, validated: req.validated }));
    });
}

test("aceita os filtros de extrato por intervalo", async () => {
    const { error, validated } = await validate({ body: extratoBancarioBodySchema }, {
        body: {
            empresa: ["LPSI", "LSUL"],
            dataInicial: "2025-06-01",
            dataFinal: "2025-06-30"
        }
    });

    assert.equal(error, undefined);
    assert.deepEqual(validated.body, {
        empresa: ["LPSI", "LSUL"],
        dataInicial: "2025-06-01",
        dataFinal: "2025-06-30"
    });
});

test("aceita datas específicas e rejeita campos inesperados", async () => {
    const valid = await validate({ body: extratoBancarioBodySchema }, {
        body: { empresa: ["EBC"], datas: ["2026-04-01", "2026-04-05"] }
    });
    const invalid = await validate({ body: extratoBancarioBodySchema }, {
        body: { empresa: ["EBC"], datas: ["2026-04-01"], campoInesperado: true }
    });

    assert.equal(valid.error, undefined);
    assert.equal(invalid.error.code, "INVALID_REQUEST");
    assert.equal(invalid.error.details[0].path, "campoInesperado");
});

test("rejeita datas inválidas e intervalos invertidos", async () => {
    const invalidDate = await validate({ body: extratoBancarioBodySchema }, {
        body: { empresa: ["EBC"], datas: ["2026-02-30"] }
    });
    const invalidRange = await validate({ body: extratoBancarioBodySchema }, {
        body: { empresa: ["EBC"], dataInicial: "2026-04-05", dataFinal: "2026-04-01" }
    });

    assert.equal(invalidDate.error.code, "INVALID_REQUEST");
    assert.equal(invalidDate.error.details[0].path, "datas.0");
    assert.equal(invalidRange.error.details[0].path, "dataFinal");
});

test("exige login, e-mail e senha no registro", async () => {
    const { error } = await validate({ body: authRegisterBodySchema }, {
        body: { login: "", email: "email-inválido" }
    });

    assert.equal(error.code, "INVALID_REQUEST");
    assert.deepEqual(error.details.map((detail) => detail.path), ["login", "email", "senha"]);
});

test("rejeita query, params e cookie de autenticação ausente", async () => {
    const queryAndParams = await validate({ query: emptyObjectSchema, params: emptyObjectSchema }, {
        query: { pagina: "1" },
        params: { id: "1" }
    });
    const headers = await validate({ headers: protectedRouteHeadersSchema }, { headers: {} });
    const validHeaders = await validate({ headers: protectedRouteHeadersSchema }, {
        headers: { cookie: `${AUTH_COOKIE_NAME}=token-assinado` }
    });

    assert.equal(queryAndParams.error.code, "INVALID_REQUEST");
    assert.equal(queryAndParams.error.details.length, 2);
    assert.equal(headers.error.code, "INVALID_REQUEST");
    assert.equal(validHeaders.error, undefined);
});
