import type { PersonaCard } from "./persona";
import type { InterviewIntent, QuestionAnalysis } from "./question-analyzer";
import { personaKnows } from "./candidate-grounding";

export type AnswerPlan = {
  intent: InterviewIntent;
  answerMode: string;
  objective: string;
  mustCover: string[];
  avoid: string[];
  candidateFactsSafe: string[];
  depth: QuestionAnalysis["expectedDepth"];
  targetDurationSeconds: number;
  maxTokens: number;
  styleCue: string;
  openerRule: string;
  structure: string;
  ungroundedTech: string[];
};

const INTENT_OBJECTIVE: Record<InterviewIntent, string> = {
  definition: "What it is, then the useful part. Then stop. Do not lecture or dump features.",
  why: "The practical reason you'd pick it, then one tradeoff. Do not define the product.",
  why_not: "The reason you would not pick it, then the alternative.",
  when_to_use: "Say when it is the right tool versus the alternative.",
  when_not_to_use: "When it is the wrong fit, then what you would pick instead.",
  how_to_identify: "Explain how you detect or recognize the thing they asked about. Do not implement the whole system.",
  how_to_implement: "Walk the implementation sequence with the actual technologies.",
  how_to_process: "Walk the processing sequence: ingest, transform, commit the boundary.",
  how_to_configure: "The settings that matter, why, and one production caveat.",
  how_to_design: "Requirements, components, data flow — only what this question needs.",
  how_to_handle: "Give the production strategy: happy path plus failure modes. Not a definition.",
  how_to_monitor: "What you watch, where you look, and what you page on.",
  how_to_deploy: "How it moves Dev to Test to Prod, parameters, and rollback.",
  architecture: "How data moves, which services sit where, and one reliability or cost tradeoff.",
  optimization: "Name the bottleneck, then the cheapest levers for THIS technology.",
  troubleshooting: "Symptom, where you look, likely cause, fix, then how you stop it repeating.",
  debugging: "How you isolate the failing stage and what evidence you use.",
  comparison: "Differences, when you pick each, one practical tradeoff. Do not define both from scratch.",
  tradeoff: "What you gain and what you pay. Pick a side for a typical production stack.",
  scenario: "Assumptions in one clause, then the approach, then a risk you watch.",
  experience: "Use resume facts if present. Otherwise a typical production approach — never invent an employer.",
  advantages: "Why it wins in production, briefly.",
  disadvantages: "Where it hurts, briefly.",
  limitations: "What it cannot do well.",
  security: "Identity, least privilege, secrets, and one audit point.",
  cost: "What actually drives spend and how you keep it down.",
  scalability: "What breaks first at volume and how you design around it.",
  failure_handling: "What you retry, what you must not mark complete, and how you validate.",
  incident: "Triage, evidence, fix, communication, then prevent-repeat. Do not invent Slack alerts.",
  data_quality: "The check, what happens to bad rows, and how you reconcile.",
  coding: "One spoken sentence of intent, then real production code, then one edge case.",
  follow_up: "Continue the previous thread. Do not restart the topic.",
  clarification: "Restate the mechanism they asked about in plainer words.",
  example: "One concrete production example. Do not restart the definition.",
};

