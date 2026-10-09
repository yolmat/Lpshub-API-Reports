import { performance } from "node:perf_hooks";
import pinoHttp from "pino-http";

import logger, { serializeError } from "../config/logger.js";

const SLOW_REQUEST_THRESHOLD_MS = 1000;

function getPathWithoutQuery(url = "/") {
    try {
        return new URL(url, "http://local").pathname;
    } catch {
        return "/";
    }
}

const httpLogger = pinoHttp({
    logger,
    genReqId: (req) => req.id,
    customLogLevel(req, res, error) {
        if (error || res.statusCode >= 500) {
            return "error";
        }

        if (res.statusCode >= 400) {
            return "warn";
        }

        return "info";
    },
    customSuccessMessage: () => "Requisição concluída.",
    customErrorMessage: () => "Requisição concluída com erro.",
    serializers: {
        req(req) {
            return {
                id: req.id,
                method: req.method,
                path: getPathWithoutQuery(req.url),
                remoteAddress: req.remoteAddress
            };
        },
        res(res) {
            return { statusCode: res.statusCode };
        },
        err: serializeError
    }
});

function requestLogger(req, res, next) {
    const startedAt = performance.now();

    res.once("finish", () => {
        const durationMs = Number((performance.now() - startedAt).toFixed(2));

        if (durationMs >= SLOW_REQUEST_THRESHOLD_MS) {
            req.log.warn({
                event: "HTTP_SLOW_REQUEST",
                durationMs,
                method: req.method,
                route: getPathWithoutQuery(req.originalUrl)
            }, "Endpoint lento detectado.");
        }
    });

    return httpLogger(req, res, next);
}

export {
    getPathWithoutQuery,
    requestLogger,
    SLOW_REQUEST_THRESHOLD_MS
};
