import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import test from "node:test";

import { createApp } from "../src/app.js";
import { getHttpSecurityConfig } from "../src/config/env.js";

async function request(app, path, options) {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    try {
        const { port } = server.address();

        return await fetch(`http://127.0.0.1:${port}${path}`, options);
    } finally {
        server.close();
        await once(server, "close");
    }
}

test("normaliza somente origens HTTP e HTTPS configuradas para CORS", () => {
    const config = getHttpSecurityConfig({
        CORS_ALLOWED_ORIGINS: "https://app.exemplo.com/, http://localhost:3000, https://app.exemplo.com/painel, ftp://arquivos.exemplo.com, inválido"
    });

    assert.deepEqual(config.allowedCorsOrigins, [
        "https://app.exemplo.com",
        "http://localhost:3000"
    ]);
});

test("adiciona cabeçalhos de segurança e libera CORS apenas para origem autorizada", async () => {
    const app = createApp({
        isProduction: false,
        allowedCorsOrigins: ["https://app.exemplo.com"],
        trustProxy: false
    });
    const authorizedResponse = await request(app, "/health", {
        headers: { Origin: "https://app.exemplo.com" }
    });
    const unauthorizedResponse = await request(app, "/health", {
        headers: { Origin: "https://origem-nao-autorizada.exemplo.com" }
    });

    assert.equal(authorizedResponse.status, 200);
    assert.equal(authorizedResponse.headers.get("access-control-allow-origin"), "https://app.exemplo.com");
    assert.equal(authorizedResponse.headers.get("access-control-allow-credentials"), "true");
    assert.equal(authorizedResponse.headers.get("x-content-type-options"), "nosniff");
    assert.equal(authorizedResponse.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.equal(authorizedResponse.headers.get("x-powered-by"), null);
    assert.equal(unauthorizedResponse.headers.get("access-control-allow-origin"), null);
});

test("exige HTTPS em produção e aceita HTTPS sinalizado por proxy confiável", async () => {
    const app = createApp({
        isProduction: true,
        allowedCorsOrigins: [],
        trustProxy: 1
    });
    const insecureResponse = await request(app, "/health");
    const proxiedHttpsResponse = await request(app, "/health", {
        headers: { "x-forwarded-proto": "https" }
    });

    assert.equal(insecureResponse.status, 403);
    assert.equal((await insecureResponse.json()).error.code, "HTTPS_REQUIRED");
    assert.equal(proxiedHttpsResponse.status, 200);
});

test("rejeita body maior que o limite da rota de extratos bancários", async () => {
    const app = createApp({
        isProduction: false,
        allowedCorsOrigins: [],
        trustProxy: false
    });
    const response = await request(app, "/api/v1/extratos-bancarios", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dados: "x".repeat(11 * 1024) })
    });

    assert.equal(response.status, 413);
    assert.equal((await response.json()).error.code, "PAYLOAD_TOO_LARGE");
});
