import { planAnswer, type AnswerPlan } from "./answer-planner";
import { buildAnalyzeSystemPrompt } from "./interview-prompts";
import { applyRepetitionGuard, scoreRepetition } from "./repetition-guard";
import { rewriteUngroundedExperience } from "./candidate-grounding";
import { analyzeWithMemory, getInterviewThread, recallSessionMemory, rememberAnswer } from "./session-memory";
import { matchingSubjects, subjectContext } from "./subject-docs";
import {
  extractKeyPoints,
  isCodeIntent,
  isPointwiseQuestion,
  isProcessQuestion,
  looksLikeCodeDump,
  scoreEmployeeAnswer,
  stripCodeFences,
  toSpokenAnswer,
} from "./answer-quality";
import { defaultCodingSpec, formatCodingAnswer, hasExecutableCode } from "./coding-intelligence";
import type { PersonaCard } from "./persona";
import type { QuestionAnalysis } from "./question-analyzer";
import { answerFormatCue } from "./interview-voice";
import { normalizeSpokenQuestion } from "./question-finalizer";
import { buildAnswerChatParams, resolveAnswerModel } from "./answer-chat";

export type InterviewUserPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

export type InterviewAnswerSection = {
  type: string;
  title: string;
  language: string;
  content: string;
};

export type InterviewAnswerEval = {
  question: string;
  normalizedQuestion: string;
  analysis: QuestionAnalysis;
  plan: AnswerPlan;
  retrievalSubjects: string[];
  retrieval: string;
  rawAnswer: string;
  finalAnswer: string;
  answer: string;
  sections: InterviewAnswerSection[];
  keyPoints: string[];
  askedForCode: boolean;
  repetition: { score: number; reasons: string[] };
  grounding: { stripped: string[]; text: string };
  ungrounded: string[];
  quality: string;
  finalizeMs: number;
  classifyMs: number;
  retrievalMs: number;
  planMs: number;
  firstTokenMs: number | null;
  totalMs: number;
  live: boolean;
  skippedLlm: boolean;
};

const JOIN_FALLBACK = "These are how I keep or drop rows when two tables meet.\n• Inner join keeps only matching keys.\n• Left join keeps every row from the driving table and fills nulls when the right side has no match.\n• Right join is the opposite.\nFor example I almost always left join employees to departments so I never drop someone who is not assigned yet.";
const LAKEVIEW_FALLBACK = "I'd confirm which they mean, because two things get called lake view.\n• Databricks Lakeview is the dashboarding and AI/BI layer, not a table. For example analysts build those dashboards on Gold or a SQL warehouse.\n• A lakehouse view is a SQL view over Delta so people query a stable name without touching raw files.";
const TRANSFORM_FALLBACK = "I don't think of load as a list of PySpark functions. In a typical Azure load I use bronze landing, then a notebook to type the columns we need.\n• Filter and select so bronze junk never reaches silver.\n• withColumn for derived fields and standard names.\n• Join reference data, and groupBy only when gold needs an aggregate.\n• Write Delta, and the next job reads that, not the raw files.";
const ACCESS_FALLBACK = "I don't grant people one by one. I put them in an Azure AD group and grant the group on Unity Catalog. ADF service principals get the same pattern. Then I validate they can open the schema, not the whole lake.";

function spokenFallbackFor(question: string): string {
  const t = String(question || "").toLowerCase();
  if (/left join|right join|inner join|what do you mean by .{0,40}join/.test(t)) return JOIN_FALLBACK;
  if (/lake ?view/.test(t)) return LAKEVIEW_FALLBACK;
  if (/transformation/.test(t) && /load|used/.test(t)) return TRANSFORM_FALLBACK;
  return "";
}

function extractJsonStringField(raw: string, field: string) {
  const key = `"${field}"`;
  const start = raw.indexOf(key);
  if (start < 0) return "";
  const colon = raw.indexOf(":", start + key.length);
  if (colon < 0) return "";
  let index = colon + 1;
  while (index < raw.length && /\s/.test(raw[index] || "")) index += 1;
  if (raw[index] !== "\"") return "";
  index += 1;
  let out = "";
  while (index < raw.length) {
    const ch = raw[index];
    if (ch === "\\") {
      const next = raw[index + 1];
      if (next === "n") out += "\n";
      else if (next === "t") out += "\t";
      else if (next === "r") out += "\r";
      else if (next === "\"") out += "\"";
      else if (next === "\\") out += "\\";
      else if (next === "u" && raw.length > index + 5) {
        out += String.fromCharCode(Number.parseInt(raw.slice(index + 2, index + 6), 16) || 32);
        index += 6;
        continue;
      } else if (next) out += next;
      index += 2;
      continue;
    }
    if (ch === "\"") return out;
    out += ch;
    index += 1;
  }
  return out;
}

