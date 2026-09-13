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
