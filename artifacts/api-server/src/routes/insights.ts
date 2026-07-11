import { Router } from "express";
import { db } from "@workspace/db";
import { insights, sessions } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CreateInsightBody } from "@workspace/api-zod";

const router = Router();

router.post("/insights", async (req, res) => {
  const parsed = CreateInsightBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [insight] = await db
    .insert(insights)
    .values({
      sessionId: parsed.data.sessionId,
      question: parsed.data.question,
      answer: parsed.data.answer,
      confidence: parsed.data.confidence ?? null,
    })
    .returning();

  await db
    .update(sessions)
    .set({ insightCount: sql`${sessions.insightCount} + 1` })
    .where(eq(sessions.id, parsed.data.sessionId));

  res.status(201).json(insight);
});

export default router;
