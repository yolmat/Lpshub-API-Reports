// Referência histórica; a integração executada pela API está em src/integrations/sapServiceLayerClient.js.
import { sapServiceLayerConfig } from "../config/env.js";
import AppError from "../utils/AppError.js";

const SAP_API_PATH = "/b1s/v1/";
const FBL5N_QUERY_PAGE_SIZE = 1000;
const FBL5N_QUERY_CONCURRENCY = 10;
const FBL5N_LOGOUT_RESERVE_MS = 10000;
const FBL5N_QUERY_CODES = Object.freeze([
    "FBL5N_LC",
    "FBL5N_NS",
    "FBL5N_CR",
    "FBL5N_RI",
    "FBL5N_AD",
    "FBL5N_JU_LCM",
    "FBL5N_DS_LCM"
]);
const SENSITIVE_SAP_FIELDS = new Set([
    "accesstoken",
    "apikey",
    "api_key",
    "authorization",
    "b1session",
    "companydb",
    "cookie",
    "password",
    "refreshtoken",
    "secret",
    "session",
    "sessionid",
    "set-cookie",
    "token",
    "username"
]);

function sanitizeSapData(value) {
    if (Array.isArray(value)) {
        return value.map(sanitizeSapData);
    }

    if (!value || typeof value !== "object") {
        return value;
    }

    return Object.fromEntries(
        Object.entries(value)
            .filter(([key]) => !SENSITIVE_SAP_FIELDS.has(key.toLowerCase()))
            .map(([key, fieldValue]) => [key, sanitizeSapData(fieldValue)])
    );
}

function getConfig() {
    const { url, login, timeoutMs } = sapServiceLayerConfig;

    if (!url || !login.companyDb || !login.userName || !login.password) {
        throw new AppError(
            "A configuração de integração com o SAP está incompleta.",
            500,
            "SAP_CONFIGURATION_ERROR"
        );
    }

    return { url, login, timeoutMs };
}

function getApiBaseUrl(baseUrl) {
    return new URL(SAP_API_PATH, `${baseUrl.replace(/\/$/, "")}/`);
}

function getCookieHeader(response, body) {
    const setCookies = typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [response.headers.get("set-cookie")].filter(Boolean);

    const cookies = setCookies.map((cookie) => cookie.split(";", 1)[0]);

    if (cookies.length > 0) {
        return cookies.join("; ");
    }

    if (body?.SessionId) {
        return `B1SESSION=${body.SessionId}`;
    }

    throw new AppError(
        "O SAP não retornou uma sessão válida.",
        502,
        "SAP_SESSION_ERROR"
    );
}

async function parseResponse(response) {
    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
        return null;
    }

    return response.json();
}

async function requestSap(url, options = {}) {
    const { timeoutMs: configuredTimeoutMs } = getConfig();
    const {
        requestTimeoutMs = configuredTimeoutMs,
        ...fetchOptions
    } = options;
    const abortController = new AbortController();
    const timeoutId = setTimeout(
        () => abortController.abort(),
        requestTimeoutMs
    );

    try {
        const response = await fetch(url, {
            ...fetchOptions,
            signal: abortController.signal
        });
        const body = await parseResponse(response);

        if (!response.ok) {
            throw new AppError(
                "Não foi possível concluir a consulta no SAP.",
                502,
                "SAP_REQUEST_ERROR"
            );
        }

        return { response, body };
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        const isTimeout = error.name === "AbortError";
        throw new AppError(
            isTimeout
                ? "A consulta ao SAP excedeu o tempo limite."
                : "Não foi possível comunicar com o SAP.",
            502,
            isTimeout ? "SAP_TIMEOUT" : "SAP_CONNECTION_ERROR"
        );
    } finally {
        clearTimeout(timeoutId);
    }
}

async function login(requestTimeoutMs) {
    const { url, login: credentials } = getConfig();
    const loginUrl = new URL("Login", getApiBaseUrl(url));
    const { response, body } = await requestSap(loginUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        requestTimeoutMs,
        body: JSON.stringify({
            CompanyDB: credentials.companyDb,
            UserName: credentials.userName,
            Password: credentials.password
        })
    });

    return getCookieHeader(response, body);
}

