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
const CLIENT_BATCH_SIZE = 25;

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
    (:bplIdAtivo = 0 OR B0."BPLId" BETWEEN :bplIdInicial AND :bplIdFinal)
    AND (:refDateAtivo = 0 OR B0."RefDate" BETWEEN :refDateInicial AND :refDateFinal)
    AND (:dueDateAtivo = 0 OR B0."DueDate" BETWEEN :dueDateInicial AND :dueDateFinal)

`;

const DEPLOYED_CLIENT_COLUMNS = Object.freeze({
    FBL5N_LC: 'BP."CardCode"',
    FBL5N_NS: 'BP."CardCode"',
    FBL5N_CR: 'BP."CardCode"',
    FBL5N_RI: 'BP."CardCode"',
    FBL5N_AD: 'BP."CardCode"',
    FBL5N_JU_LCM: 'ABP."CardCode"',
    FBL5N_DS_LCM: 'ABP."CardCode"'
});

function buildClientFilter(cardCode) {
    const clientParameters = Array.from(
        { length: CLIENT_BATCH_SIZE },
        (_, index) => `:c${index}`
    ).join(", ");

    return `AND (${cardCode} IN (${clientParameters}) OR (${cardCode} >= :clienteInicial AND ${cardCode} <= :clienteFinal))`;
}

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

    return `${finalSelect.replace(orderByMarker, `\n${PARAMETER_FILTER}`).trimEnd()}\n${buildClientFilter('B0."CodPN"')}`;
}

function buildFbl5nDeployedSqlQueryDefinitions(definitions) {
    if (definitions.length !== QUERY_CODES.length
        || definitions.some((item, index) => item.SqlCode !== QUERY_CODES[index])) {
        throw new Error("As sete SQLQueries SAP devem estar na ordem conhecida.");
    }

    return definitions.map((definition) => {
        if (!/:dueDateFinal\s*$/.test(definition.SqlText)) {
            throw new Error(`Filtro final não encontrado em ${definition.SqlCode}.`);
        }

        return {
            ...definition,
            SqlText: `${definition.SqlText.trimEnd()}\n${buildClientFilter(
                DEPLOYED_CLIENT_COLUMNS[definition.SqlCode]
            )}`
        };
    });
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
    const sourcePath = fileURLToPath(new URL("../../docs/implementation/FBL5N.sql", import.meta.url));
    const source = readFileSync(sourcePath, "utf8");

    return buildFbl5nSqlQueryDefinitions(source);
}

export {
    buildFbl5nSqlQueryDefinitions,
    buildFbl5nDeployedSqlQueryDefinitions,
    loadFbl5nSqlQueryDefinitions,
    CLIENT_BATCH_SIZE,
    QUERY_CODES,
    splitOriginalQuery
};
