import { Router, type Request, type Response } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { AnalyzeContextBody, TranscribeAudioBody } from "@workspace/api-zod";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import { Buffer } from "node:buffer";
import path from "path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { readUserDocument, consumeCredits, grantCredits, CREDIT_COSTS } from "../lib/store";

const router = Router();

async function takeCredits(req: Request, res: Response, amount: number) {
  const result = await consumeCredits(req.authUser!.id, amount);
  if (!result.ok) {
    res.status(402).json({
      error: "Not enough credits. Open Pricing in the web app to upgrade.",
      credits: result.credits,
      plan: result.plan,
    });
    return null;
  }
  return result;
}
const DEFAULT_ANALYSIS_MODEL = process.env.OPENAI_MODEL || "gpt-4.1";
const DEFAULT_TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-transcribe";
const DEFAULT_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const DEFAULT_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime";
const DEFAULT_REALTIME_TRANSCRIPTION_MODEL = process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL || "gpt-4o-transcribe";
const DEFAULT_REALTIME_NOISE_REDUCTION = process.env.OPENAI_REALTIME_NOISE_REDUCTION === "far_field" ? "far_field" : "near_field";
const TRANSCRIPTION_PROMPT = "A clear American English question from a data engineering meeting.";

const ENGLISH_QUESTION = /\b(what|why|how|when|where|who|which|tell|explain|describe|walk|can you|could you|would you)\b/i;
const ENGLISH_FUNCTION_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "you", "i", "we", "they", "to", "of", "and", "in",
  "that", "it", "for", "on", "with", "this", "have", "be", "what", "how", "why", "can", "do", "does",
  "tell", "me", "about", "your", "my", "so", "yeah", "okay", "ok", "like", "just", "when", "if", "or",
  "not", "but", "from", "at", "as", "would", "could", "should", "will", "there", "here", "please",
  "yes", "no", "right", "well", "hello", "hi", "hey", "explain",
]);
const WEAK_ENGLISH_WORDS = new Set(["a", "an", "i", "no", "ok", "to", "or"]);
const FOREIGN_FUNCTION_WORDS = new Set([
  "alsof", "hemel", "het", "een", "van", "niet", "jij", "jullie", "und", "der", "die", "das", "ich",
  "nicht", "que", "para", "como", "esto", "esta", "les", "des", "une", "pas", "avec", "oui",
  "el", "los", "las", "por", "una", "sehr", "ist", "che", "per", "con", "kya", "hai", "aap",
  "kaise", "nahi", "nahin", "haan", "theek", "acha", "accha", "bhai", "kyun", "kyon", "mera",
  "meri", "tum", "hum", "kaun", "kab", "kahan", "woh", "yeh", "aur", "itu", "bagus", "sekali",
  "saya", "tidak", "yang", "untuk", "ada", "ini", "hallo", "wie", "geht", "dir", "nuk", "kuptoj",
  "tardo", "diario", "kocham", "bueno", "gracias", "hola", "porque", "pero", "muy", "aqui", "ahora",
]);
const HALLUCINATED_TRANSCRIPT = /thanks for watching|thank you for watching|please subscribe|the boy ran quickly|\[music\]|\[silence\]|rewrite:|clarifying:|greeting:|translation:|subtitle:|respond to /i;

function looksLikeUsEnglish(text: string) {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value) return false;
  if (/[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F]/.test(value)) {
    return false;
  }
  if (HALLUCINATED_TRANSCRIPT.test(value)) return false;
  const words = value.toLowerCase().replace(/[^a-z'\s]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;
  const englishHits = words.filter((word) => ENGLISH_FUNCTION_WORDS.has(word)).length;
  const strongEnglish = words.filter((word) => ENGLISH_FUNCTION_WORDS.has(word) && !WEAK_ENGLISH_WORDS.has(word)).length;
  const foreignHits = words.filter((word) => FOREIGN_FUNCTION_WORDS.has(word)).length;
  if (foreignHits > 0 && foreignHits >= strongEnglish) return false;
  if (words.length < 5 && !ENGLISH_QUESTION.test(value)) return false;
  if (strongEnglish === 0 && words.length < 6) return false;
  if (englishHits === 0) return false;
  return true;
}
const ALLOWED_ANALYSIS_MODELS = new Set(
  (process.env.OPENAI_ALLOWED_MODELS || "gpt-4.1,gpt-4o")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean),
);

