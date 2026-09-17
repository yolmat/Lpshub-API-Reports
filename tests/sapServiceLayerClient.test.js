import assert from "node:assert/strict";
import test from "node:test";
import {
    getAllFiliais,
    getExtratosBancarios
} from "../src/integrations/sapServiceLayerClient.js";

test("monta o filtro de extrato bancario e encerra a sessao SAP", async (t) => {
    const originalFetch = globalThis.fetch;
    const calls = [];

    globalThis.fetch = async (input, options = {}) => {
        const url = input.toString();
        calls.push({ url, method: options.method || "GET" });

        if (url.endsWith("/Login")) {
            return new Response(JSON.stringify({ SessionId: "sessao-teste" }), {
                status: 200,
                headers: { "content-type": "application/json" }
            });
        }

        if (url.endsWith("/Logout")) {
            return new Response(null, { status: 204 });
        }

        return new Response(JSON.stringify({ value: [{ AccountName: "EBC" }] }), {
            status: 200,
            headers: { "content-type": "application/json" }
        });
    };

    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    const extratos = await getExtratosBancarios({
        empresas: ["LPSI", "LSUL", "EBC"],
        dataInicial: "2025-06-01",
        dataFinal: "2025-06-30"
    });

    assert.deepEqual(extratos, [{ AccountName: "EBC" }]);
    const queryUrl = new URL(calls[1].url);
    assert.equal(queryUrl.pathname, "/b1s/v1/BankPages");
    assert.equal(
        queryUrl.searchParams.get("$filter"),
        "(endswith(AccountName,'LPSI') or endswith(AccountName,'LSUL') or endswith(AccountName,'EBC')) and DueDate ge '2025-06-01' and DueDate le '2025-06-30'"
    );
    assert.deepEqual(
        calls.map(({ method, url }) => ({ method, url: new URL(url).pathname })),
        [
            { method: "POST", url: "/b1s/v1/Login" },
            { method: "GET", url: "/b1s/v1/BankPages" },
            { method: "POST", url: "/b1s/v1/Logout" }
        ]
    );
});

test("monta o filtro de extrato bancario para datas especificas", async (t) => {
    const originalFetch = globalThis.fetch;
    const calls = [];

    globalThis.fetch = async (input, options = {}) => {
        const url = input.toString();
        calls.push({ url, method: options.method || "GET" });

        if (url.endsWith("/Login")) {
            return new Response(JSON.stringify({ SessionId: "sessao-teste" }), {
                status: 200,
                headers: { "content-type": "application/json" }
            });
        }

        if (url.endsWith("/Logout")) {
            return new Response(null, { status: 204 });
        }

        return new Response(JSON.stringify({ value: [] }), {
            status: 200,
            headers: { "content-type": "application/json" }
        });
    };

    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    await getExtratosBancarios({
        empresas: ["EBC"],
        datas: ["2026-04-01", "2026-04-02", "2026-04-05"]
    });

    const queryUrl = new URL(calls[1].url);
    assert.equal(
        queryUrl.searchParams.get("$filter"),
        "(endswith(AccountName,'EBC')) and (DueDate eq '2026-04-01' or DueDate eq '2026-04-02' or DueDate eq '2026-04-05')"
    );
});

test("consulta todas as páginas de filiais e encerra a sessão SAP", async (t) => {
    const originalFetch = globalThis.fetch;
    const calls = [];

    globalThis.fetch = async (input, options = {}) => {
        const url = input.toString();
        const method = options.method || "GET";
        calls.push({ url, method, headers: options.headers });

        if (url.endsWith("/Login")) {
            return new Response(JSON.stringify({ SessionId: "sessao-teste" }), {
                status: 200,
                headers: { "content-type": "application/json" }
            });
        }

        if (url.endsWith("/Logout")) {
            return new Response(null, { status: 204 });
        }

        if (url.includes("$skip=20")) {
            return new Response(JSON.stringify({
                value: [{ IDSAP: 2, Sigla: "LITB" }]
            }), {
                status: 200,
                headers: { "content-type": "application/json" }
            });
        }

        return new Response(JSON.stringify({
            value: [{ IDSAP: 1, Sigla: "LITA" }],
            "odata.nextLink": "SQLQueries('LpsHub-GetDadosFiliais')/List?&$skip=20"
        }), {
            status: 200,
            headers: { "content-type": "application/json" }
        });
    };

    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    const filiais = await getAllFiliais();

    assert.deepEqual(filiais, [
        { IDSAP: 1, Sigla: "LITA" },
        { IDSAP: 2, Sigla: "LITB" }
    ]);
    assert.deepEqual(
        calls.map(({ method, url }) => ({ method, url: new URL(url).pathname + new URL(url).search })),
        [
            { method: "POST", url: "/b1s/v1/Login" },
            { method: "GET", url: "/b1s/v1/SQLQueries('LpsHub-GetDadosFiliais')/List" },
            { method: "GET", url: "/b1s/v1/SQLQueries('LpsHub-GetDadosFiliais')/List?&$skip=20" },
            { method: "POST", url: "/b1s/v1/Logout" }
        ]
    );
    assert.equal(calls[1].headers.Cookie, "B1SESSION=sessao-teste");
    assert.equal(calls[3].headers.Cookie, "B1SESSION=sessao-teste");
});

test("encerra a sessão SAP quando a consulta de filiais falha", async (t) => {
    const originalFetch = globalThis.fetch;
    const calls = [];

    globalThis.fetch = async (input, options = {}) => {
        const url = input.toString();
        calls.push({ url, method: options.method || "GET" });

        if (url.endsWith("/Login")) {
            return new Response(JSON.stringify({ SessionId: "sessao-teste" }), {
                status: 200,
                headers: { "content-type": "application/json" }
            });
        }

        if (url.endsWith("/Logout")) {
            return new Response(null, { status: 204 });
        }

        return new Response(JSON.stringify({ error: { message: "Falha" } }), {
            status: 500,
            headers: { "content-type": "application/json" }
        });
    };

    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    await assert.rejects(getAllFiliais, { code: "SAP_REQUEST_ERROR" });
    assert.deepEqual(
        calls.map(({ method, url }) => ({ method, url: new URL(url).pathname })),
        [
            { method: "POST", url: "/b1s/v1/Login" },
            { method: "GET", url: "/b1s/v1/SQLQueries('LpsHub-GetDadosFiliais')/List" },
            { method: "POST", url: "/b1s/v1/Logout" }
        ]
    );
});