async function logout(cookie, requestTimeoutMs) {
    const { url } = getConfig();
    const logoutUrl = new URL("Logout", getApiBaseUrl(url));

    await requestSap(logoutUrl, {
        method: "POST",
        headers: { Cookie: cookie },
        requestTimeoutMs
    });
}

function getNextPageUrl(nextLink, baseUrl) {
    const nextPageUrl = new URL(nextLink, getApiBaseUrl(baseUrl));
    const sapUrl = new URL(baseUrl);

    if (nextPageUrl.origin !== sapUrl.origin) {
        throw new AppError(
            "O SAP retornou uma URL de paginação inválida.",
            502,
            "SAP_PAGINATION_ERROR"
        );
    }

    return nextPageUrl;
}

async function getAllPages(initialPageUrl, cookie, resourceName) {
    const { url } = getConfig();
    const records = [];
    const visitedUrls = new Set();
    let pageUrl = initialPageUrl;

    while (pageUrl) {
        if (visitedUrls.has(pageUrl.href)) {
            throw new AppError(
                "O SAP retornou uma paginacao repetida.",
                502,
                "SAP_PAGINATION_ERROR"
            );
        }

        visitedUrls.add(pageUrl.href);
        const { body } = await requestSap(pageUrl, {
            headers: { Cookie: cookie }
        });

        if (!body || !Array.isArray(body.value)) {
            throw new AppError(
                `O SAP retornou uma resposta de ${resourceName} invalida.`,
                502,
                "SAP_RESPONSE_ERROR"
            );
        }

        records.push(...sanitizeSapData(body.value));
        pageUrl = body["odata.nextLink"]
            ? getNextPageUrl(body["odata.nextLink"], url)
            : null;
    }

    return records;
}

function formatSqlQueryParameter(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
    }

    if (typeof value === "string") {
        return `'${value.replaceAll("'", "''")}'`;
    }

    throw new TypeError("Parâmetro de SQLQuery inválido.");
}

function createSqlQueryParamList(parameters) {
    return Object.entries(parameters)
        .map(([name, value]) => `${name}=${formatSqlQueryParameter(value)}`)
        .join("&");
}

function getRemainingTime(deadline) {
    const remainingTime = deadline - Date.now();

    if (remainingTime <= 0) {
        throw new AppError(
            "A geração da FBL5N excedeu o tempo limite.",
            502,
            "SAP_TIMEOUT"
        );
    }

    return remainingTime;
}

async function getAllSqlQueryPages(queryCode, parameters, cookie, deadline) {
    const { url } = getConfig();
    const records = [];
    const visitedUrls = new Set();
    let pageUrl = new URL(
        `SQLQueries('${queryCode}')/List`,
        getApiBaseUrl(url)
    );
    let isFirstPage = true;

    while (pageUrl) {
        if (visitedUrls.has(pageUrl.href)) {
            throw new AppError(
                "O SAP retornou uma paginação repetida.",
                502,
                "SAP_PAGINATION_ERROR"
            );
        }

        visitedUrls.add(pageUrl.href);
        const requestOptions = {
            method: isFirstPage ? "POST" : "GET",
            requestTimeoutMs: getRemainingTime(deadline),
            headers: {
                Cookie: cookie,
                Prefer: `odata.maxpagesize=${FBL5N_QUERY_PAGE_SIZE}`
            }
        };

        if (isFirstPage) {
            requestOptions.headers["Content-Type"] = "application/json";
            requestOptions.body = JSON.stringify({
                ParamList: createSqlQueryParamList(parameters)
            });
        }

        const { body } = await requestSap(pageUrl, requestOptions);

        if (!body || !Array.isArray(body.value)) {
            throw new AppError(
                `O SAP retornou uma resposta inválida para ${queryCode}.`,
                502,
                "SAP_RESPONSE_ERROR"
            );
        }

        records.push(...sanitizeSapData(body.value));
        pageUrl = body["odata.nextLink"]
            ? getNextPageUrl(body["odata.nextLink"], url)
            : null;
        isFirstPage = false;
    }

    return records;
}

