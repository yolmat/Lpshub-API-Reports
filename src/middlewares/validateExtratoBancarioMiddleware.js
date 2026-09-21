import AppError from "../utils/AppError.js";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function getSingleBodyValue(value) {
    return typeof value === "string" ? value.trim() : "";
}

function isDatasEmpty(value) {
    return value === undefined
        || value === null
        || (typeof value === "string" && !value.trim())
        || (Array.isArray(value) && value.length === 0);
}

function formatarDataParaSap(value, fieldName) {
    const match = value.match(DATE_PATTERN);

    if (!match) {
        throw new AppError(`O campo ${fieldName} deve estar no formato AAAA-MM-DD.`, 400, "INVALID_DATE_FORMAT");
    }

    const [, year, month, day] = match;
    const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime()) || date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) {
        throw new AppError(`O campo ${fieldName} contem uma data invalida.`, 400, "INVALID_DATE");
    }

    return value;
}

function getEmpresas(value) {
    if (!Array.isArray(value) || value.length === 0) {
        throw new AppError("O campo EMPRESA deve conter pelo menos uma filial.", 400, "INVALID_COMPANIES");
    }

    const empresas = value.map((empresa) => (
        typeof empresa === "string" ? empresa.trim() : ""
    ));

    if (empresas.some((empresa) => !empresa)) {
        throw new AppError("O campo EMPRESA deve conter somente textos preenchidos.", 400, "INVALID_COMPANIES");
    }

    return empresas;
}

function getDatas(value) {
    if (isDatasEmpty(value)) {
        return undefined;
    }

    if (!Array.isArray(value) || value.length === 0) {
        throw new AppError("O campo DATAS deve conter pelo menos uma data.", 400, "INVALID_DATES");
    }

    return value.map((data) => (
        formatarDataParaSap(getSingleBodyValue(data), "DATAS")
    ));
}

function validateExtratoBancario(req, res, next) {
    try {
        const body = req.body || {};
        const empresas = getEmpresas(body.empresa);
        const datas = getDatas(body.datas);
        const dataInicial = getSingleBodyValue(body.dataInicial);
        const dataFinal = getSingleBodyValue(body.dataFinal);

        if (datas) {
            req.extratoBancarioQuery = { empresas, datas };
            return next();
        }

        if (!dataInicial && !dataFinal) {
            throw new AppError("O campo DATAS deve conter pelo menos uma data.", 400, "INVALID_DATES");
        }

        if (!dataInicial) {
            throw new AppError("O campo DATAINICIAL deve conter pelo menos uma data.", 400, "INVALID_DATE");
        }

        if (!dataFinal) {
            throw new AppError("O campo DATAFINAL deve conter pelo menos uma data.", 400, "INVALID_DATE");
        }

        const dataInicialFormatada = formatarDataParaSap(dataInicial, "DATAINICIAL");
        const dataFinalFormatada = formatarDataParaSap(dataFinal, "DATAFINAL");

        if (dataInicialFormatada > dataFinalFormatada) {
            throw new AppError("O campo DATAINICIAL nao pode ser posterior ao campo DATAFINAL.", 400, "INVALID_DATE_RANGE");
        }

        req.extratoBancarioQuery = {
            empresas,
            dataInicial: dataInicialFormatada,
            dataFinal: dataFinalFormatada
        };
        return next();
    } catch (error) {
        return next(error);
    }
}

export default validateExtratoBancario;
