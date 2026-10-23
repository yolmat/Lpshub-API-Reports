import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

process.env.SAP_SERVICE_LAYER_URL = "https://sap.example.test";
process.env.SAP_SERVICE_LAYER_COMPANY_DB = "EMPRESA_TESTE";
process.env.SAP_SERVICE_LAYER_USERNAME = "usuario_teste";
process.env.SAP_SERVICE_LAYER_PASSWORD = "senha_teste";

const {
    buildFbl5nDeployedSqlQueryDefinitions,
    buildFbl5nSqlQueryDefinitions,
    CLIENT_BATCH_SIZE,
    QUERY_CODES,
    splitOriginalQuery
} = await import("../src/integrations/fbl5nSqlQueries.js");
const { assertSapFilters, createSqlParameters, createSqlParameterSets, filterRecords } = await import("../src/services/fbl5nService.js");
const { projectFbl5nBlocks } = await import("../src/services/fbl5nProjection.js");
const { getFbl5nBlocks } = await import("../src/integrations/sapServiceLayerClient.js");
const { compareRecordSets } = await import("../scripts/compareFbl5nResults.js");

const source = readFileSync(new URL("../docs/implementation/FBL5N.sql", import.meta.url), "utf8");

function emptyFilters() {
    return {
        BPLId: [],
        CardCode: [],
        RefDate: [],
        DueDate: []
    };
}

