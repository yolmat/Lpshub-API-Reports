import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import { Writable } from "node:stream";
import test from "node:test";
import { setTimeout as wait } from "node:timers/promises";
import express from "express";

import { createApp } from "../src/app.js";
import { AUDITED_ROUTES, findAuditedRoute } from "../src/config/auditRoutes.js";
import { createLogger, getLoggerOptions } from "../src/config/logger.js";
import audit, { createAuditMiddleware } from "../src/middlewares/audit.js";
import errorMiddleware from "../src/middlewares/errorMiddleware.js";
import {
    getRequestContext,
    requestContext,
    updateRequestContext
} from "../src/middlewares/requestContext.js";
import prisma from "../src/repositories/prisma.js";
import {
    createAuditService,
    createSessionReference,
    filterMetadata
} from "../src/services/auditService.js";
import AppError from "../src/utils/AppError.js";
import {
    AUDIT_ACTIONS,
    AUDIT_EVENTS,
    AUDIT_TARGET_SYSTEMS
} from "../src/utils/auditEvents.js";

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

test("todas as rotas possuem AuditAction sem usar a ação genérica", () => {
    const routes = Object.values(AUDITED_ROUTES);
    const registeredEvents = [];
    const service = {
        getRequestEvent: () => null,
        recordEvent: () => Promise.resolve(),
        registerRequestEvent(event) {
            registeredEvents.push(event);
        }
    };
    const middleware = createAuditMiddleware(service);

    assert.equal(routes.length, 12);
    assert.equal(new Set(routes.map((route) => (
        `${route.method} ${route.fullPath}`
    ))).size, routes.length);

    for (const route of routes) {
        assert.notEqual(route.audit.action, AUDIT_ACTIONS.HTTP_REQUEST);
        assert.equal(findAuditedRoute(route.method, route.fullPath), route);

        middleware({
            headers: {},
            ip: "127.0.0.1",
            method: route.method,
            originalUrl: route.fullPath
        }, {
            end() {},
            locals: {},
            write() {}
        }, () => {});

        assert.deepEqual(registeredEvents.at(-1), route.audit);
    }
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
    const metadata = filterMetadata(AUDIT_EVENTS.REPORT_EXECUTED, {
        empresaCount: 3,
        dateStart: "2026-10-01",
        responseSizeBytes: 1847,
        password: "não-pode-persistir",
        payload: { financeiro: "não-pode-persistir" },
        dateCount: { valor: 4 }
    });

    assert.deepEqual(metadata, {
        empresaCount: 3,
        dateStart: "2026-10-01",
        responseSizeBytes: 1847
    });

    let persisted;
    const service = createAuditService({
        createAuditLog(data) {
            persisted = data;
            return Promise.resolve(data);
        }
    });

    await service.recordEvent({
        requestId: "8bd1278b-225f-4c41-8e8e-d223f31fa54a",
        eventType: AUDIT_EVENTS.HTTP_REQUEST_COMPLETED,
        action: AUDIT_ACTIONS.HTTP_REQUEST,
        targetSystem: AUDIT_TARGET_SYSTEMS.APPLICATION,
        route: "/health",
        method: "GET",
        success: true,
        statusCode: 200,
        durationMs: 25.4,
        ipAddress: "127.0.0.1",
        sessionId: "sessao-nunca-persistida",
        metadata: { responseSizeBytes: 200, cookie: "não-pode-persistir" }
    });

    assert.deepEqual(persisted.metadata, { responseSizeBytes: 200 });
    assert.equal(persisted.createdAt.toISOString().endsWith("Z"), true);
    assert.equal("sessionId" in persisted, false);
    assert.equal(persisted.sessionReference, createSessionReference("sessao-nunca-persistida"));
    assert.equal(persisted.sessionReference.includes("sessao-nunca-persistida"), false);
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

test("aguarda a auditoria nas rotas comuns e libera login sem aguardar", async () => {
    let releaseReportAudit;
    let releaseLoginAudit;
    let reportAuditStarted = false;
    const service = {
        getRequestEvent: () => null,
        recordEvent(event) {
            if (event.route === "/api/v1/relatorio") {
                reportAuditStarted = true;
                return new Promise((resolve) => {
                    releaseReportAudit = resolve;
                });
            }

            return new Promise((resolve) => {
                releaseLoginAudit = resolve;
            });
        }
    };
    const app = express();

    app.use(requestContext);
    app.use(createAuditMiddleware(service));
    app.get("/api/v1/relatorio", (req, res) => res.json({ success: true }));
    app.post("/api/v1/auth/login", (req, res) => res.json({ success: true }));

    let reportFinished = false;
    const reportRequest = request(app, "/api/v1/relatorio")
        .then((response) => {
            reportFinished = true;
            return response;
        });

    for (let attempt = 0; attempt < 20 && !reportAuditStarted; attempt += 1) {
        await wait(5);
    }

    assert.equal(reportAuditStarted, true);
    assert.equal(reportFinished, false);
    releaseReportAudit();
    assert.equal((await reportRequest).status, 200);

    const loginResponse = await request(app, "/api/v1/auth/login", { method: "POST" });

    assert.equal(loginResponse.status, 200);
    assert.equal(typeof releaseLoginAudit, "function");
    releaseLoginAudit();
});

test("persiste o resultado HTTP usando o mesmo requestId retornado ao cliente", async () => {
    const app = createApp({
        isProduction: false,
        allowedCorsOrigins: [],
        trustProxy: false
    }, { auditMiddleware: audit });
    const response = await request(app, "/health", {
        headers: { cookie: "lpshub_access_token=token-inválido" }
    });
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
        assert.equal(auditLog?.eventType, AUDIT_EVENTS.ACCESS_DENIED);
        assert.equal(auditLog?.route, "/health");
        assert.equal(auditLog?.action, AUDIT_ACTIONS.AUTHORIZE_ACCESS);
        assert.equal(auditLog?.targetSystem, AUDIT_TARGET_SYSTEMS.APPLICATION);
        assert.equal(auditLog?.success, false);
        assert.equal(auditLog?.statusCode, 401);
        assert.equal(auditLog?.durationMs >= 0, true);
    } finally {
        await prisma.auditLog.deleteMany({ where: { requestId } });
    }
});

test("persiste o ator autenticado e a referência da sessão em relatórios", async () => {
    const persistedEvents = [];
    const service = createAuditService({
        createAuditLog(event) {
            persistedEvents.push(event);
            return Promise.resolve(event);
        }
    });
    const app = express();

    app.use(requestContext);
    app.use(createAuditMiddleware(service));
    app.use((req, res, next) => {
        req.authenticatedUser = { id: "usuario-123", login: "msaraiva" };
        service.setRequestActor({
            userId: req.authenticatedUser.id,
            username: req.authenticatedUser.login,
            sessionId: "sessao-123"
        });
        next();
    });
    app.get("/api/v1/filiais", (req, res) => res.status(200).json({ data: [] }));

    const response = await request(app, "/api/v1/filiais");
    const auditEvent = persistedEvents.at(-1);

    assert.equal(response.status, 200);
    assert.equal(auditEvent.userId, "usuario-123");
    assert.equal(auditEvent.username, "msaraiva");
    assert.equal(auditEvent.sessionReference, createSessionReference("sessao-123"));
    assert.equal(auditEvent.action, AUDIT_ACTIONS.BRANCH_LIST);
});