const INTENT_STYLE: Record<InterviewIntent, string> = {
  definition: "Spoken: what it is in one breath, then why it matters in production. Not a product brochure.",
  why: "Spoken: the main reason you'd pick it, then one tradeoff. Not 'X is often chosen for its ability'. Not '<Product> is a…'.",
  why_not: "Spoken: the failure mode, then the alternative.",
  when_to_use: "Spoken: when it fits, when it does not.",
  when_not_to_use: "Spoken: when it is the wrong tool.",
  how_to_identify: "Spoken: the signal you look at. Stop before the full implementation.",
  how_to_implement: "Spoken paragraphs: I'd start by / the first thing I'd check is / my usual approach is. Then how you'd build it, then one operational caveat. Never 'To implement…'. No numbered tutorial.",
  how_to_process: "Spoken: ingest, transform, commit the boundary.",
  how_to_configure: "Spoken: the knobs that matter and why.",
  how_to_design: "Spoken architecture: requirements, components, flow, one reliability point. Not an academic essay.",
  how_to_handle: "Spoken strategy: happy path plus failure modes. Not a definition.",
  how_to_monitor: "Spoken: what you watch, where you look, what you page on.",
  how_to_deploy: "Spoken: promote path, env parameters, rollback.",
  architecture: "Spoken design: requirements, services, flow, reliability. Think out loud. Not a textbook.",
  optimization: "Spoken: name the bottleneck first, then the cheapest levers for THIS stack, then how you'd measure.",
  troubleshooting: "Spoken diagnostic: where you look, likely cause, fix, prevent. Do not invent Slack alerts.",
  debugging: "Spoken: where you look and what the evidence tells you.",
  comparison: "Spoken: I would not treat them as the same job. Differences, when each wins. Do not define both from scratch.",
  tradeoff: "Spoken: what you gain and what you pay.",
  scenario: "Spoken: assumptions, approach, a risk you watch.",
  experience: "Spoken story from resume facts only. No STAR headings. If ungrounded, typically / I'd — never invent.",
  advantages: "Spoken: why it wins in production, briefly.",
  disadvantages: "Spoken: where it hurts, briefly.",
  limitations: "Spoken: yes, that's the limitation, then what you'd do instead. Do not define the technique.",
  security: "Spoken: identity, least privilege, secrets — not a policy dump.",
  cost: "Spoken: what drives spend and how you keep it down.",
  scalability: "Spoken: what breaks first at volume and how you design around it.",
  failure_handling: "Spoken: failure point, what you retry, what you must not mark complete, how you validate.",
  incident: "Spoken: triage, evidence, fix, prevent. Do not invent Slack alerts.",
  data_quality: "Spoken: the check, bad-row policy, reconcile.",
  coding: "Working code in sections first, then 1–2 spoken sentences and one edge case. abfss examples, never s3://my-bucket.",
  follow_up: "Spoken: only the new slice. Do not restart the last answer.",
  clarification: "Spoken: plainer restatement of the mechanism.",
  example: "Spoken: one concrete production example. Do not restart the definition.",
};

