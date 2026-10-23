import { getFbl5nBlocks } from "../integrations/sapServiceLayerClient.js";
import auditService from "./auditService.js";
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
    const bplRange = getRange(
        filters.BPLId,
        undefined,
        undefined,
        0,
        MAX_BPL_ID
    );
    const refDateRange = getRange(
        filters.RefDate,
        filters.RefDateInicial,
        filters.RefDateFinal,
        MIN_DATE,
        MAX_DATE
    );
    const dueDateRange = getRange(
        filters.DueDate,
        filters.DueDateInicial,
        filters.DueDateFinal,
        MIN_DATE,
        MAX_DATE
    );

    return {
        bplIdInicial: bplRange.initial,
        bplIdFinal: bplRange.final,
        refDateInicial: refDateRange.initial,
        refDateFinal: refDateRange.final,
        dueDateInicial: dueDateRange.initial,
        dueDateFinal: dueDateRange.final
    };
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

function filterRecords(records, filters) {
    const bplIds = new Set(filters.BPLId.map(String));

    return records.filter((record) => (
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
    ));
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
        dueDateEnd: filters.DueDateFinal,
        clientStart: filters.clienteInicial,
        clientEnd: filters.clienteFinal
    };
}

async function consultarFbl5n(filters) {
    const metadata = createAuditMetadata(filters);

    auditService.registerRequestEvent({
        eventType: AUDIT_EVENTS.REPORT_EXECUTED,
        action: AUDIT_ACTIONS.FBL5N_SEARCH,
        targetSystem: AUDIT_TARGET_SYSTEMS.SAP_B1,
        metadata
    });

    const blocks = await getFbl5nBlocks(createSqlParameters(filters));
    const records = filterRecords(blocks.flatMap(({ records: items }) => items), filters);

    records.sort(compareDocumentNumber);

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
    filterRecords
};
