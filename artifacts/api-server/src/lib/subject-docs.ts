import { KNOWLEDGE_TOPICS, type KnowledgeSlice, type KnowledgeTopic } from "./knowledge-topics";

export const SENIOR_ANSWER_LENS = `LOCKDOWN — same shape for every client question.
You are a working senior engineer on the call. Every answer, every topic:
1) OPEN: 1–2 sentences as a real employee — what this topic is and how I work with it.
2) COMPLETE PROCESS: then walk the full process the question is asking for, start to finish, the way I actually do it. Do not stop at two or four talking points. Cover the steps in order, what I check, and how I know it worked.
3) keyPoints: 3–5 short glanceable anchors taken from that process — not a substitute for the spoken process, not tool-name chips.
Do not skip the process for definitions, joins, lake view, architecture, troubleshooting, or follow-ups. If they asked "what is X", explain X and the process of using it. If they asked "how do you", give the whole how.
Do not force "In my current project" if the resume does not name one — still speak as someone who does this work.
Never invent an employer, incident, Slack alert, metric, or file path. Daily stack is Azure ADF + Databricks + ADLS + Delta + Unity Catalog. Storage examples use abfss://, not fake s3://my-bucket.
Code only when they asked to write it: still explain the process first, then the script.
No • bullets unless they asked for a list. No headings.`;

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
