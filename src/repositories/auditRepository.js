import prisma from "../repository/prisma.js";

function createAuditLog(data) {
    return prisma.auditLog.create({ data });
}

export { createAuditLog };
