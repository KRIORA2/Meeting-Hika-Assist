import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { ANSWER_API_METHOD, FALLBACK_ANSWER_MODEL } from "../lib/answer-chat";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json({
    ...data,
    service: process.env.RENDER_SERVICE_NAME || "hikanest-api",
    revision: process.env.RENDER_GIT_COMMIT || null,
    branch: process.env.RENDER_GIT_BRANCH || null,
    answerModel: process.env.OPENAI_MODEL || FALLBACK_ANSWER_MODEL,
    answerMethod: ANSWER_API_METHOD,
    openaiKeyConfigured: Boolean(String(process.env.OPENAI_API_KEY || "").trim()),
  });
});

router.get("/desktop/update", (_req, res) => {
  res.json({
    version: process.env.DESKTOP_LATEST_VERSION ?? "1.1.23",
    downloadUrl: process.env.DESKTOP_DOWNLOAD_URL ?? null,
  });
});

export default router;
