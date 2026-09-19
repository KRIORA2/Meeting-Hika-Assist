/**
 * Production API checks against https://hikanest-api-v1.onrender.com
 * Does not print secrets. Requires a Firebase ID token or email/password test user.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function loadEnv(filePath: string) {
  try {
    for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      const value = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
      if (key && !process.env[key]) process.env[key] = value;
    }
  } catch { /* missing env is allowed */ }
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
loadEnv(resolve(repoRoot, ".env"));
loadEnv(resolve(repoRoot, "artifacts/api-server/.env"));
loadEnv(resolve(repoRoot, "artifacts/hika/.env"));

const API = process.env.HIKA_PROD_API_URL || "https://hikanest-api-v1.onrender.com";
const EXPECTED_MODEL = "gpt-5.6-sol";
const EXPECTED_REVISION = String(process.env.HIKA_EXPECTED_REVISION || "").trim();

type NdjsonEvent = {
  type?: string;
  questionId?: string;
  generationId?: string;
  question?: string;
  answer?: string;
  model?: string;
  error?: string;
};

function hasPysparkCode(text: string) {
  return /from pyspark|Window\.|row_number|dropDuplicates|drop_duplicates/i.test(text);
}

async function healthz() {
  const res = await fetch(`${API}/api/healthz`);
  const body = await res.json() as {
    status?: string;
    service?: string;
    revision?: string | null;
    answerModel?: string;
  };
  return { status: res.status, body };
}

async function firebaseIdToken(): Promise<string> {
  const existing = String(process.env.HIKA_PROD_TOKEN || process.env.HIKA_AUTH_TOKEN || "").trim();
  if (existing) return existing;
  const apiKey = String(process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_WEB_API_KEY || "").trim();
  const email = String(process.env.HIKA_TEST_EMAIL || process.env.FIREBASE_TEST_EMAIL || "").trim();
  const password = String(process.env.HIKA_TEST_PASSWORD || process.env.FIREBASE_TEST_PASSWORD || "").trim();
  if (!apiKey || !email || !password) {
    throw new Error("Missing HIKA_PROD_TOKEN or HIKA_TEST_EMAIL/HIKA_TEST_PASSWORD + VITE_FIREBASE_API_KEY");
  }
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const payload = await res.json() as { idToken?: string; error?: { message?: string } };
  if (!res.ok || !payload.idToken) {
    throw new Error(`Firebase sign-in failed (${payload.error?.message || res.status})`);
  }
  return payload.idToken;
}

async function analyze(args: {
  token: string;
  question: string;
  questionId: string;
  generationId: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  signal?: AbortSignal;
}) {
  const started = Date.now();
  let firstTokenMs: number | null = null;
  const res = await fetch(`${API}/api/openai/analyze`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.token}`,
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify({
      transcript: `ANSWER THIS: "${args.question.replace(/"/g, "'")}"`,
      questionId: args.questionId,
      generationId: args.generationId,
      model: "gpt-4.1",
      stream: true,
      mode: "interview",
      history: args.history || [],
    }),
    signal: args.signal,
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(`analyze ${res.status}: ${payload.error || res.statusText}`);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let buffer = "";
  let done: NdjsonEvent | null = null;
  const deltas: NdjsonEvent[] = [];
  while (true) {
    const { value, done: eof } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !eof });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let event: NdjsonEvent;
      try { event = JSON.parse(trimmed) as NdjsonEvent; } catch { continue; }
      if (event.type === "delta") {
        if (firstTokenMs == null) firstTokenMs = Date.now() - started;
        deltas.push(event);
      } else if (event.type === "done") done = event;
      else if (event.type === "error") throw new Error(event.error || "Analyze failed");
    }
    if (eof) break;
  }
  return {
    firstTokenMs,
    totalMs: Date.now() - started,
    done,
    deltas,
    answer: String(done?.answer || deltas.at(-1)?.answer || ""),
    model: done?.model || deltas.find((item) => item.model)?.model || "",
  };
}

function rejectStale(activeGenerationId: string, event: NdjsonEvent) {
  return !event.generationId || event.generationId === activeGenerationId;
}

let failed = false;
const health = await healthz();
const healthOk = health.status === 200
  && health.body.answerModel === EXPECTED_MODEL
  && health.body.service === "hikanest-api-v1"
  && (!EXPECTED_REVISION || health.body.revision === EXPECTED_REVISION);
if (!healthOk) failed = true;
console.log(JSON.stringify({
  step: "healthz",
  ok: healthOk,
  status: health.status,
  service: health.body.service,
  revision: health.body.revision,
  answerModel: health.body.answerModel,
}));

