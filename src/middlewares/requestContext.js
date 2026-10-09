import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const requestContextStorage = new AsyncLocalStorage();
const CONTEXT_FIELDS = new Set(["requestId", "userId", "sessionId", "ip"]);

function requestContext(req, res, next) {
    const context = {
        requestId: randomUUID(),
        userId: null,
        sessionId: null,
        ip: req.ip
    };

    req.id = context.requestId;
    res.setHeader("X-Request-ID", context.requestId);

    return requestContextStorage.run(context, next);
}

function getRequestContext() {
    return requestContextStorage.getStore() ?? {};
}

function updateRequestContext(values) {
    const context = requestContextStorage.getStore();

    if (!context) {
        return;
    }

    for (const [key, value] of Object.entries(values)) {
        if (CONTEXT_FIELDS.has(key)) {
            context[key] = value;
        }
    }
}

function getSafeLogContext() {
    const { requestId, userId, ip } = getRequestContext();

    return Object.fromEntries(
        Object.entries({ requestId, userId, ip })
            .filter(([, value]) => value !== null && value !== undefined)
    );
}

export {
    getRequestContext,
    getSafeLogContext,
    requestContext,
    updateRequestContext
};
