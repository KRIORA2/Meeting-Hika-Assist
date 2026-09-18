import { matchingSubjects } from "./subject-docs";
import {
  listRecentUserInsights,
  listSessionInsights,
  listUserSessions,
  loadUserMemory,
  saveUserMemory,
  type SessionMemoryItem,
} from "./store";

const STOP = new Set([
  "the", "and", "for", "you", "your", "that", "this", "with", "from", "what", "how", "why",
  "when", "who", "are", "was", "were", "have", "has", "did", "does", "can", "could", "would",
  "should", "about", "into", "them", "they", "our", "use", "used", "using", "me", "my", "we",
]);

const cache = new Map<string, SessionMemoryItem[]>();
const inflight = new Map<string, Promise<SessionMemoryItem[]>>();

function tokens(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOP.has(word));
}

function compactItem(question: string, answer: string, subjects: string[] = []): SessionMemoryItem | null {
  const q = String(question || "").replace(/\s+/g, " ").trim().slice(0, 180);
  const a = String(answer || "").replace(/\s+/g, " ").trim().slice(0, 280);
  if (q.length < 8 || a.length < 24) return null;
  if (/didn'?t catch a clear english question/i.test(a)) return null;
  return {
    question: q,
    answer: a,
    subjects: subjects.slice(0, 4),
    at: Date.now(),
  };
}

function similar(left: string, right: string): number {
  const a = new Set(tokens(left));
  const b = new Set(tokens(right));
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const word of a) if (b.has(word)) overlap += 1;
  return overlap / Math.max(a.size, b.size);
}

function mergeItems(current: SessionMemoryItem[], next: SessionMemoryItem): SessionMemoryItem[] {
  const kept = current.filter((item) => similar(item.question, next.question) < 0.72);
  return [next, ...kept].slice(0, 80);
}

async function persist(userId: string, items: SessionMemoryItem[]) {
  cache.set(userId, items);
  await saveUserMemory(userId, items).catch(() => undefined);
}

export async function warmSessionMemory(userId: string): Promise<SessionMemoryItem[]> {
  const cached = cache.get(userId);
  if (cached) return cached;
  const pending = inflight.get(userId);
  if (pending) return pending;

  const work = (async () => {
    let items = await loadUserMemory(userId);
    if (!items.length) {
      const insights = await listRecentUserInsights(userId, 80).catch(() => []);
      items = insights
        .map((insight) => compactItem(insight.question, insight.answer, matchingSubjects(insight.question)))
        .filter((item): item is SessionMemoryItem => Boolean(item));
    }
    if (!items.length) {
      const sessions = await listUserSessions(userId).catch(() => []);
      const packed: SessionMemoryItem[] = [];
      for (const session of sessions.slice(0, 8)) {
        const rows = await listSessionInsights(userId, session.id).catch(() => null);
        for (const insight of rows || []) {
          const item = compactItem(insight.question, insight.answer, matchingSubjects(insight.question));
          if (item) packed.push(item);
        }
        if (packed.length >= 80) break;
      }
      items = packed.slice(0, 80);
    }
    if (items.length) await saveUserMemory(userId, items).catch(() => undefined);
    cache.set(userId, items);
    return items;
  })();

  inflight.set(userId, work);
  try {
    return await work;
  } finally {
    inflight.delete(userId);
  }
}

export async function rememberAnswer(userId: string, question: string, answer: string) {
  const item = compactItem(question, answer, matchingSubjects(question));
  if (!item) return;
  const current = cache.get(userId) ?? await warmSessionMemory(userId).catch(() => []);
  const next = mergeItems(current, item);
  cache.set(userId, next);
  void persist(userId, next);
}

export function recallSessionMemory(userId: string, question: string): string {
  const items = cache.get(userId);
  if (!items?.length) return "";
  const subjects = matchingSubjects(question);
  const ranked = items
    .map((item) => {
      let score = similar(question, item.question) * 10;
      if (subjects.some((subject) => item.subjects.includes(subject))) score += 1.5;
      return { item, score };
    })
    .filter((row) => row.score >= 1.2)
    .sort((left, right) => right.score - left.score)
    .slice(0, 2);
  if (!ranked.length) return "";
  const lines = ranked.map((row) => `Q: ${row.item.question}\nA: ${row.item.answer}`);
  return `LEARNED FROM THIS CANDIDATE'S PAST SESSIONS (stay consistent with these facts and style; do not copy word-for-word unless the question is the same):\n${lines.join("\n")}`;
}
