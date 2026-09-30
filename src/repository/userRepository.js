import prisma from "./prisma.js";

function createUser(data) {
    return prisma.user.create({ data });
}

function findUserByLogin(login) {
    return prisma.user.findUnique({ where: { login } });
}

function findUserById(id) {
    return prisma.user.findUnique({ where: { id } });
}

function findUserByLoginAndEmail(login, email) {
    return prisma.user.findFirst({ where: { login, email } });
}

function updateUserPassword(id, passwordHash) {
    return prisma.user.update({
        where: { id },
        data: { passwordHash }
    });
}

function createUserSession(data) {
    return prisma.userSession.create({ data });
}

function findUserSessionById(id) {
    return prisma.userSession.findUnique({ where: { id } });
}

function updateUserSessionActivity(id, lastActivityAt) {
    return prisma.userSession.update({
        where: { id },
        data: { lastActivityAt }
    });
}

function deleteUserSession(id) {
    return prisma.userSession.delete({ where: { id } });
}

export {
    createUserSession,
    createUser,
    deleteUserSession,
    findUserById,
    findUserByLogin,
    findUserByLoginAndEmail,
    findUserSessionById,
    updateUserSessionActivity,
    updateUserPassword
};
