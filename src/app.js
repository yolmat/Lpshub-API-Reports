import express from "express";
import cors from "cors";

import routes from "./routes/index.js";
import errorMiddleware from "./middlewares/errorMiddleware.js";

const app = express();

app.use(
    cors({
        origin: true,
        credentials: true
    })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", routes);

app.get("/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        message: "API online"
    });
});

app.use(errorMiddleware);

export default app;
