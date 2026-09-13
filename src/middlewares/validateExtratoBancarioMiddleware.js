import AppError from "../utils/AppError.js";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function getSingleBodyValue(value) {
    return typeof value === "string" ? value.trim() : "";
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
        throw new AppError("O campo empresa deve conter pelo menos uma empresa.", 400, "INVALID_COMPANIES");
    }

    const empresas = value.map((empresa) => (
        typeof empresa === "string" ? empresa.trim() : ""
    ));

    if (empresas.some((empresa) => !empresa)) {
        throw new AppError("O campo empresa deve conter somente textos preenchidos.", 400, "INVALID_COMPANIES");
    }

    return empresas;
}

function validateExtratoBancario(req, res, next) {
    try {
        const body = req.body || {};
        const empresas = getEmpresas(body.empresa);
        const dataInicial = formatarDataParaSap(getSingleBodyValue(body.dataInicial), "dataInicial");
        const dataFinal = formatarDataParaSap(getSingleBodyValue(body.dataFinal), "dataFinal");

        if (dataInicial > dataFinal) {
            throw new AppError("A dataInicial nao pode ser posterior a dataFinal.", 400, "INVALID_DATE_RANGE");
        }

        req.extratoBancarioQuery = { empresas, dataInicial, dataFinal };
        return next();
    } catch (error) {
        return next(error);
    }
}

export default validateExtratoBancario;
