import { matchingSubjects } from "./subject-docs";
import { extractOpener, extractSpokenConcepts } from "./repetition-guard";
import {
  analyzeQuestion,
  type QuestionAnalysis,
} from "./question-analyzer";
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

export type InterviewThread = {
  currentTopic: string;
  currentThread: string;
  topicsDiscussed: string[];
  questionsAnswered: Array<{
    question: string;
    topic: string;
    intent: string;
    fingerprint: string;
    conceptsCovered: string[];
  }>;
  conceptsAlreadyCovered: string[];
  conceptsToAvoidRepeating: string[];
  recentAnswers: string[];
  recentOpeners: string[];
  lastAnalysis: QuestionAnalysis | null;
  candidateFactsUsed: string[];
  lastStrategy: string;
};

const threads = new Map<string, InterviewThread>();

function emptyThread(): InterviewThread {
  return {
    currentTopic: "",
    currentThread: "",
    topicsDiscussed: [],
    questionsAnswered: [],
    conceptsAlreadyCovered: [],
    conceptsToAvoidRepeating: [],
    recentAnswers: [],
    recentOpeners: [],
    lastAnalysis: null,
    candidateFactsUsed: [],
    lastStrategy: "",
  };
}

function threadKey(userId: string, sessionId?: number | null) {
  return sessionId ? `${userId}:${sessionId}` : userId;
}

export function getInterviewThread(userId: string, sessionId?: number | null): InterviewThread {
  const key = threadKey(userId, sessionId);
  const existing = threads.get(key);
  if (existing) return existing;
  const created = emptyThread();
  threads.set(key, created);
  return created;
}

function tokens(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOP.has(word));
}