function envInteger(name: string, fallback: number, min: number, max: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function envNumber(name: string, fallback: number, min: number, max: number) {
  const value = Number.parseFloat(process.env[name] ?? "");
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

const REALTIME_CONFIG = {
  clientSecretTtlSeconds: envInteger("OPENAI_REALTIME_CLIENT_SECRET_TTL_SECONDS", 600, 10, 7200),
  maxOutputTokens: envInteger("OPENAI_REALTIME_MAX_OUTPUT_TOKENS", 220, 32, 4096),
  vadThreshold: envNumber("OPENAI_REALTIME_VAD_THRESHOLD", 0.38, 0, 1),
  vadPrefixPaddingMs: envInteger("OPENAI_REALTIME_VAD_PREFIX_PADDING_MS", 400, 0, 2000),
  interviewVadSilenceMs: envInteger("INTERVIEW_VAD_SILENCE_MS", 900, 300, 2000),
  meetingVadSilenceMs: envInteger("MEETING_VAD_SILENCE_MS", 1000, 300, 2000),
};

type EmbeddingCacheEntry = {
  chunks: string[];
  vectors: number[][];
};

/**
 * Creates a narrowly scoped, short-lived Realtime credential. The permanent
 * API key is used only for this server-to-server request and is never sent to
 * a browser or Electron renderer.
 */
router.post("/openai/realtime/session", async (req, res) => {
  const sessionGuidance = typeof req.body?.sessionGuidance === "string"
    ? req.body.sessionGuidance.slice(0, 4_000)
    : "";
  const mode = req.body?.mode === "meeting" ? "meeting" : "interview";
  const autoAnswer = req.body?.autoAnswer !== false;
  const uploadedDocs = Array.isArray(req.body?.uploadedDocs)
    ? req.body.uploadedDocs.slice(0, 3).filter((doc: unknown): doc is { id: string; name?: string } =>
      !!doc && typeof (doc as { id?: unknown }).id === "string")
    : [];

  if (!process.env.OPENAI_API_KEY) {
    res.status(503).json({ error: "Realtime voice is not configured on the server." });
    return;
  }

  const spent = await takeCredits(req, res, CREDIT_COSTS.realtime);
  if (!spent) return;

  // Document extraction happens once when the persistent Realtime session is
  // created, never for every partial transcription event.
  const documentContext: string[] = [];
  if (uploadedDocs.length) {
    for (const doc of uploadedDocs) {
      try {
        const stored = await readUserDocument(req.authUser!.id, doc.id);
        if (!stored) continue;
        const content = (await extractDocumentTextFromBuffer(stored.name, stored.buffer)).replace(/\s+/g, " ").trim();
        if (content) documentContext.push(`${doc.name || stored.name || "Profile"}: ${buildResumeSignal(content).slice(0, 2200)}`);
      } catch {
        // A document is optional context; it must not block live voice setup.
      }
    }
  }

  const modeInstructions = mode === "interview"
    ? [
      "You are the candidate on a live data-engineering interview. Answer in first person as that person.",
      "Treat the most recent completed user turn as the exact question.",
      "Parakeet format: one spoken opener, then 3 to 5 short bullets the candidate can glance at and say.",
    ]
    : [
      "You are that same data engineer on a live work call. Write as them in first person.",
      "Treat the most recent completed user turn as the exact request.",
      "Parakeet format: one spoken opener, then 3 to 5 short teammate talking points.",
    ];

  const instructions = [
    "You write this person's on-screen answers like Parakeet. Never speak with voice. Never generate audio.",
    "You are a real senior data engineer. First person only. Not a coach.",
    "Write every answer in US English with American spelling. Never reply in Hindi or any other language.",
    "If the transcript is not a clear US English question, say you did not catch the question. Do not invent a topic from foreign or nonsense words.",
    "Answer the spoken question as captured. Do not swap their words for resume keywords or guessed jargon.",
    "Format: line 1 is the spoken opener. Then 3 to 5 short bullets starting with •. One idea per line.",
    "No headings, no JSON, no Contextual Explanation, no inventory confirmation boxes.",
    "No 'As an AI', no 'Great question', no 'Based on the conversation', no 'I'm not aware'.",
    "Do not invent projects, metrics, or employers.",
    "If a skill is not in the resume, say you have working knowledge and can ramp — do not fake ownership.",
    "Keep ordinary answers under 90 words. Include code only when they explicitly asked for code.",
    ...modeInstructions,
    sessionGuidance ? `Persona / session guidance from the user (follow this strictly):\n${sessionGuidance}` : "",
    documentContext.length ? `Resume and documents (this is who you are):\n${documentContext.join("\n")}` : "",
  ].filter(Boolean).join("\n");

  const silenceDurationMs = mode === "meeting"
    ? REALTIME_CONFIG.meetingVadSilenceMs
    : REALTIME_CONFIG.interviewVadSilenceMs;
  const session = {
    type: "realtime",
    model: DEFAULT_REALTIME_MODEL,
    output_modalities: ["text"],
    max_output_tokens: REALTIME_CONFIG.maxOutputTokens,
    instructions,
    audio: {
      input: {
        noise_reduction: { type: DEFAULT_REALTIME_NOISE_REDUCTION },
        transcription: {
          model: DEFAULT_REALTIME_TRANSCRIPTION_MODEL,
          language: "en",
          prompt: TRANSCRIPTION_PROMPT,
        },
        turn_detection: {
          type: "server_vad",
          threshold: REALTIME_CONFIG.vadThreshold,
          prefix_padding_ms: REALTIME_CONFIG.vadPrefixPaddingMs,
          silence_duration_ms: silenceDurationMs,
          create_response: autoAnswer,
          interrupt_response: true,
        },
      },
    },
  };

  try {
    const upstream = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: REALTIME_CONFIG.clientSecretTtlSeconds },
        session,
      }),
    });
    const response = await upstream.json().catch(() => null) as { value?: unknown; expires_at?: unknown } | null;
    if (!upstream.ok) {
      await grantCredits(req.authUser!.id, CREDIT_COSTS.realtime).catch(() => undefined);
      req.log.error({ status: upstream.status }, "Realtime client secret request failed");
      res.status(502).json({ error: "Could not authorize the realtime voice connection." });
      return;
    }
    if (!response || typeof response.value !== "string" || typeof response.expires_at !== "number") {
      await grantCredits(req.authUser!.id, CREDIT_COSTS.realtime).catch(() => undefined);
      req.log.error("Realtime client secret response was malformed");
      res.status(502).json({ error: "Realtime authorization response was invalid." });
      return;
    }
    res.json({ clientSecret: response.value, expiresAt: response.expires_at, credits: spent.credits });
  } catch (err) {
    await grantCredits(req.authUser!.id, CREDIT_COSTS.realtime).catch(() => undefined);
    req.log.error({ err }, "Realtime client secret request failed");
    res.status(502).json({ error: "Could not reach the realtime authorization service." });
  }
});

