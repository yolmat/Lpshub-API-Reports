import { getAllFiliais } from "../integrations/sapServiceLayerClient.js";

async function listarFiliais() {
    return getAllFiliais();
}

export { listarFiliais };
