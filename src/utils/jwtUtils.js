import { createHmac, timingSafeEqual } from "node:crypto";

function encode(value) {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(value, secret) {
    return createHmac("sha256", secret).update(value).digest("base64url");
}

function createAuthToken(user, secret, expirationSeconds) {
    const issuedAt = Math.floor(Date.now() / 1000);
    const header = encode({ alg: "HS256", typ: "JWT" });
    const payload = encode({
        sub: user.id,
        role: user.role,
        iat: issuedAt,
        exp: issuedAt + expirationSeconds
    });
    const unsignedToken = `${header}.${payload}`;

    return `${unsignedToken}.${sign(unsignedToken, secret)}`;
}

function verifyAuthToken(token, secret) {
    const [header, payload, signature, ...extraParts] = token.split(".");

    if (!header || !payload || !signature || extraParts.length > 0) {
        return null;
    }

    const expectedSignature = sign(`${header}.${payload}`, secret);
    const signatureBuffer = Buffer.from(signature);
    const expectedSignatureBuffer = Buffer.from(expectedSignature);

    if (
        signatureBuffer.length !== expectedSignatureBuffer.length
        || !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
    ) {
        return null;
    }

    try {
        const parsedHeader = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
        const parsedPayload = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

        if (
            parsedHeader.alg !== "HS256"
            || parsedHeader.typ !== "JWT"
            || typeof parsedPayload.sub !== "string"
            || !Number.isSafeInteger(parsedPayload.exp)
            || parsedPayload.exp <= Math.floor(Date.now() / 1000)
        ) {
            return null;
        }

        return parsedPayload;
    } catch {
        return null;
    }
}

export { createAuthToken, verifyAuthToken };
