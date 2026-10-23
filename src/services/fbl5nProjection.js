import AppError from "../utils/AppError.js";

const GROUPED_QUERIES = new Set(["FBL5N_AD", "FBL5N_JU_LCM", "FBL5N_DS_LCM"]);
const SIGNED_RECON_QUERIES = new Set(["FBL5N_LC", "FBL5N_RI", "FBL5N_JU_LCM", "FBL5N_DS_LCM"]);

function formatCreateTime(value) {
    if (value === null || value === undefined) {
        return null;
    }

    const lastFour = `0${value}`.slice(-4);
    return `${lastFour.slice(0, 2)}:${lastFour.slice(-2)}`;
}

function getReconciledAmount(record, queryCode) {
    if (queryCode === "FBL5N_AD") {
        return 0;
    }

    const amount = record.ReconSumRaw;

    if (!SIGNED_RECON_QUERIES.has(queryCode)) {
        return amount ?? null;
    }

    if (record.ReconIsCredit === "C") {
        return amount === null || amount === undefined ? null : -amount;
    }

    return record.ReconIsCredit === "D" ? amount ?? null : null;
}

function projectRecord(record, queryCode) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
        throw new AppError(
            "O SAP retornou campos incompletos para a FBL5N.",
            502,
            "SAP_RESPONSE_ERROR"
        );
    }

    if (Object.hasOwn(record, "Cod.Filial")) {
        return record;
    }

    if (!["BPLId", "RefDate", "DebitRaw", "CreditRaw"].every((key) => Object.hasOwn(record, key))) {
        throw new AppError(
            "O SAP retornou campos incompletos para a FBL5N.",
            502,
            "SAP_RESPONSE_ERROR"
        );
    }

    const isAdvance = queryCode === "FBL5N_AD";
    const isAdjustment = queryCode === "FBL5N_JU_LCM" || queryCode === "FBL5N_DS_LCM";

    return {
        "Cod.Filial": record.BPLId ?? null,
        "Razão Filial": record.BPLName ?? null,
        Empresa: record.Empresa ?? null,
        DocOrigem: isAdvance || isAdjustment ? 0 : record.CreatedBy ?? null,
        "NºDoc": record.DocNum ?? null,
        "Tipo de Documento": isAdvance ? "AD" : record.TipoDocumento ?? null,
        CodPN: record.CodPN ?? null,
        PN: record.PN ?? null,
        "Código do PN": record.CodigoPN ?? null,
        Contrato: isAdvance || isAdjustment
            ? ""
            : queryCode === "FBL5N_CR"
                ? record.Contrato ?? record.PaymentContrato ?? null
                : record.Contrato ?? null,
        PV: isAdvance || isAdjustment ? "" : record.PV ?? null,
        LCM: record.LCM ?? null,
        LCMInterno: isAdvance ? 0 : record.LCMInterno ?? null,
        "NºParcela": isAdvance || isAdjustment ? 0 : record.NumeroParcela ?? null,
        "Dt Lançamento": record.RefDate ?? null,
        "Dt Vencimento": record.DueDate ?? null,
        "Dt Documento": record.TaxDate ?? null,
        Valor: Number(record.DebitRaw) - Number(record.CreditRaw),
        "nºDocumento de Compensação": isAdvance ? 0 : record.ReconNum ?? null,
        "Vlr Reconciliado": getReconciledAmount(record, queryCode),
        "Dt Reconciliação": isAdvance ? "" : record.ReconDate ?? null,
        Observações: record.LineMemo ?? null,
        "Chv.ref.1": record.Ref1 ?? null,
        "Chv.ref.2": record.Ref2 ?? null,
        "Chv.ref.3": record.Ref3Line ?? null,
        "Dt.Executou lçmto": record.CreateDate ?? null,
        "Hora Executou lçmto": formatCreateTime(record.CreateTimeRaw),
        "Criado por": record.CriadoPor ?? null,
        "Conta Contra partida": isAdjustment ? "" : record.ContraAct ?? null,
        "Desc.Conta Contra partida": isAdjustment
            ? ""
            : record.ContraAcctName ?? record.ContraCardName ?? null
    };
}

function groupProjectedRecords(records, queryCode) {
    const grouped = new Map();

    for (const record of records) {
        const projected = projectRecord(record, queryCode);
        const { Valor, ...columns } = projected;
        // O SQL original agrupa também campos que não aparecem na projeção final.
        const extraGroupColumns = queryCode === "FBL5N_AD"
            ? [record.ContraAcctName, record.ContraCardName, record.UserSignGroup]
            : [record.BaseTransType, record.ReconIsCredit, record.ReconSumRaw, record.UserSignGroup];
        const key = JSON.stringify([columns, extraGroupColumns]);
        const existing = grouped.get(key);

        if (existing) {
            existing.Valor += Valor;
        } else {
            grouped.set(key, projected);
        }
    }

    return [...grouped.values()];
}

function projectFbl5nBlocks(blocks) {
    return blocks.flatMap(({ queryCode, records }) => {
        if (records.length === 0 || (records[0] && Object.hasOwn(records[0], "Cod.Filial"))) {
            return records;
        }

        return GROUPED_QUERIES.has(queryCode)
            ? groupProjectedRecords(records, queryCode)
            : records.map((record) => projectRecord(record, queryCode));
    });
}

export { projectFbl5nBlocks };
