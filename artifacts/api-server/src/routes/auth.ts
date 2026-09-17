import { Router } from "express";
import { z } from "zod";
import { adminAuth, adminDb } from "../lib/firebase";
import {
  createDesktopSession,
  createOpaqueToken,
  deleteDesktopSession,
  hashOpaqueToken,
  requireAuth,
} from "../lib/auth";
import { logger } from "../lib/logger";

const router = Router();

const desktopExchangeSchema = z.object({
  code: z.string().min(20).max(200),
});

router.get("/auth/config", (_req, res) => {
  res.json({
    provider: "firebase",
    google: Boolean(process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_PROJECT_ID),
  });
});

router.get("/auth/session", requireAuth, async (req, res) => {
  const auth = req.authUser!;
  res.json({
    session: {
      email: auth.email,
      provider: auth.provider,
      signedInAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 1000 * 60 * 55).toISOString(),
    },
  });
});

router.post("/auth/logout", requireAuth, async (req, res) => {
  await deleteDesktopSession(req.authSessionId);
  res.status(204).end();
});

router.post("/auth/desktop/handoff", requireAuth, async (req, res) => {
  try {
    const code = createOpaqueToken();
    await adminDb().collection("desktopLoginCodes").doc(hashOpaqueToken(code)).set({
      userId: req.authUser!.id,
      email: req.authUser!.email,
      provider: req.authUser!.provider,
      expiresAt: new Date(Date.now() + 1000 * 60 * 2),
      usedAt: null,
    });
    res.json({ handoffUrl: `hikanest://auth?code=${encodeURIComponent(code)}` });
  } catch (error) {
    logger.error({ err: error, userId: req.authUser!.id }, "Desktop handoff creation failed");
    res.status(503).json({ error: "Desktop sign-in is temporarily unavailable." });
  }
});

router.post("/auth/desktop/exchange", async (req, res) => {
  const parsed = desktopExchangeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid desktop sign-in request." });
    return;
  }

  try {
    const ref = adminDb().collection("desktopLoginCodes").doc(hashOpaqueToken(parsed.data.code));
    const snap = await ref.get();
    const data = snap.data();
    const expiresAt = data?.expiresAt?.toDate?.() ?? (data?.expiresAt ? new Date(data.expiresAt) : null);
    if (!snap.exists || !data || data.usedAt || !expiresAt || expiresAt.getTime() <= Date.now()) {
      res.status(401).json({ error: "This desktop sign-in link has expired or was already used." });
      return;
    }

    await ref.update({ usedAt: new Date() });
    const userRecord = await adminAuth().getUser(String(data.userId));
    const auth = await createDesktopSession({
      id: userRecord.uid,
      email: (userRecord.email || String(data.email || "")).toLowerCase(),
      provider: String(data.provider || "password"),
    });
    res.json(auth);
  } catch (error) {
    logger.error({ err: error }, "Desktop handoff exchange failed");
    res.status(503).json({ error: "Desktop sign-in is temporarily unavailable." });
  }
});

export default router;
