import assert from "node:assert/strict";
import test from "node:test";
import validateExtratoBancario from "../src/middlewares/validateExtratoBancarioMiddleware.js";

function validar(body) {
    return new Promise((resolve) => {
        const req = { body };
        validateExtratoBancario(req, {}, (error) => {
            resolve({ error, filtros: req.extratoBancarioQuery });
        });
    });
}

test("valida e converte os filtros de extrato bancario", async () => {
    const { error, filtros } = await validar({
        empresa: ["LPSI", "LSUL", "EBC"],
        dataInicial: "2025-06-01",
        dataFinal: "2025-06-30"
    });

    assert.equal(error, undefined);
    assert.deepEqual(filtros, {
        empresas: ["LPSI", "LSUL", "EBC"],
        dataInicial: "2025-06-01",
        dataFinal: "2025-06-30"
    });
});

test("rejeita intervalo de datas invalido", async () => {
    const { error } = await validar({
        empresa: ["EBC"],
        dataInicial: "2026-04-04",
        dataFinal: "2026-04-03"
    });

    assert.equal(error.code, "INVALID_DATE_RANGE");
});

test("aceita datas especificas sem exigir intervalo", async () => {
    const { error, filtros } = await validar({
        empresa: ["EBC"],
        datas: ["2026-04-01", "2026-04-02", "2026-04-05"]
    });

    assert.equal(error, undefined);
    assert.deepEqual(filtros, {
        empresas: ["EBC"],
        datas: ["2026-04-01", "2026-04-02", "2026-04-05"]
    });
});

test("rejeita lista de datas vazia", async () => {
    const { error } = await validar({
        empresa: ["EBC"],
        datas: []
    });

    assert.equal(error.code, "INVALID_DATES");
    assert.equal(error.message, "O campo DATAS deve conter pelo menos uma data.");
});

test("rejeita empresa vazia com mensagem do campo", async () => {
    const { error } = await validar({
        empresa: [],
        dataInicial: "2026-04-01",
        dataFinal: "2026-04-05"
    });

    assert.equal(error.code, "INVALID_COMPANIES");
    assert.equal(error.message, "O campo EMPRESA deve conter pelo menos uma filial.");
});

test("rejeita a ausência de todos os filtros de data", async () => {
    const { error } = await validar({ empresa: ["EBC"] });

    assert.equal(error.code, "INVALID_DATES");
    assert.equal(error.message, "O campo DATAS deve conter pelo menos uma data.");
});

test("rejeita dataInicial ausente quando datas não é informado", async () => {
    const { error } = await validar({
        empresa: ["EBC"],
        dataFinal: "2026-04-05"
    });

    assert.equal(error.code, "INVALID_DATE");
    assert.equal(error.message, "O campo DATAINICIAL deve conter pelo menos uma data.");
});

test("rejeita dataFinal ausente quando datas não é informado", async () => {
    const { error } = await validar({
        empresa: ["EBC"],
        dataInicial: "2026-04-01"
    });

    assert.equal(error.code, "INVALID_DATE");
    assert.equal(error.message, "O campo DATAFINAL deve conter pelo menos uma data.");
});

test("aceita intervalo quando datas é enviado vazio", async () => {
    const { error, filtros } = await validar({
        empresa: ["EBC"],
        dataInicial: "2026-04-01",
        dataFinal: "2026-04-05",
        datas: []
    });

    assert.equal(error, undefined);
    assert.deepEqual(filtros, {
        empresas: ["EBC"],
        dataInicial: "2026-04-01",
        dataFinal: "2026-04-05"
    });
});