function multiset(records) {
    const counts = new Map();

    for (const record of records) {
        const key = JSON.stringify(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return [...counts].sort(([left], [right]) => left.localeCompare(right));
}

test("as sete SQLQueries preservam os blocos e a projeção do SQL original", () => {
    const original = splitOriginalQuery(source);
    const definitions = buildFbl5nSqlQueryDefinitions(source);

    assert.deepEqual(definitions.map(({ SqlCode }) => SqlCode), QUERY_CODES);
    assert.equal(original.blocks.length, 7);

    definitions.forEach((definition, index) => {
        const generated = readFileSync(
            new URL(`../docs/implementation/sqlqueries/${definition.SqlCode}.sql`, import.meta.url),
            "utf8"
        );

        assert.equal(generated, `${definition.SqlText}\n`);
        assert.equal(definition.SqlText.includes(original.blocks[index]), true);
        assert.equal((definition.SqlText.match(/\bunion\s+all\b/gi) ?? []).length, 0);
        assert.equal(definition.SqlText.includes('LEFT JOIN OUSR B1 ON B0."UserSign" = B1."USERID"'), true);
        assert.equal(definition.SqlText.includes('B0."BPLId" AS "Cod.Filial"'), true);
        assert.equal(definition.SqlText.includes('B1."U_NAME" AS "Criado por"'), true);
        assert.equal(definition.SqlText.includes(':bplIdAtivo = 0'), true);
        assert.equal(definition.SqlText.includes(':refDateAtivo = 0'), true);
        assert.equal(definition.SqlText.includes(':dueDateAtivo = 0'), true);
        assert.equal(definition.SqlText.includes('B0."CodPN" IN (:c0,'), true);
        assert.equal(definition.SqlText.includes(':c24)'), true);
        assert.equal(definition.SqlText.includes('B0."CodPN" >= :clienteInicial'), true);
    });
});

test("manifesto preparado das sete SQLQueries filtra as colunas efetivas de cada bloco", () => {
    const deployed = JSON.parse(readFileSync(
        new URL("../docs/implementation/sqlqueries/FBL5N_7_SQLQueries_ServiceLayer.json", import.meta.url),
        "utf8"
    ));
    const filtered = buildFbl5nDeployedSqlQueryDefinitions(deployed);
    const generated = JSON.parse(readFileSync(
        new URL("../docs/implementation/sqlqueries/FBL5N_7_SQLQueries_ServiceLayer_filtradas.json", import.meta.url),
        "utf8"
    ));

    assert.deepEqual(generated, filtered);
    filtered.forEach((definition, index) => {
        assert.equal(definition.SqlText.startsWith(deployed[index].SqlText.trimEnd()), true);
        assert.equal(definition.SqlText.includes('"CardCode" IN (:c0,'), true);
        assert.equal(definition.SqlText.includes(':c24)'), true);
        assert.equal(definition.SqlText.includes('"CardCode" >= :clienteInicial'), true);
        assert.equal(definition.SqlText.includes('"CardCode" <= :clienteFinal'), true);
        const parameters = [...new Set(definition.SqlText.match(/:[A-Za-z][A-Za-z0-9_]*/g))]
            .map((name) => name.slice(1));
        assert.equal(parameters.join(",").length <= 254, true);
    });
    assert.equal(filtered[0].SqlText.includes('BP."CardCode" IN (:c0,'), true);
    assert.equal(filtered[5].SqlText.includes('ABP."CardCode" IN (:c0,'), true);
    assert.equal(filtered[6].SqlText.includes('AJL."BPLId"'), true);
});

test("filtros ausentes permanecem amplos; listas criam partições exatas no SAP", () => {
    const noFilter = createSqlParameters(emptyFilters());
    const selected = createSqlParameterSets({
        ...emptyFilters(),
        BPLId: [2, 4],
        RefDate: ["2026-01-01", "2026-01-03"]
    });

    assert.equal(noFilter.bplIdInicial, 0);
    assert.equal(noFilter.clienteTodos, "%");
    assert.equal(selected.length, 4);
    assert.deepEqual(selected.map(({ bplIdInicial, bplIdFinal, refDateInicial, refDateFinal }) => (
        [bplIdInicial, bplIdFinal, refDateInicial, refDateFinal]
    )), [
        [2, 2, "2026-01-01", "2026-01-01"],
        [2, 2, "2026-01-03", "2026-01-03"],
        [4, 4, "2026-01-01", "2026-01-01"],
        [4, 4, "2026-01-03", "2026-01-03"]
    ]);
    const contiguous = createSqlParameterSets({
        ...emptyFilters(),
        BPLId: [3, 2, 1],
        RefDate: ["2026-01-03", "2026-01-02", "2026-01-01"]
    });
    assert.equal(contiguous.length, 1);
    assert.equal(contiguous[0].bplIdInicial, 1);
    assert.equal(contiguous[0].bplIdFinal, 3);
    assert.equal(contiguous[0].refDateInicial, "2026-01-01");
    assert.equal(contiguous[0].refDateFinal, "2026-01-03");
});

test("parametriza até 25 clientes por lote e preserva intervalos sem filtrar na API", () => {
    const single = createSqlParameters({
        ...emptyFilters(),
        CardCode: ["CPJ000443"]
    });
    const list = createSqlParameterSets({
        ...emptyFilters(),
        CardCode: ["CPJ000443", "CPJ000444"]
    });
    const range = createSqlParameters({
        ...emptyFilters(),
        CardCode: ["CPJ000443"],
        clienteInicial: "CPJ000400",
        clienteFinal: "CPJ000499"
    });

    assert.equal(single.clienteTodos, "");
    assert.equal(single.clienteInicial, "1");
    assert.equal(single.clienteFinal, "0");
    assert.equal(single.c0, "CPJ000443");
    assert.equal(single.c24, "CPJ000443");
    assert.equal(list.length, 1);
    assert.equal(list[0].c0, "CPJ000443");
    assert.equal(list[0].c1, "CPJ000444");
    assert.equal(list[0].c24, "CPJ000443");
    assert.equal(range.clienteInicial, "CPJ000400");
    assert.equal(range.clienteFinal, "CPJ000499");
    assert.equal(range.c0, "CPJ000400");
    assert.equal(createSqlParameters({
        ...emptyFilters(),
        CardCode: ["A&B"]
    }).c0, "A&B");
});

test("mil clientes únicos geram 40 lotes de até 25 sem sobreposição", () => {
    const codes = Array.from(
        { length: 1000 },
        (_, index) => `CPJ${String(index + 1).padStart(6, "0")}`
    );
    const sets = createSqlParameterSets({
        ...emptyFilters(),
        CardCode: [...codes, codes[0]]
    });

    assert.equal(CLIENT_BATCH_SIZE, 25);
    assert.equal(sets.length, 40);
    assert.deepEqual(
        sets.flatMap((set) => Array.from(
            { length: CLIENT_BATCH_SIZE },
            (_, index) => set[`c${index}`]
        )),
        codes
    );
    assert.equal(sets.every((set) => (
        set.clienteInicial === "1" && set.clienteFinal === "0"
    )), true);
});

test("rejeita registros que uma SQLQuery SAP não filtrou", () => {
    const filters = { ...emptyFilters(), CardCode: ["CPJ000443"] };
    const rows = [{ CodPN: "CPJ000443" }, { CodPN: "CPJ000444" }];

    assert.doesNotThrow(() => assertSapFilters(rows.slice(0, 1), filters));
    assert.throws(() => assertSapFilters(rows, filters), { code: "SAP_RESPONSE_ERROR" });
    assert.equal(rows.length, 2);
});

test("consolidação preserva duplicatas e aplica os filtros exatos do código existente", () => {
    const duplicate = {
        "Cod.Filial": 2,
        CodPN: "CPF000123",
        "Dt Lançamento": "20260102",
        "Dt Vencimento": "2026-02-03",
        "NºDoc": 10,
        Valor: 12.5
    };
    const other = { ...duplicate, "Cod.Filial": 3, "NºDoc": 11, Valor: null };
    const originalRows = [duplicate, { ...duplicate }, other];
    const blocks = [[duplicate], [{ ...duplicate }], [other], [], [], [], []];
    const consolidated = blocks.flat();

    assert.deepEqual(multiset(consolidated), multiset(originalRows));
    assert.deepEqual(filterRecords(consolidated, emptyFilters()), originalRows);
    assert.deepEqual(filterRecords(consolidated, {
        ...emptyFilters(),
        BPLId: [2],
        RefDate: ["2026-01-02"]
    }), [duplicate, duplicate]);
});

test("projeta os campos intermediários do SAP antes de aplicar o filtro da rota", () => {
    const raw = {
        BPLId: 1,
        BPLName: "Filial de teste",
        DocNum: 42,
        TipoDocumento: "LC",
        CodPN: "CPF000123",
        RefDate: "20260110",
        DueDate: "20260210",
        DebitRaw: 15,
        CreditRaw: 3,
        ReconSumRaw: 4,
        ReconIsCredit: "C",
        CreateTimeRaw: 930
    };
    const blocks = QUERY_CODES.map((queryCode) => ({
        queryCode,
        records: queryCode === "FBL5N_LC" ? [raw] : []
    }));
    const projected = projectFbl5nBlocks(blocks);
    const filtered = filterRecords(projected, {
        ...emptyFilters(),
        BPLId: [1, 2],
        RefDateInicial: "2026-01-01",
        RefDateFinal: "2026-01-20"
    });

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]["Cod.Filial"], 1);
    assert.equal(filtered[0]["Dt Lançamento"], "20260110");
    assert.equal(filtered[0]["NºDoc"], 42);
    assert.equal(filtered[0].Valor, 12);
    assert.equal(filtered[0]["Vlr Reconciliado"], -4);
    assert.equal(filtered[0]["Hora Executou lçmto"], "09:30");
    assert.equal(Object.keys(filtered[0]).length, 30);
});