const TOPIC_CONCEPTS: Record<string, Partial<Record<InterviewIntent, string[]>>> = {
  incremental: {
    definition: ["only changed rows", "watermark or CDC as the change boundary"],
    why: ["avoid full reloads", "cost and SLA", "when full load is still safer"],
    how_to_identify: ["how the source exposes changes", "watermark", "CDC", "updated-at timestamp", "change tracking"],
    how_to_process: ["source extract with watermark parameter", "ADF", "land in ADLS", "Databricks", "Delta MERGE", "advance watermark after success"],
    how_to_implement: ["ADF parameterized copy or lookup", "sink bronze", "notebook MERGE", "control table for watermark"],
    how_to_handle: ["change detection", "idempotent MERGE", "retries", "late arriving data", "duplicates", "monitoring"],
    failure_handling: ["do not advance watermark on failure", "rerun is safe because MERGE is idempotent", "records are not skipped"],
    optimization: ["filter at source", "partition by load date", "predicate pushdown", "MERGE on keys", "compact small files"],
    comparison: ["incremental vs full load", "CDC vs watermark", "when full reload is the recovery path"],
  },
  delta: {
    definition: ["ACID on Parquet", "transaction log", "MERGE UPDATE DELETE"],
    why: ["reliable upserts", "time travel", "concurrent jobs"],
    how_to_implement: ["CREATE TABLE USING DELTA", "MERGE on business key", "checkpoint for streams"],
    optimization: ["OPTIMIZE", "ZORDER", "file sizing", "do not optimize every micro-batch"],
    failure_handling: ["transaction log", "retry MERGE", "time travel to inspect"],
    comparison: ["Delta vs Parquet", "need for MERGE and concurrent writers"],
    troubleshooting: ["Spark UI plus DESCRIBE HISTORY", "failed MERGE conflicts"],
    experience: ["lakehouse silver/gold on Delta"],
  },
  adf: {
    definition: ["orchestration", "pipeline activity dataset linked service IR"],
    how_to_implement: ["Copy or Lookup", "parameters", "execute Databricks"],
    troubleshooting: ["ADF Monitor", "failed activity", "rerun from failed"],
    comparison: ["ADF vs Databricks — orchestrate vs transform"],
  },
  spark: {
    definition: ["DataFrame engine", "driver executors", "shuffle"],
    optimization: ["broadcast join", "AQE", "partition count", "avoid Python UDFs"],
    troubleshooting: ["skew", "spill", "Spark UI"],
    how_to_handle: ["skew isolation", "salt or broadcast", "then scale"],
  },
  databricks: {
    definition: ["Spark on ADLS with Delta and Unity Catalog"],
    how_to_implement: ["job cluster", "notebook or DLT", "ADF or jobs trigger"],
    optimization: ["Photon", "spot vs on-demand", "do not leave all-purpose on"],
    troubleshooting: ["Spark UI", "job cluster logs"],
  },
  partitioning: {
    definition: ["split files so queries prune"],
    how_to_implement: ["partition on filter grain", "avoid too-small files"],
    optimization: ["file size 256MB-1GB", "compaction"],
  },
  devops: {
    definition: ["git-based promote of pipelines"],
    how_to_implement: ["feature branch", "PR", "Dev to Test to Prod"],
    comparison: ["GitHub Actions vs Azure DevOps"],
  },
  scd: {
    definition: ["history on dimension attributes", "type 2 current flag or dates"],
    how_to_implement: ["MERGE expire old row", "insert new version", "business key"],
  },
  lakehouse: {
    definition: ["bronze raw", "silver cleansed", "gold for BI"],
    architecture: ["ingest", "transform", "serve", "one reliability or cost point"],
  },
  fabric: {
    definition: ["SaaS analytics on OneLake", "workloads share the lake"],
    why: ["unified lake plus BI", "when the org is already on Fabric capacity"],
    how_to_implement: ["Lakehouse or Warehouse by consumer", "pipelines or notebooks", "semantic model"],
    comparison: ["Fabric vs ADF+Databricks", "context not a winner-takes-all"],
    security: ["workspace roles", "OneLake permissions", "deployment pipelines"],
  },
  snowflake: {
    definition: ["storage separate from virtual warehouses"],
    optimization: ["warehouse size", "auto-suspend", "clustering / pruning"],
    cost: ["warehouse uptime", "auto-suspend", "don't leave XL running"],
    how_to_implement: ["COPY or Snowpipe", "MERGE", "tasks/streams if incremental"],
  },
  powerbi: {
    definition: ["semantic model plus report"],
    optimization: ["star schema", "query folding", "Import vs DirectQuery vs Direct Lake"],
    security: ["RLS", "workspace roles"],
    how_to_implement: ["model grain", "relationships", "refresh strategy"],
  },
  kafka: {
    definition: ["distributed log", "partitions and offsets"],
    how_to_handle: ["consumer failure", "at-least-once plus idempotent sink"],
    comparison: ["Kafka vs Event Hubs as the bus"],
    failure_handling: ["replay from offset", "idempotent write"],
  },
  api: {
    how_to_implement: ["auth", "pagination", "land JSON", "schema"],
    how_to_handle: ["429 backoff", "timeouts", "idempotent writes"],
    failure_handling: ["retry with backoff", "do not double-post without an idempotency key"],
  },
  adls: {
    definition: ["hierarchical namespace on blob"],
    security: ["RBAC plus ACLs", "managed identity", "no account keys in notebooks"],
    how_to_implement: ["container and folder grain", "file sizes"],
  },
  unity: {
    definition: ["catalog.schema.object"],
    security: ["groups not emails", "service principals for jobs"],
    troubleshooting: ["USE CATALOG / SCHEMA / SELECT before blaming code"],
  },
  sql: {
    definition: ["set-based query on tables"],
    how_to_implement: ["keys", "join or MERGE", "one edge case"],
    optimization: ["filter early", "sargable predicates", "check the plan"],
    coding: ["working query", "nulls and duplicates"],
  },
  quality: {
    data_quality: ["the check", "bad-row policy", "source-to-target reconcile"],
    how_to_handle: ["fail the run or quarantine", "do not silently drop"],
  },
  modeling: {
    definition: ["grain first", "facts and dimensions"],
    how_to_implement: ["surrogate keys", "SCD policy"],
    comparison: ["star vs snowflake schema"],
  },
  dlt: {
    definition: ["declarative pipeline with expectations"],
    how_to_handle: ["expectation action", "quarantine vs fail"],
    comparison: ["DLT vs notebook jobs — orchestration vs Spark code"],
  },
  security: {
    security: ["identity", "least privilege", "secrets in a vault"],
    how_to_implement: ["managed identity", "group grants"],
  },
};

