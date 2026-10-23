import { consultarFbl5n } from "../services/fbl5nService.js";

async function consultar(req, res, next) {
    try {
        const records = await consultarFbl5n(req.validated.body);

        return res.status(200).json({ success: true, data: records });
    } catch (error) {
        return next(error);
    }
}

export { consultar };
