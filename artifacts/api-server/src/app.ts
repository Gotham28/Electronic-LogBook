import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Exactly one hop: Render's own load balancer is the only proxy between the internet and
// this process. With a number, Express/proxy-addr trusts only that many entries counting
// from the end of X-Forwarded-For, so req.ip becomes whatever the load balancer itself
// appended - never a value an attacker prepends before it reaches the load balancer.
// `true` would trust the whole header, letting a client set its own req.ip outright
// (SEC-12) - never use it here.
app.set("trust proxy", 1);

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
const localFrontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? (process.env.NODE_ENV === "production" ? "" : localFrontendUrl))
  .split(",")
  .map((entry) => entry.trim().replace(/\/+$/, "").toLowerCase())
  .filter((entry) => entry.length > 0);

if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
  throw new Error(
    "Missing required environment variable: ALLOWED_ORIGINS (comma-separated list of allowed browser origins)",
  );
}

app.disable("x-powered-by");
app.use(
  cors({
    origin(requestOrigin, callback) {
      // Requests without an Origin header are not browser cross-origin requests
      // (curl, health checks, server-to-server), so the allowlist does not apply.
      if (!requestOrigin) {
        callback(null, true);
        return;
      }
      callback(null, allowedOrigins.includes(requestOrigin.toLowerCase()));
    },
    credentials: true,
  }),
);
app.use(cookieParser());
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] || "")) {
      res.status(415).json({ message: "Use application/json" }); return;
    }
    const origin = req.headers.origin;
    const ownOrigin = `${req.protocol}://${req.get("host")}`;
    if (origin && origin !== ownOrigin && !allowedOrigins.includes(origin.toLowerCase().replace(/\/+$/, ""))) {
      res.status(403).json({ message: "Untrusted request origin" }); return;
    }
    if (req.cookies?.token && !req.headers.authorization && !origin) {
      res.status(403).json({ message: "Cookie writes require a trusted Origin header" }); return;
    }
  }
  next();
});
// Razorpay webhook signatures are computed over the raw request body bytes; parsing this one
// path through express.json() first would make the signature unverifiable (JSON.stringify is
// not byte-identical to what Razorpay signed). This path alone gets its own raw-body parser
// and is excluded from the JSON parser below - every other route is unaffected.
const RAZORPAY_WEBHOOK_PATH = "/api/payments/webhook";
app.use(RAZORPAY_WEBHOOK_PATH, express.raw({ type: "application/json" }));
app.use(express.json({
  limit: "128kb",
  type: (req) => req.url?.split("?")[0] !== RAZORPAY_WEBHOOK_PATH && /^application\/json(?:;|$)/i.test(req.headers["content-type"] || ""),
}));

app.use("/api", router);
app.use((_req, res) => { res.status(404).json({ message: "Route not found" }); });

const errors: ErrorRequestHandler = (error, req, res, _next) => {
  if (error.type === "entity.too.large") { res.status(413).json({ message: "Request is too large" }); return; }
  if (error.type === "entity.parse.failed") { res.status(400).json({ message: "Invalid JSON" }); return; }
  const code = error.code || error.cause?.code;
  if (code === "23505") { res.status(409).json({ message: "This record already exists" }); return; }
  if (["23503", "23514"].includes(code)) { res.status(400).json({ message: "Invalid record relationship or value" }); return; }
  // Drizzle errors can contain SQL parameters, including credentials and clinical records.
  req.log.error({ code: typeof code === "string" && /^[A-Z0-9]{5}$/.test(code) ? code : "UNEXPECTED" }, "Request failed");
  res.status(500).json({ message: "Internal server error" });
};
app.use(errors);

export default app;
