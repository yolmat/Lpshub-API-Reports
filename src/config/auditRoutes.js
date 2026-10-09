import {
    AUDIT_ACTIONS,
    AUDIT_EVENTS,
    AUDIT_TARGET_SYSTEMS
} from "../utils/auditEvents.js";

function defineRoute({
    method,
    path,
    fullPath,
    eventType,
    action,
    targetSystem
}) {
    return Object.freeze({
        method,
        path,
        fullPath,
        audit: Object.freeze({ eventType, action, targetSystem })
    });
}

const AUDITED_ROUTES = Object.freeze({
    API_STATUS: defineRoute({
        method: "GET",
        path: "/",
        fullPath: "/api",
        eventType: AUDIT_EVENTS.HTTP_REQUEST_COMPLETED,
        action: AUDIT_ACTIONS.API_STATUS_CHECK,
        targetSystem: AUDIT_TARGET_SYSTEMS.APPLICATION
    }),
    HEALTH: defineRoute({
        method: "GET",
        path: "/health",
        fullPath: "/health",
        eventType: AUDIT_EVENTS.HTTP_REQUEST_COMPLETED,
        action: AUDIT_ACTIONS.HEALTH_CHECK,
        targetSystem: AUDIT_TARGET_SYSTEMS.APPLICATION
    }),
    AUTH_LOGIN: defineRoute({
        method: "POST",
        path: "/auth/login",
        fullPath: "/api/v1/auth/login",
        eventType: AUDIT_EVENTS.AUTH_LOGIN_SUCCESS,
        action: AUDIT_ACTIONS.AUTHENTICATE,
        targetSystem: AUDIT_TARGET_SYSTEMS.APPLICATION
    }),
    AUTH_ME: defineRoute({
        method: "GET",
        path: "/auth/me",
        fullPath: "/api/v1/auth/me",
        eventType: AUDIT_EVENTS.USER_VIEWED,
        action: AUDIT_ACTIONS.VIEW_CURRENT_USER,
        targetSystem: AUDIT_TARGET_SYSTEMS.APPLICATION
    }),
    AUTH_LOGOUT: defineRoute({
        method: "POST",
        path: "/auth/logout",
        fullPath: "/api/v1/auth/logout",
        eventType: AUDIT_EVENTS.AUTH_LOGOUT,
        action: AUDIT_ACTIONS.LOGOUT,
        targetSystem: AUDIT_TARGET_SYSTEMS.POSTGRESQL
    }),
    AUTH_REGISTER: defineRoute({
        method: "POST",
        path: "/auth/register",
        fullPath: "/api/v1/auth/register",
        eventType: AUDIT_EVENTS.USER_CREATED,
        action: AUDIT_ACTIONS.CREATE_USER,
        targetSystem: AUDIT_TARGET_SYSTEMS.POSTGRESQL
    }),
    AUTH_USERS: defineRoute({
        method: "GET",
        path: "/auth/users",
        fullPath: "/api/v1/auth/users",
        eventType: AUDIT_EVENTS.USER_LISTED,
        action: AUDIT_ACTIONS.LIST_USERS,
        targetSystem: AUDIT_TARGET_SYSTEMS.POSTGRESQL
    }),
    AUTH_PASSWORD_RESET: defineRoute({
        method: "POST",
        path: "/auth/password-reset",
        fullPath: "/api/v1/auth/password-reset",
        eventType: AUDIT_EVENTS.USER_UPDATED,
        action: AUDIT_ACTIONS.RESET_USER_PASSWORD,
        targetSystem: AUDIT_TARGET_SYSTEMS.POSTGRESQL
    }),
    AUTH_DEACTIVATE: defineRoute({
        method: "POST",
        path: "/auth/deactivate",
        fullPath: "/api/v1/auth/deactivate",
        eventType: AUDIT_EVENTS.USER_DISABLED,
        action: AUDIT_ACTIONS.DISABLE_USER,
        targetSystem: AUDIT_TARGET_SYSTEMS.POSTGRESQL
    }),
    BANK_STATEMENTS: defineRoute({
        method: "POST",
        path: "/extratos-bancarios",
        fullPath: "/api/v1/extratos-bancarios",
        eventType: AUDIT_EVENTS.REPORT_EXECUTED,
        action: AUDIT_ACTIONS.BANK_STATEMENT_SEARCH,
        targetSystem: AUDIT_TARGET_SYSTEMS.SAP_B1
    }),
    BRANCHES: defineRoute({
        method: "GET",
        path: "/filiais",
        fullPath: "/api/v1/filiais",
        eventType: AUDIT_EVENTS.REPORT_EXECUTED,
        action: AUDIT_ACTIONS.BRANCH_LIST,
        targetSystem: AUDIT_TARGET_SYSTEMS.SAP_B1
    }),
    SERVICE_LAYER: defineRoute({
        method: "GET",
        path: "/service-layer",
        fullPath: "/api/v1/service-layer",
        eventType: AUDIT_EVENTS.SERVICE_LAYER_CONNECTION_CHECK,
        action: AUDIT_ACTIONS.CHECK_SERVICE_LAYER_CONNECTION,
        targetSystem: AUDIT_TARGET_SYSTEMS.SAP_B1
    })
});

function normalizePath(path) {
    return path.length > 1 ? path.replace(/\/$/, "") : path;
}

function findAuditedRoute(method, path) {
    const normalizedPath = normalizePath(path);

    return Object.values(AUDITED_ROUTES).find((route) => (
        route.method === method && route.fullPath === normalizedPath
    )) ?? null;
}

export { AUDITED_ROUTES, findAuditedRoute };
