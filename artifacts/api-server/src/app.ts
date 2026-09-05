import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((entry) => entry.trim().replace(/\/+$/, "").toLowerCase())
  .filter((entry) => entry.length > 0);

if (allowedOrigins.length === 0) {
  throw new Error(
    "Missing required environment variable: ALLOWED_ORIGINS (comma-separated list of allowed browser origins)",
  );
}

app.use(
  cors({
    origin(requestOrigin, callback) {
      // Requests without an Origin header are not browser cross-origin requests
      // (curl, health checks, server-to-server), so the allowlist does not apply.
      if (!requestOrigin) {
        callback(null, true);
        return;
      }
      callback(null, allowedOrigins.includes(requestOrigin));
    },
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
