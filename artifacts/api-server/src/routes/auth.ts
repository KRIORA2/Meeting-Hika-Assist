import { Router } from "express";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, users, authSessions, passwordResetTokens } from "@workspace/db";
import {
  createOpaqueToken,
  createSessionForUser,
  hashOpaqueToken,
  hashPassword,
  requireAuth,
  verifyPassword,
  type AuthUser,
} from "../lib/auth";
import { logger } from "../lib/logger";

const router = Router();

function parseAudienceList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const googleAudienceList = [
  ...parseAudienceList(process.env.GOOGLE_CLIENT_IDS),
  ...parseAudienceList(process.env.HIKA_GOOGLE_CLIENT_IDS),
  process.env.GOOGLE_CLIENT_ID,
  process.env.HIKA_GOOGLE_CLIENT_ID,
  process.env.VITE_GOOGLE_CLIENT_ID,
]
  .map((item) => (item || "").trim())
  .filter(Boolean);

const googleAudiences = Array.from(new Set(googleAudienceList));
const googleClientId = googleAudiences[0] || "";
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;

router.get("/auth/google/config", (_req, res) => {
  res.json({
    enabled: googleAudiences.length > 0,
    clientId: googleClientId || null,
  });
});

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const googleSchema = z.object({
  idToken: z.string().min(1),
});

const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
});

function toAuthUser(row: { id: number; email: string; provider: string | null | undefined }): AuthUser {
  return {
    id: row.id,
    email: row.email,
    provider: row.provider || "password",
  };
}

router.post("/auth/signup", async (req, res) => {
  const parsed = signUpSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  try {
    const existing = await db.select().from(users).where(eq(users.email, email));
    if (existing[0]) {
      res.status(409).json({ error: "Account already exists" });
      return;
    }

    const [created] = await db
      .insert(users)
      .values({
        email,
        passwordHash: hashPassword(parsed.data.password),
        provider: "password",
      })
      .returning();

    const auth = await createSessionForUser(toAuthUser(created), "password");
    res.status(201).json(auth);
  } catch (error) {
    logger.error({ err: error, email }, "Password sign-up persistence failed");
    res.status(503).json({ error: "Account service is unavailable. Check the Render DATABASE_URL and database migrations." });
  }
});

router.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  try {
    const [found] = await db.select().from(users).where(eq(users.email, email));
    if (!found || !verifyPassword(parsed.data.password, found.passwordHash)) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const auth = await createSessionForUser(toAuthUser(found), found.provider || "password");
    res.json(auth);
  } catch (error) {
    logger.error({ err: error, email }, "Password sign-in persistence failed");
    res.status(503).json({ error: "Account service is unavailable. Check the Render DATABASE_URL and database migrations." });
  }
});

router.post("/auth/google", async (req, res) => {
  const parsed = googleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  if (!googleClient || !googleClientId) {
    res.status(501).json({ error: "Google login is not configured" });
    return;
  }

  let payload: { email?: string; sub?: string } | undefined;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: parsed.data.idToken,
      audience: googleAudiences,
    });
    payload = ticket.getPayload();
  } catch (error) {
    logger.warn({
      err: error,
      configuredAudienceCount: googleAudiences.length,
    }, "Google ID token verification rejected");
    res.status(401).json({
      error: "Google token was rejected. Set VITE_GOOGLE_CLIENT_ID in Vercel and GOOGLE_CLIENT_IDS in Render to the same Web OAuth client ID, then redeploy both services.",
    });
    return;
  }

  const email = payload?.email?.trim().toLowerCase();
  const googleSub = payload?.sub;
  if (!email || !googleSub) {
    res.status(401).json({ error: "Google did not provide a valid account identity." });
    return;
  }

  try {
    let [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) {
      [user] = await db
        .insert(users)
        .values({
          email,
          googleSub,
          provider: "google",
        })
        .returning();
    } else if (!user.googleSub) {
      [user] = await db
        .update(users)
        .set({ googleSub, provider: "google", updatedAt: new Date() })
        .where(eq(users.id, user.id))
        .returning();
    }

    const auth = await createSessionForUser(toAuthUser(user), "google");
    res.json(auth);
  } catch (error) {
    logger.error({ err: error, email }, "Google sign-in persistence failed");
    res.status(500).json({ error: "Google account verification succeeded, but the account could not be created. Check the Render database logs and migrations." });
  }
});

router.get("/auth/session", requireAuth, async (req, res) => {
  const auth = req.authUser!;
  const sessionId = req.authSessionId!;
  const [sessionRow] = await db.select().from(authSessions).where(eq(authSessions.id, sessionId));
  res.json({
    session: {
      email: auth.email,
      provider: auth.provider,
      signedInAt: sessionRow.createdAt.toISOString(),
      expiresAt: sessionRow.expiresAt.toISOString(),
    },
  });
});

router.post("/auth/logout", requireAuth, async (req, res) => {
  if (req.authSessionId) {
    await db.delete(authSessions).where(eq(authSessions.id, req.authSessionId));
  }
  res.status(204).end();
});

router.post("/auth/password-reset/request", async (req, res) => {
  const parsed = passwordResetRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, email));

  let resetToken: string | undefined;

  if (user) {
    const plainToken = createOpaqueToken();
    const tokenHash = hashOpaqueToken(plainToken);
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 1000 * 60 * 30),
    });
    resetToken = plainToken;
  }

  res.json({
    message: "If the account exists, a password reset token has been generated.",
    resetToken: process.env.NODE_ENV === "production" ? undefined : resetToken,
  });
});

router.post("/auth/password-reset/confirm", async (req, res) => {
  const parsed = passwordResetConfirmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const tokenHash = hashOpaqueToken(parsed.data.token.trim());
  const rows = await db
    .select()
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.tokenHash, tokenHash), gt(passwordResetTokens.expiresAt, new Date()), isNull(passwordResetTokens.usedAt)));

  const tokenRow = rows[0];
  if (!tokenRow) {
    res.status(400).json({ error: "Invalid or expired reset token" });
    return;
  }

  await db.update(users)
    .set({ passwordHash: hashPassword(parsed.data.password), provider: "password", updatedAt: new Date() })
    .where(eq(users.id, tokenRow.userId));

  await db.update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, tokenRow.id));

  await db.delete(authSessions).where(eq(authSessions.userId, tokenRow.userId));

  res.json({ message: "Password updated successfully." });
});

export default router;