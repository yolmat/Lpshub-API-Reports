import { getFbl5nBlocks } from "../integrations/sapServiceLayerClient.js";
import { CLIENT_BATCH_SIZE } from "../integrations/fbl5nSqlQueries.js";
import { projectFbl5nBlocks } from "./fbl5nProjection.js";
import logger from "../config/logger.js";
import auditService from "./auditService.js";
import AppError from "../utils/AppError.js";
import {
    AUDIT_ACTIONS,
    AUDIT_EVENTS,
    AUDIT_TARGET_SYSTEMS
} from "../utils/auditEvents.js";

const MIN_DATE = "0001-01-01";
const MAX_DATE = "9999-12-31";
const MAX_BPL_ID = 2147483647;

function normalizeDate(value) {
    if (typeof value !== "string") {
        return null;
    }

    if (/^\d{8}$/.test(value)) {
        return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
    }

    const isoDate = value.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate : null;
}

function getRange(values, initial, final, minimum, maximum) {
    if (initial || final) {
        return {
            initial: initial ?? minimum,
            final: final ?? maximum
        };
    }

    if (values.length > 0) {
        return {
            initial: values.reduce((smallest, value) => (
                value < smallest ? value : smallest
            )),
            final: values.reduce((largest, value) => (
                value > largest ? value : largest
            ))
        };
    }

    return { initial: minimum, final: maximum };
}

function createSqlParameters(filters) {
    return createSqlParameterSets(filters)[0];
}

function getSelectedRanges(values, initial, final, minimum, maximum) {
    if (initial || final || values.length === 0) {
        return [getRange([], initial, final, minimum, maximum)];
    }

    const ordered = [...new Set(values)].sort((left, right) => (
        left < right ? -1 : left > right ? 1 : 0
    ));
    const ordinal = (value) => typeof value === "number"
        ? value
        : Date.parse(`${value}T00:00:00Z`) / 86400000;

    return ordered.reduce((ranges, value) => {
        const last = ranges.at(-1);

        if (last && ordinal(value) === ordinal(last.final) + 1) {
            last.final = value;
        } else {
            ranges.push({ initial: value, final: value });
        }

        return ranges;
    }, []);
}

function createSqlParameterSets(filters) {
    const bplRanges = getSelectedRanges(filters.BPLId, undefined, undefined, 0, MAX_BPL_ID);
    const refRanges = getSelectedRanges(
        filters.RefDate, filters.RefDateInicial, filters.RefDateFinal, MIN_DATE, MAX_DATE
    );
    const dueRanges = getSelectedRanges(
        filters.DueDate, filters.DueDateInicial, filters.DueDateFinal, MIN_DATE, MAX_DATE
    );
    const hasClientRange = Boolean(filters.clienteInicial || filters.clienteFinal);
    const clientFamily = filters.clienteInicial?.slice(0, 3)
        ?? filters.clienteFinal?.slice(0, 3);
    const uniqueClients = [...new Set(filters.CardCode)];
    const clients = hasClientRange
        ? [{
            todos: "",
            initial: filters.clienteInicial ?? `${clientFamily}000000`,
            final: filters.clienteFinal ?? `${clientFamily}999999`,
            codes: []
        }]
        : uniqueClients.length > 0
            ? Array.from(
                { length: Math.ceil(uniqueClients.length / CLIENT_BATCH_SIZE) },
                (_, index) => ({
                    todos: "",
                    initial: "1",
                    final: "0",
                    codes: uniqueClients.slice(
                        index * CLIENT_BATCH_SIZE,
                        (index + 1) * CLIENT_BATCH_SIZE
                    )
                })
            )
            : [{ todos: "%", initial: "1", final: "0", codes: [] }];

    return bplRanges.flatMap((bpl) => refRanges.flatMap((refDate) => (
        dueRanges.flatMap((dueDate) => clients.map((client) => ({
            bplIdInicial: bpl.initial,
            bplIdFinal: bpl.final,
            refDateInicial: refDate.initial,
            refDateFinal: refDate.final,
            dueDateInicial: dueDate.initial,
            dueDateFinal: dueDate.final,
            clienteTodos: client.todos,
            clienteInicial: client.initial,
            clienteFinal: client.final,
            ...(client.todos === "%" ? {} : Object.fromEntries(
                Array.from({ length: CLIENT_BATCH_SIZE }, (_, index) => [
                    `c${index}`,
                    client.codes[index] ?? client.codes[0] ?? client.initial
                ])
            ))
        })))
    )));
}

function matchesDateFilter(value, values, initial, final) {
    const normalized = normalizeDate(value);

    if (initial || final) {
        return normalized !== null
            && (!initial || normalized >= initial)
            && (!final || normalized <= final);
    }

    return values.length === 0
        || (normalized !== null && values.includes(normalized));
}

