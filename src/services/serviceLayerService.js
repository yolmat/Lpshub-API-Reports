import { checkServiceLayerConnection } from "../integrations/sapServiceLayerClient.js";
import auditService from "./auditService.js";
import {
    AUDIT_ACTIONS,
    AUDIT_EVENTS,
    AUDIT_TARGET_SYSTEMS
} from "../utils/auditEvents.js";

async function verificarConexaoServiceLayer() {
    await checkServiceLayerConnection();

    auditService.registerRequestEvent({
        eventType: AUDIT_EVENTS.SERVICE_LAYER_CONNECTION_CHECK,
        action: AUDIT_ACTIONS.CHECK_SERVICE_LAYER_CONNECTION,
        targetSystem: AUDIT_TARGET_SYSTEMS.SAP_B1
    });
}

export { verificarConexaoServiceLayer };
