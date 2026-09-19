import { KNOWLEDGE_TOPICS, type KnowledgeSlice, type KnowledgeTopic } from "./knowledge-topics";

export const SENIOR_ANSWER_LENS = `LOCKDOWN — think about THIS question, then answer it. Do not reuse a résumé bio.
You are a working senior engineer answering out loud in a live interview, not writing a product page, tutorial, or notes.
Do not force first person. Do not start every answer with I. Voice follows the question:
  definition → "X is essentially… The useful part is…"
  why → the reason you'd pick it, then a tradeoff. Not "<Product> is a…"
  implementation → first decision or usual approach. Not "To implement…"
  troubleshooting / optimization → where you'd look or the bottleneck first.
  comparison → I'd choose X when… Y when…. No absolute winner.
  experience → verified resume facts only, spoken as a story.
  challenge / follow-up → answer the new concern immediately. Do not restart.
  coding → working code in sections first, then 1–2 spoken sentences.
Spoken shape: direct answer → reasoning → practical detail → edge/tradeoff if it matters. Then stop.
Do not pad with security, cost, CI/CD, monitoring, or governance unless this question needs them.
"In my current project" only for experience / have-you / your-project, and only with verified facts.
Retrieved docs are evidence. Rephrase conversationally. Never invent an employer, incident, Slack alert, metric, or file path.
Storage examples use abfss://, not fake s3://my-bucket.`;

const TOPIC_BY_ID = new Map(KNOWLEDGE_TOPICS.map((topic) => [topic.id, topic]));

function topicBlob(topic: KnowledgeTopic): string {
  const parts = Object.values(topic.slices).filter(Boolean);
  return `${topic.title.toUpperCase()}: ${parts.join(" ")}`;
}

export const SUBJECT_DOCS: Record<string, string> = Object.fromEntries(
  KNOWLEDGE_TOPICS.map((topic) => [topic.id, topicBlob(topic)]),
);

function neededSlices(question: string, intent?: string): KnowledgeSlice[] {
  const t = String(question || "").toLowerCase();
  const byIntent: Record<string, KnowledgeSlice[]> = {
    definition: ["fundamentals", "tradeoffs"],
    why: ["tradeoffs", "fundamentals"],
    when_to_use: ["tradeoffs", "fundamentals"],
    how_to_identify: ["production", "fundamentals"],
    how_to_implement: ["production", "fundamentals"],
    how_to_process: ["production", "architecture"],
    how_to_configure: ["production", "fundamentals"],
    how_to_design: ["architecture", "production"],
    how_to_monitor: ["troubleshooting", "production"],
    how_to_deploy: ["production", "architecture"],
    why_not: ["tradeoffs", "fundamentals"],
    when_not_to_use: ["tradeoffs", "fundamentals"],
    incident: ["troubleshooting", "production"],
    data_quality: ["production", "troubleshooting"],
    optimization: ["production", "architecture"],
    troubleshooting: ["troubleshooting", "production"],
    debugging: ["troubleshooting", "production"],
    failure_handling: ["troubleshooting", "production"],
    comparison: ["tradeoffs", "fundamentals"],
    tradeoff: ["tradeoffs", "fundamentals"],
    architecture: ["architecture", "production", "fundamentals"],
    scalability: ["architecture", "production"],
    coding: ["production", "fundamentals"],
    experience: ["production", "fundamentals"],
    security: ["production", "tradeoffs"],
    cost: ["tradeoffs", "production"],
  };
  if (intent && byIntent[intent]) return byIntent[intent];
  if (/(became slow|job failed|pipeline failed|troubleshoot|debug|root cause|what would you check|cannot read)/i.test(t)) {
    return ["troubleshooting", "production", "fundamentals"];
  }
  if (/(difference between| vs\.? |versus|compare |map .* onto|when do you pick)/i.test(t)) {
    return ["tradeoffs", "fundamentals", "architecture"];
  }
  if (/(walk me through|end to end|end-to-end|design a |architecture|10 tb|lakehouse)/i.test(t)) {
    return ["architecture", "production", "fundamentals"];
  }
  if (/(how did you|how do you (use|implement|handle|process|identify)|in your (current )?project)/i.test(t)) {
    return ["production", "fundamentals", "troubleshooting"];
  }
  if (/(what is|what are|explain|define)/i.test(t)) {
    return ["fundamentals", "production", "tradeoffs"];
  }
  return ["fundamentals", "production", "architecture"];
}

function topicScore(topic: KnowledgeTopic, hay: string): number {
  let score = 0;
  for (const keyword of topic.keywords) {
    const needle = keyword.toLowerCase();
    if (!needle) continue;
    if (hay.includes(needle)) score += Math.min(48, needle.length + 8);
  }
  return score;
}

export function matchingSubjects(question: string, topicHint?: string): string[] {
  const ranked = rankSubjects(question);
  const hintMap: Record<string, string> = {
    incremental: "incremental",
    scd: "scd",
    delta: "delta",
    adf: "adf",
    databricks: "databricks",
    spark: "spark",
    sql: "sql",
    lakehouse: "lakehouse",
    partitioning: "spark",
    devops: "devops",
    fabric: "fabric",
    snowflake: "snowflake",
    powerbi: "powerbi",
    kafka: "kafka",
    api: "api",
    adls: "adls",
    unity: "unity-catalog",
    dlt: "dlt",
    security: "security",
    modeling: "sql",
    quality: "testing",
  };
  const mapped = hintMap[String(topicHint || "").trim()] || "";
  const hinted = mapped && TOPIC_BY_ID.has(mapped) ? mapped : (topicHint && TOPIC_BY_ID.has(topicHint) ? topicHint : "");
  if (hinted) {
    return [...new Set([hinted, ...ranked])].slice(0, 4);
  }
  if (!ranked.length) return ["lakehouse", "adf", "databricks"];
  return ranked;
}

export function scoredSubjects(question: string): string[] {
  return rankSubjects(question);
}

function rankSubjects(question: string): string[] {
  const hay = String(question || "").toLowerCase();
  const ranked = KNOWLEDGE_TOPICS
    .map((topic) => ({ id: topic.id, score: topicScore(topic, hay) }))
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  return [...new Set(ranked.map((row) => row.id))].slice(0, 4);
}

export function detectSubject(question: string): string {
  return matchingSubjects(question)[0] || "azure";
}

function fillExtras(ids: string[]): string[] {
  const filled = [...ids];
  const primary = TOPIC_BY_ID.get(ids[0]);
  for (const extra of primary?.extras ?? ["lakehouse", "databricks"]) {
    if (!filled.includes(extra)) filled.push(extra);
  }
  return filled.slice(0, 3);
}

const CONTEXT_CHAR_BUDGET = 900;

export function subjectContext(question: string, intent?: string, topicHint?: string): string {
  const ids = fillExtras(matchingSubjects(question, topicHint));
  const slices = neededSlices(question, intent);
  const blocks: string[] = [];
  let used = 0;
  for (const id of ids) {
    const topic = TOPIC_BY_ID.get(id);
    if (!topic) continue;
    const body = slices
      .map((slice) => topic.slices[slice])
      .filter(Boolean)
      .join(" ");
    if (!body) continue;
    const block = `[${topic.title}] ${body}`;
    if (used + block.length > CONTEXT_CHAR_BUDGET && blocks.length) break;
    blocks.push(block);
    used += block.length;
  }
  return blocks.join("\n");
}

export function knowledgeStats() {
  return {
    topics: KNOWLEDGE_TOPICS.length,
    sources: new Set(KNOWLEDGE_TOPICS.flatMap((topic) => topic.sources)).size,
  };
}
