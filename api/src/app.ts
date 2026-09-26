import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { errorHandler } from "./middleware/errors.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";

export const app = express();

app.use(cors({ origin: config.webOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use("/api", healthRouter);
app.use("/api/auth", authRouter);

app.use(errorHandler);
