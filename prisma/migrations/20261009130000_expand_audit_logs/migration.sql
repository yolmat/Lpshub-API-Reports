-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM (
    'HTTP_REQUEST_COMPLETED',
    'AUTH_LOGIN_SUCCESS',
    'AUTH_LOGIN_FAILED',
    'AUTH_LOGOUT',
    'AUTH_SESSION_EXPIRED',
    'REPORT_EXECUTED',
    'REPORT_EXPORTED',
    'USER_CREATED',
    'USER_UPDATED',
    'USER_DISABLED',
    'PERMISSION_CHANGED',
    'EXTERNAL_API_REQUEST',
    'EXTERNAL_API_ERROR',
    'ACCESS_DENIED',
    'VALIDATION_FAILED',
    'AUDIT_LOG_VIEWED'
);

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM (
    'HTTP_REQUEST',
    'AUTHENTICATE',
    'LOGOUT',
    'SESSION_EXPIRE',
    'BANK_STATEMENT_SEARCH',
    'BRANCH_LIST',
    'CREATE_USER',
    'RESET_USER_PASSWORD',
    'UPDATE_USER',
    'DISABLE_USER',
    'CHANGE_PERMISSION',
    'EXTERNAL_API_CALL',
    'AUTHORIZE_ACCESS',
    'VALIDATE_REQUEST',
    'VIEW_AUDIT_LOG'
);

-- Preserve AuditLog as an append-only snapshot independent from User.
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_userId_fkey";

ALTER TABLE "AuditLog"
    ADD COLUMN "username" VARCHAR(100),
    ADD COLUMN "userAgent" VARCHAR(512),
    ADD COLUMN "action" "AuditAction" NOT NULL DEFAULT 'HTTP_REQUEST',
    ADD COLUMN "targetSystem" VARCHAR(50) NOT NULL DEFAULT 'APPLICATION',
    ADD COLUMN "durationMs" INTEGER,
    ADD COLUMN "responseCount" INTEGER,
    ADD COLUMN "errorCode" VARCHAR(100),
    ADD COLUMN "sessionReference" CHAR(64);

UPDATE "AuditLog"
SET
    "durationMs" = COALESCE(ROUND(("metadata"->>'durationMs')::numeric), 0),
    "errorCode" = "metadata"->>'errorCode';

ALTER TABLE "AuditLog"
    ALTER COLUMN "durationMs" SET NOT NULL,
    ALTER COLUMN "action" DROP DEFAULT,
    ALTER COLUMN "targetSystem" DROP DEFAULT,
    ALTER COLUMN "id" TYPE UUID USING gen_random_uuid(),
    ALTER COLUMN "requestId" TYPE UUID USING "requestId"::UUID,
    ALTER COLUMN "eventType" TYPE "AuditEventType" USING "eventType"::text::"AuditEventType",
    ALTER COLUMN "route" TYPE VARCHAR(255),
    ALTER COLUMN "method" TYPE VARCHAR(10),
    ALTER COLUMN "ipAddress" TYPE VARCHAR(64);

CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
