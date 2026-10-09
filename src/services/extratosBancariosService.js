import { getExtratosBancarios } from "../integrations/sapServiceLayerClient.js";
import auditService from "./auditService.js";
import {
    AUDIT_ACTIONS,
    AUDIT_EVENTS,
    AUDIT_TARGET_SYSTEMS
} from "../utils/auditEvents.js";

async function listarExtratosBancarios(filtros) {
    const metadata = {
        empresaCount: filtros.empresas.length,
        dateCount: filtros.datas?.length ?? 0,
        dateStart: filtros.dataInicial,
        dateEnd: filtros.dataFinal
    };

    auditService.registerRequestEvent({
        eventType: AUDIT_EVENTS.REPORT_EXECUTED,
        action: AUDIT_ACTIONS.BANK_STATEMENT_SEARCH,
        targetSystem: AUDIT_TARGET_SYSTEMS.SAP_B1,
        metadata
    });

    const records = await getExtratosBancarios(filtros);

    auditService.registerRequestEvent({
        eventType: AUDIT_EVENTS.REPORT_EXECUTED,
        action: AUDIT_ACTIONS.BANK_STATEMENT_SEARCH,
        targetSystem: AUDIT_TARGET_SYSTEMS.SAP_B1,
        responseCount: records.length,
        metadata
    });

    return records;
}

export { listarExtratosBancarios };