function compactItem(
  question: string,
  answer: string,
  extras: Partial<SessionMemoryItem> = {},
): SessionMemoryItem | null {
  const q = String(question || "").replace(/\s+/g, " ").trim().slice(0, 180);
  const a = String(answer || "").replace(/\s+/g, " ").trim().slice(0, 280);
  if (q.length < 8 || a.length < 24) return null;
  if (/didn'?t catch a clear english question/i.test(a)) return null;
  return {
    question: q,
    answer: a,
    subjects: (extras.subjects || []).slice(0, 4),
    at: extras.at || Date.now(),
    topic: extras.topic,
    intent: extras.intent,
    fingerprint: extras.fingerprint,
    concepts: extras.concepts?.slice(0, 8),
    opener: extras.opener?.slice(0, 160),
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
  const kept = current.filter((item) => {
    if (next.fingerprint && item.fingerprint && next.fingerprint === item.fingerprint) return false;
    if (next.fingerprint && item.fingerprint) return true;
    return similar(item.question, next.question) < 0.86;
  });
  return [next, ...kept].slice(0, 80);
}

async function persist(userId: string, items: SessionMemoryItem[]) {
  cache.set(userId, items);
  if (process.env.HIKA_SKIP_MEMORY_PERSIST === "1") return;
  await saveUserMemory(userId, items).catch(() => undefined);
}

export async function warmSessionMemory(userId: string): Promise<SessionMemoryItem[]> {
  const cached = cache.get(userId);
  if (cached) return cached;
  if (process.env.HIKA_SKIP_MEMORY_PERSIST === "1") {
    cache.set(userId, []);
    return [];
  }
  const pending = inflight.get(userId);
  if (pending) return pending;

  const work = (async () => {
    let items = await loadUserMemory(userId);
    if (!items.length) {
      const insights = await listRecentUserInsights(userId, 80).catch(() => []);
      items = insights
        .map((insight) => compactItem(insight.question, insight.answer, { subjects: matchingSubjects(insight.question) }))
        .filter((item): item is SessionMemoryItem => Boolean(item));
    }
    if (!items.length) {
      const sessions = await listUserSessions(userId).catch(() => []);
      const packed: SessionMemoryItem[] = [];
      for (const session of sessions.slice(0, 8)) {
        const rows = await listSessionInsights(userId, session.id).catch(() => null);
        for (const insight of rows || []) {
          const item = compactItem(insight.question, insight.answer, { subjects: matchingSubjects(insight.question) });
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

export async function rememberAnswer(
  userId: string,
  question: string,
  answer: string,
  analysis?: QuestionAnalysis | null,
  sessionId?: number | null,
  factsUsed: string[] = [],
) {
  const parsed = analysis || analyzeQuestion(question, getInterviewThread(userId, sessionId).lastAnalysis);
  const concepts = extractSpokenConcepts(answer);
  const opener = extractOpener(answer);
  const item = compactItem(question, answer, {
    subjects: matchingSubjects(question),
    topic: parsed.topic,
    intent: parsed.intent,
    fingerprint: parsed.fingerprint,
    concepts,
    opener,
  });
  if (item) {
    const current = cache.get(userId) ?? await warmSessionMemory(userId).catch(() => []);
    const next = mergeItems(current, item);
    cache.set(userId, next);
    void persist(userId, next);
  }

  const thread = getInterviewThread(userId, sessionId);
  if (parsed.relationToPreviousQuestion === "new_topic") {
    thread.conceptsAlreadyCovered = [];
    thread.conceptsToAvoidRepeating = [];
    thread.currentThread = parsed.topic;
  }
  thread.currentTopic = parsed.topic;
  if (!thread.topicsDiscussed.includes(parsed.topic)) thread.topicsDiscussed.push(parsed.topic);
  thread.questionsAnswered.unshift({
    question: parsed.question,
    topic: parsed.topic,
    intent: parsed.intent,
    fingerprint: parsed.fingerprint,
    conceptsCovered: concepts,
  });
  thread.questionsAnswered = thread.questionsAnswered.slice(0, 12);
  thread.conceptsAlreadyCovered = [...new Set([...concepts, ...thread.conceptsAlreadyCovered])].slice(0, 24);
  thread.conceptsToAvoidRepeating = thread.conceptsAlreadyCovered.slice(0, 12);
  thread.recentAnswers = [answer.slice(0, 400), ...thread.recentAnswers].slice(0, 4);
  thread.recentOpeners = [opener, ...thread.recentOpeners].slice(0, 4);
  thread.lastAnalysis = parsed;
  thread.candidateFactsUsed = [...new Set([...factsUsed, ...thread.candidateFactsUsed])].slice(0, 8);
  thread.lastStrategy = extractOpener(answer).slice(0, 160);
}

export function recallSessionMemory(userId: string, question: string, sessionId?: number | null): string {
  const thread = getInterviewThread(userId, sessionId);
  const previous = thread.lastAnalysis;
  const analysis = analyzeQuestion(question, previous, thread.conceptsAlreadyCovered);
  const lines: string[] = [];

  if (thread.questionsAnswered.length) {
    const last = thread.questionsAnswered[0];
    lines.push(
      `SESSION THREAD topic=${thread.currentTopic || analysis.topic} lastIntent=${last?.intent || "none"} lastQ="${last?.question || ""}"`,
    );
    if (analysis.relationToPreviousQuestion === "new_topic") {
      lines.push("New topic. Do not continue the previous thread.");
    } else {
      lines.push(`This is ${analysis.relationToPreviousQuestion}. Do not repeat: ${thread.conceptsToAvoidRepeating.join(", ") || "the previous opener"}.`);
      lines.push("Cover only the NEW distinction for this intent.");
      if (thread.lastStrategy) {
        lines.push(`Stay consistent with the last strategy unless they asked to change it: ${thread.lastStrategy}`);
      }
      if (analysis.relationToPreviousQuestion === "failure_scenario") {
        lines.push("Connect the failure to that strategy — especially what you must not mark complete.");
      }
    }
  }

  const items = cache.get(userId) || [];
  const ranked = items
    .filter((item) => item.fingerprint && item.fingerprint !== analysis.fingerprint)
    .map((item) => {
      let score = 0;
      if (item.topic === analysis.topic) score += 2;
      if (item.intent && item.intent !== analysis.intent && item.topic === analysis.topic) score += 1.5;
      return { item, score };
    })
    .filter((row) => row.score >= 2)
    .slice(0, 2);

  if (ranked.length) {
    lines.push("PAST FACTS ONLY (do not copy wording or openers):");
    for (const row of ranked) {
      const facts = (row.item.concepts || []).join(", ") || row.item.answer.slice(0, 80);
      lines.push(`- ${row.item.intent || "prior"} on ${row.item.topic || "topic"}: ${facts}`);
    }
  }

  return lines.join("\n");
}

export function analyzeWithMemory(userId: string, question: string, sessionId?: number | null): QuestionAnalysis {
  const thread = getInterviewThread(userId, sessionId);
  return analyzeQuestion(question, thread.lastAnalysis, thread.conceptsAlreadyCovered);
}