function detectRequestedLanguage(text: string): "sql" | "python" | "auto" {
  if (!isCodeIntent(text)) return "auto";
  const t = text.toLowerCase();
  if (/\bsql\b|\bsql query\b|\bselect\b|\bgroup by\b|\bcte\b/.test(t) && !/\bpyspark\b|\bspark\b/.test(t)) return "sql";
  if (/\bpyspark\b|\bspark\b|\bdatabricks\b|\bpython\b|\bscript\b/.test(t)) return "python";
  return "auto";
}

function sanitizeProductionCode(code: string): string {
  return String(code || "")
    .replace(/s3a:\/\/my-bucket\/[^\s'"`)]+/gi, "abfss://bronze@examplestorage.dfs.core.windows.net/inbound/")
    .replace(/s3:\/\/my-bucket\/[^\s'"`)]+/gi, "abfss://bronze@examplestorage.dfs.core.windows.net/inbound/")
    .replace(/['"]s3a:\/\/my-bucket\/?['"]/gi, "'abfss://bronze@examplestorage.dfs.core.windows.net/inbound/'")
    .replace(/['"]s3:\/\/my-bucket\/?['"]/gi, "'abfss://bronze@examplestorage.dfs.core.windows.net/inbound/'");
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

function emptyPlan(analysis: QuestionAnalysis): AnswerPlan {
  return planAnswer(analysis, null);
}

function emptyEval(args: {
  question: string;
  analysis: QuestionAnalysis;
  finalizeMs: number;
  classifyMs: number;
  started: number;
  live: boolean;
}): InterviewAnswerEval {
  const plan = emptyPlan(args.analysis);
  return {
    question: args.question,
    normalizedQuestion: args.analysis.question,
    analysis: args.analysis,
    plan,
    retrievalSubjects: [],
    retrieval: "",
    rawAnswer: "",
    finalAnswer: "",
    answer: "",
    sections: [],
    keyPoints: [],
    askedForCode: false,
    repetition: { score: 0, reasons: [] },
    grounding: { stripped: [], text: "" },
    ungrounded: [],
    quality: "skipped",
    finalizeMs: args.finalizeMs,
    classifyMs: args.classifyMs,
    retrievalMs: 0,
    planMs: 0,
    firstTokenMs: null,
    totalMs: Date.now() - args.started,
    live: args.live,
    skippedLlm: true,
  };
}

/**
 * Production generation path used by POST /openai/analyze and live eval.
 * Local intelligence + retrieval + one streaming GPT call. No extra classify LLM.
 */
export async function generateInterviewAnswer(args: {
  question: string;
  userId: string;
  sessionId?: number | null;
  persona?: PersonaCard | null;
  mode?: "interview" | "meeting";
  model?: string;
  live?: boolean;
  persist?: boolean;
  extraUserParts?: InterviewUserPart[];
  onDelta?: (partial: string) => void;
}): Promise<InterviewAnswerEval> {
  const started = Date.now();
  const finalizeAt = Date.now();
  const question = normalizeSpokenQuestion(args.question);
  const finalizeMs = Date.now() - finalizeAt;
  const classifiedAt = Date.now();
  const analysis = analyzeWithMemory(args.userId, question, args.sessionId);
  const classifyMs = Date.now() - classifiedAt;
  const liveRequested = Boolean(args.live);
  const live = Boolean(liveRequested && process.env.OPENAI_API_KEY);

  if (!analysis.isAnswerable || analysis.isIncomplete) {
    return emptyEval({ question, analysis, finalizeMs, classifyMs, started, live: false });
  }

  const retrievalAt = Date.now();
  const retrievalSubjects = matchingSubjects(question, analysis.topic);
  const retrieval = subjectContext(question, analysis.intent, analysis.topic);
  const retrievalMs = Date.now() - retrievalAt;
  const plannedAt = Date.now();
  const plan = planAnswer(analysis, args.persona);
  const planMs = Date.now() - plannedAt;
  const memoryCue = recallSessionMemory(args.userId, question, args.sessionId);
  const systemPrompt = buildAnalyzeSystemPrompt({
    analysis,
    plan,
    persona: args.persona,
    memoryCue,
    retrieval,
    sessionMode: args.mode || "interview",
    formatCue: answerFormatCue(question),
  });

  const askedForCode = analysis.intent === "coding" || isCodeIntent(question);
  const askedForPoints = isPointwiseQuestion(question);
  const spokenAnswer = !askedForCode;
  let rawAnswer = "";
  let parsedAnswer = "";
  let parsedRecommended = "";
  let parsedKeyPoints: string[] = [];
  let sections: InterviewAnswerSection[] = [];
  let firstTokenMs: number | null = null;
  let skippedLlm = !live;

  if (live) {
    const { openai } = await import("@workspace/integrations-openai-ai-server");
    const userContent: InterviewUserPart[] = [
      { type: "text", text: `THIS QUESTION ONLY:\n${question}` },
      ...(args.extraUserParts || []),
    ];
    const openAiStartedAt = Date.now();
    let raw = "";
    let lastPartial = "";
    try {
      const completion = await openai.chat.completions.create(buildAnswerChatParams({
        model: resolveAnswerModel(args.model),
        temperature: spokenAnswer ? 0.8 : 0.15,
        topP: 0.9,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent as never },
        ],
        maxOutputTokens: plan.maxTokens,
        stream: true,
      }));
      for await (const chunk of completion) {
        const piece = chunk.choices[0]?.delta?.content ?? "";
        raw += piece;
        if (piece && firstTokenMs == null) firstTokenMs = Date.now() - started;
        const partial = extractJsonStringField(raw, "answer");
        if (partial.length >= 8 && partial !== lastPartial) {
          lastPartial = partial;
          args.onDelta?.(partial);
        }
      }
    } catch (err) {
      const diagnostic = err as {
        openAiStarted?: boolean;
        firstTokenArrived?: boolean;
        openAiCompleted?: boolean;
        openAiRequestMs?: number;
      };
      diagnostic.openAiStarted = true;
      diagnostic.firstTokenArrived = firstTokenMs != null;
      diagnostic.openAiCompleted = false;
      diagnostic.openAiRequestMs = Date.now() - openAiStartedAt;
      throw err;
    }
    let parsed: {
      answer?: string;
      recommendedAnswer?: string;
      keyPoints?: unknown;
      sections?: Array<{ type?: string; title?: string; language?: string; content?: string }>;
    } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
    parsedAnswer = String(parsed.answer || "").trim();
    parsedRecommended = String(parsed.recommendedAnswer || "").trim();
    rawAnswer = parsedAnswer || lastPartial;
    parsedKeyPoints = Array.isArray(parsed.keyPoints)
      ? parsed.keyPoints.map((point) => String(point || "").trim()).filter(Boolean).slice(0, 5)
      : [];
    sections = (parsed.sections ?? []).map((section) => ({
      type: typeof section?.type === "string" ? section.type : "code",
      title: typeof section?.title === "string" ? section.title : "Code",
      language: normalizeLanguage(section?.language),
      content: sanitizeProductionCode(typeof section?.content === "string" ? section.content : ""),
    })).filter((section) => Boolean(section.content));
  } else {
    rawAnswer = [
      plan.objective,
      `Must cover: ${plan.mustCover.join("; ")}`,
      `Structure: ${plan.structure}`,
    ].join(" ");
    parsedAnswer = rawAnswer;
  }

  let answer = parsedAnswer || rawAnswer;
  if (askedForCode) {
    sections.sort((left, right) => {
      const leftIsCode = /^(code|sql|python|pyspark|scala|bash|hcl|json)$/i.test(left.type) || /^(sql|python|scala|bash|hcl|json)$/i.test(left.language);
      const rightIsCode = /^(code|sql|python|pyspark|scala|bash|hcl|json)$/i.test(right.type) || /^(sql|python|scala|bash|hcl|json)$/i.test(right.language);
      return Number(rightIsCode) - Number(leftIsCode);
    });
    const codeSection = sections.find((section) => section.content && /^(code|sql|python|pyspark)$/i.test(section.type));
    const preferredLanguage = detectRequestedLanguage(question);
    const firstCodeBlock = extractFirstCodeBlock(answer);
    if (!codeSection?.content && firstCodeBlock?.code) {
      sections.splice(0, sections.length, {
        type: preferredLanguage === "sql" ? "sql" : "code",
        title: preferredLanguage === "sql" ? "SQL Query" : "Code",
        language: firstCodeBlock.language || preferredLanguage || "python",
        content: sanitizeProductionCode(firstCodeBlock.code),
      });
    }
    for (const section of sections) {
      section.content = sanitizeProductionCode(section.content);
    }
    if (live) {
      const spec = analysis.coding || defaultCodingSpec(detectRequestedLanguage(question) === "sql" ? "sql" : "python");
      const lang = sections[0]?.language || spec.language || preferredLanguage || "sql";
      const sectionBody = (sections.find((section) => section.content)?.content || "")
        .replace(/^```[a-zA-Z0-9_-]*\n?/, "")
        .replace(/```$/, "")
        .trim();
      const prose = [parsedAnswer, parsedRecommended]
        .map((text) => String(text || "").trim())
        .find((text) => text && !/fenced complete code first|complete executable snippet/i.test(text) && !hasExecutableCode(text)) || "";
      const codeSource = hasExecutableCode(parsedAnswer)
        ? parsedAnswer
        : hasExecutableCode(parsedRecommended)
          ? parsedRecommended
          : sectionBody
            ? `\`\`\`${lang}\n${sectionBody}\n\`\`\`${prose ? `\n\n${prose}` : ""}`
            : parsedAnswer || rawAnswer;
      for (const section of sections) {
        const inner = section.content.replace(/^```[a-zA-Z0-9_-]*\n?/, "").replace(/```$/, "").trim();
        section.content = inner;
      }
      try {
        answer = formatCodingAnswer(codeSource, spec);
      } catch (err) {
        console.error(JSON.stringify({
          event: "coding.format_failed",
          language: spec.language,
          dialect: spec.dialect,
          reason: String((err as Error)?.message || err).slice(0, 180),
        }));
        answer = codeSource;
      }
    }
  } else if (live) {
    const source = [parsedRecommended, answer].find((text) => text && !looksLikeCodeDump(text) && !/SELECT \* FROM table1/i.test(text || "")) || "";
    answer = toSpokenAnswer(source, askedForPoints);
    if (!answer || looksLikeCodeDump(answer)) {
      answer = toSpokenAnswer(spokenFallbackFor(question) || answer, askedForPoints);
    }
    if (!answer && isProcessQuestion(question)) {
      answer = toSpokenAnswer(ACCESS_FALLBACK, askedForPoints);
    }
    sections = [];
  }

  const thread = getInterviewThread(args.userId, args.sessionId);
  answer = applyRepetitionGuard(answer, thread.recentOpeners, thread.recentAnswers, analysis);
  const grounded = rewriteUngroundedExperience(answer, args.persona);
  answer = grounded.text;
  if (live && !answer) {
    answer = "I didn't catch a clear English question. Press Listen again.";
  }
  const quality = scoreEmployeeAnswer(answer, askedForCode, askedForPoints);
  if (live && !quality.ok && !askedForCode) {
    const fallback = spokenFallbackFor(question);
    if (fallback) answer = toSpokenAnswer(fallback, askedForPoints);
    else if (isProcessQuestion(question)) answer = ACCESS_FALLBACK;
    else answer = toSpokenAnswer(answer, askedForPoints);
  }
  const repetition = scoreRepetition(answer, thread.recentOpeners, thread.recentAnswers, thread.conceptsAlreadyCovered);
  if (args.persist !== false) {
    await rememberAnswer(args.userId, question, answer, analysis, args.sessionId, plan.candidateFactsSafe);
  }

  return {
    question,
    normalizedQuestion: analysis.question,
    analysis,
    plan,
    retrievalSubjects,
    retrieval,
    rawAnswer,
    finalAnswer: answer,
    answer,
    sections,
    keyPoints: parsedKeyPoints.length ? parsedKeyPoints : extractKeyPoints(answer),
    askedForCode,
    repetition,
    grounding: { stripped: grounded.stripped, text: grounded.text },
    ungrounded: grounded.stripped,
    quality: quality.reason,
    finalizeMs,
    classifyMs,
    retrievalMs,
    planMs,
    firstTokenMs,
    totalMs: Date.now() - started,
    live,
    skippedLlm,
  };
}