const PLAN_STRUCTURE: Record<InterviewIntent, string> = {
  definition: "what-it-is then where-it-shows-up. No full-system dump.",
  why: "purpose then one tradeoff.",
  why_not: "why not then alternative.",
  when_to_use: "when-yes then when-no.",
  when_not_to_use: "when-no then what instead.",
  how_to_identify: "detection-signal only.",
  how_to_implement: "first decision → how you'd build it → one operational caveat. Not 'To implement…' and not a numbered tutorial.",
  how_to_process: "ingest → transform → commit-boundary, spoken.",
  how_to_configure: "knob then why then caveat.",
  how_to_design: "I'd start with… then the layers… then failure/scale if this question needs them. Spoken, not a document.",
  how_to_handle: "strategy: happy-path plus failure modes.",
  how_to_monitor: "signal → place you look → alert.",
  how_to_deploy: "promote path → env params → rollback.",
  architecture: "I'd start with… then ingestion, storage, transform, serve. Spoken design, not a document.",
  optimization: "bottleneck then levers.",
  troubleshooting: "symptom → evidence → cause → fix → prevent.",
  debugging: "where you look then what it tells you.",
  comparison: "difference then when each wins.",
  tradeoff: "gain vs cost.",
  scenario: "assumption → approach → risk.",
  experience: "resume fact if grounded, else typical approach with no fake employer.",
  advantages: "why it wins.",
  disadvantages: "where it hurts.",
  limitations: "hard limit.",
  security: "identity then least privilege.",
  cost: "cost driver then control.",
  scalability: "what breaks at volume then the change.",
  failure_handling: "Address the failure in sentence one. Idempotent retry, partial load, audit. Do not define the technique.",
  incident: "triage → evidence → fix → prevent.",
  data_quality: "check → bad-row policy → reconcile.",
  coding: "working code in sections first, then 1–2 spoken sentences and one edge case. No theory lecture first.",
  follow_up: "new distinction only. Do not restart the last answer.",
  clarification: "plainer restatement.",
  example: "one concrete path, no definition restart.",
};

const GENERIC_MUST: Partial<Record<InterviewIntent, string[]>> = {
  definition: ["what it is", "where it sits in a real system"],
  why: ["purpose", "tradeoff"],
  why_not: ["the reason you skip it", "the alternative"],
  when_to_use: ["when yes", "when no"],
  when_not_to_use: ["when it is the wrong fit"],
  how_to_identify: ["the signal you look at", "how you know it is reliable"],
  how_to_process: ["steps in order", "commit point"],
  how_to_implement: ["tools in order", "one production caveat"],
  how_to_configure: ["the setting", "why it matters"],
  how_to_design: ["requirements", "components", "one risk"],
  how_to_handle: ["happy path plus failure"],
  how_to_monitor: ["the signal", "where you look"],
  how_to_deploy: ["promote path", "rollback"],
  failure_handling: ["what you retry", "what you do not mark complete"],
  incident: ["triage", "fix then prevent"],
  data_quality: ["the check", "bad-row policy"],
  optimization: ["bottleneck", "the cheapest fix first"],
  troubleshooting: ["where you look first", "fix then prevent"],
  comparison: ["difference", "when each wins"],
  architecture: ["flow", "one reliability point"],
  coding: ["working query", "edge case"],
  security: ["identity", "least privilege"],
  scalability: ["what breaks first", "the change"],
};

function durationFor(analysis: QuestionAnalysis): number {
  const intent = analysis.intent;
  const depth = analysis.expectedDepth;
  let seconds = 45;
  if (depth === "simple" || intent === "definition") seconds = 22;
  else if (intent === "why" || intent === "why_not" || intent === "advantages" || intent === "disadvantages") seconds = 28;
  else if (intent === "architecture" || intent === "how_to_design") seconds = 80;
  else if (intent === "coding") seconds = 50;
  else if (intent === "optimization" || intent === "troubleshooting" || intent === "failure_handling" || intent === "scalability") seconds = 50;
  if (analysis.isFollowUp && intent !== "architecture" && intent !== "how_to_design") {
    seconds = Math.min(seconds, 32);
  }
  return seconds;
}

