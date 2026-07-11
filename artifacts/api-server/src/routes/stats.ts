import { Router } from "express";
import { db } from "@workspace/db";
import { sessions, insights } from "@workspace/db";
import { eq, count, avg } from "drizzle-orm";

const router = Router();

router.get("/stats", async (req, res) => {
  const [sessionStats] = await db
    .select({ total: count() })
    .from(sessions);

  const [activeStats] = await db
    .select({ total: count() })
    .from(sessions)
    .where(eq(sessions.status, "active"));

  const [insightStats] = await db
    .select({ total: count() })
    .from(insights);

  const totalSessions = sessionStats?.total ?? 0;
  const totalInsights = insightStats?.total ?? 0;
  const avgInsightsPerSession =
    totalSessions > 0 ? totalInsights / totalSessions : 0;

  res.json({
    totalSessions,
    activeSessions: activeStats?.total ?? 0,
    totalInsights,
    avgInsightsPerSession: Math.round(avgInsightsPerSession * 10) / 10,
  });
});

export default router;
