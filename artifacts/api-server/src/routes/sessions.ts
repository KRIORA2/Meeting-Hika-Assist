import { Router } from "express";
import {
  CreateSessionBody,
  UpdateSessionBody,
  GetSessionParams,
  UpdateSessionParams,
  DeleteSessionParams,
  ListSessionInsightsParams,
} from "@workspace/api-zod";
import {
  createSession,
  deleteSession,
  getOwnedSession,
  listSessionInsights,
  listUserSessions,
  updateSession,
} from "../lib/store";
import { warmSessionMemory } from "../lib/session-memory";

const router = Router();

router.get("/sessions", async (req, res) => {
  try {
    return res.json(await listUserSessions(req.authUser!.id));
  } catch (err) {
    req.log.error({ err }, "GET /sessions failed");
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/sessions", async (req, res) => {
  try {
    const parsed = CreateSessionBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const session = await createSession(req.authUser!.id, parsed.data.title, parsed.data.platform);
    void warmSessionMemory(req.authUser!.id);
    return res.status(201).json(session);
  } catch (err) {
    req.log.error({ err }, "POST /sessions failed");
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/sessions/:id", async (req, res) => {
  try {
    const parsed = GetSessionParams.safeParse({ id: Number(req.params.id) });
    if (!parsed.success) return res.status(400).json({ error: "Invalid id" });
    const session = await getOwnedSession(req.authUser!.id, parsed.data.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    return res.json(session);
  } catch (err) {
    req.log.error({ err }, "GET /sessions/:id failed");
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/sessions/:id", async (req, res) => {
  try {
    const parsedParams = UpdateSessionParams.safeParse({ id: Number(req.params.id) });
    if (!parsedParams.success) return res.status(400).json({ error: "Invalid id" });
    const parsed = UpdateSessionBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const updated = await updateSession(req.authUser!.id, parsedParams.data.id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Session not found" });
    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, "PATCH /sessions/:id failed");
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/sessions/:id", async (req, res) => {
  try {
    const parsed = DeleteSessionParams.safeParse({ id: Number(req.params.id) });
    if (!parsed.success) return res.status(400).json({ error: "Invalid id" });
    const deleted = await deleteSession(req.authUser!.id, parsed.data.id);
    if (!deleted) return res.status(404).json({ error: "Session not found" });
    return res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "DELETE /sessions/:id failed");
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/sessions/:id/insights", async (req, res) => {
  try {
    const parsed = ListSessionInsightsParams.safeParse({ id: Number(req.params.id) });
    if (!parsed.success) return res.status(400).json({ error: "Invalid id" });
    const rows = await listSessionInsights(req.authUser!.id, parsed.data.id);
    if (!rows) return res.status(404).json({ error: "Session not found" });
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET /sessions/:id/insights failed");
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