const resumeEmbeddingCache = new Map<string, EmbeddingCacheEntry>();

function isCodeIntent(text: string): boolean {
  const t = text.toLowerCase();
  return /(write (me )?(a |the )?(code|query|script|function)|give me (the )?(code|sql|query|script)|show me (the )?(code|sql|pyspark|query)|paste the (code|query)|executable code|implement (this|it) in|python script|pyspark (code|script)|sql query to)/i.test(t);
}

function toParakeetScript(text: string) {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*#{1,6}\s+.+$/gm, "")
    .replace(/^\s*\*\*[^*]+\*\*\s*:?\s*$/gm, "")
    .replace(/^\s*(contextual explanation|cluster inventory confirmation|explanation|interview tip|follow-?up|details|notes)\s*:?\s*$/gim, "")
    .replace(/\*\*/g, "")
    .trim();

  let lines = cleaned
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*]|•)\s+/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (lines.length < 3 && /•/.test(cleaned)) {
    lines = cleaned
      .split("•")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  if (lines.length < 3) {
    const sentences = cleaned
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 8);
    if (sentences.length >= 3) lines = sentences;
  }

  if (lines.length === 0) return "";
  if (lines.length === 1) return lines[0];

  const opener = lines[0].replace(/^[•\-]\s*/, "");
  const points = lines.slice(1).map((line) => {
    const body = line.replace(/^[•\-]\s*/, "").replace(/[.]+$/, "");
    return `• ${body}`;
  });
  return [opener, ...points].join("\n");
}

function extractExplicitQuestion(text: string): string | null {
  const match = text.match(/ANSWER THIS:\s*"([\s\S]*?)"/i);
  if (!match?.[1]) return null;
  const q = match[1].trim();
  return q.length > 0 ? q : null;
}

function isResumeQuestion(text: string): boolean {
  const t = text.toLowerCase();
  return /(tell me about yourself|introduce yourself|walk me through your resume|previous project|current project|roles and responsibilities|what do you do|your background|your experience|why should we hire you|read.*resume|analy[sz]e.*resume|uploaded.*resume|resume.*job description|resume.*\bjd\b|job description.*resume|\bjd\b.*resume|act like me|answer as me)/i.test(t);
}

function isResumeLikeFile(name: string): boolean {
  return /(resume|cv|profile|experience|bio)/i.test(name);
}

type InterviewQuestionType =
  | "HR Question"
  | "Technical Question"
  | "Coding Question"
  | "Scenario Question"
  | "Behavioral Question"
  | "Project Question"
  | "Resume Question"
  | "Leadership Question"
  | "Cloud Question"
  | "Database Question"
  | "Databricks Question"
  | "Azure Question"
  | "General Meeting Question";

function detectQuestionType(text: string): InterviewQuestionType {
  const t = (text || "").toLowerCase();
  if (!t.trim()) return "General Meeting Question";
  if (/(databricks|unity catalog|delta live table|dlt|autoloader|medallion)/i.test(t)) return "Databricks Question";
  if (/(azure|adf|synapse|data lake|key vault|azure devops|event hub)/i.test(t)) return "Azure Question";
  if (/(sql|database|query|normalization|index|join|stored procedure|cte|window function)/i.test(t)) return "Database Question";
  if (/(code|coding|implement|write a function|algorithm|complexity|time complexity|space complexity)/i.test(t)) return "Coding Question";
  if (/(project|architecture|system design|end to end|production issue|impact)/i.test(t)) return "Project Question";
  if (/(situation|task|action|result|behavior|conflict|challenge|deadline|stakeholder)/i.test(t)) return "Behavioral Question";
  if (/(lead|mentored|ownership|team|influence|cross-functional|manager)/i.test(t)) return "Leadership Question";
  if (/(tell me about yourself|introduce yourself|walk me through your resume|background|experience)/i.test(t)) return "Resume Question";
  if (/(cloud|aws|gcp|azure)/i.test(t)) return "Cloud Question";
  if (/(what would you do|how would you handle|if this happens|scenario|suppose)/i.test(t)) return "Scenario Question";
  if (/(hr|strength|weakness|why should we hire|why this role|salary|notice period)/i.test(t)) return "HR Question";
  if (/(explain|difference between|how does|what is|best practices|trade off)/i.test(t)) return "Technical Question";
  return "General Meeting Question";
}

