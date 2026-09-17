import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/desktop/update", (_req, res) => {
  res.json({
    version: process.env.DESKTOP_LATEST_VERSION ?? "1.1.9",
    downloadUrl: process.env.DESKTOP_DOWNLOAD_URL ?? null,
  });
});

export default router;
