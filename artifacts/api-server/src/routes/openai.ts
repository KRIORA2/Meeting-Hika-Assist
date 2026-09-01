import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { AnalyzeContextBody, TranscribeAudioBody } from "@workspace/api-zod";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import { Buffer } from "node:buffer";
import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

const router = Router();
const DEFAULT_ANALYSIS_MODEL = process.env.OPENAI_MODEL || "gpt-4.1";
const DEFAULT_TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-transcribe";
const DEFAULT_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const DEFAULT_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime";
const DEFAULT_REALTIME_TRANSCRIPTION_MODEL = process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";
const DEFAULT_REALTIME_NOISE_REDUCTION = process.env.OPENAI_REALTIME_NOISE_REDUCTION === "far_field" ? "far_field" : "near_field";

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
  vadThreshold: envNumber("OPENAI_REALTIME_VAD_THRESHOLD", 0.45, 0, 1),
  vadPrefixPaddingMs: envInteger("OPENAI_REALTIME_VAD_PREFIX_PADDING_MS", 200, 0, 2000),
  interviewVadSilenceMs: envInteger("INTERVIEW_VAD_SILENCE_MS", 250, 150, 2000),
  meetingVadSilenceMs: envInteger("MEETING_VAD_SILENCE_MS", 400, 150, 2000),
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
    ? req.body.sessionGuidance.slice(0, 1_500)
    : "";
  const mode = req.body?.mode === "meeting" ? "meeting" : "interview";
  const uploadedDocs = Array.isArray(req.body?.uploadedDocs)
    ? req.body.uploadedDocs.slice(0, 3).filter((doc: unknown): doc is { id: string; name?: string } =>
      !!doc && typeof (doc as { id?: unknown }).id === "string")
    : [];

  if (!process.env.OPENAI_API_KEY) {
    res.status(503).json({ error: "Realtime voice is not configured on the server." });
    return;
  }

  // Document extraction happens once when the persistent Realtime session is
  // created, never for every partial transcription event.
  const documentContext: string[] = [];
  if (uploadedDocs.length) {
    const uploadDir = path.join(process.cwd(), "uploads");
    for (const doc of uploadedDocs) {
      try {
        const found = fs.existsSync(uploadDir)
          ? fs.readdirSync(uploadDir).find((file) => file.startsWith(doc.id))
          : undefined;
        if (!found) continue;
        const content = (await extractDocumentText(path.join(uploadDir, found))).replace(/\s+/g, " ").trim();
        if (content) documentContext.push(`${doc.name || "Profile"}: ${buildResumeSignal(content).slice(0, 900)}`);
      } catch {
        // A document is optional context; it must not block live voice setup.
      }
    }
  }

  const modeInstructions = mode === "interview"
    ? [
      "The speaker is answering an interviewer. Treat the most recent completed user turn as the exact question, including shorthand and follow-up questions.",
      "Give a natural answer the speaker can say aloud. Use confident first person only when the supplied candidate context supports it; otherwise give a technically correct answer without inventing experience.",
      "For behavioural questions, make the answer concrete with a compact situation, action, and result. For technical questions, explain the direct answer first, then one practical example, trade-off, or implementation detail.",
    ]
    : [
      "Treat the most recent completed user turn as the exact request, including shorthand and follow-up questions.",
      "For decisions or action questions, state the recommendation first, then the brief rationale or next step. Keep related turns connected, but do not summarize the whole meeting unless asked.",
    ];

  const instructions = [
    "You are Hikanest Live Assist, a fast, context-aware copilot for live interviews and meetings.",
    "Understand the speaker's actual intent before answering. Silently correct obvious transcription mistakes, typos, and incomplete phrasing using the surrounding conversation and supplied context.",
    "Answer the question directly and specifically. Do not give generic advice, a generic summary, an agenda, or chatbot filler such as 'I can help', 'As an AI', or 'Based on the conversation'.",
    "Output polished natural free text only: no JSON, no confidence score, no role labels, and no headings such as 'Recommended Answer'. Do not repeat the question.",
    "Use a short paragraph by default; use brief bullets only when they make an explanation, comparison, or steps clearer.",
    "Be accurate, practical, and specific. Never invent facts, project details, metrics, or candidate experience. If essential information is missing, state the assumption briefly and give the best useful answer.",
    "Keep ordinary answers under 140 words while remaining direct. For interview questions, give a detailed candidate answer with responsibilities, technical decisions, impact, and one relevant example when supported by supplied context. Include code only when it is requested, and keep code immediately usable.",
    ...modeInstructions,
    sessionGuidance ? `Session guidance:\n${sessionGuidance}` : "",
    documentContext.length ? `Relevant candidate context (use only when supported):\n${documentContext.join("\n")}` : "",
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
        transcription: { model: DEFAULT_REALTIME_TRANSCRIPTION_MODEL, language: "en" },
        turn_detection: {
          type: "server_vad",
          threshold: REALTIME_CONFIG.vadThreshold,
          prefix_padding_ms: REALTIME_CONFIG.vadPrefixPaddingMs,
          silence_duration_ms: silenceDurationMs,
          create_response: true,
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
      req.log.error({ status: upstream.status }, "Realtime client secret request failed");
      res.status(502).json({ error: "Could not authorize the realtime voice connection." });
      return;
    }
    if (!response || typeof response.value !== "string" || typeof response.expires_at !== "number") {
      req.log.error("Realtime client secret response was malformed");
      res.status(502).json({ error: "Realtime authorization response was invalid." });
      return;
    }
    res.json({ clientSecret: response.value, expiresAt: response.expires_at });
  } catch (err) {
    req.log.error({ err }, "Realtime client secret request failed");
    res.status(502).json({ error: "Could not reach the realtime authorization service." });
  }
});

