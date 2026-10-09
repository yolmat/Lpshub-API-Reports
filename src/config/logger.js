import pino from "pino";

import { getSafeLogContext } from "../middlewares/requestContext.js";

const REDACTED_PATHS = [
    "authorization",
    "cookie",
    "password",
    "senha",
    "token",
    "accessToken",
    "refreshToken",
    "sessionId",
    "sessionToken",
    "apiKey",
    "secret",
    "connectionString",
    "DATABASE_URL",
    "Authorization",
    "Cookie",
    "Password",
    "SessionId",
    "B1SESSION",
    "CompanyDB",
    "UserName",
    "req.headers.authorization",
    "req.headers.cookie",
    "req.headers['set-cookie']",
    "res.headers['set-cookie']",
    "headers.authorization",
    "headers.cookie",
    "body.password",
    "body.senha",
    "body.token",
    "body.accessToken",
    "body.refreshToken",
    "body.sessionId",
    "body.sessionToken",
    "body.apiKey",
    "*.authorization",
    "*.cookie",
    "*.password",
    "*.senha",
    "*.token",
    "*.accessToken",
    "*.refreshToken",
    "*.sessionId",
    "*.sessionToken",
    "*.apiKey",
    "*.secret",
    "*.Authorization",
    "*.Cookie",
    "*.Password",
    "*.SessionId",
    "*.B1SESSION",
    "*.CompanyDB",
    "*.UserName"
];

function serializeError(error) {
    return {
        type: error?.name,
        message: error?.message,
        stack: error?.stack,
        code: error?.code
    };
}

function getLoggerOptions(destination, overrides = {}) {
    const pretty = overrides.pretty ?? (
        !destination
        && !process.env.NODE_TEST_CONTEXT
        && process.env.NODE_ENV !== "production"
    );
    const options = {
        base: { service: "lpshub-api-reports" },
        level: overrides.level ?? (process.env.NODE_TEST_CONTEXT ? "silent" : "info"),
        mixin: getSafeLogContext,
        redact: {
            paths: REDACTED_PATHS,
            remove: true
        },
        serializers: { err: serializeError },
        timestamp: pino.stdTimeFunctions.isoTime
    };

    if (pretty) {
        options.transport = {
            target: "pino-pretty",
            options: {
                colorize: Boolean(process.stdout.isTTY),
                singleLine: true,
                translateTime: "SYS:standard"
            }
        };
    }

    return options;
}

function createLogger(destination, overrides = {}) {
    const options = getLoggerOptions(destination, overrides);

    return destination ? pino(options, destination) : pino(options);
}

const logger = createLogger();

export { createLogger, getLoggerOptions, REDACTED_PATHS, serializeError };
export default logger;
