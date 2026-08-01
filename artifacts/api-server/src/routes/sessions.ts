import { Router } from "express";
import { db } from "@workspace/db";
import { sessions, insights } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import {
  CreateSessionBody,
  UpdateSessionBody,
  GetSessionParams,
  UpdateSessionParams,
  DeleteSessionParams,
  ListSessionInsightsParams,
} from "@workspace/api-zod";

console.log("✅ session.ts loaded");

const router = Router();

router.get("/sessions", async (req, res) => {
  try {
    console.log("✅ GET /api/sessions");

    const rows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, req.authUser!.id))
      .orderBy(desc(sessions.createdAt));

    console.log(`✅ Found ${rows.length} sessions`);

    res.json(rows);
  } catch (err) {
    console.error("GET /sessions failed");
    console.error(err);

    return res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
    });
}
});

router.post("/sessions", async (req, res) => {
  try {
    console.log("✅ POST /api/sessions");
    console.log("Request Body:", req.body);

    const parsed = CreateSessionBody.safeParse(req.body);

    if (!parsed.success) {
      console.error("❌ Validation Failed");
      console.error(parsed.error);

      return res.status(400).json({
        error: parsed.error.flatten(),
      });
    }

    console.log("✅ Validation Passed");

    const [session] = await db
      .insert(sessions)
      .values({
        userId: req.authUser!.id,
        title: parsed.data.title,
        platform: parsed.data.platform,
      })
      .returning();

    console.log("✅ Session Created:", session);

    return res.status(201).json(session);
  } catch (err) {
    console.error("❌ POST /sessions failed");
    console.error(err);

    return res.status(500).json({
      error: "Internal Server Error",
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

router.get("/sessions/:id", async (req, res) => {
  try {
    const parsed = GetSessionParams.safeParse({
      id: Number(req.params.id),
    });

    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const [session] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, parsed.data.id), eq(sessions.userId, req.authUser!.id)));

    if (!session) {
      return res.status(404).json({
        error: "Session not found",
      });
    }

    res.json(session);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/sessions/:id", async (req, res) => {
  try {
    const parsedParams = UpdateSessionParams.safeParse({
      id: Number(req.params.id),
    });

    if (!parsedParams.success) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const parsed = UpdateSessionBody.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.flatten(),
      });
    }

    const updateData: Partial<typeof sessions.$inferInsert> = {};

    if (parsed.data.title)
      updateData.title = parsed.data.title;

    if (parsed.data.status) {
      updateData.status = parsed.data.status;

      if (parsed.data.status === "ended") {
        updateData.endedAt = new Date();
      }
    }

    const [updated] = await db
      .update(sessions)
      .set(updateData)
      .where(and(eq(sessions.id, parsedParams.data.id), eq(sessions.userId, req.authUser!.id)))
      .returning();

    if (!updated) {
      return res.status(404).json({
        error: "Session not found",
      });
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/sessions/:id", async (req, res) => {
  try {
    const parsed = DeleteSessionParams.safeParse({
      id: Number(req.params.id),
    });

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid id",
      });
    }

    await db
      .delete(sessions)
      .where(and(eq(sessions.id, parsed.data.id), eq(sessions.userId, req.authUser!.id)));

    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/sessions/:id/insights", async (req, res) => {
  try {
    const parsed = ListSessionInsightsParams.safeParse({
      id: Number(req.params.id),
    });

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid id",
      });
    }

    const ownedSession = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, parsed.data.id), eq(sessions.userId, req.authUser!.id)));

    if (!ownedSession[0]) {
      return res.status(404).json({ error: "Session not found" });
    }

    const rows = await db
      .select()
      .from(insights)
      .where(eq(insights.sessionId, parsed.data.id))
      .orderBy(desc(insights.createdAt));

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;