function buildConfidenceBar(score: number): string {
  const clamped = Math.max(0, Math.min(100, score));
  const filled = Math.max(0, Math.min(10, Math.round(clamped / 10)));
  return `${"█".repeat(filled)}${"░".repeat(10 - filled)}`;
}

function confidenceScoreFromLabel(value?: string): number {
  if (!value) return 72;
  const t = value.toLowerCase();
  if (t === "high") return 92;
  if (t === "medium") return 78;
  if (t === "low") return 62;
  return 72;
}

async function extractDocumentTextFromBuffer(fileName: string, buffer: Buffer): Promise<string> {
  const ext = path.extname(fileName).toLowerCase();

  if (ext === ".txt" || ext === ".md" || ext === ".json" || ext === ".csv") {
    return buffer.toString("utf8");
  }

  if (ext === ".pdf") {
    const parsed = await pdfParse(buffer);
    return parsed.text || "";
  }

  if (ext === ".docx") {
    const parsed = await mammoth.extractRawText({ buffer });
    return parsed.value || "";
  }

  return "";
}

function isLikelyCode(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.includes("```")) return true;
  if (/^(select|with|insert|update|delete|create|alter|drop)\b/i.test(t)) return true;
  if (/^(import\s+\w+|from\s+\w+\s+import\s+\w+|def\s+\w+\s*\(|class\s+\w+)/i.test(t)) return true;
  return /\n\s*(select|with|from|where|join|group by|order by|def |import |spark\.|df\.)/i.test(t);
}

function shouldUseDocumentGrounding(_text: string, docs?: Array<{ id?: string; name?: string }> | null): boolean {
  return Boolean(docs?.length);
}

function detectRequestedLanguage(text: string): "sql" | "python" | "auto" {
  const t = text.toLowerCase();
  if (/\bsql\b|\bquery\b|\bselect\b|\bjoin\b|\bgroup by\b|\bcte\b/.test(t)) return "sql";
  if (/\bpyspark\b|\bspark\b|\bdatabricks\b|\bpython\b|\bscript\b/.test(t)) return "python";
  return "auto";
}

function hasPlaceholderContent(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("...") ||
    t.includes("your logic here") ||
    t.includes("todo") ||
    t.includes("placeholder") ||
    t.includes("<table_name>") ||
    t.includes("<column_name>") ||
    t.includes("fill this")
  );
}

function validateSql(sql: string): { valid: boolean; reason?: string } {
  const t = sql.trim();
  if (!t) return { valid: false, reason: "empty" };
  if (hasPlaceholderContent(t)) return { valid: false, reason: "placeholder" };
  if (t.includes("```")) return { valid: false, reason: "markdown fences" };
  if (!/\b(select|with|insert|update|delete|create|merge)\b/i.test(t)) {
    return { valid: false, reason: "missing sql verb" };
  }
  if (/\b(select|with)\b/i.test(t) && !/\bfrom\b/i.test(t)) {
    return { valid: false, reason: "select/with without from" };
  }
  if (/\bjoin\b/i.test(t) && !/\bon\b/i.test(t)) {
    return { valid: false, reason: "join without on" };
  }
  return { valid: true };
}