async function mapWithConcurrency(items, concurrency, operation) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            results[currentIndex] = await operation(
                items[currentIndex],
                currentIndex
            );
        }
    }

    const workerCount = Math.min(concurrency, items.length);
    await Promise.all(Array.from({ length: workerCount }, worker));

    return results;
}

async function getFbl5nBlocks(parameters) {
    const { timeoutMs } = getConfig();
    const totalTimeoutMs = Math.max(
        1,
        timeoutMs - FBL5N_LOGOUT_RESERVE_MS
    );
    const deadline = Date.now() + totalTimeoutMs;
    const cookie = await login(getRemainingTime(deadline));
    let operationError;

    try {
        return await mapWithConcurrency(
            FBL5N_QUERY_CODES,
            FBL5N_QUERY_CONCURRENCY,
            async (queryCode) => ({
                queryCode,
                records: await getAllSqlQueryPages(
                    queryCode,
                    parameters,
                    cookie,
                    deadline
                )
            })
        );
    } catch (error) {
        operationError = error;
        throw error;
    } finally {
        try {
            await logout(cookie, FBL5N_LOGOUT_RESERVE_MS);
        } catch (logoutError) {
            if (!operationError) {
                throw logoutError;
            }
        }
    }
}

async function executeWithSapSession(operation) {
    const cookie = await login();
    let operationError;

    try {
        return await operation(cookie);
    } catch (error) {
        operationError = error;
        throw error;
    } finally {
        try {
            await logout(cookie);
        } catch (logoutError) {
            if (!operationError) {
                throw logoutError;
            }
        }
    }
}

async function checkServiceLayerConnection() {
    await executeWithSapSession(async () => undefined);
}

async function getAllFiliais() {
    const { url } = getConfig();
    const cookie = await login();
    let operationError;

    try {
        const filiais = [];
        const visitedUrls = new Set();
        let pageUrl = new URL(
            "SQLQueries('LpsHub-GetDadosFiliais')/List",
            getApiBaseUrl(url)
        );

        while (pageUrl) {
            if (visitedUrls.has(pageUrl.href)) {
                throw new AppError(
                    "O SAP retornou uma paginação repetida.",
                    502,
                    "SAP_PAGINATION_ERROR"
                );
            }

            visitedUrls.add(pageUrl.href);
            const { body } = await requestSap(pageUrl, {
                headers: { Cookie: cookie }
            });

            if (!body || !Array.isArray(body.value)) {
                throw new AppError(
                    "O SAP retornou uma resposta de filiais inválida.",
                    502,
                    "SAP_RESPONSE_ERROR"
                );
            }

            filiais.push(...sanitizeSapData(body.value));
            pageUrl = body["odata.nextLink"]
                ? getNextPageUrl(body["odata.nextLink"], url)
                : null;
        }

        return filiais;
    } catch (error) {
        operationError = error;
        throw error;
    } finally {
        try {
            await logout(cookie);
        } catch (logoutError) {
            if (!operationError) {
                throw logoutError;
            }
        }
    }
}

function escapeOdataString(value) {
    return value.replaceAll("'", "''");
}

async function getExtratosBancarios({ empresas, dataInicial, dataFinal, datas }) {
    const { url } = getConfig();
    const pageUrl = new URL("BankPages", getApiBaseUrl(url));
    const accountFilters = empresas.map((empresa) => (
        `endswith(AccountName,'${escapeOdataString(empresa)}')`
    ));
    const dateFilter = datas
        ? `(${datas.map((data) => `DueDate eq '${data}'`).join(" or ")})`
        : `DueDate ge '${dataInicial}' and DueDate le '${dataFinal}'`;
    const filter = [
        `(${accountFilters.join(" or ")})`,
        dateFilter
    ].join(" and ");

    pageUrl.searchParams.set("$filter", filter);

    return executeWithSapSession((cookie) => (
        getAllPages(pageUrl, cookie, "extratos bancarios")
    ));
}

export {
    checkServiceLayerConnection,
    FBL5N_QUERY_CODES,
    getAllFiliais,
    getExtratosBancarios,
    getFbl5nBlocks
};
