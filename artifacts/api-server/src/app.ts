import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import router from "./routes";
import { stripeWebhook } from "./routes/billing";
import { logger } from "./lib/logger";

const app: Express = express();
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.get("/", (_req, res) => {
  res.json({
    service: "hikanest-api",
    status: "ok",
    health: "/api/healthz",
  });
});

app.get("/api", (_req, res) => {
  res.json({
    service: "hikanest-api",
    status: "ok",
    health: "/api/healthz",
  });
});

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
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    // Electron/file origins and server-to-server calls do not carry Origin.
    if (!origin || origin === "file://" || origin === "null" || process.env.NODE_ENV !== "production" || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin is not allowed"));
  },
}));
app.post("/api/billing/webhook", express.raw({ type: "application/json" }), stripeWebhook);
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Please try again later." },
});
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "AI request limit reached. Please wait before trying again." },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Request limit reached. Please try again shortly." },
});

app.use("/api/auth", authLimiter);
app.use("/api/openai", aiLimiter);
app.use("/api", apiLimiter);
app.use("/api", router);

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled API error");

  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  const status = typeof err?.status === "number" ? err.status : 500;
  res.status(status).json({ error: status >= 500 ? "Internal server error" : "Request failed" });
});

export default app;