function validatePython(code: string): { valid: boolean; reason?: string } {
  const t = code.trim();
  if (!t) return { valid: false, reason: "empty" };
  if (hasPlaceholderContent(t)) return { valid: false, reason: "placeholder" };
  if (t.includes("```")) return { valid: false, reason: "markdown fences" };
  const hasPythonSignal =
    /^(import\s+\w+|from\s+\w+\s+import\s+\w+|def\s+\w+\s*\(|class\s+\w+)/im.test(t) ||
    /\b(spark\.|DataFrame|pd\.|requests\.)\b/.test(t);
  if (!hasPythonSignal) return { valid: false, reason: "not python-like" };
  return { valid: true };
}

function extractFirstCodeBlock(text: string): { language?: string; code: string } | null {
  const match = text.match(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/);
  if (!match) return null;
  return {
    language: match[1] ? match[1].toLowerCase() : undefined,
    code: match[2].trim(),
  };
}

function normalizeLanguage(lang?: string | null): string {
  if (!lang) return "text";
  const l = lang.toLowerCase();
  if (l.includes("sql")) return "sql";
  if (l.includes("py")) return "python";
  if (l.includes("spark")) return "python";
  if (l.includes("bash") || l.includes("shell")) return "bash";
  return l;
}

function normalizeContextText(text: string): string {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function splitIntoChunks(text: string, maxChars = 720, overlap = 120): string[] {
  const normalized = normalizeContextText(text);
  if (!normalized) return [];

  if (normalized.length <= maxChars) return [normalized];

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < normalized.length) {
    const end = Math.min(normalized.length, cursor + maxChars);
    chunks.push(normalized.slice(cursor, end));
    if (end === normalized.length) break;
    cursor = Math.max(0, end - overlap);
  }

  return chunks.slice(0, 40);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function getOrBuildDocEmbeddings(docKey: string, content: string): Promise<EmbeddingCacheEntry> {
  const existing = resumeEmbeddingCache.get(docKey);
  if (existing) return existing;

  const chunks = splitIntoChunks(content);
  if (chunks.length === 0) {
    const emptyEntry: EmbeddingCacheEntry = { chunks: [], vectors: [] };
    resumeEmbeddingCache.set(docKey, emptyEntry);
    return emptyEntry;
  }

  const vectors: number[][] = [];
  const batchSize = 24;

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const resp = await openai.embeddings.create({
      model: DEFAULT_EMBEDDING_MODEL,
      input: batch,
    });

    for (const item of resp.data) {
      vectors.push(item.embedding);
    }
  }

  const entry: EmbeddingCacheEntry = { chunks, vectors };
  resumeEmbeddingCache.set(docKey, entry);
  return entry;
}

async function retrieveRelevantResumeContext(args: {
  uploadedDocs?: Array<{ id?: string; name?: string }>;
  query: string;
  userId: string;
}): Promise<string> {
  const { uploadedDocs, query, userId } = args;
  if (!uploadedDocs || uploadedDocs.length === 0) return "";

  const normalizedQuery = normalizeContextText(query);
  if (!normalizedQuery) return "";

  const queryEmbedding = await openai.embeddings.create({
    model: DEFAULT_EMBEDDING_MODEL,
    input: normalizedQuery,
  });

  const qVec = queryEmbedding.data[0]?.embedding;
  if (!qVec) return "";

  const candidates: Array<{ score: number; name: string; snippet: string }> = [];

  for (const d of uploadedDocs.slice(0, 5)) {
    const id = d.id;
    const name = d.name || id || "file";
    if (!id) continue;
    const stored = await readUserDocument(userId, id);
    if (!stored) continue;
    const content = (await extractDocumentTextFromBuffer(stored.name, stored.buffer)).replace(/\s+/g, " ").trim();
    if (!content) continue;

    const docKey = `${id}:${name}`;
    const entry = await getOrBuildDocEmbeddings(docKey, content);
    if (entry.chunks.length === 0 || entry.vectors.length === 0) continue;

    for (let i = 0; i < entry.chunks.length; i += 1) {
      const score = cosineSimilarity(qVec, entry.vectors[i] || []);
      if (score > 0.16) {
        candidates.push({ score, name, snippet: entry.chunks[i] });
      }
    }
  }

  if (candidates.length === 0) return "";

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 6).map((c, idx) =>
    `Match ${idx + 1} (${c.name}, score ${(c.score * 100).toFixed(1)}):\n${c.snippet}`,
  );

  return top.join("\n\n");
}

function buildConversationContext(history?: Array<{ role?: string; content?: string }> | null): string {
  if (!Array.isArray(history) || history.length === 0) return "";

  const turns = history.slice(-8).map((turn) => {
    const role = turn.role === "assistant" ? "Assistant" : "User";
    const content = normalizeContextText(turn.content || "");
    return content ? `${role}: ${content}` : null;
  }).filter(Boolean);

  return turns.length > 0 ? `Recent conversation memory:\n${turns.join("\n")}` : "";
}

function buildRelevantDocumentSnippet(content: string, query: string): string {
  const normalizedContent = normalizeContextText(content);
  const normalizedQuery = normalizeContextText(query).toLowerCase();
  if (!normalizedContent) return "";

  if (normalizedQuery) {
    const terms = normalizedQuery.split(/[^a-z0-9]+/).filter(Boolean);
    const match = terms.find((term) => normalizedContent.toLowerCase().includes(term));
    if (match) {
      const idx = normalizedContent.toLowerCase().indexOf(match);
      const start = Math.max(0, idx - 220);
      const end = Math.min(normalizedContent.length, idx + 900);
      const snippet = normalizedContent.slice(start, end);
      if (snippet) return snippet;
    }
  }

  return normalizedContent.slice(0, 1400);
}

function buildResumeSignal(content: string): string {
  const normalized = normalizeContextText(content);
  if (!normalized) return "";

  const segments = normalized
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(0, 260);

  const keep = segments.filter((line) =>
    /(experience|project|responsib|achievement|delivered|implemented|designed|optimized|migration|azure|databricks|spark|python|sql|etl|pipeline|production|client|lead|mentored|support|company|role|technology|kpi)/i.test(line),
  );

  return keep.slice(0, 18).join("\n");
}

function formatInterviewAnswer(args: {
  recommendedAnswer: string;
  keywords: string[];
  resumeMatch: string[];
  followUp: string;
  tip: string;
  confidenceScore: number;
}): string {
  const keywords = args.keywords.filter(Boolean).slice(0, 6);
  const resumeMatch = args.resumeMatch.filter(Boolean).slice(0, 6);
  const confidence = Math.max(0, Math.min(100, args.confidenceScore));
  const bar = buildConfidenceBar(confidence);

  const keywordLines = keywords.length > 0
    ? keywords.map((k) => `• ${k}`).join("\n")
    : "• Role fit\n• Business impact\n• Production reliability";

  const resumeLines = resumeMatch.length > 0
    ? resumeMatch.join("\n")
    : "Company: Not found in uploaded resume\nProject: Not found in uploaded resume\nExperience: Not enough resume evidence\nSkill: Not enough resume evidence";

  return [
    "🎯 Recommended Answer",
    "",
    args.recommendedAnswer.trim(),
    "",
    "--------------------------------------------------",
    "",
    "📌 Mention These Keywords",
    "",
    keywordLines,
    "",
    "--------------------------------------------------",
    "",
    "💼 Resume Match",
    "",
    resumeLines,
    "",
    "--------------------------------------------------",
    "",
    "⭐ If Interviewer Asks More",
    "",
    args.followUp.trim(),
    "",
    "--------------------------------------------------",
    "",
    "🧠 Interview Tip",
    "",
    args.tip.trim(),
    "",
    "Confidence",
    "",
    bar,
    "",
    `${confidence}%`,
  ].join("\n");
}

