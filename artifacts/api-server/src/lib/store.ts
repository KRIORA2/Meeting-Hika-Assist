import {
  FieldValue,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
  type Transaction,
} from "firebase-admin/firestore";
import { adminBucket, adminDb } from "./firebase";

export type SessionRecord = {
  id: number;
  userId: string;
  title: string;
  platform: string;
  status: string;
  insightCount: number;
  createdAt: string;
  endedAt: string | null;
};

export type InsightRecord = {
  id: number;
  sessionId: number;
  question: string;
  answer: string;
  confidence: string | null;
  createdAt: string;
};

function toIso(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as Timestamp).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

export function newNumericId() {
  return Date.now() * 10 + Math.floor(Math.random() * 10);
}

export function sessionFromDoc(id: string, data: DocumentData): SessionRecord {
  return {
    id: Number(data.id ?? id),
    userId: String(data.userId),
    title: String(data.title ?? "Session"),
    platform: String(data.platform ?? "other"),
    status: String(data.status ?? "active"),
    insightCount: Number(data.insightCount ?? 0),
    createdAt: toIso(data.createdAt),
    endedAt: data.endedAt ? toIso(data.endedAt) : null,
  };
}

export function insightFromDoc(id: string, data: DocumentData): InsightRecord {
  return {
    id: Number(data.id ?? id),
    sessionId: Number(data.sessionId),
    question: String(data.question ?? ""),
    answer: String(data.answer ?? ""),
    confidence: data.confidence ? String(data.confidence) : null,
    createdAt: toIso(data.createdAt),
  };
}

export async function getOwnedSession(userId: string, sessionId: number) {
  const snap = await adminDb().collection("sessions").doc(String(sessionId)).get();
  if (!snap.exists) return null;
  const session = sessionFromDoc(snap.id, snap.data() || {});
  return session.userId === userId ? session : null;
}

export async function listUserSessions(userId: string) {
  const snap = await adminDb().collection("sessions").where("userId", "==", userId).get();
  return snap.docs
    .map((doc: QueryDocumentSnapshot) => sessionFromDoc(doc.id, doc.data()))
    .sort((left: SessionRecord, right: SessionRecord) => right.createdAt.localeCompare(left.createdAt));
}

export async function createSession(userId: string, title: string, platform: string) {
  const id = newNumericId();
  const createdAt = new Date();
  const payload = {
    id,
    userId,
    title,
    platform,
    status: "active",
    insightCount: 0,
    createdAt,
    endedAt: null,
  };
  await adminDb().collection("sessions").doc(String(id)).set(payload);
  return sessionFromDoc(String(id), payload);
}

export async function updateSession(
  userId: string,
  sessionId: number,
  patch: { title?: string; status?: string },
) {
  const current = await getOwnedSession(userId, sessionId);
  if (!current) return null;
  const next = {
    title: patch.title ?? current.title,
    status: patch.status ?? current.status,
    endedAt: patch.status === "ended" ? new Date() : current.endedAt,
  };
  await adminDb().collection("sessions").doc(String(sessionId)).update(next);
  return {
    ...current,
    ...next,
    endedAt: next.endedAt instanceof Date ? next.endedAt.toISOString() : next.endedAt,
  };
}

export async function deleteSession(userId: string, sessionId: number) {
  const current = await getOwnedSession(userId, sessionId);
  if (!current) return false;
  const insights = await adminDb().collection("insights").where("sessionId", "==", sessionId).get();
  const batch = adminDb().batch();
  insights.docs.forEach((doc: QueryDocumentSnapshot) => batch.delete(doc.ref));
  batch.delete(adminDb().collection("sessions").doc(String(sessionId)));
  await batch.commit();
  return true;
}

export async function listSessionInsights(userId: string, sessionId: number) {
  const session = await getOwnedSession(userId, sessionId);
  if (!session) return null;
  const snap = await adminDb().collection("insights").where("sessionId", "==", sessionId).get();
  return snap.docs
    .map((doc: QueryDocumentSnapshot) => insightFromDoc(doc.id, doc.data()))
    .sort((left: InsightRecord, right: InsightRecord) => right.createdAt.localeCompare(left.createdAt));
}

export async function createInsight(
  userId: string,
  input: { sessionId: number; question: string; answer: string; confidence?: string | null },
) {
  const session = await getOwnedSession(userId, input.sessionId);
  if (!session) return null;
  const id = newNumericId();
  const createdAt = new Date();
  const payload = {
    id,
    sessionId: input.sessionId,
    userId,
    question: input.question,
    answer: input.answer,
    confidence: input.confidence ?? null,
    createdAt,
  };
  const sessionRef = adminDb().collection("sessions").doc(String(input.sessionId));
  const insightRef = adminDb().collection("insights").doc(String(id));
  const batch = adminDb().batch();
  batch.set(insightRef, payload);
  batch.update(sessionRef, { insightCount: FieldValue.increment(1) });
  await batch.commit();
  return insightFromDoc(String(id), payload);
}

export async function getUserStats(userId: string) {
  const sessions = await listUserSessions(userId);
  const totalSessions = sessions.length;
  const activeSessions = sessions.filter((session: SessionRecord) => session.status === "active").length;
  const totalInsights = sessions.reduce((sum: number, session: SessionRecord) => sum + session.insightCount, 0);
  return {
    totalSessions,
    activeSessions,
    totalInsights,
    avgInsightsPerSession: totalSessions > 0 ? Math.round((totalInsights / totalSessions) * 10) / 10 : 0,
  };
}

