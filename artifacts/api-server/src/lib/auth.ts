import { createHash, randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { adminAuth, adminDb } from "./firebase";
import { logger } from "./logger";
import { ensureUserAccount } from "./store";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export type AuthUser = {
  id: string;
  email: string;
  provider: string;
};

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      authSessionId?: string;
    }
  }
}

export function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function getBearerToken(req: Request): string | null {
  const header = req.header("authorization") || req.header("Authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

function providerFromFirebase(signInProvider?: string) {
  if (signInProvider === "google.com") return "google";
  return "password";
}

export async function createDesktopSession(user: AuthUser) {
  const token = createOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  const createdAt = new Date();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await adminDb().collection("authSessions").doc(tokenHash).set({
    userId: user.id,
    email: user.email,
    provider: user.provider,
    createdAt,
    expiresAt,
    lastSeenAt: createdAt,
  });
  return {
    token,
    session: {
      email: user.email,
      provider: user.provider as "password" | "google",
      signedInAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    },
  };
}

async function getAuthFromFirebaseToken(token: string): Promise<AuthUser | null> {
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    const email = decoded.email?.trim().toLowerCase();
    if (!email) return null;
    await ensureUserAccount(decoded.uid, email, providerFromFirebase(decoded.firebase?.sign_in_provider));
    return {
      id: decoded.uid,
      email,
      provider: providerFromFirebase(decoded.firebase?.sign_in_provider),
    };
  } catch {
    return null;
  }
}

async function getAuthFromDesktopToken(token: string, req: Request): Promise<AuthUser | null> {
  const tokenHash = hashOpaqueToken(token);
  const snap = await adminDb().collection("authSessions").doc(tokenHash).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  const expiresAt = data.expiresAt?.toDate?.() ?? new Date(data.expiresAt);
  if (!(expiresAt instanceof Date) || expiresAt.getTime() <= Date.now()) {
    await snap.ref.delete();
    return null;
  }
  req.authSessionId = tokenHash;
  void snap.ref.update({ lastSeenAt: new Date() });
  const user = {
    id: String(data.userId),
    email: String(data.email || ""),
    provider: String(data.provider || "password"),
  };
  await ensureUserAccount(user.id, user.email, user.provider);
  return user;
}

export async function getAuthFromRequest(req: Request): Promise<AuthUser | null> {
  const token = getBearerToken(req);
  if (!token) return null;
  const firebaseUser = await getAuthFromFirebaseToken(token);
  if (firebaseUser) {
    req.authUser = firebaseUser;
    return firebaseUser;
  }
  const desktopUser = await getAuthFromDesktopToken(token, req);
  if (desktopUser) {
    req.authUser = desktopUser;
    return desktopUser;
  }
  return null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = await getAuthFromRequest(req);
    if (!auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  } catch (error) {
    logger.error({ err: error }, "Auth verification failed");
    res.status(503).json({ error: "Account service is unavailable. Check Firebase Admin credentials." });
  }
}

export async function deleteDesktopSession(sessionId?: string) {
  if (!sessionId) return;
  await adminDb().collection("authSessions").doc(sessionId).delete();
}