function openerRuleFor(analysis: QuestionAnalysis, ungroundedTech: string[]): string {
  if (analysis.relationToPreviousQuestion === "challenge" || /\bwouldn'?t\b.{0,40}\b(fail|break|fall over)\b/i.test(analysis.question)) {
    return "Address the challenge in a complete first sentence — yes, that's the limitation, then what you'd do instead. Do not restart with a definition, and do not output a fragment.";
  }
  if (analysis.isFollowUp || analysis.intent === "follow_up") {
    return "Open with the new distinction in a complete spoken answer. Do not restart the last topic from scratch, and do not output a leftover sentence fragment.";
  }
  if (analysis.intent === "failure_handling") {
    return "Address the failure in the first sentence. Do not restart with a definition.";
  }
  if (analysis.intent === "definition") {
    return "Spoken what-it-is, then the useful part. Not a brochure feature dump. Then stop.";
  }
  if (analysis.intent === "experience" && ungroundedTech.length) {
    return "Do not claim hands-on work. Open with I'd / typically / a production approach.";
  }
  if (analysis.intent === "experience") {
    return "Use verified resume facts naturally. No STAR headings. Do not invent employers.";
  }
  if (analysis.intent === "coding") {
    return "Put working code in sections first. Then 1–2 spoken sentences, not a lecture.";
  }
  if (analysis.intent === "why" || analysis.intent === "why_not") {
    return "Open with the reason you'd pick it. Do not open with '<Product> is a…'.";
  }
  if (analysis.intent === "optimization" || analysis.intent === "troubleshooting") {
    return "Open with the bottleneck or where you'd look first. Do not start by defining the product.";
  }
  if (analysis.intent === "how_to_implement" || analysis.intent === "how_to_process" || analysis.intent === "how_to_handle") {
    return "Open with the first decision or approach. Do not open with 'To implement…' or '<Product> is a…'.";
  }
  if (analysis.intent === "comparison" || analysis.intent === "tradeoff") {
    return "I'd choose X when… Y when…. No absolute winner. Do not define both from scratch.";
  }
  if (analysis.intent === "architecture" || analysis.intent === "how_to_design") {
    return "Think out loud: I'd start with… then…. Not a formal architecture document.";
  }
  if (analysis.intent === "cost") {
    return "Open with what actually drives spend for THIS product. Not a generic pipeline lecture.";
  }
  return "Start with the mechanism, decision, or problem. Not '<Product> is a…', not 'To implement…', not job title. Do not start every answer with I.";
}

function tokensFor(seconds: number, coding: boolean): number {
  if (coding) return 900;
  if (seconds <= 25) return 320;
  if (seconds >= 70) return 780;
  return 640;
}

function safeCandidateFacts(persona: PersonaCard | null | undefined, analysis: QuestionAnalysis): string[] {
  if (!persona?.facts?.length) {
    return persona?.skills?.filter((skill) => {
      const hay = `${analysis.question} ${analysis.topic} ${analysis.technologies.join(" ")}`.toLowerCase();
      return hay.includes(skill.toLowerCase());
    }).slice(0, 4) ?? [];
  }
  const hay = `${analysis.question} ${analysis.technologies.join(" ")} ${analysis.topic}`.toLowerCase();
  return persona.facts
    .filter((fact) => hay.includes(fact.fact.toLowerCase().slice(0, 24)) || analysis.technologies.some((tech) => fact.fact.toLowerCase().includes(tech.toLowerCase())))
    .map((fact) => fact.fact)
    .slice(0, 4);
}

