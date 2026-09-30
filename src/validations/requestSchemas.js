import { z } from "zod";

import { AUTH_COOKIE_NAME } from "../config/auth.js";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value) {
    if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) {
        return false;
    }

    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day;
}

const emptyObjectSchema = z.object({}).strict();

const loginSchema = z.string({ error: "O campo LOGIN é obrigatório." }).refine(
    (value) => value.trim().length > 0,
    "O campo LOGIN é obrigatório."
);
const emailSchema = z.string().trim().min(1, "O campo EMAIL é obrigatório.").email("O campo EMAIL deve conter um e-mail válido.");
const passwordSchema = z.string().min(1, "O campo SENHA é obrigatório.");

const authLoginBodySchema = z.object({
    login: loginSchema,
    senha: passwordSchema
}).strict();

const authRegisterBodySchema = z.object({
    login: loginSchema,
    email: emailSchema,
    senha: passwordSchema
}).strict();

const authPasswordResetBodySchema = z.object({
    login: loginSchema,
    email: emailSchema
}).strict();

const authLogoutBodySchema = z.object({
    login: loginSchema
}).strict();

const authDeactivateUserBodySchema = z.object({
    login: loginSchema
}).strict();

const protectedRouteHeadersSchema = z.object({
    cookie: z.string().min(1, "O cookie de autenticação é obrigatório.").refine(
        (value) => value.split(";").some((item) => item.trim().startsWith(`${AUTH_COOKIE_NAME}=`)),
        "O cookie de autenticação é obrigatório."
    )
}).passthrough();

const extratoBancarioBodySchema = z.object({
    empresa: z.array(z.string().trim().min(1, "Cada item de EMPRESA deve ser uma filial válida."))
        .min(1, "O campo EMPRESA deve conter pelo menos uma filial."),
    datas: z.array(z.string().refine(isValidIsoDate, "Cada item de DATAS deve estar no formato AAAA-MM-DD."))
        .optional(),
    dataInicial: z.string().refine(isValidIsoDate, "O campo DATAINICIAL deve estar no formato AAAA-MM-DD.")
        .optional(),
    dataFinal: z.string().refine(isValidIsoDate, "O campo DATAFINAL deve estar no formato AAAA-MM-DD.")
        .optional()
}).strict().superRefine((value, context) => {
    if (value.datas?.length) {
        return;
    }

    if (!value.dataInicial && !value.dataFinal) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["datas"],
            message: "Informe DATAS ou o intervalo DATAINICIAL e DATAFINAL."
        });
        return;
    }

    if (!value.dataInicial) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["dataInicial"],
            message: "O campo DATAINICIAL é obrigatório quando DATAS não é informado."
        });
    }

    if (!value.dataFinal) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["dataFinal"],
            message: "O campo DATAFINAL é obrigatório quando DATAS não é informado."
        });
    }

    if (value.dataInicial && value.dataFinal && value.dataInicial > value.dataFinal) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["dataFinal"],
            message: "DATAFINAL deve ser maior ou igual a DATAINICIAL."
        });
    }
});

export {
    authDeactivateUserBodySchema,
    authLoginBodySchema,
    authLogoutBodySchema,
    authPasswordResetBodySchema,
    authRegisterBodySchema,
    emptyObjectSchema,
    extratoBancarioBodySchema,
    protectedRouteHeadersSchema
};