test("agrupa adiantamentos como o SQL original e mantém a projeção final existente", () => {
    const advance = {
        BPLId: 1,
        RefDate: "20260110",
        DueDate: "20260111",
        DocNum: 15,
        DebitRaw: 10,
        CreditRaw: 0,
        UserSignGroup: 2
    };
    const projected = projectFbl5nBlocks(QUERY_CODES.map((queryCode) => ({
        queryCode,
        records: queryCode === "FBL5N_AD"
            ? [advance, { ...advance, DebitRaw: 5 }]
            : queryCode === "FBL5N_NS"
                ? [{ "Cod.Filial": 1, "Dt Lançamento": "20260110" }]
                : []
    })));

    assert.equal(projected.length, 2);
    assert.deepEqual(projected[0], { "Cod.Filial": 1, "Dt Lançamento": "20260110" });
    assert.equal(projected[1].Valor, 15);
    assert.equal(projected[1]["Tipo de Documento"], "AD");
    assert.equal(projected[1]["NºParcela"], 0);
});

test("rejeita um formato SAP desconhecido em vez de retornar um relatório vazio", () => {
    assert.throws(
        () => projectFbl5nBlocks([{ queryCode: "FBL5N_LC", records: [{ OutroCampo: 1 }] }]),
        { code: "SAP_RESPONSE_ERROR" }
    );
});

