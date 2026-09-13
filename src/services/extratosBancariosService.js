import { getExtratosBancarios } from "../integrations/sapServiceLayerClient.js";

async function listarExtratosBancarios(filtros) {
    return getExtratosBancarios(filtros);
}

export { listarExtratosBancarios };