async function runCodeRepairPass(args: {
  promptQuestion: string;
  originalAnswer: string;
  preferredLanguage?: string;
}): Promise<{ answer: string; sections: Array<{ type: string; title: string; language: string; content: string }> }> {
  const { promptQuestion, originalAnswer, preferredLanguage } = args;

  const repaired = await openai.chat.completions.create({
    model: DEFAULT_ANALYSIS_MODEL,
    temperature: 0,
    top_p: 1,
    messages: [
      {
        role: "system",
        content: `You convert weak/prose responses into accurate executable technical output.

Rules:
- Return ONLY valid JSON.
- If user intent is SQL, return syntactically correct SQL query as answer.
- If user intent is Python/PySpark, return runnable script with imports.
- No explanation text in answer for code asks.
- Never include markdown fences in answer.

JSON schema:
{
  "answer": "string",
  "sections": [{ "type": "sql|code", "title": "SQL Query|Python Script|PySpark Script|Code", "language": "sql|python", "content": "string" }]
}`,
      },
      {
        role: "user",
        content: `Question:\n${promptQuestion}\n\nWeak answer to fix:\n${originalAnswer}\n\nPreferred language: ${preferredLanguage ?? "auto"}`,
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1500,
  });

  const raw = repaired.choices[0]?.message?.content ?? "{}";
  let parsed: any = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
  const sections = Array.isArray(parsed.sections)
    ? parsed.sections
        .map((s: any) => ({
          type: typeof s?.type === "string" ? s.type : "code",
          title: typeof s?.title === "string" ? s.title : "Code",
          language: normalizeLanguage(s?.language),
          content: typeof s?.content === "string" ? s.content.trim() : "",
        }))
        .filter((s: any) => !!s.content)
    : [];

  return { answer, sections };
}

router.post("/openai/analyze", async (req, res) => {
  const parsed = AnalyzeContextBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { transcript, screenshotBase64, uploadedDocs, history = [], mode, model: requestedModel } = parsed.data;
  const spent = await takeCredits(req, res, CREDIT_COSTS.analyze);
  if (!spent) return;
  const analysisModel = requestedModel && ALLOWED_ANALYSIS_MODELS.has(requestedModel)
    ? requestedModel
    : DEFAULT_ANALYSIS_MODEL;
  const explicitQuestion = extractExplicitQuestion(transcript);
  if (explicitQuestion && !looksLikeUsEnglish(explicitQuestion)) {
    const restored = await grantCredits(req.authUser!.id, CREDIT_COSTS.analyze).catch(() => null);
    res.json({
      question: "Unclear audio",
      questionType: "general",
      answer: "I didn't catch a clear English question. Press Listen when they ask again.",
      domain: "General Business",
      suggestions: [],
      confidence: "low",
      sections: [],
      credits: restored?.credits ?? spent.credits,
    });
    return;
  }
  const resumeQuestion = isResumeQuestion(explicitQuestion ?? transcript);
  const useGrounding = shouldUseDocumentGrounding(explicitQuestion ?? transcript, uploadedDocs);

  const userContent: ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `Meeting transcript:\n${transcript || "(no transcript yet)"}`,
    },
  ];

  if (screenshotBase64) {
    userContent.push({
      type: "image_url",
      image_url: {
        url: `data:image/jpeg;base64,${screenshotBase64}`,
        detail: "low",
      },
    });
  }

  const conversationContext = buildConversationContext(history);
  if (conversationContext) {
    userContent.push({ type: "text", text: conversationContext });
  }

  try {
    // Only ground from uploaded documents when the question is clearly resume/profile related.
    if (useGrounding && uploadedDocs && uploadedDocs.length > 0) {
      const docsLines: string[] = [];
      let resumeGrounding = "";
      try {
        const docsToRead = uploadedDocs.slice(0, 3);
        for (const d of docsToRead) {
          const id = d.id;
          const name = d.name || id || "file";
          docsLines.push(`- ${name}`);
          if (!id) continue;
          try {
            const stored = await readUserDocument(req.authUser!.id, id);
            if (!stored) continue;
            const content = (await extractDocumentTextFromBuffer(stored.name, stored.buffer)).replace(/\s+/g, " ").trim();
            if (content) {
              const clipped = content.slice(0, 7000);
              docsLines.push(`Content (first 1200 chars):\n${clipped}`);
              if (!resumeGrounding && (resumeQuestion || isResumeLikeFile(name))) {
                resumeGrounding = buildResumeSignal(clipped) || clipped;
              }
            }
          } catch { /* non-fatal */ }
        }
        if (docsLines.length) {
          userContent.push({ type: "text", text: `User uploaded documents:\n${docsLines.join("\n")}` });
        }
        if (resumeGrounding) {
          userContent.push({
            type: "text",
            text: `Primary resume context for candidate answers:\n${resumeGrounding}`,
          });
        }

        if (docsToRead.length > 0 && useGrounding) {
          const docContextLines: string[] = [];
          for (const d of docsToRead) {
            const id = d.id;
            const name = d.name || id || "file";
            if (!id) continue;
            try {
              const stored = await readUserDocument(req.authUser!.id, id);
              if (!stored) continue;
              const content = (await extractDocumentTextFromBuffer(stored.name, stored.buffer)).replace(/\s+/g, " ").trim();
              const relevantSnippet = buildRelevantDocumentSnippet(content, explicitQuestion ?? transcript ?? "");
              if (relevantSnippet) {
                docContextLines.push(`Document: ${name}\nRelevant excerpt:\n${relevantSnippet}`);
              }
            } catch { /* non-fatal */ }
          }
          if (docContextLines.length) {
            userContent.push({ type: "text", text: `Relevant document context:\n${docContextLines.join("\n\n")}` });
          }
        }
      } catch { /* ignore upload doc read errors */ }
    }

    if (uploadedDocs && uploadedDocs.length > 0) {
      try {
        const semanticContext = await retrieveRelevantResumeContext({
          uploadedDocs,
          query: explicitQuestion ?? transcript ?? "",
          userId: req.authUser!.id,
        });
        if (semanticContext) {
          userContent.push({
            type: "text",
            text: `Semantic resume matches (embedding retrieval):\n${semanticContext}`,
          });
        }
      } catch {
        // non-fatal: continue without embedding context
      }
    }

    const inferredQuestion = explicitQuestion ?? transcript ?? "";
    const questionType = detectQuestionType(inferredQuestion);
    const spokenAnswer = !isCodeIntent(inferredQuestion);
    const modeVoice = mode === "interview"
      ? `INTERVIEW: You are the candidate. Answer the interviewer the way a hired senior data engineer would actually speak. Direct, first person, concrete. No lecture. No inventory confirmation. No "I can check with admin."`
      : `MEETING: You are on a live work call. Answer like a data engineer talking to teammates. Decisive. Say what we run and what you would do next. No consultant hedging.`;

    const completion = await openai.chat.completions.create({
      model: analysisModel,
      temperature: spokenAnswer ? 0.55 : 0.15,
      top_p: spokenAnswer ? 0.9 : 0.9,
      messages: [
        {
          role: "system",
          content: `You are a Parakeet-style live copilot. The user glances at your text and speaks it. Never generate audio.

Session mode: ${mode}
Detected question type: ${questionType}
${modeVoice}

You ARE this person: a real senior data engineer on a live ${mode}. Use the resume, JD, and session guidance as your identity. First person only. You are not a coach.

ANSWER FORMAT — this is mandatory, like Parakeet:
Line 1: a spoken opener plus the direct answer. Contractions. "Yeah", "So basically", "Right, so", or go straight in.
Then 3 to 5 short bullets. Start each with •. One idea per line. Easy to glance at while talking.
Under 90 words. No blank section titles.

Interview example for cluster types:
Yeah, so we mainly use three cluster types in Databricks.
• All-purpose — notebooks and interactive work while I'm developing
• Job clusters — they spin up for a scheduled job and auto-terminate
• High concurrency — shared SQL compute so BI users aren't fighting for the same cluster

Meeting example for "any other clusters":
Right — in this workspace it's just those three.
• Interactive for notebooks
• Job clusters for scheduled runs
• High concurrency for SQL / BI
• I haven't stood up anything else. If a new workload needs its own, I can add it

Behavioral example:
Yeah, a recent one was late data hitting a gold dashboard.
• Pipeline was dropping same-day events after a timezone change
• I added a watermark and a Delta merge on the unique key
• Dashboard caught up without a full reload

Use real data-engineering language when it fits: bronze/silver/gold, Autoloader, Delta, Unity Catalog, job vs all-purpose clusters, watermarks, shuffle, SCD.

Never do this:
- Headings or labels like Contextual Explanation, Cluster Inventory Confirmation, Explanation, Interview Tip
- A single dense paragraph
- "I'm not aware", "I can check with admin", "as of now these are the main", "Great question", "As a data engineer with X years", "As an AI"
- Dump REST API, Terraform, or Python unless they explicitly asked for code
- Invent employers, projects, or metrics. If it is not in the resume, say you have working knowledge and can ramp

If the transcript is not a clear English question, answer only: I didn't catch a clear English question. Press Listen again.

Output JSON only:
{
  "question": "The speaker's English question, ≤60 chars",
  "questionType": "${questionType}",
  "recommendedAnswer": "The Parakeet-style spoken script with line breaks and • bullets",
  "answer": "The Parakeet-style spoken script with line breaks and • bullets",
  "confidence": "high|medium|low",
  "sections": []
}

Keep sections empty unless they explicitly asked for code. Put newline characters in answer. The answer field is the on-screen script.`,
        },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1300,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let result: {
      question?: string;
      questionType?: string;
      recommendedAnswer?: string;
      keywords?: string[];
      resumeMatch?: string[];
      followUpAnswer?: string;
      interviewTip?: string;
      confidenceScore?: number;
      answer?: string;
      domain?: string;
      suggestions?: string[];
      confidence?: string;
      sections?: Array<{ type: string; title: string; content: string; language?: string | null }>;
    };
    try {
      result = JSON.parse(raw);
    } catch {
      result = {};
    }

    const transcriptText = typeof transcript === "string" ? transcript : "";
    const codeIntent = isCodeIntent(explicitQuestion ?? transcriptText);
    const sections = (result.sections ?? []).map((s) => ({
      ...s,
      language: normalizeLanguage(s.language),
    }));
    sections.sort((left, right) => {
      const leftIsCode = /^(code|sql|python|pyspark|scala|bash|hcl|json)$/i.test(left.type) || /^(sql|python|scala|bash|hcl|json)$/i.test(left.language);
      const rightIsCode = /^(code|sql|python|pyspark|scala|bash|hcl|json)$/i.test(right.type) || /^(sql|python|scala|bash|hcl|json)$/i.test(right.language);
      return Number(rightIsCode) - Number(leftIsCode);
    });

    const recommendedAnswer = typeof result.recommendedAnswer === "string" ? result.recommendedAnswer.trim() : "";

    let answer = (result.answer ?? "").trim();

    if (codeIntent) {
      const codeSection = sections.find((section) => section.content && /^(code|sql)$/i.test(section.type));
      const preferredLanguage = detectRequestedLanguage(explicitQuestion ?? transcriptText);
      const firstCodeBlock = extractFirstCodeBlock(answer);

      if (codeSection?.content) {
        answer = codeSection.content;
      } else if (firstCodeBlock?.code) {
        answer = firstCodeBlock.code;
      } else {
        const repaired = await runCodeRepairPass({
          promptQuestion: explicitQuestion ?? transcriptText,
          originalAnswer: answer || recommendedAnswer,
          preferredLanguage,
        });
        answer = repaired.answer || repaired.sections[0]?.content || "Unable to generate executable code for this request.";
        if (repaired.sections.length) sections.splice(0, sections.length, ...repaired.sections);
      }
    } else {
      answer = toParakeetScript(recommendedAnswer || answer);
      sections.splice(0, sections.length);
    }

    if (!answer) {
      answer = "I didn't catch a clear English question. Press Listen again.";
    }

    const normalizedQuestion = (result.question ?? "").trim();
    const safeQuestion = normalizedQuestion && !/^meeting context$/i.test(normalizedQuestion)
      ? normalizedQuestion
      : `${questionType}: Live question`;

    res.json({
      question: safeQuestion,
      questionType: result.questionType ?? questionType,
      answer,
      domain: result.domain ?? "General Business",
      suggestions: result.suggestions ?? [],
      confidence: result.confidence ?? "low",
      sections,
      credits: spent.credits,
    });
  } catch (err) {
    req.log.error({ err }, "OpenAI analyze error");
    await grantCredits(req.authUser!.id, CREDIT_COSTS.analyze).catch(() => undefined);
    res.status(500).json({ error: "Failed to analyze context" });
  }
});

router.post("/openai/transcribe", async (req, res) => {
  const parsed = TranscribeAudioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { audioBase64, mimeType = "audio/webm" } = parsed.data;

  try {
    if (!/^audio\/(webm|ogg|mp4|mpeg|mp3)(?:;|$)/i.test(mimeType)) {
      res.status(415).json({ error: "Unsupported audio format" });
      return;
    }
    const audioBuffer = Buffer.from(audioBase64, "base64");

    if (audioBuffer.length > 10 * 1024 * 1024) {
      res.status(413).json({ error: "Audio chunk is too large" });
      return;
    }

    if (audioBuffer.length < 500) {
      res.json({ transcript: "" });
      return;
    }

    const spent = await takeCredits(req, res, CREDIT_COSTS.transcribe);
    if (!spent) return;

    const ext = mimeType.includes("mp4")
      ? "mp4"
      : mimeType.includes("ogg")
      ? "ogg"
      : mimeType.includes("mp3")
      ? "mp3"
      : "webm";

    const blob = new Blob([audioBuffer], { type: mimeType });
    const file = new File([blob], `audio.${ext}`, { type: mimeType });

    const transcription = await openai.audio.transcriptions.create({
      model: DEFAULT_TRANSCRIPTION_MODEL,
      file: file as unknown as Parameters<typeof openai.audio.transcriptions.create>[0]["file"],
      response_format: "text",
      language: "en",
      temperature: 0,
      prompt: TRANSCRIPTION_PROMPT,
    });

    const raw =
      typeof transcription === "string"
        ? transcription
        : ((transcription as { text?: string }).text ?? "");
    const text = raw.replace(/\s+/g, " ").trim();
    res.json({ transcript: looksLikeUsEnglish(text) ? text : "", credits: spent.credits });
  } catch (err) {
    await grantCredits(req.authUser!.id, CREDIT_COSTS.transcribe).catch(() => undefined);
    req.log.error({ err }, "OpenAI transcription failed");
    res.status(500).json({
      error: "Failed to transcribe audio",
    });
  }
});

export default router;