test("comparação de resultados detecta diferenças de valor e de multiplicidade", () => {
    const original = [{ a: 1, b: null }, { a: 1, b: null }, { a: 2, b: 4 }];

    assert.equal(compareRecordSets(original, [
        { b: null, a: 1 },
        { a: 2, b: 4 },
        { a: 1, b: null }
    ]).equivalent, true);
    assert.deepEqual(compareRecordSets(original, [
        { a: 1, b: null },
        { a: 2, b: 5 }
    ]), {
        originalCount: 3,
        optimizedCount: 2,
        missing: 2,
        additional: 1,
        equivalent: false
    });
});

test("consulta as sete SQLQueries na mesma sessão, percorre páginas e encerra por logout", async (t) => {
    const originalFetch = globalThis.fetch;
    const calls = [];

    globalThis.fetch = async (input, options = {}) => {
        const url = new URL(input);
        const method = options.method ?? "GET";
        calls.push({ url, method, options });

        if (url.pathname.endsWith("/Login")) {
            return Response.json({ SessionId: "sessao-sap-teste" });
        }

        if (url.pathname.endsWith("/Logout")) {
            return new Response(null, { status: 204 });
        }

        const code = /SQLQueries\('([^']+)'\)/.exec(url.pathname)?.[1];
        const isSecondPage = url.searchParams.has("$skip");

        return Response.json({
            value: [{ code, page: isSecondPage ? 2 : 1 }],
            ...(!isSecondPage && code === "FBL5N_LC"
                ? { "odata.nextLink": "SQLQueries('FBL5N_LC')/List?$skip=1" }
                : {})
        });
    };
    t.after(() => { globalThis.fetch = originalFetch; });

    const blocks = await getFbl5nBlocks(createSqlParameterSets({
        ...emptyFilters(),
        BPLId: [1, 3],
        CardCode: ["CPJ000443"],
        RefDate: ["2026-01-01", "2026-01-03"],
        DueDateInicial: "2026-02-01",
        DueDateFinal: "2026-02-28"
    }));
    const queryCalls = calls.filter(({ url }) => url.pathname.includes("SQLQueries"));

    assert.deepEqual(blocks.map(({ queryCode }) => queryCode), QUERY_CODES);
    assert.equal(blocks[0].records.length, 8);
    assert.equal(queryCalls.length, 32);
    assert.equal(calls[0].url.pathname, "/b1s/v1/Login");
    assert.equal(calls.at(-1).url.pathname, "/b1s/v1/Logout");
    assert.equal(queryCalls.filter(({ method }) => method === "POST").length, 28);
    assert.equal(queryCalls.filter(({ method }) => method === "GET").length, 4);
    assert.equal(queryCalls.every(({ options }) => options.headers.Cookie === "B1SESSION=sessao-sap-teste"), true);
    assert.equal(queryCalls.every(({ options }) => options.headers.Prefer === "odata.maxpagesize=1000"), true);
    const paramLists = queryCalls
        .filter(({ method }) => method === "POST")
        .map(({ options }) => JSON.parse(options.body).ParamList);
    assert.deepEqual([...new Set(paramLists.map((value) => /bplIdInicial=(\d+)/.exec(value)?.[1]))], ["1", "3"]);
    assert.deepEqual([...new Set(paramLists.map((value) => /refDateInicial='([^']+)'/.exec(value)?.[1]))], ["2026-01-01", "2026-01-03"]);
    assert.equal(paramLists.every((value) => value.includes("dueDateInicial='2026-02-01'")), true);
    assert.equal(paramLists.every((value) => !value.includes("clienteTodos=")), true);
    assert.equal(paramLists.every((value) => value.includes("clienteInicial='1'")), true);
    assert.equal(paramLists.every((value) => value.includes("c0='CPJ000443'")), true);
    assert.equal(paramLists.every((value) => value.includes("c24='CPJ000443'")), true);
});

test("executa lotes de clientes em sequência e preserva os sete blocos", async (t) => {
    const originalFetch = globalThis.fetch;
    const started = [];
    let completedFirstBatch = 0;

    globalThis.fetch = async (input, options = {}) => {
        const path = new URL(input).pathname;
        if (path.endsWith("/Login")) return Response.json({ SessionId: "sessao-sap-teste" });
        if (path.endsWith("/Logout")) return new Response(null, { status: 204 });

        const code = /SQLQueries\('([^']+)'\)/.exec(path)?.[1];
        const paramList = JSON.parse(options.body).ParamList;
        const secondBatch = paramList.includes("c0='CPJ000026'");
        started.push({ code, secondBatch, completedFirstBatch });
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (!secondBatch) completedFirstBatch += 1;
        return Response.json({ value: [{ code, secondBatch }] });
    };
    t.after(() => { globalThis.fetch = originalFetch; });

    const codes = Array.from(
        { length: 26 },
        (_, index) => `CPJ${String(index + 1).padStart(6, "0")}`
    );
    const blocks = await getFbl5nBlocks(createSqlParameterSets({
        ...emptyFilters(), CardCode: codes
    }));

    assert.equal(started.length, 14);
    assert.equal(started.slice(0, 7).every(({ secondBatch }) => !secondBatch), true);
    assert.equal(started.slice(7).every(({ secondBatch, completedFirstBatch: completed }) => (
        secondBatch && completed === 7
    )), true);
    assert.equal(blocks.every(({ records }) => records.length === 2), true);
});

