import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

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
app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

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
