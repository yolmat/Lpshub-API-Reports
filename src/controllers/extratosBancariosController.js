import { listarExtratosBancarios } from "../services/extratosBancariosService.js";

async function listar(req, res, next) {
    try {
        const { empresa, datas, dataInicial, dataFinal } = req.validated.body;
        const filtros = datas?.length
            ? { empresas: empresa, datas }
            : { empresas: empresa, dataInicial, dataFinal };
        const extratos = await listarExtratosBancarios(filtros);

        return res.status(200).json({
            success: true,
            data: extratos
        });
    } catch (error) {
        return next(error);
    }
}

export { listar };
