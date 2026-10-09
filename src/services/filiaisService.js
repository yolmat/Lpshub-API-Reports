import { getAllFiliais } from "../integrations/sapServiceLayerClient.js";
import auditService from "./auditService.js";
import {
    AUDIT_ACTIONS,
    AUDIT_EVENTS,
    AUDIT_TARGET_SYSTEMS
} from "../utils/auditEvents.js";

async function listarFiliais() {
    auditService.registerRequestEvent({
        eventType: AUDIT_EVENTS.REPORT_EXECUTED,
        action: AUDIT_ACTIONS.BRANCH_LIST,
        targetSystem: AUDIT_TARGET_SYSTEMS.SAP_B1
    });

    const records = await getAllFiliais();

    auditService.registerRequestEvent({
        eventType: AUDIT_EVENTS.REPORT_EXECUTED,
        action: AUDIT_ACTIONS.BRANCH_LIST,
        targetSystem: AUDIT_TARGET_SYSTEMS.SAP_B1,
        responseCount: records.length
    });

    return records;
}

export { listarFiliais };
