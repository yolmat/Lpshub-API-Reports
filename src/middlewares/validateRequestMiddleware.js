import AppError from "../utils/AppError.js";

function formatIssues(location, issues) {
    return issues.map((issue) => ({
        location,
        path: issue.path.length
            ? issue.path.join(".")
            : issue.code === "unrecognized_keys"
                ? issue.keys.join(".")
                : "",
        code: issue.code,
        message: issue.message
    }));
}

function validateRequest(schemas) {
    return (req, res, next) => {
        const validated = {};
        const details = [];

        for (const [location, schema] of Object.entries(schemas)) {
            const result = schema.safeParse(req[location] || {});

            if (!result.success) {
                details.push(...formatIssues(location, result.error.issues));
                continue;
            }

            validated[location] = result.data;
        }

        if (details.length) {
            return next(new AppError(
                "Dados da requisição inválidos.",
                400,
                "INVALID_REQUEST",
                details
            ));
        }

        req.validated = {
            ...(req.validated || {}),
            ...validated
        };
        return next();
    };
}

export default validateRequest;
