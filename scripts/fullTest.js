import "dotenv/config";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import prisma from "../src/repository/prisma.js";
import { hashPassword } from "../src/utils/passwordUtils.js";

function getFullTestUserConfig(env = process.env) {
    const login = env.FULL_TEST_ADMIN_LOGIN?.trim();
    const email = env.FULL_TEST_ADMIN_EMAIL?.trim().toLowerCase();
    const senha = env.FULL_TEST_ADMIN_PASSWORD;

    if (!login || !email || !senha) {
        throw new Error(
            "Defina FULL_TEST_ADMIN_LOGIN, FULL_TEST_ADMIN_EMAIL e FULL_TEST_ADMIN_PASSWORD no .env."
        );
    }

    return { login, email, senha };
}

async function verifyDatabase(client = prisma) {
    await client.$queryRawUnsafe("SELECT 1");
}

async function createFullTestUser(
    config,
    { client = prisma, createPasswordHash = hashPassword } = {}
) {
    const passwordHash = await createPasswordHash(config.senha);

    return client.user.upsert({
        where: { login: config.login },
        update: {
            email: config.email,
            passwordHash,
            role: "ADM",
            status: true
        },
        create: {
            login: config.login,
            email: config.email,
            passwordHash,
            role: "ADM",
            status: true
        },
        select: {
            id: true,
            login: true,
            email: true,
            role: true,
            status: true
        }
    });
}

function startDevelopmentServer(spawnProcess = spawn) {
    const isWindows = process.platform === "win32";
    const command = isWindows ? "cmd.exe" : "npm";
    const args = isWindows ? ["/d", "/s", "/c", "npm run dev"] : ["run", "dev"];
    const child = spawnProcess(command, args, { stdio: "inherit" });

    child.once("exit", (code, signal) => {
        process.exitCode = code ?? (signal ? 1 : 0);
    });

    return child;
}

async function main() {
    const config = getFullTestUserConfig();

    try {
        await verifyDatabase();
        const user = await createFullTestUser(config);

        console.log(`Banco disponível. Usuário de teste ${user.login} preparado.`);
    } finally {
        await prisma.$disconnect();
    }

    startDevelopmentServer();
}

const isExecutedDirectly = process.argv[1] === fileURLToPath(import.meta.url);

if (isExecutedDirectly) {
    main().catch((error) => {
        console.error("Não foi possível preparar o ambiente de teste.", error);
        process.exitCode = 1;
    });
}

export {
    createFullTestUser,
    getFullTestUserConfig,
    startDevelopmentServer,
    verifyDatabase
};