test("consulta as versões base no SAP quando nenhum cliente é informado", async (t) => {
    const originalFetch = globalThis.fetch;
    const calls = [];

    globalThis.fetch = async (input, options = {}) => {
        const path = new URL(input).pathname;
        calls.push({ path, options });

        if (path.endsWith("/Login")) return Response.json({ SessionId: "sessao-sap-teste" });
        if (path.endsWith("/Logout")) return new Response(null, { status: 204 });
        return Response.json({ value: [] });
    };
    t.after(() => { globalThis.fetch = originalFetch; });

    const blocks = await getFbl5nBlocks(createSqlParameterSets(emptyFilters()));
    const queryCalls = calls.filter(({ path }) => path.includes("SQLQueries"));

    assert.deepEqual(blocks.map(({ queryCode }) => queryCode), QUERY_CODES);
    assert.equal(queryCalls.length, 7);
    assert.equal(queryCalls.every(({ path }) => path.includes("_BASE')/List")), true);
    assert.equal(queryCalls.every(({ options }) => (
        !JSON.parse(options.body).ParamList.includes("cliente")
    )), true);
});

test("aguarda consultas em andamento antes de encerrar a sessão quando um bloco falha", async (t) => {
    const originalFetch = globalThis.fetch;
    const calls = [];

    globalThis.fetch = async (input) => {
        const path = new URL(input).pathname;
        calls.push(path);

        if (path.endsWith("/Login")) {
            return Response.json({ SessionId: "sessao-sap-teste" });
        }

        if (path.endsWith("/Logout")) {
            return new Response(null, { status: 204 });
        }

        if (path.includes("FBL5N_NS")) {
            return Response.json({ error: "falha" }, { status: 500 });
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
        calls.push(`concluído:${path}`);
        return Response.json({ value: [] });
    };
    t.after(() => { globalThis.fetch = originalFetch; });

    await assert.rejects(
        getFbl5nBlocks(createSqlParameters(emptyFilters())),
        { code: "SAP_REQUEST_ERROR" }
    );

    assert.equal(calls.at(-1), "/b1s/v1/Logout");
    assert.equal(calls.filter((item) => item.startsWith("concluído:")).length, 6);
});
