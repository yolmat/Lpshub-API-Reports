import { listarExtratosBancarios } from "../services/extratosBancariosService.js";

async function listar(req, res, next) {
    try {
        const extratos = await listarExtratosBancarios(req.extratoBancarioQuery);

        return res.status(200).json({
            success: true,
            data: extratos
        });
    } catch (error) {
        return next(error);
    }
}

export { listar };
