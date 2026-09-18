import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { apiKeyAuth } from "./middleware/apiKeyAuth.js";
import { readOnly } from "./middleware/readOnly.js";
import managementRoutes from "./routes/management.js";
import { financeReadiness } from "./services/financeClient.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.join(projectRoot, "public");

if (config.nodeEnv === "production") app.set("trust proxy", 1);

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(morgan(config.nodeEnv === "production" ? "combined" : "dev"));

// Allow server-to-server requests, same-origin browser requests, and explicitly
// configured external browser origins. The API key is still required for data.
app.use(cors((req, callback) => {
  const corsOptions = {
    origin(origin, originCallback) {
    if (!origin) return originCallback(null, true);

    const forwardedProto = String(req.get("x-forwarded-proto") || "").split(",")[0].trim();
    const protocol = forwardedProto || req.protocol;
    const host = req.get("host");
    const sameOrigin = host ? `${protocol}://${host}` : "";

    if (origin === sameOrigin || config.allowedOrigins.includes(origin)) {
      return originCallback(null, true);
    }

    const error = new Error("CORS origin is not allowed.");
    error.status = 403;
    return originCallback(error);
  },
  methods: ["GET", "HEAD", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
  credentials: false,
  maxAge: 600
  };
  callback(null, corsOptions);
}));

app.use(express.json({ limit: "50kb" }));

app.use((req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  res.set("X-Content-Type-Options", "nosniff");
  next();
});

// Public landing/viewer and API description.
app.get("/", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
app.get("/viewer", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
app.get("/openapi.yaml", (_req, res) => res.sendFile(path.join(projectRoot, "openapi.yaml")));
app.get("/favicon.ico", (_req, res) => res.status(204).end());

app.get("/health", (_req, res) => res.json({
  status: "ok",
  service: "uma-management-read-api",
  readOnly: true
}));

app.get("/ready", async (_req, res) => {
  try {
    const upstream = await financeReadiness();
    res.json({ status: "ready", upstream });
  } catch (error) {
    res.status(503).json({ status: "not_ready", message: error.message });
  }
});

app.use("/api/v1", rateLimit({
  windowMs: 60 * 1000,
  limit: config.rateLimitPerMinute,
  standardHeaders: "draft-8",
  legacyHeaders: false
}));
app.use("/api/v1", readOnly, apiKeyAuth);
app.use("/api/v1/management", managementRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: "The requested read-only endpoint does not exist.",
    available: [
      "/",
      "/health",
      "/ready",
      "/openapi.yaml",
      "/api/v1/management/dashboard",
      "/api/v1/management/report",
      "/api/v1/management/filters",
      "/api/v1/management/snapshot"
    ]
  });
});

app.use((error, _req, res, _next) => {
  const status = Number(error?.status || 500);
  const safeStatus = status >= 400 && status <= 599 ? status : 500;
  if (config.nodeEnv !== "test") console.error(error);
  res.status(safeStatus).json({
    error: safeStatus >= 500 ? "Gateway Error" : "Request Error",
    message: error?.message || "Unexpected error."
  });
});

export default app;
