import { verificarConexaoServiceLayer } from "../services/serviceLayerService.js";

async function verificarConexao(req, res, next) {
    try {
        await verificarConexaoServiceLayer();

        return res.status(200).json({
            message: "Service Layer funcionando"
        });
    } catch (error) {
        return next(error);
    }
}

export { verificarConexao };
