import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const HASH_PREFIX = "scrypt";

async function hashPassword(password) {
    const salt = randomBytes(SALT_LENGTH);
    const derivedKey = await scrypt(password, salt, KEY_LENGTH);

    return [
        HASH_PREFIX,
        salt.toString("hex"),
        derivedKey.toString("hex")
    ].join("$");
}

async function verifyPassword(password, storedHash) {
    if (typeof storedHash !== "string") {
        return false;
    }

    const [prefix, saltHex, hashHex, ...extraParts] = storedHash.split("$");

    if (prefix !== HASH_PREFIX || !saltHex || !hashHex || extraParts.length > 0) {
        return false;
    }

    try {
        const salt = Buffer.from(saltHex, "hex");
        const storedKey = Buffer.from(hashHex, "hex");

        if (salt.length !== SALT_LENGTH || storedKey.length !== KEY_LENGTH) {
            return false;
        }

        const derivedKey = await scrypt(password, salt, KEY_LENGTH);

        return timingSafeEqual(storedKey, derivedKey);
    } catch {
        return false;
    }
}

export { hashPassword, verifyPassword };
