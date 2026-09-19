/**
 * Live GPT-5.6 Sol checks for the interview-intelligence rework.
 * Skips (exit 0) if OPENAI_API_KEY is missing. Fails on empty/stale/wrong-question answers.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateInterviewAnswer } from "../../artifacts/api-server/src/lib/answer-generator.ts";
import { analyzeQuestion } from "../../artifacts/api-server/src/lib/question-analyzer.ts";

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

if (!String(process.env.OPENAI_API_KEY || "").trim()) {
  console.log(JSON.stringify({ skipped: true, reason: "OPENAI_API_KEY missing" }));
  process.exit(0);
}

const userId = "verify-interview-rework";
const rows: Array<{
  q: string;
  expect?: RegExp;
  code?: boolean;
  followUpOf?: number;
}> = [
  { q: "what is cdc actually", expect: /\b(cdc|change data capture)\b/i },
  { q: "how you implement incremental load", expect: /watermark|cdc|merge|incremental/i },
  { q: "write pyspark remove duplicate", code: true, expect: /pyspark|window|row_number|dropduplicates|distinct/i },
  { q: "write sql second highest salary", code: true, expect: /select|salary|row_number|dense_rank|offset/i },
  { q: "tell difference adf and databricks", expect: /adf|data factory|databricks/i },
  { q: "How do you implement it in Databricks?", followUpOf: 0, expect: /databricks|delta|cdc|merge/i },
];

let failed = false;
const previousAnswers: string[] = [];
for (let i = 0; i < rows.length; i += 1) {
  const row = rows[i];
  const started = Date.now();
  let firstDeltaMs: number | null = null;
  const questionId = `q_live_${i}`;
  const generationId = `g_live_${i}`;
  try {
    const local = analyzeQuestion(row.q, row.followUpOf != null ? analyzeQuestion(rows[row.followUpOf].q) : null);
    const result = await generateInterviewAnswer({
      question: row.q,
      userId,
      sessionId: 42,
      live: true,
      persist: false,
      model: "gpt-5.6-sol",
      questionId,
      generationId,
      extraUserParts: row.followUpOf != null
        ? [{ type: "text", text: `Previous answer:\n${previousAnswers[row.followUpOf] || ""}` }]
        : [],
      onDelta: (_partial, meta) => {
        if (firstDeltaMs == null) firstDeltaMs = Date.now() - started;
        if (meta && meta.generationId !== generationId) failed = true;
      },
    });
    const answer = String(result.finalAnswer || "");
    previousAnswers[i] = answer;
    const hasCode = /```|from pyspark|SELECT |ROW_NUMBER|Window\.|dropDuplicates/i.test(answer);
    const ok = Boolean(answer)
      && result.questionId === questionId
      && result.generationId === generationId
      && !result.skippedLlm
      && (!row.expect || row.expect.test(answer))
      && (!row.code || hasCode);
    if (!ok) failed = true;
    console.log(JSON.stringify({
      question: row.q,
      ok,
      live: result.live,
      skippedLlm: result.skippedLlm,
      intent: local.intent,
      topic: local.topic,
      followUp: local.isFollowUp,
      questionId: result.questionId,
      generationId: result.generationId,
      firstTokenMs: result.firstTokenMs,
      firstDeltaMs,
      totalMs: Date.now() - started,
      hasCode,
      opener: answer.slice(0, 90),
    }));
  } catch (err) {
    failed = true;
    console.log(JSON.stringify({
      question: row.q,
      ok: false,
      error: String((err as Error)?.message || err).slice(0, 180),
      totalMs: Date.now() - started,
    }));
  }
}

if (failed) process.exit(1);
