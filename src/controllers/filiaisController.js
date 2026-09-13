import { listarFiliais } from "../services/filiaisService.js";

async function listar(req, res, next) {
    try {
        const filiais = await listarFiliais();

        return res.status(200).json({
            success: true,
            data: filiais
        });
    } catch (error) {
        return next(error);
    }
}

export { listar };
