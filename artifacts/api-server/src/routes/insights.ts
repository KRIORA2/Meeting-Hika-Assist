import { Router } from "express";
import { CreateInsightBody } from "@workspace/api-zod";
import { createInsight } from "../lib/store";
import { rememberAnswer } from "../lib/session-memory";

const router = Router();

router.post("/insights", async (req, res) => {
  const parsed = CreateInsightBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const insight = await createInsight(req.authUser!.id, parsed.data);
    if (!insight) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    void rememberAnswer(req.authUser!.id, insight.question, insight.answer);
    res.status(201).json(insight);
  } catch (err) {
    req.log.error({ err }, "POST /insights failed");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
