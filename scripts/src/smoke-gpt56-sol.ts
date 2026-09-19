/**
 * Live smoke of generateInterviewAnswer on gpt-5.6-sol.
 * Prints no secrets, resume, or raw prompts.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateInterviewAnswer } from "../../artifacts/api-server/src/lib/answer-generator.ts";

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
process.env.OPENAI_MODEL = "gpt-5.6-sol";
process.env.HIKA_SKIP_MEMORY_PERSIST = "1";

const keyPresent = Boolean(String(process.env.OPENAI_API_KEY || "").trim())
  && !/^your-openai-api-key/i.test(String(process.env.OPENAI_API_KEY || ""))
  && String(process.env.OPENAI_API_KEY || "").trim().length >= 20;

const questions = [
  "What is SCD Type 1?",
  "Write a sample SQL code for SCD Type 1.",
  "Write PySpark code to remove duplicates while keeping the latest record.",
  "How do you implement incremental loading in ADF?",
  "How would you handle failure during incremental loading?",
];

function mergeParts(text: string) {
  return {
    mergeInto: /\bMERGE\s+INTO\b/i.test(text),
    using: /\bUSING\b/i.test(text),
    on: /\bON\b/i.test(text),
    whenMatchedUpdate: /\bWHEN\s+MATCHED\s+THEN\s+UPDATE\b/i.test(text),
    whenNotMatchedInsert: /\bWHEN\s+NOT\s+MATCHED\s+THEN\s+INSERT\b/i.test(text),
  };
}

console.log(JSON.stringify({
  openaiKeyPresent: keyPresent ? "YES" : "NO",
  model: process.env.OPENAI_MODEL,
}, null, 2));

if (!keyPresent) {
  console.log(JSON.stringify({ ok: false, error: "OPENAI_API_KEY missing; smoke not run" }));
  process.exit(1);
}

let failed = false;
for (const question of questions) {
  const started = Date.now();
  try {
    const result = await generateInterviewAnswer({
      question,
      userId: "smoke-gpt-5-6-sol",
      sessionId: 1,
      live: true,
      persist: false,
      model: "gpt-5.6-sol",
    });
    const answer = String(result.finalAnswer || "");
    const row: Record<string, unknown> = {
      question,
      ok: true,
      model: process.env.OPENAI_MODEL,
      intent: result.analysis.intent,
      askedForCode: result.askedForCode,
      live: result.live,
      skippedLlm: result.skippedLlm,
      firstTokenMs: result.firstTokenMs,
      totalMs: Date.now() - started,
      answerChars: answer.length,
      quality: result.quality,
      opener: answer.slice(0, 100),
    };
    if (/SCD Type 1/i.test(question) && result.askedForCode) {
      const parts = mergeParts(answer);
      row.mergeParts = parts;
      row.mergeComplete = Object.values(parts).every(Boolean);
      if (!row.mergeComplete) failed = true;
    }
    console.log(JSON.stringify(row));
  } catch (err) {
    failed = true;
    const error = err as { name?: string; message?: string; status?: number; code?: string };
    console.log(JSON.stringify({
      question,
      ok: false,
      totalMs: Date.now() - started,
      errorType: error?.name || typeof err,
      errorMessage: String(error?.message || err).slice(0, 400),
      status: error?.status || null,
      code: error?.code || null,
    }));
  }
}

if (failed) process.exit(1);
