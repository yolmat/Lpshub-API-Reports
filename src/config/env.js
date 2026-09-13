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

export { sapServiceLayerConfig };