function parseClientCode(value) {
    const match = /^(CPF|CPJ)(\d{6})$/.exec(value ?? "");

    return match
        ? { prefix: match[1], number: Number(match[2]) }
        : null;
}

function matchesClientFilter(cardCode, filters) {
    const { clienteInicial, clienteFinal, CardCode } = filters;

    if (!clienteInicial && !clienteFinal) {
        return CardCode.length === 0 || CardCode.includes(cardCode);
    }

    const parsedCardCode = parseClientCode(cardCode);
    const initial = clienteInicial ? parseClientCode(clienteInicial) : null;
    const final = clienteFinal ? parseClientCode(clienteFinal) : null;
    const family = initial?.prefix ?? final?.prefix;

    return parsedCardCode !== null
        && parsedCardCode.prefix === family
        && (!initial || parsedCardCode.number >= initial.number)
        && (!final || parsedCardCode.number <= final.number);
}

function matchesRecordFilters(record, filters, bplIds) {
    return (
        (bplIds.size === 0 || bplIds.has(String(record["Cod.Filial"])))
        && matchesClientFilter(record.CodPN, filters)
        && matchesDateFilter(
            record["Dt Lançamento"],
            filters.RefDate,
            filters.RefDateInicial,
            filters.RefDateFinal
        )
        && matchesDateFilter(
            record["Dt Vencimento"],
            filters.DueDate,
            filters.DueDateInicial,
            filters.DueDateFinal
        )
    );
}

function filterRecords(records, filters) {
    const bplIds = new Set(filters.BPLId.map(String));

    return records.filter((record) => matchesRecordFilters(record, filters, bplIds));
}

function assertSapFilters(records, filters) {
    const bplIds = new Set(filters.BPLId.map(String));

    if (records.some((record) => !matchesRecordFilters(record, filters, bplIds))) {
        throw new AppError(
            "O SAP retornou registros fora dos filtros solicitados.",
            502,
            "SAP_RESPONSE_ERROR"
        );
    }
}

function compareDocumentNumber(left, right) {
    const leftNumber = Number(left["NºDoc"]);
    const rightNumber = Number(right["NºDoc"]);

    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
        return leftNumber - rightNumber;
    }

    return String(left["NºDoc"] ?? "").localeCompare(
        String(right["NºDoc"] ?? ""),
        "pt-BR",
        { numeric: true }
    );
}

function createAuditMetadata(filters) {
    return {
        bplCount: filters.BPLId.length,
        cardCodeCount: filters.CardCode.length,
        refDateCount: filters.RefDate.length,
        dueDateCount: filters.DueDate.length,
        refDateStart: filters.RefDateInicial,
        refDateEnd: filters.RefDateFinal,
        dueDateStart: filters.DueDateInicial,
        dueDateEnd: filters.DueDateFinal
    };
}

async function consultarFbl5n(filters) {
    const startedAt = performance.now();
    const metadata = createAuditMetadata(filters);

    auditService.registerRequestEvent({
        eventType: AUDIT_EVENTS.REPORT_EXECUTED,
        action: AUDIT_ACTIONS.FBL5N_SEARCH,
        targetSystem: AUDIT_TARGET_SYSTEMS.SAP_B1,
        metadata
    });

    const blocks = await getFbl5nBlocks(createSqlParameterSets(filters));
    const sapDurationMs = Math.round(performance.now() - startedAt);
    const projectionStartedAt = performance.now();
    const projected = projectFbl5nBlocks(blocks);
    const projectionDurationMs = Math.round(performance.now() - projectionStartedAt);
    const filterStartedAt = performance.now();
    const records = projected;
    assertSapFilters(records, filters);
    const filterDurationMs = Math.round(performance.now() - filterStartedAt);

    const sortStartedAt = performance.now();
    records.sort(compareDocumentNumber);
    const sortDurationMs = Math.round(performance.now() - sortStartedAt);

    logger.info({
        event: "FBL5N_CONSOLIDATED",
        sapDurationMs,
        projectionDurationMs,
        filterDurationMs,
        sortDurationMs,
        totalMs: Math.round(performance.now() - startedAt),
        receivedCount: blocks.reduce((total, block) => total + block.records.length, 0),
        projectedCount: projected.length,
        responseCount: records.length
    }, "Relatório FBL5N consolidado.");

    auditService.registerRequestEvent({
        eventType: AUDIT_EVENTS.REPORT_EXECUTED,
        action: AUDIT_ACTIONS.FBL5N_SEARCH,
        targetSystem: AUDIT_TARGET_SYSTEMS.SAP_B1,
        responseCount: records.length,
        metadata
    });

    return records;
}

export {
    consultarFbl5n,
    createSqlParameters,
    createSqlParameterSets,
    filterRecords,
    assertSapFilters
};
