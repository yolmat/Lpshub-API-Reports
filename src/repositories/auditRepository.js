import prisma from "./prisma.js";

function createAuditLog(data) {
    return prisma.auditLog.create({ data });
}

export { createAuditLog };