export function planAnswer(
  analysis: QuestionAnalysis,
  persona?: PersonaCard | null,
): AnswerPlan {
  const topicBank = TOPIC_CONCEPTS[analysis.topic] || {};
  const mustCover = [
    ...(topicBank[analysis.intent] || GENERIC_MUST[analysis.intent] || ["answer the exact verb they used"]),
  ].filter((item) => !analysis.conceptsToAvoidRepeating.some((seen) => seen.toLowerCase() === item.toLowerCase()));

  const avoid = [
    ...analysis.conceptsToAvoidRepeating,
    "In my role as",
    "job-title biography",
    "generic definition dump",
  ];
  const askedTech = analysis.technologies.map((item) => item.toLowerCase());
  const ungroundedTech = askedTech.filter((tech) => {
    if (!persona || !(persona.skills?.length || persona.technologies?.length)) {
      return analysis.intent === "experience";
    }
    return !personaKnows(persona, tech);
  });

  if (analysis.intent === "experience" && ungroundedTech.length) {
    mustCover.unshift(`Do not claim hands-on ${ungroundedTech.join(", ")}. Explain a typical production approach.`);
    avoid.push("I have used " + ungroundedTech.join("/"), "in my project we used " + ungroundedTech.join("/"));
  }

  if (analysis.relationToPreviousQuestion !== "new_topic") {
    avoid.push("restarting the topic from scratch", "repeating the previous concept sequence");
  }
  if (analysis.intent !== "definition") {
    avoid.push("Wikipedia-style definition opener", "opening with '<Product> is a…'");
  }
  if (analysis.intent === "how_to_implement" || analysis.intent === "how_to_process" || analysis.intent === "how_to_handle") {
    avoid.push("opening with 'To implement…'");
  }
  if (analysis.intent !== "experience") {
    avoid.push("In my current project as the opener");
  }
  if (analysis.intent === "how_to_identify") avoid.push("full implementation walkthrough");
  if (analysis.intent === "how_to_process") avoid.push("definition lecture");
  if (analysis.intent === "failure_handling" || analysis.intent === "incident") avoid.push("happy-path tutorial");
  if (analysis.intent === "definition" || analysis.expectedDepth === "simple") {
    avoid.push("security/cost/CI/CD/monitoring padding");
  }

  const seconds = durationFor(analysis);
  const facts = analysis.intent === "experience" ? safeCandidateFacts(persona, analysis) : [];

  return {
    intent: analysis.intent,
    answerMode: analysis.answerMode,
    objective: INTENT_OBJECTIVE[analysis.intent],
    mustCover: mustCover.slice(0, 7),
    avoid: [...new Set(avoid)].slice(0, 12),
    candidateFactsSafe: facts,
    depth: analysis.expectedDepth,
    targetDurationSeconds: seconds,
    maxTokens: tokensFor(seconds, analysis.intent === "coding"),
    styleCue: INTENT_STYLE[analysis.intent],
    openerRule: openerRuleFor(analysis, ungroundedTech),
    structure: PLAN_STRUCTURE[analysis.intent],
    ungroundedTech,
  };
}

export function planToPrompt(plan: AnswerPlan, analysis: QuestionAnalysis): string {
  return [
    `PLAN intent=${plan.intent} primary=${analysis.primaryIntent} mode=${plan.answerMode} depth=${plan.depth} ~${plan.targetDurationSeconds}s spoken`,
    `Fingerprint: ${analysis.fingerprint}`,
    analysis.subTopic || analysis.scenario
      ? `Focus: subTopic=${analysis.subTopic || "none"} scenario=${analysis.scenario || "none"}`
      : "",
    `Relation: ${analysis.relationToPreviousQuestion}${analysis.isFollowUp ? " (follow-up — do not restart)" : ""}`,
    `Objective: ${plan.objective}`,
    `Structure: ${plan.structure}`,
    `Must cover: ${plan.mustCover.join("; ")}`,
    `Avoid: ${plan.avoid.join("; ")}`,
    plan.candidateFactsSafe.length && analysis.intent === "experience"
      ? `Safe resume facts for this experience question: ${plan.candidateFactsSafe.join("; ")}`
      : analysis.intent === "experience"
        ? "No matching resume fact. Use I'd / typically / a production approach — do not invent an employer."
        : "Do not mention the current project or résumé unless they asked about the candidate.",
    `Style: ${plan.styleCue}`,
    plan.openerRule,
    "Do not pad with security, cost, CI/CD, or monitoring unless this question needs them.",
  ].filter(Boolean).join("\n");
}
