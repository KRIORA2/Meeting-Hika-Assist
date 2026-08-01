import { randomBytes, createHash, scryptSync, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db, authSessions, users } from "@workspace/db";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export type AuthUser = {
  id: number;
  email: string;
  provider: string;
};

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      authSessionId?: number;
    }
  }
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false;
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, "hex");
  if (derived.length !== stored.length) return false;
  return timingSafeEqual(derived, stored);
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

export async function createSessionForUser(user: AuthUser, provider: string) {
  const token = createOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const [session] = await db
    .insert(authSessions)
    .values({
      userId: user.id,
      tokenHash,
      provider,
      expiresAt,
    })
    .returning();

  return {
    token,
    session: {
      email: user.email,
      provider: provider as "password" | "google",
      signedInAt: session.createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    },
  };
}

export async function getAuthFromRequest(req: Request): Promise<AuthUser | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  const tokenHash = hashOpaqueToken(token);
  const rows = await db
    .select({
      sessionId: authSessions.id,
      userId: users.id,
      email: users.email,
      provider: authSessions.provider,
    })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .where(and(eq(authSessions.tokenHash, tokenHash), gt(authSessions.expiresAt, new Date())));

  const auth = rows[0];
  if (!auth) return null;

  req.authSessionId = auth.sessionId;
  req.authUser = {
    id: auth.userId,
    email: auth.email,
    provider: auth.provider,
  };

  void db
    .update(authSessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(authSessions.id, auth.sessionId));

  return req.authUser;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}