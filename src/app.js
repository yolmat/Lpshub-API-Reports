import express from "express";
import cors from "cors";
import helmet from "helmet";

import { getHttpSecurityConfig } from "./config/env.js";
import routes from "./routes/index.js";
import errorMiddleware from "./middlewares/errorMiddleware.js";

const EXTRATOS_BANCARIOS_BODY_LIMIT = "10kb";
const AUTH_BODY_LIMIT = "2kb";

function requireHttps(req, res, next) {
    if (req.secure) {
        return next();
    }

    return res.status(403).json({
        success: false,
        error: {
            code: "HTTPS_REQUIRED",
            message: "A conexão HTTPS é obrigatória neste ambiente."
        }
    });
}

function createApp(httpSecurityConfig = getHttpSecurityConfig()) {
    const app = express();

    app.disable("x-powered-by");
    app.set("trust proxy", httpSecurityConfig.trustProxy);
    app.use(helmet());
    app.use(cors({
        credentials: true,
        origin(origin, callback) {
            callback(null, Boolean(
                origin && httpSecurityConfig.allowedCorsOrigins.includes(origin)
            ));
        }
    }));

    if (httpSecurityConfig.isProduction) {
        app.use(requireHttps);
    }

    app.use(
        "/api/v1/extratos-bancarios",
        express.json({ limit: EXTRATOS_BANCARIOS_BODY_LIMIT })
    );
    app.use("/api/v1/auth", express.json({ limit: AUTH_BODY_LIMIT }));

    app.use("/api", routes);

    app.get("/health", (req, res) => {
        res.status(200).json({
            status: "ok",
            message: "API online"
        });
    });

    app.use(errorMiddleware);

    return app;
}

const app = createApp();

export default app;
export { AUTH_BODY_LIMIT, createApp, EXTRATOS_BANCARIOS_BODY_LIMIT };
