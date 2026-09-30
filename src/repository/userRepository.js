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

export {
    createUser,
    findUserById,
    findUserByLogin,
    findUserByLoginAndEmail,
    updateUserPassword
};
