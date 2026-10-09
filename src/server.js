import "./config/env.js";
import app from "./app.js";
import logger from "./config/logger.js";

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
    logger.info({ event: "API_STARTED", port: PORT }, "API iniciada.");
});

server.on("error", (error) => {
    logger.fatal({ err: error, event: "API_START_FAILED", port: PORT }, "Falha ao iniciar a API.");
});