const resumeEmbeddingCache = new Map<string, EmbeddingCacheEntry>();

function isCodeIntent(text: string): boolean {
  const t = text.toLowerCase();
  return /(sql|query|pyspark|spark|python|script|code|databricks|join|group by|cte|window function|row_number)/i.test(t);
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

async function extractDocumentText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".txt" || ext === ".md" || ext === ".json" || ext === ".csv") {
    return fs.readFileSync(filePath, "utf8");
  }

  if (ext === ".pdf") {
    const buffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(buffer);
    return parsed.text || "";
  }

  if (ext === ".docx") {
    const parsed = await mammoth.extractRawText({ path: filePath });
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

function shouldUseDocumentGrounding(text: string, docs?: Array<{ id?: string; name?: string }> | null): boolean {
  if (!docs?.length) return false;
  const t = text.toLowerCase();
  return /(resume|cv|background|experience|project|tell me about yourself|introduce yourself|roles and responsibilities|strengths|responsibilities)/i.test(t)
    || docs.some((d) => isResumeLikeFile(d.name || ""));
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
  uploadDir: string;
}): Promise<string> {
  const { uploadedDocs, query, uploadDir } = args;
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
    if (!id || !fs.existsSync(uploadDir)) continue;

    const files = fs.readdirSync(uploadDir);
    const found = files.find((f) => f.startsWith(id));
    if (!found) continue;

    const fullPath = path.join(uploadDir, found);
    const content = (await extractDocumentText(fullPath)).replace(/\s+/g, " ").trim();
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

  const { transcript, screenshotBase64 } = parsed.data;
  const uploadedDocs = (parsed.data as any).uploadedDocs as Array<{ id?: string; name?: string }> | undefined;
  const history = Array.isArray((req.body as any)?.history) ? (req.body as any).history : [];
  const requestedModel = typeof (req.body as { model?: unknown }).model === "string"
    ? (req.body as { model: string }).model
    : undefined;
  const analysisModel = requestedModel || DEFAULT_ANALYSIS_MODEL;
  const explicitQuestion = extractExplicitQuestion(transcript);
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
        const UPLOAD_DIR = path.join(process.cwd(), "uploads");
        const docsToRead = uploadedDocs.slice(0, 3);
        for (const d of docsToRead) {
          const id = d.id;
          const name = d.name || id || "file";
          docsLines.push(`- ${name}`);

          try {
            if (id && fs.existsSync(UPLOAD_DIR)) {
              const files = fs.readdirSync(UPLOAD_DIR);
              const found = files.find(f => f.startsWith(id));
              if (found) {
                const fullPath = path.join(UPLOAD_DIR, found);
                const content = (await extractDocumentText(fullPath)).replace(/\s+/g, " ").trim();
                if (content) {
                  const clipped = content.slice(0, 2400);
                  docsLines.push(`Content (first 1200 chars):\n${clipped}`);
                  if (!resumeGrounding && (resumeQuestion || isResumeLikeFile(name))) {
                    resumeGrounding = buildResumeSignal(clipped) || clipped;
                  }
                }
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
            try {
              if (id && fs.existsSync(UPLOAD_DIR)) {
                const files = fs.readdirSync(UPLOAD_DIR);
                const found = files.find((f) => f.startsWith(id));
                if (found) {
                  const fullPath = path.join(UPLOAD_DIR, found);
                  const content = (await extractDocumentText(fullPath)).replace(/\s+/g, " ").trim();
                  const relevantSnippet = buildRelevantDocumentSnippet(content, explicitQuestion ?? transcript ?? "");
                  if (relevantSnippet) {
                    docContextLines.push(`Document: ${name}\nRelevant excerpt:\n${relevantSnippet}`);
                  }
                }
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
          uploadDir: path.join(process.cwd(), "uploads"),
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

    const completion = await openai.chat.completions.create({
      model: analysisModel,
      temperature: 0.2,
      top_p: 0.9,
      messages: [
        {
          role: "system",
          content: `You are Hikanest Live Assist, a real-time interview and meeting copilot.

Role:
- Behave like an experienced technical mentor sitting beside the candidate during a live interview.
- You are not a chatbot and must never produce generic ChatGPT-like replies.
- You must continuously use transcript context, prior turns, and uploaded resume/document evidence.

Current detected question type: ${questionType}

Core behavior:
- Think before answering. Understand the actual question, not just the keywords.
- Infer intent from context, shorthand, partial sentences, spelling mistakes, and prior conversation.
- Handle typos and malformed phrasing silently. For example, interpret "databrik", "pyspak", "azur", "micrsoft", "resme" as Databricks, PySpark, Azure, Microsoft, and Resume.
- Treat follow-up questions as connected to earlier context unless the user clearly changes the topic.
- Remember prior conversation, uploaded files, and resume information when relevant.
- Never sound robotic, generic, or repetitive. Avoid filler phrases like "As an AI" or "I can help" unless truly necessary.
- Write like a strong professional with 8–15 years of experience: clear, practical, confident, and grounded.
- Never say "As an AI" or "According to the information".
- Sound like a real candidate: "In my project...", "While working at...", "I implemented...".

When a resume or profile document is uploaded:
- Read it as authoritative context for the user's background.
- Extract and remember structured details such as name, experience, companies, projects, skills, responsibilities, education, certifications, achievements, and timeline.
- Use that profile to tailor every response. If the user asks about introductions, strengths, responsibilities, project experience, career summary, or interview questions, answer from the resume automatically and naturally.
- If the resume mentions specific tools, platforms, or domains, reflect them in the answer. For example, if the resume shows Databricks, Azure, Python, or Spark, the responses should sound aligned with those experiences.
- If details are missing, say that you could not find enough information to answer accurately rather than inventing facts.
- If a technology is not present in resume/project evidence, explicitly state "I have theoretical understanding and can ramp up quickly" instead of pretending direct hands-on ownership.

When the user asks interview questions:
- Answer as if you are that candidate, not as a textbook narrator.
- Use first-person language such as "I worked on...", "I was responsible for...", and "In my project..." when the resume supports it.
- Sound practical and experience-based, with examples, trade-offs, and realistic insight.
- Make the answer feel like a strong interview response: direct, confident, structured, and tailored to the resume.
- If the resume contains real achievements, use them. If the resume contains strong technical skills, make the answer reflect those skills naturally.
- Avoid generic interview coaching language. Be specific and believable.

Answer strategy by question type:
- Resume/HR: concise personal narrative with role progression and impact.
- Behavioral: use STAR flow (Situation, Task, Action, Result) naturally.
- Project: include architecture, role, responsibilities, challenge, solution, business impact.
- Coding: include approach, optimized solution, complexity, edge cases.
- Technical: include definition, real project example, advantages, limitations, best practices.
- Follow-up/"explain further": continue from the previous answer, do not restart from scratch.

When handling documents:
- Use uploaded PDFs, DOCX, TXT, Markdown, PowerPoint, Excel, JSON, code files, and OCR-style image content when relevant.
- Do not hallucinate. Answer only from the supplied material when appropriate.

When answering questions:
- Start with the most relevant point first.
- Be concise, but complete.
- Prefer direct answers over vague commentary.
- For normal conversation, respond like a helpful professional: natural, conversational, clear, and human.
- For interview questions, respond like an interview-winning candidate: polished, confident, tailored to the resume, and grounded in real experience.
- For technical questions, provide complete and accurate solutions with practical reasoning.
- For SQL, Python, PySpark, Azure, data engineering, or development questions, provide working code or queries when appropriate.
- For coding tasks, understand the existing architecture before suggesting changes and avoid isolated snippets unless the user asks for them.
- Explain why a change is useful or necessary when it adds value.
- Make the answer feel as if it was written by a real expert, not a template or a generic AI assistant.

Meeting assistant behavior:
- Understand meeting transcripts, tasks, decisions, action items, and follow-up needs.
- Produce concise summaries, clear notes, and useful follow-up content.

Answer quality rules:
- Be correct, relevant, accurate, and context-aware.
- Avoid generic fluff.
- If the information is insufficient, say: "I couldn't find enough information to answer accurately."
- Never fabricate details.

Output format:
Return ONLY valid JSON with this structure:
{
  "question": "Concise label ≤60 chars",
  "questionType": "${questionType}",
  "recommendedAnswer": "Complete high-quality answer the candidate can say aloud",
  "answer": "Same answer, with no headings or templates",
  "confidence": "high|medium|low",
  "sections": [
    {
      "type": "code|bullets|example|explanation|summary",
      "title": "Section title",
      "language": "sql|python|bash|hcl|scala|json|null",
      "content": "COMPLETE working content here"
    }
  ]
}

Important:
- Never use "Meeting context" as the question label.
- Never write placeholder code like "# your logic here" or "...".
- For SQL/Python/PySpark/code requests, the top-level answer should be code-first and not prose.
- For interview or meeting answers, return only the polished answer the candidate should say. Do not include keywords, resume matches, follow-up suggestions, interview tips, confidence scores, headings, or labels.
- Do not apologize or add meta-commentary.`,
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
      answer = recommendedAnswer || answer;
    }

    if (!answer) {
      answer = "No insights available for the current context.";
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
    });
  } catch (err) {
    req.log.error({ err }, "OpenAI analyze error");
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
    const audioBuffer = Buffer.from(audioBase64, "base64");

    if (audioBuffer.length < 500) {
      res.json({ transcript: "" });
      return;
    }

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
    });

    const text =
      typeof transcription === "string"
        ? transcription
        : ((transcription as { text?: string }).text ?? "");
    res.json({ transcript: text.trim() });
  } catch (err: any) {
  console.error("========== OPENAI ERROR ==========");
  console.error(err);

  if (err.response) {
    console.error(await err.response.text?.());
  }

  res.status(500).json({
    error: err.message,
    details: err,
  });
}
});

export default router;
