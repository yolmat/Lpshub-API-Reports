import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const QUERY_CODES = Object.freeze([
    "FBL5N_LC",
    "FBL5N_NS",
    "FBL5N_CR",
    "FBL5N_RI",
    "FBL5N_AD",
    "FBL5N_JU_LCM",
    "FBL5N_DS_LCM"
]);

const QUERY_NAMES = Object.freeze([
    "FBL5N: Lançamentos contábeis",
    "FBL5N: Notas fiscais de saída",
    "FBL5N: Recebimentos",
    "FBL5N: Reconciliações internas",
    "FBL5N: Adiantamentos",
    "FBL5N: Juros de lançamento contábil",
    "FBL5N: Descontos de lançamento contábil"
]);

const DOCUMENT_COLUMNS = Object.freeze([
    "BPLId",
    "BPLName",
    "Empresa",
    "TransType",
    "CreatedBy",
    "DocNum",
    "Tipo de Documento",
    "CodPN",
    "PN",
    "Código do PN",
    "Contrato",
    "PV",
    "LCM",
    "LCMInterno",
    "U_UPP_NumeroParcela",
    "SourceLine",
    "RefDate",
    "DueDate",
    "TaxDate",
    "Valor",
    "ReconNum",
    "ReconSum",
    "ReconDate",
    "LineMemo",
    "Ref1",
    "Ref2",
    "Ref3Line",
    "CreateDate",
    "CreateTime",
    "UserSign",
    "ContraAct",
    "AcctName"
]);

const PARAMETER_FILTER = `WHERE
    B0."BPLId" BETWEEN :bplIdInicial AND :bplIdFinal
    AND B0."RefDate" BETWEEN :refDateInicial AND :refDateFinal
    AND B0."DueDate" BETWEEN :dueDateInicial AND :dueDateFinal

`;

function splitOriginalQuery(source) {
    const documentosMarker = /\bDocumentos\s+as\s*\(/i.exec(source);
    const finalSelectMarker = /\n\)\s*\n\s*select\s*\n\s*B0\."BPLId"/i.exec(source);

    if (!documentosMarker || !finalSelectMarker) {
        throw new Error("Não foi possível localizar as seções da FBL5N original.");
    }

    const documentBodyStart = documentosMarker.index
        + documentosMarker[0].lastIndexOf("(")
        + 1;
    const commonPrefix = source.slice(0, documentBodyStart).replace(
        /Documentos\s+as\s*\($/i,
        `Documentos (\n${DOCUMENT_COLUMNS.map((column) => `    "${column}"`).join(",\n")}\n) AS (`
    );
    const documentBody = source.slice(documentBodyStart, finalSelectMarker.index);
    const finalSelect = source.slice(finalSelectMarker.index);
    const blocks = documentBody
        .split(/\n\s*union\s+all\s*\n/gi)
        .map((block) => block.trim())
        .filter(Boolean);

    if (blocks.length !== QUERY_CODES.length) {
        throw new Error(
            `A FBL5N original deve conter ${QUERY_CODES.length} blocos; encontrados ${blocks.length}.`
        );
    }

    return { commonPrefix, blocks, finalSelect };
}

function addParameterizedFilter(finalSelect) {
    const orderByMarker = /\nORDER BY 5\s*$/i;

    if (!orderByMarker.test(finalSelect)) {
        throw new Error("Não foi possível localizar a ordenação final da FBL5N.");
    }

    return finalSelect.replace(orderByMarker, `\n${PARAMETER_FILTER}`).trimEnd();
}

function buildFbl5nSqlQueryDefinitions(source) {
    const { commonPrefix, blocks, finalSelect } = splitOriginalQuery(source);
    const parameterizedFinalSelect = addParameterizedFilter(finalSelect);

    return QUERY_CODES.map((SqlCode, index) => ({
        SqlCode,
        SqlName: QUERY_NAMES[index],
        SqlText: `${commonPrefix}\n${blocks[index]}\n${parameterizedFinalSelect}`
    }));
}

function loadFbl5nSqlQueryDefinitions() {
    const sourcePath = fileURLToPath(new URL("./FBL5N.sql", import.meta.url));
    const source = readFileSync(sourcePath, "utf8");

    return buildFbl5nSqlQueryDefinitions(source);
}

export {
    buildFbl5nSqlQueryDefinitions,
    loadFbl5nSqlQueryDefinitions,
    QUERY_CODES
};
