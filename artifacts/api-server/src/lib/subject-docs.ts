import { KNOWLEDGE_TOPICS, type KnowledgeSlice, type KnowledgeTopic } from "./knowledge-topics";

export const SENIOR_ANSWER_LENS = `LOCKDOWN — spoken interview, not documentation.
Write like a senior engineer talking to an interviewer. One natural answer. No bullet lists unless they asked for a list. No headings. No telegram notes.
Direct answer first, then expand only as far as the question needs. Simple questions stay short. Architecture can go longer. Do not force "In my current project" on definition questions.
If the resume names a project, use it for experience questions. Otherwise say it as a general industry approach — never invent an employer, incident, or metric.
Daily stack is Azure ADF + Databricks + ADLS + Delta + Unity Catalog. Map other tools from frozen docs.`;

const TOPIC_BY_ID = new Map(KNOWLEDGE_TOPICS.map((topic) => [topic.id, topic]));

function topicBlob(topic: KnowledgeTopic): string {
  const parts = Object.values(topic.slices).filter(Boolean);
  return `${topic.title.toUpperCase()}: ${parts.join(" ")}`;
}

export const SUBJECT_DOCS: Record<string, string> = Object.fromEntries(
  KNOWLEDGE_TOPICS.map((topic) => [topic.id, topicBlob(topic)]),
);

function neededSlices(question: string): KnowledgeSlice[] {
  const t = String(question || "").toLowerCase();
  if (/(became slow|job failed|pipeline failed|troubleshoot|debug|root cause|what would you check|cannot read)/i.test(t)) {
    return ["troubleshooting", "production", "fundamentals"];
  }
  if (/(difference between| vs\.? |versus|compare |map .* onto|when do you pick)/i.test(t)) {
    return ["tradeoffs", "fundamentals", "architecture"];
  }
  if (/(walk me through|end to end|end-to-end|design a |architecture|10 tb|lakehouse)/i.test(t)) {
    return ["architecture", "production", "fundamentals"];
  }
  if (/(how did you|how do you (use|implement|handle)|in your (current )?project)/i.test(t)) {
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

export function matchingSubjects(question: string): string[] {
  const hay = String(question || "").toLowerCase();
  const ranked = KNOWLEDGE_TOPICS
    .map((topic) => ({ id: topic.id, score: topicScore(topic, hay) }))
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  if (!ranked.length) return ["lakehouse", "adf", "databricks"];
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

const CONTEXT_CHAR_BUDGET = 2200;

export function subjectContext(question: string): string {
  const ids = fillExtras(matchingSubjects(question));
  const slices = neededSlices(question);
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