const token = await firebaseIdToken();
const cdc = { q: "what is cdc actually", id: "q_prod_a", gen: "g_prod_a", expect: /\b(cdc|change data capture)\b/i };
const rows: Array<{
  key: string;
  q: string;
  id: string;
  gen: string;
  expect?: RegExp;
  code?: boolean;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}> = [
  { key: "A", ...cdc },
  { key: "B", q: "how you implement incremental load", id: "q_prod_b", gen: "g_prod_b", expect: /watermark|cdc|merge|incremental/i },
  { key: "C", q: "write pyspark remove duplicate", id: "q_prod_c", gen: "g_prod_c", code: true, expect: /pyspark|window|row_number|dropduplicates|distinct/i },
  { key: "D", q: "write sql second highest salary", id: "q_prod_d", gen: "g_prod_d", code: true, expect: /select|salary|dense_rank|row_number|offset/i },
  { key: "E", q: "tell difference adf and databricks", id: "q_prod_e", gen: "g_prod_e", expect: /adf|data factory|databricks/i },
];

const previous: Record<string, string> = {};
for (const row of rows) {
  const result = await analyze({ token, question: row.q, questionId: row.id, generationId: row.gen });
  previous[row.key] = result.answer;
  const ok = Boolean(result.answer)
    && result.model === EXPECTED_MODEL
    && result.done?.questionId === row.id
    && result.done?.generationId === row.gen
    && (!row.expect || row.expect.test(result.answer))
    && (!row.code || hasPysparkCode(result.answer) || /SELECT |DENSE_RANK|ROW_NUMBER/i.test(result.answer))
    && !/gpt-4\.1|gpt-4o(?!-transcribe)/i.test(result.model);
  if (!ok) failed = true;
  console.log(JSON.stringify({
    step: row.key,
    question: row.q,
    ok,
    model: result.model,
    questionId: result.done?.questionId,
    generationId: result.done?.generationId,
    firstTokenMs: result.firstTokenMs,
    totalMs: result.totalMs,
    hasCode: hasPysparkCode(result.answer) || /SELECT |DENSE_RANK|ROW_NUMBER/i.test(result.answer),
    opener: result.answer.slice(0, 90),
  }));
}

const follow = await analyze({
  token,
  question: "How do you implement it in Databricks?",
  questionId: "q_prod_f",
  generationId: "g_prod_f",
  history: [
    { role: "user", content: cdc.q },
    { role: "assistant", content: (previous.A || "").slice(0, 140) },
  ],
});
const followOk = Boolean(follow.answer)
  && follow.model === EXPECTED_MODEL
  && /databricks|delta|cdc|merge/i.test(follow.answer);
if (!followOk) failed = true;
console.log(JSON.stringify({
  step: "F",
  question: "How do you implement it in Databricks?",
  ok: followOk,
  model: follow.model,
  firstTokenMs: follow.firstTokenMs,
  totalMs: follow.totalMs,
  opener: follow.answer.slice(0, 90),
}));

const schema = await analyze({
  token,
  question: "how you handle schema change in adf",
  questionId: "q_prod_g",
  generationId: "g_prod_g",
});
const schemaOk = Boolean(schema.answer) && schema.model === EXPECTED_MODEL && /schema|adf|mapping|pipeline/i.test(schema.answer);
if (!schemaOk) failed = true;
console.log(JSON.stringify({
  step: "G",
  question: "how you handle schema change in adf",
  ok: schemaOk,
  model: schema.model,
  firstTokenMs: schema.firstTokenMs,
  totalMs: schema.totalMs,
  opener: schema.answer.slice(0, 90),
}));

const q1 = analyze({ token, question: "what is cdc actually", questionId: "q_stale_1", generationId: "g_stale_1" });
await new Promise((resolveWait) => setTimeout(resolveWait, 250));
const q2 = await analyze({ token, question: "why delta lake", questionId: "q_stale_2", generationId: "g_stale_2" });
const q1Result = await q1;
const active = "g_stale_2";
const q1WouldPaint = [q1Result.done, ...q1Result.deltas].some((event) => event && rejectStale(active, event) && event.generationId === "g_stale_1");
const staleOk = q2.model === EXPECTED_MODEL
  && q2.done?.generationId === "g_stale_2"
  && q1Result.done?.generationId === "g_stale_1"
  && !q1WouldPaint
  && /delta/i.test(q2.answer);
if (!staleOk) failed = true;
console.log(JSON.stringify({
  step: "H",
  ok: staleOk,
  q1GenerationId: q1Result.done?.generationId,
  q2GenerationId: q2.done?.generationId,
  q1WouldOverwriteQ2: q1WouldPaint,
  q2Model: q2.model,
  q1FirstTokenMs: q1Result.firstTokenMs,
  q2FirstTokenMs: q2.firstTokenMs,
  q2TotalMs: q2.totalMs,
  q2Opener: q2.answer.slice(0, 90),
}));

const coding = await analyze({
  token,
  question: "write pyspark code to remove duplicates",
  questionId: "q_prod_i",
  generationId: "g_prod_i",
});
const codingOk = coding.model === EXPECTED_MODEL && hasPysparkCode(coding.answer);
if (!codingOk) failed = true;
console.log(JSON.stringify({
  step: "I",
  question: "write pyspark code to remove duplicates",
  ok: codingOk,
  model: coding.model,
  firstTokenMs: coding.firstTokenMs,
  totalMs: coding.totalMs,
  hasPysparkCode: hasPysparkCode(coding.answer),
  opener: coding.answer.slice(0, 90),
}));

if (failed) process.exit(1);
