import { sapServiceLayerConfig } from "../config/env.js";
import AppError from "../utils/AppError.js";

const SAP_API_PATH = "/b1s/v1/";

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
    const { timeoutMs } = getConfig();
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
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

async function login() {
    const { url, login: credentials } = getConfig();
    const loginUrl = new URL("Login", getApiBaseUrl(url));
    const { response, body } = await requestSap(loginUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            CompanyDB: credentials.companyDb,
            UserName: credentials.userName,
            Password: credentials.password
        })
    });

    return getCookieHeader(response, body);
}

async function logout(cookie) {
    const { url } = getConfig();
    const logoutUrl = new URL("Logout", getApiBaseUrl(url));

    await requestSap(logoutUrl, {
        method: "POST",
        headers: { Cookie: cookie }
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

        records.push(...body.value);
        pageUrl = body["odata.nextLink"]
            ? getNextPageUrl(body["odata.nextLink"], url)
            : null;
    }

    return records;
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

            filiais.push(...body.value);
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

export { getAllFiliais, getExtratosBancarios };
