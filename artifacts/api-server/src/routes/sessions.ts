import { Router } from "express";
import { db } from "@workspace/db";
import { sessions, insights } from "@workspace/db";
import { eq, count, desc } from "drizzle-orm";
import {
  CreateSessionBody,
  UpdateSessionBody,
  GetSessionParams,
  UpdateSessionParams,
  DeleteSessionParams,
  ListSessionInsightsParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/sessions", async (req, res) => {
  const rows = await db
    .select()
    .from(sessions)
    .orderBy(desc(sessions.createdAt));
  res.json(rows);
});

router.post("/sessions", async (req, res) => {
  const parsed = CreateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [session] = await db
    .insert(sessions)
    .values({ title: parsed.data.title, platform: parsed.data.platform })
    .returning();
  res.status(201).json(session);
});

router.get("/sessions/:id", async (req, res) => {
  const parsed = GetSessionParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, parsed.data.id));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json(session);
});

router.patch("/sessions/:id", async (req, res) => {
  const parsedParams = UpdateSessionParams.safeParse({ id: Number(req.params.id) });
  if (!parsedParams.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Partial<typeof sessions.$inferInsert> = {};
  if (parsed.data.title) updateData.title = parsed.data.title;
  if (parsed.data.status) {
    updateData.status = parsed.data.status;
    if (parsed.data.status === "ended") {
      updateData.endedAt = new Date();
    }
  }
  const [updated] = await db
    .update(sessions)
    .set(updateData)
    .where(eq(sessions.id, parsedParams.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json(updated);
});

router.delete("/sessions/:id", async (req, res) => {
  const parsed = DeleteSessionParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(sessions).where(eq(sessions.id, parsed.data.id));
  res.status(204).end();
});

router.get("/sessions/:id/insights", async (req, res) => {
  const parsed = ListSessionInsightsParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const rows = await db
    .select()
    .from(insights)
    .where(eq(insights.sessionId, parsed.data.id))
    .orderBy(desc(insights.createdAt));
  res.json(rows);
});

export default router;
