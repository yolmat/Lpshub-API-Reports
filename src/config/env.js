import dotenv from "dotenv";

dotenv.config({ quiet: true });

const getEnvValue = (name) => process.env[name]?.trim();
const DEFAULT_SAP_SERVICE_LAYER_TIMEOUT_MS = 300000;

const getTimeout = () => {
    const timeout = Number.parseInt(
        getEnvValue("SAP_SERVICE_LAYER_TIMEOUT_MS"),
        10
    );

    return Number.isSafeInteger(timeout) && timeout > 0
        ? timeout
        : DEFAULT_SAP_SERVICE_LAYER_TIMEOUT_MS;
};

const sapServiceLayerConfig = Object.freeze({
    url: getEnvValue("SAP_SERVICE_LAYER_URL"),
    login: Object.freeze({
        companyDb: getEnvValue("SAP_SERVICE_LAYER_COMPANY_DB"),
        userName: getEnvValue("SAP_SERVICE_LAYER_USERNAME"),
        password: getEnvValue("SAP_SERVICE_LAYER_PASSWORD")
    }),
    timeoutMs: getTimeout()
});

function getAllowedCorsOrigins(value) {
    if (!value) {
        return [];
    }

    return [...new Set(value.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
        .flatMap((origin) => {
            try {
                const url = new URL(origin);

                const isOrigin = (url.protocol === "http:" || url.protocol === "https:")
                    && url.pathname === "/"
                    && !url.search
                    && !url.hash
                    && !url.username
                    && !url.password;

                return [isOrigin ? url.origin : null];
            } catch {
                return [];
            }
        })
        .filter(Boolean))];
}

function getTrustProxy(value) {
    const proxyCount = Number.parseInt(value, 10);

    return Number.isSafeInteger(proxyCount) && proxyCount > 0
        ? proxyCount
        : false;
}

function getHttpSecurityConfig(env = process.env) {
    return Object.freeze({
        isProduction: env.NODE_ENV === "production",
        allowedCorsOrigins: Object.freeze(
            getAllowedCorsOrigins(env.CORS_ALLOWED_ORIGINS)
        ),
        trustProxy: getTrustProxy(env.TRUST_PROXY)
    });
}

export { getHttpSecurityConfig, sapServiceLayerConfig };
