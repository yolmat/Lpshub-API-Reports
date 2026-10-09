import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import { Writable } from "node:stream";
import test from "node:test";
import { setTimeout as wait } from "node:timers/promises";

import { createApp } from "../src/app.js";
import { createLogger, getLoggerOptions } from "../src/config/logger.js";
import audit from "../src/middlewares/audit.js";
import errorMiddleware from "../src/middlewares/errorMiddleware.js";
import {
    getRequestContext,
    requestContext,
    updateRequestContext
} from "../src/middlewares/requestContext.js";
import prisma from "../src/repository/prisma.js";
import { createAuditService, filterMetadata } from "../src/services/auditService.js";
import AppError from "../src/utils/AppError.js";
import { AUDIT_EVENTS } from "../src/utils/auditEvents.js";

async function request(app, path) {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    try {
        const { port } = server.address();
        return await fetch(`http://127.0.0.1:${port}${path}`);
    } finally {
        server.close();
        await once(server, "close");
    }
}

test("cria requestId UUID e preserva o contexto durante operações assíncronas", async () => {
    const headers = new Map();
    const req = { ip: "127.0.0.1" };
    const res = { setHeader: (name, value) => headers.set(name, value) };

    await requestContext(req, res, async () => {
        updateRequestContext({ userId: "user-1", sessionId: "sessao-secreta" });
        await wait(1);

        assert.deepEqual(getRequestContext(), {
            requestId: req.id,
            userId: "user-1",
            sessionId: "sessao-secreta",
            ip: "127.0.0.1"
        });
    });

    assert.match(req.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.equal(headers.get("X-Request-ID"), req.id);
});

test("remove credenciais e identificador de sessão dos logs estruturados", async () => {
    const chunks = [];
    const destination = new Writable({
        write(chunk, encoding, callback) {
            chunks.push(chunk.toString());
            callback();
        }
    });
    const testLogger = createLogger(destination, { level: "info" });

    testLogger.info({
        password: "senha-exposta",
        sessionId: "sessao-exposta",
        nested: {
            token: "token-exposto",
            Password: "credencial-sap-exposta",
            safe: "valor-seguro"
        }
    }, "Teste de redaction.");
    await wait(1);

    const output = chunks.join("");
    const entry = JSON.parse(output.trim());

    assert.equal(output.includes("senha-exposta"), false);
    assert.equal(output.includes("sessao-exposta"), false);
    assert.equal(output.includes("token-exposto"), false);
    assert.equal(output.includes("credencial-sap-exposta"), false);
    assert.equal(entry.nested.safe, "valor-seguro");
});

test("usa pino-pretty somente para visualização fora de produção", () => {
    const developmentOptions = getLoggerOptions(undefined, { pretty: true });
    const productionOptions = getLoggerOptions(undefined, { pretty: false });

    assert.equal(developmentOptions.transport.target, "pino-pretty");
    assert.equal(developmentOptions.transport.options.singleLine, true);
    assert.equal(productionOptions.transport, undefined);
});

test("auditoria aceita somente metadata primitivo presente na allow-list", async () => {
    const metadata = filterMetadata(AUDIT_EVENTS.HTTP_REQUEST_COMPLETED, {
        durationMs: 25.4,
        errorCode: "INVALID_REQUEST",
        password: "não-pode-persistir",
        payload: { financeiro: "não-pode-persistir" },
        statusCode: { valor: 400 }
    });

    assert.deepEqual(metadata, {
        durationMs: 25.4,
        errorCode: "INVALID_REQUEST"
    });

    let persisted;
    const service = createAuditService({
        createAuditLog(data) {
            persisted = data;
            return Promise.resolve(data);
        }
    });

    await service.recordEvent({
        requestId: "request-1",
        eventType: AUDIT_EVENTS.HTTP_REQUEST_COMPLETED,
        route: "/health",
        method: "GET",
        success: true,
        statusCode: 200,
        ipAddress: "127.0.0.1",
        metadata: { statusCode: 200, cookie: "não-pode-persistir" }
    });

    assert.deepEqual(persisted.metadata, { statusCode: 200 });
    assert.equal(persisted.createdAt.toISOString().endsWith("Z"), true);
    assert.equal("sessionId" in persisted, false);
});

test("classifica erros do SAP separadamente dos erros da aplicação", () => {
    const logs = [];
    const req = {
        log: {
            error: (data) => logs.push(data),
            warn: (data) => logs.push(data)
        },
        method: "GET",
        path: "/api/v1/filiais"
    };
    const res = {
        headersSent: false,
        locals: {},
        status(statusCode) {
            this.statusCode = statusCode;
            return this;
        },
        json(payload) {
            this.payload = payload;
            return this;
        }
    };

    errorMiddleware(
        new AppError("Falha no SAP.", 502, "SAP_TIMEOUT"),
        req,
        res,
        () => {}
    );

    assert.equal(res.locals.errorSource, "sap");
    assert.equal(logs[0].errorSource, "sap");
    assert.equal(logs[0].errorCode, "SAP_TIMEOUT");
});

test("persiste o resultado HTTP usando o mesmo requestId retornado ao cliente", async () => {
    const app = createApp({
        isProduction: false,
        allowedCorsOrigins: [],
        trustProxy: false
    }, { auditMiddleware: audit });
    const response = await request(app, "/health");
    const requestId = response.headers.get("x-request-id");
    let auditLog;

    for (let attempt = 0; attempt < 20 && !auditLog; attempt += 1) {
        auditLog = await prisma.auditLog.findFirst({ where: { requestId } });

        if (!auditLog) {
            await wait(25);
        }
    }

    try {
        assert.match(requestId, /^[0-9a-f-]{36}$/i);
        assert.equal(auditLog?.eventType, AUDIT_EVENTS.HTTP_REQUEST_COMPLETED);
        assert.equal(auditLog?.route, "/health");
        assert.equal(auditLog?.success, true);
        assert.equal(auditLog?.statusCode, 200);
    } finally {
        await prisma.auditLog.deleteMany({ where: { requestId } });
    }
});