export async function saveDocument(userId: string, id: string, name: string, buffer: Buffer) {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
  const storagePath = `users/${userId}/documents/${id}${ext}`;
  await adminBucket().file(storagePath).save(buffer, {
    resumable: false,
    metadata: { contentType: "application/octet-stream" },
  });
  await adminDb().collection("documents").doc(id).set({
    id,
    userId,
    name,
    storagePath,
    createdAt: new Date(),
  });
  return { id, name };
}

export async function deleteDocument(userId: string, id: string) {
  const snap = await adminDb().collection("documents").doc(id).get();
  if (!snap.exists) return false;
  const data = snap.data() || {};
  if (data.userId !== userId) return false;
  if (data.storagePath) {
    await adminBucket().file(String(data.storagePath)).delete({ ignoreNotFound: true });
  }
  await snap.ref.delete();
  return true;
}

export async function readUserDocument(userId: string, id: string) {
  const snap = await adminDb().collection("documents").doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  if (data.userId !== userId || !data.storagePath) return null;
  const [buffer] = await adminBucket().file(String(data.storagePath)).download();
  return {
    id,
    name: String(data.name || id),
    buffer,
  };
}

export const CREDIT_COSTS = {
  transcribe: 1,
  analyze: 2,
  realtime: 1,
} as const;

export const PLAN_CREDITS = {
  free: 50,
  pro: 500,
} as const;

export const SESSION_PACK_CREDITS = 20;

export const PLAN_PRICES = {
  sessionInr: 199,
  proMonthlyUsd: 13,
  proYearlyUsd: 130,
} as const;

export type AccountPlan = "free" | "pro";

export type UserAccount = {
  userId: string;
  email: string;
  plan: AccountPlan;
  credits: number;
  creditsResetAt: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

function nextMonth(from: Date) {
  return new Date(from.getFullYear(), from.getMonth() + 1, 1);
}

function asDate(value: unknown): Date | null {
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as Timestamp).toDate();
  }
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function normalizeAccount(userId: string, data: DocumentData): UserAccount {
  const plan: AccountPlan = data.plan === "pro" ? "pro" : "free";
  const now = new Date();
  let creditsResetAt = asDate(data.creditsResetAt) ?? nextMonth(now);
  let credits = typeof data.credits === "number" ? data.credits : PLAN_CREDITS[plan];
  if (creditsResetAt.getTime() <= now.getTime()) {
    credits = PLAN_CREDITS[plan];
    creditsResetAt = nextMonth(now);
  }
  return {
    userId,
    email: String(data.email || ""),
    plan,
    credits,
    creditsResetAt: creditsResetAt.toISOString(),
    stripeCustomerId: data.stripeCustomerId ? String(data.stripeCustomerId) : null,
    stripeSubscriptionId: data.stripeSubscriptionId ? String(data.stripeSubscriptionId) : null,
  };
}

export async function ensureUserAccount(userId: string, email: string, provider: string) {
  const ref = adminDb().collection("users").doc(userId);
  const snap = await ref.get();
  const account = normalizeAccount(userId, { ...(snap.data() || {}), email });
  await ref.set({
    email,
    provider,
    plan: account.plan,
    credits: account.credits,
    creditsResetAt: new Date(account.creditsResetAt),
    updatedAt: new Date(),
  }, { merge: true });
  return account;
}

export async function getUserAccount(userId: string) {
  const snap = await adminDb().collection("users").doc(userId).get();
  return normalizeAccount(userId, snap.data() || {});
}

export async function consumeCredits(userId: string, amount: number) {
  const ref = adminDb().collection("users").doc(userId);
  return adminDb().runTransaction(async (transaction: Transaction) => {
    const snap = await transaction.get(ref);
    const account = normalizeAccount(userId, snap.data() || {});
    if (account.credits < amount) {
      return { ok: false as const, ...account };
    }
    const credits = account.credits - amount;
    transaction.set(ref, {
      plan: account.plan,
      credits,
      creditsResetAt: new Date(account.creditsResetAt),
      updatedAt: new Date(),
    }, { merge: true });
    return { ok: true as const, ...account, credits };
  });
}

export async function grantCredits(userId: string, amount: number) {
  const ref = adminDb().collection("users").doc(userId);
  const snap = await ref.get();
  const account = normalizeAccount(userId, snap.data() || {});
  const credits = account.credits + amount;
  await ref.set({ credits, updatedAt: new Date() }, { merge: true });
  return { ...account, credits };
}

export async function applyProSubscription(
  userId: string,
  input: { stripeCustomerId: string; stripeSubscriptionId: string },
) {
  const ref = adminDb().collection("users").doc(userId);
  await ref.set({
    plan: "pro",
    credits: PLAN_CREDITS.pro,
    creditsResetAt: nextMonth(new Date()),
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    updatedAt: new Date(),
  }, { merge: true });
  return getUserAccount(userId);
}

export async function applyFreePlan(userId: string) {
  const ref = adminDb().collection("users").doc(userId);
  await ref.set({
    plan: "free",
    stripeSubscriptionId: null,
    updatedAt: new Date(),
  }, { merge: true });
  return getUserAccount(userId);
}
