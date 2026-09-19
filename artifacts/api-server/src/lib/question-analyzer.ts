/**
 * Hika intelligence insertion (deterministic, no extra LLM call):
 *
 *   Audio -> STT (overlay/web) -> question text
 *     -> analyzeQuestion()        // intent, topic, fingerprint, follow-up, confidence
 *     -> interview thread memory  // concepts already covered
 *     -> planAnswer()             // mustCover / avoid / depth / structure
 *     -> subjectContext(intent)   // RAG slices by intent, not topic-only
 *     -> one streaming chat.completions call
 *     -> applyRepetitionGuard + grounding
 *     -> overlay
 */

import { isCodeIntent } from "./answer-quality";
import { scoredSubjects } from "./subject-docs";
import {
  FILLER,
  isIncompleteQuestion as isIncompleteStem,
  looksLikeFollowUpShape,
  normalizeSpokenQuestion,
} from "./question-finalizer";

export type InterviewIntent =
  | "definition"
  | "why"
  | "why_not"
  | "when_to_use"
  | "when_not_to_use"
  | "how_to_identify"
  | "how_to_implement"
  | "how_to_process"
  | "how_to_configure"
  | "how_to_design"
  | "how_to_handle"
  | "how_to_monitor"
  | "how_to_deploy"
  | "architecture"
  | "optimization"
  | "troubleshooting"
  | "debugging"
  | "comparison"
  | "tradeoff"
  | "scenario"
  | "experience"
  | "advantages"
  | "disadvantages"
  | "limitations"
  | "security"
  | "cost"
  | "scalability"
  | "failure_handling"
  | "incident"
  | "data_quality"
  | "coding"
  | "follow_up"
  | "clarification"
  | "example";

export type FineIntent = InterviewIntent | "sql_coding" | "pyspark_coding" | "challenge" | "governance" | "observability";

export type QuestionRelation =
  | "new_topic"
  | "related_but_different"
  | "follow_up"
  | "same_intent"
  | "challenge"
  | "why_follow_up"
  | "clarification"
  | "example_request"
  | "deep_dive"
  | "counter_argument"
  | "failure_scenario";

export type IntentClassification = {
  intent: InterviewIntent;
  confidence: number;
  rule: string;
};

export type QuestionAnalysis = {
  question: string;
  originalQuestion: string;
  topic: string;
  subTopic: string;
  intent: InterviewIntent;
  primaryIntent: FineIntent;
  secondaryIntent: FineIntent | null;
  questionType: string;
  scenario: string;
  technologies: string[];
  entities: string[];
  expectedDepth: "simple" | "senior" | "architecture";
  complexity: "simple" | "normal" | "complex";
  answerMode: string;
  isFollowUp: boolean;
  isAnswerable: boolean;
  isIncomplete: boolean;
  relationToPreviousQuestion: QuestionRelation;
  fingerprint: string;
  conceptsAlreadyCovered: string[];
  conceptsToAvoidRepeating: string[];
  confidence: number;
  matchedRule: string;
};

const TECH_ALIASES: Array<{ id: string; pattern: RegExp; label: string }> = [
  { id: "adf", pattern: /\b(adf|azure data factory|data factory)\b/i, label: "ADF" },
  { id: "databricks", pattern: /\b(databricks|\badb\b)\b/i, label: "Databricks" },
  { id: "spark", pattern: /\b(pyspark|apache spark|\bspark\b)\b/i, label: "Spark" },
  { id: "delta", pattern: /\b(delta lake|\bdelta\b|delta merge|delta live tables|\bdlt\b)\b/i, label: "Delta Lake" },
  { id: "adls", pattern: /\b(adls|data lake storage|abfss|gen2)\b/i, label: "ADLS" },
  { id: "synapse", pattern: /\bsynapse\b/i, label: "Synapse" },
  { id: "fabric", pattern: /\b(microsoft fabric|\bfabric\b|onelake|direct lake)\b/i, label: "Fabric" },
  { id: "snowflake", pattern: /\bsnowflake\b/i, label: "Snowflake" },
  { id: "powerbi", pattern: /\b(power bi|powerbi|\bdax\b)\b/i, label: "Power BI" },
  { id: "sql", pattern: /\b(sql server|sql|postgres|mysql|oracle|t-sql)\b/i, label: "SQL" },
  { id: "python", pattern: /\bpython\b/i, label: "Python" },
  { id: "kafka", pattern: /\b(kafka|event hubs?)\b/i, label: "Kafka" },
  { id: "unity", pattern: /\b(unity catalog|\buc\b)\b/i, label: "Unity Catalog" },
  { id: "docker", pattern: /\bdocker\b/i, label: "Docker" },
  { id: "kubernetes", pattern: /\b(kubernetes|\bk8s\b)\b/i, label: "Kubernetes" },
  { id: "terraform", pattern: /\b(terraform|bicep|arm template)\b/i, label: "Terraform" },
  { id: "react", pattern: /\breact\b/i, label: "React" },
  { id: "node", pattern: /\b(node\.?js|express)\b/i, label: "Node.js" },
  { id: "aws", pattern: /\b(aws|s3|glue|redshift)\b/i, label: "AWS" },
  { id: "gcp", pattern: /\b(gcp|bigquery|dataproc)\b/i, label: "GCP" },
  { id: "azure", pattern: /\bazure\b/i, label: "Azure" },
];

const TOPIC_ALIASES: Array<{ topic: string; pattern: RegExp }> = [
  { topic: "unity", pattern: /\b(unity catalog|metastore|storage credential|external location)\b/i },
  { topic: "dlt", pattern: /\b(delta live tables|\bdlt\b|lakeflow|pipeline expectation)\b/i },
  { topic: "fabric", pattern: /\b(microsoft fabric|\bfabric\b|onelake|direct lake|dataflow gen)\b/i },
  { topic: "snowflake", pattern: /\b(snowflake|snowpipe|virtual warehouse|zero-copy clone)\b/i },
  { topic: "powerbi", pattern: /\b(power bi|powerbi|\bdax\b|directquery|incremental refresh|query folding|row[- ]level security|\brls\b)\b/i },
  { topic: "kafka", pattern: /\b(kafka|consumer group|topic partition|event hubs?)\b/i },
  { topic: "api", pattern: /\b(rest api|\bapis?\b|pagination|rate limit|oauth|bearer token)\b/i },
  { topic: "adls", pattern: /\b(adls|data lake storage|hierarchical namespace|storage account)\b/i },
  { topic: "incremental", pattern: /\b(incremental|watermark|cdc|change data capture|full load|late arriv|change tracking|change detection|changed records|incremental data|reliable timestamp)\b/i },
  { topic: "scd", pattern: /\b(scd|slowly changing|type 2|type ii)\b/i },
  { topic: "delta", pattern: /\b(delta lake|\bdelta\b|delta merge|zorder|vacuum|time travel)\b/i },
  { topic: "adf", pattern: /\b(adf|azure data factory|integration runtime|linked service|mapping data flow)\b/i },
  { topic: "databricks", pattern: /\b(databricks|\badb\b|job cluster|sql warehouse|photon)\b/i },
  { topic: "spark", pattern: /\b(pyspark|\bspark\b|broadcast join|data skew|shuffle|aqe)\b/i },
  { topic: "sql", pattern: /\b(primary key|foreign key|index|cte|window function|\bjoin\b|sql server|row_number)\b/i },
  { topic: "lakehouse", pattern: /\b(medallion|bronze|silver|gold|lakehouse)\b/i },
  { topic: "modeling", pattern: /\b(star schema|snowflake schema|fact table|dimension table|surrogate key|grain)\b/i },
  { topic: "quality", pattern: /\b(data quality|reconciliation|duplicate check|schema drift|quarantine|data contract)\b/i },
  { topic: "partitioning", pattern: /\b(partition(ing)?|file size|small files)\b/i },
  { topic: "devops", pattern: /\b(ci\/?cd|azure devops|github actions|git pipeline|bicep|terraform)\b/i },
  { topic: "security", pattern: /\b(rbac|managed identity|key vault|private endpoint|least privilege|acl)\b/i },
];

const SIMPLE_TOPICS = /\b(primary key|foreign key|what is (a |an )?(null|index|view|table|join|cte))\b/i;

type IntentRule = {
  name: string;
  intent: InterviewIntent;
  confidence: number;
  test: (t: string) => boolean;
};

const INTENT_RULES: IntentRule[] = [
  { name: "coding", intent: "coding", confidence: 0.95, test: (t) => isCodeIntent(t) },
  { name: "comparison", intent: "comparison", confidence: 0.93, test: (t) => /(difference between|\bvs\.?\b|versus|compared to|compare )/i.test(t) || (/\binstead of\b/i.test(t) && !/^why\b/i.test(t) && !/(api instead|source was an api)/i.test(t)) },
  { name: "tradeoff", intent: "tradeoff", confidence: 0.9, test: (t) => /\btrade-?offs?\b/i.test(t) },
  { name: "why_not", intent: "why_not", confidence: 0.9, test: (t) => /\bwhy (not|wouldn't|don't you)\b/i.test(t) },
  { name: "when_not", intent: "when_not_to_use", confidence: 0.88, test: (t) => /(when (do|would|should) (you|we) not use|when not to use)/i.test(t) },
  { name: "failure_halfway", intent: "failure_handling", confidence: 0.94, test: (t) => /(failed halfway|fails? halfway|job failed|pipeline fails|merge failure|what would happen if .{0,40}fail|what happens if .{0,40}fail)/i.test(t) },
  { name: "challenge_prod", intent: "limitations", confidence: 0.86, test: (t) => /(wouldn't that|doesn't that|are you sure).{0,40}(fail|break|fall over|production)/i.test(t) || /\bwouldn'?t\b.{0,40}\b(fail|break|fall over)\b/i.test(t) },
  { name: "incident", intent: "incident", confidence: 0.9, test: (t) => /\b(incident|rca|root cause analysis|sev[0-9]|on[- ]call)\b/i.test(t) },
  { name: "failure_named", intent: "failure_handling", confidence: 0.92, test: (t) => /\b(failures?|failed run|failed job|isn't updated|is not updated)\b/i.test(t) && /(handle|what if|happen|when|would)/i.test(t) },
  { name: "why_slow", intent: "troubleshooting", confidence: 0.93, test: (t) => /(why (is|are)\b.{0,40}\bslow\b|\b(job|pipeline|report|query) (is |became )slow)/i.test(t) },
  { name: "troubleshoot", intent: "troubleshooting", confidence: 0.92, test: (t) => /(troubleshoot|debug|root cause|became slow|what would you check|spark ui|access denied)/i.test(t) },
  { name: "monitor", intent: "how_to_monitor", confidence: 0.9, test: (t) => /(how (do|would|can) (you |we )?(monitor|alert|observe)|observability|alerting)/i.test(t) },
  { name: "deploy", intent: "how_to_deploy", confidence: 0.9, test: (t) => /(how (do|would|can) (you |we )?(deploy|promote|release)|dev to (uat|test|prod)|rollback)/i.test(t) },
  { name: "configure", intent: "how_to_configure", confidence: 0.88, test: (t) => /(how (do|would|can) (you |we )?(configure|set up|setup|parameterize))/i.test(t) },
  { name: "quality", intent: "data_quality", confidence: 0.88, test: (t) => /(data quality|reconcil|schema drift|quarantine bad|duplicate check)/i.test(t) },
  { name: "optimize", intent: "optimization", confidence: 0.92, test: (t) => /(optimiz|performance|tune |speed up|predicate pushdown|query folding)/i.test(t) },
  { name: "identify_paraphrase", intent: "how_to_identify", confidence: 0.88, test: (t) => /(know what changed|detect (the )?chang|spot (the )?chang|tell (what|which) (rows?|records) changed|source exposes changes|how do you detect)/i.test(t) && !/(doesn'?t|no reliable)/i.test(t) },
  { name: "identify_verb", intent: "how_to_identify", confidence: 0.94, test: (t) => /(how (do|would|can) (you |we )?(identify|detect|spot|tell)|how .* identifi|change detection)/i.test(t) },
  { name: "process_paraphrase", intent: "how_to_process", confidence: 0.87, test: (t) => /(deal with changed records|process those records|those records|land (the )?(changed|new)|apply the changes)/i.test(t) },
  { name: "process_verb", intent: "how_to_process", confidence: 0.94, test: (t) => /(how (do|would|can) (you |we )?process|actually process|source extraction)/i.test(t) },
  { name: "no_timestamp", intent: "scenario", confidence: 0.86, test: (t) => /(doesn'?t (give|provide|have)|no (reliable )?timestamp|source doesn'?t)/i.test(t) },
  { name: "api_instead", intent: "scenario", confidence: 0.85, test: (t) => /(if the source was an api|api instead|source was an api)/i.test(t) },
  { name: "implement_paraphrase", intent: "how_to_implement", confidence: 0.88, test: (t) => /(take me through the implementation|walk me through (the |how (you|'d|you would) )implement|how (you|'d) (actually )?build)/i.test(t) },
  { name: "implement_verb", intent: "how_to_implement", confidence: 0.94, test: (t) => /(how (do|would|can) (you |we )?implement)/i.test(t) },
  { name: "design", intent: "how_to_design", confidence: 0.9, test: (t) => /(how (do|would|can) (you |we )?design)/i.test(t) },
  { name: "scalability", intent: "scalability", confidence: 0.9, test: (t) => /(10\s?tb|very large|at scale|scale out|same design at|would (that|it|your approach) (still )?work)/i.test(t) },
  { name: "approach", intent: "how_to_handle", confidence: 0.84, test: (t) => /(your approach|approach to|make (that|it) reliable)/i.test(t) },
  { name: "handle_verb", intent: "how_to_handle", confidence: 0.93, test: (t) => /(how (do|would|can) (you |we )?handle)/i.test(t) },
  { name: "idempotent", intent: "how_to_handle", confidence: 0.9, test: (t) => /\bidempot/i.test(t) },
  { name: "why_choose", intent: "why", confidence: 0.91, test: (t) => /^why\b|why (do|did|would) (you|we)|why (use|choose|did you choose|this approach)/i.test(t) },
  { name: "when_to_use", intent: "when_to_use", confidence: 0.9, test: (t) => /(when (do|would|should) (you|we) use|when to use)/i.test(t) },
  { name: "downside", intent: "disadvantages", confidence: 0.9, test: (t) => /\b(disadvantage|drawback|downside|cons\b)\b/i.test(t) },
  { name: "advantages", intent: "advantages", confidence: 0.88, test: (t) => /\b(advantage|benefit|pros\b)\b/i.test(t) },
  { name: "limitations", intent: "limitations", confidence: 0.88, test: (t) => /\blimitations?\b/i.test(t) },
  { name: "security", intent: "security", confidence: 0.86, test: (t) => /\b(secur(e|ity)|rbac|encrypt|pii|least privilege)\b/i.test(t) && /(how|what|handle)/i.test(t) },
  { name: "cost", intent: "cost", confidence: 0.84, test: (t) => /\b(cost|expensive|pricing)\b/i.test(t) && /(how|why|what|trade)/i.test(t) },
  { name: "walk_architecture", intent: "architecture", confidence: 0.9, test: (t) => /(walk me through .{0,40}(architecture|medallion|end[- ]to[- ]end|lakehouse)|design a |system design)/i.test(t) && !/(implementation|how (you|'d|you would)|deal with)/i.test(t) },
  { name: "experience", intent: "experience", confidence: 0.92, test: (t) => /(have you (worked|used|done|implemented|ever)|in your (current )?project|your experience with|have you used|tell me about (a |the |your )?(current )?project|pipeline you built|walk me through your (current )?project)/i.test(t) },
  { name: "intro", intent: "experience", confidence: 0.9, test: (t) => /(tell me about yourself|introduce yourself|walk me through your (resume|background|current project|project))/i.test(t) },
  { name: "example", intent: "example", confidence: 0.91, test: (t) => /(real example|give (me )?(an |a )?example|for instance|can you show)/i.test(t) },
  { name: "scenario", intent: "scenario", confidence: 0.84, test: (t) => /(what would you do|suppose |scenario|if we (need|had)|what if )/i.test(t) },
  { name: "challenge_generic", intent: "scenario", confidence: 0.8, test: (t) => /^(are you sure|wouldn'?t that|doesn'?t that|why not just|wouldn'?t \w+ (fail|work|break|scale))\b/i.test(t) },
  { name: "clarification", intent: "clarification", confidence: 0.86, test: (t) => /(what do you mean|clarify|in other words)/i.test(t) },
  { name: "definition", intent: "definition", confidence: 0.8, test: (t) => /(what is|what are|what's|explain|define )/i.test(t) },
  { name: "generic_how", intent: "how_to_implement", confidence: 0.62, test: (t) => /(how (do|would|can) (you|we))/i.test(t) },
];

export function normalizeQuestion(text: string): string {
  return normalizeSpokenQuestion(text);
}

export function classifyIntent(question: string): IntentClassification {
  const t = normalizeQuestion(question).toLowerCase();
  if (!t) return { intent: "definition", confidence: 0.2, rule: "empty" };
  for (const rule of INTENT_RULES) {
    if (rule.test(t)) return { intent: rule.intent, confidence: rule.confidence, rule: rule.name };
  }
  return { intent: "definition", confidence: 0.45, rule: "default" };
}

export function detectIntent(question: string): InterviewIntent {
  return classifyIntent(question).intent;
}

export function detectAliasTopic(question: string): string {
  const text = normalizeQuestion(question);
  for (const row of TOPIC_ALIASES) {
    if (row.pattern.test(text)) return row.topic;
  }
  return "general";
}

export function detectTopic(question: string): string {
  const alias = detectAliasTopic(question);
  if (alias !== "general") return alias;
  return scoredSubjects(normalizeQuestion(question))[0] || "general";
}

export function detectTechnologies(question: string): string[] {
  const text = normalizeQuestion(question);
  const found: string[] = [];
  for (const row of TECH_ALIASES) {
    if (row.pattern.test(text) && !found.includes(row.label)) found.push(row.label);
  }
  return found.slice(0, 6);
}

function detectEntities(question: string): string[] {
  const text = normalizeQuestion(question);
  const hits: string[] = [];
  const catalog = [
    "watermark", "cdc", "timestamp", "change tracking", "merge", "upsert",
    "idempotent", "late arriving", "duplicate", "retry", "broadcast join",
    "data skew", "partition", "zorder", "vacuum", "scd type 2", "integration runtime",
    "api", "10tb", "pagination", "rate limit", "unity catalog", "snowpipe",
    "direct lake", "dax", "query folding", "offset", "checkpoint",
  ];
  const lower = text.toLowerCase();
  for (const item of catalog) {
    if (lower.includes(item)) hits.push(item);
  }
  return hits.slice(0, 6);
}

function answerModeFor(intent: InterviewIntent): string {
  switch (intent) {
    case "definition":
    case "why":
    case "why_not":
    case "when_to_use":
    case "when_not_to_use":
    case "advantages":
    case "disadvantages":
    case "limitations":
    case "clarification":
      return "definition";
    case "how_to_identify":
    case "how_to_implement":
    case "how_to_process":
    case "how_to_configure":
    case "how_to_handle":
    case "how_to_deploy":
    case "optimization":
    case "example":
      return "implementation";
    case "troubleshooting":
    case "debugging":
    case "failure_handling":
    case "incident":
    case "how_to_monitor":
    case "data_quality":
      return "troubleshooting";
    case "architecture":
    case "how_to_design":
    case "scalability":
      return "architecture";
    case "comparison":
    case "tradeoff":
    case "cost":
      return "comparison";
    case "coding":
      return "coding";
    case "experience":
      return "experience";
    case "scenario":
    case "security":
      return "scenario";
    default:
      return "implementation";
  }
}

function depthFor(question: string, intent: InterviewIntent): QuestionAnalysis["expectedDepth"] {
  if (intent === "architecture" || intent === "scalability" || intent === "how_to_design") return "architecture";
  if (intent === "definition" && SIMPLE_TOPICS.test(question)) return "simple";
  if (intent === "definition" && normalizeQuestion(question).split(/\s+/).length <= 7) return "simple";
  return "senior";
}

function complexityFor(question: string, intent: InterviewIntent, depth: QuestionAnalysis["expectedDepth"]): QuestionAnalysis["complexity"] {
  if (depth === "simple" || intent === "definition" || intent === "why") return "simple";
  if (depth === "architecture" || intent === "coding" || intent === "how_to_design") return "complex";
  return "normal";
}

function questionTypeFor(intent: InterviewIntent, technologies: string[]): string {
  if (intent === "coding") return "Coding Question";
  if (intent === "experience") return "Experience Question";
  if (intent === "architecture" || intent === "scalability" || intent === "how_to_design") return "Architecture Question";
  if (intent === "comparison" || intent === "tradeoff") return "Comparison Question";
  if (intent === "troubleshooting" || intent === "failure_handling" || intent === "debugging" || intent === "incident") return "Troubleshooting Question";
  if (technologies.includes("ADF") || technologies.includes("Azure") || technologies.includes("Databricks")) {
    return "Technical Question";
  }
  return "Technical Question";
}

export function questionFingerprint(
  topic: string,
  intent: InterviewIntent,
  technologies: string[] = [],
  extra: { subTopic?: string; scenario?: string } = {},
): string {
  const tech = technologies.slice(0, 2).map((item) => item.toLowerCase().replace(/\s+/g, "_")).join("+");
  const bits = [topic, intent, extra.subTopic, extra.scenario, tech].filter(Boolean);
  return bits.join("|");
}

export function isAnswerableQuestion(question: string): boolean {
  const text = normalizeQuestion(question);
  if (!text) return false;
  if (FILLER.test(text)) return false;
  if (text.split(/\s+/).length < 3 && !/[?]/.test(text) && !/(what|why|how|when|where|who)/i.test(text)) {
    return false;
  }
  return true;
}

export function isIncompleteQuestion(question: string, _previous?: QuestionAnalysis | null): boolean {
  return isIncompleteStem(question);
}

function looksLikeFollowUp(question: string, previous?: QuestionAnalysis | null): boolean {
  if (!previous) return false;
  return looksLikeFollowUpShape(question);
}

function sameTechFamily(topic: string, techLabel: string): boolean {
  const tech = techLabel.toLowerCase();
  if (topic === "databricks" && /databricks|spark/.test(tech)) return true;
  if (topic === "spark" && /spark|databricks|python/.test(tech)) return true;
  if (topic === "delta" && /delta/.test(tech)) return true;
  if (topic === "adf" && /adf|azure data factory/.test(tech)) return true;
  if (topic === "fabric" && /fabric/.test(tech)) return true;
  if (topic === "snowflake" && /snowflake/.test(tech)) return true;
  if (topic === "powerbi" && /power bi/.test(tech)) return true;
  if (topic === "unity" && /unity/.test(tech)) return true;
  if (topic === "kafka" && /kafka/.test(tech)) return true;
  return false;
}

function namesNewTopic(question: string, previous: QuestionAnalysis): boolean {
  const techs = detectTechnologies(question);
  if (!techs.length) return false;
  const prev = new Set(previous.technologies.map((item) => item.toLowerCase()));
  const introduces = techs.some((tech) => !prev.has(tech.toLowerCase()) && !sameTechFamily(previous.topic, tech));
  if (!introduces) return false;
  // Named technology in "what about X?" / definition / experience resets the thread.
  // Scenario tweaks ("if the source was an API instead") stay follow-ups.
  if (/(instead of|if the source|if we (used|had)|what would you change)/i.test(question)) {
    return false;
  }
  return /^(what is|what are|what's|explain|define |have you (worked|used)|tell me about|what about|how about|let's (talk|switch))\b/i.test(question);
}

function relationToPrevious(
  current: { topic: string; intent: InterviewIntent; fingerprint: string; question: string; rawTopic: string },
  previous?: QuestionAnalysis | null,
): { relation: QuestionRelation; isFollowUp: boolean } {
  if (!previous) return { relation: "new_topic", isFollowUp: false };
  const q = current.question.toLowerCase();
  if (namesNewTopic(current.question, previous)) {
    return { relation: "new_topic", isFollowUp: false };
  }
  const shortFollowUp = looksLikeFollowUp(current.question, previous);
  if (current.topic !== previous.topic && !shortFollowUp) {
    return { relation: "new_topic", isFollowUp: false };
  }
  if (current.intent === "example") return { relation: "example_request", isFollowUp: true };
  if (current.intent === "why") return { relation: "why_follow_up", isFollowUp: true };
  if (current.intent === "clarification") return { relation: "clarification", isFollowUp: true };
  if (/(are you sure|wouldn'?t that|doesn'?t that|why not just|that (won't|wouldn'?t) work|\bwouldn'?t\b.{0,40}\b(fail|break|fall over)\b)/i.test(q)) {
    return { relation: "challenge", isFollowUp: true };
  }
  if (current.intent === "failure_handling" || current.intent === "troubleshooting") {
    return { relation: "failure_scenario", isFollowUp: true };
  }
  if (current.intent === "disadvantages" || /(but |why not|downside)/i.test(q)) {
    return { relation: "counter_argument", isFollowUp: true };
  }
  if (current.intent === "optimization" || current.intent === "scalability" || current.intent === "scenario") {
    return { relation: "deep_dive", isFollowUp: true };
  }
  if (current.fingerprint === previous.fingerprint) {
    return { relation: "same_intent", isFollowUp: true };
  }
  if (current.topic === previous.topic && current.intent !== previous.intent) {
    return { relation: "related_but_different", isFollowUp: true };
  }
  if (shortFollowUp || current.topic === previous.topic) {
    return { relation: "follow_up", isFollowUp: true };
  }
  return { relation: "new_topic", isFollowUp: false };
}

function detectScenario(question: string): string {
  const t = question.toLowerCase();
  if (/(old record|late arriv|late update|updates an old)/i.test(t)) return "late_update";
  if (/(10\s?tb|very large|at scale)/i.test(t)) return "volume";
  if (/(halfway|partial load|failed run)/i.test(t)) return "partial_failure";
  if (/(no (reliable )?timestamp|doesn't (give|provide))/i.test(t)) return "missing_signal";
  if (/(429|rate limit|throttl)/i.test(t)) return "rate_limit";
  if (/(pagination|next (page|link|token))/i.test(t)) return "pagination";
  if (/(access denied|permission|cannot read)/i.test(t)) return "access";
  if (/(wouldn't that|are you sure|why not)/i.test(t)) return "challenge";
  return "";
}

function detectSubTopic(question: string, entities: string[]): string {
  if (entities[0]) return entities[0].replace(/\s+/g, "_");
  const t = question.toLowerCase();
  if (/\bwatermark/i.test(t)) return "watermark";
  if (/\bskew\b/i.test(t)) return "skew";
  if (/\bmerge\b/i.test(t)) return "merge";
  if (/\bintegration runtime|\bir\b/i.test(t)) return "integration_runtime";
  return "";
}

function detectSecondaryIntent(question: string, primary: InterviewIntent): FineIntent | null {
  const t = question.toLowerCase();
  if (primary !== "coding" && isCodeIntent(t)) return "coding";
  if (primary !== "security" && /\b(rbac|secure|secret|key vault)\b/i.test(t)) return "security";
  if (primary !== "scalability" && /(10\s?tb|at scale|very large)/i.test(t)) return "scalability";
  if (primary !== "optimization" && /optimiz|performance/.test(t)) return "optimization";
  if (/\bpyspark\b/i.test(t) && primary === "coding") return "pyspark_coding";
  if (/\bsql\b/i.test(t) && primary === "coding") return "sql_coding";
  return null;
}

export function analyzeQuestion(
  question: string,
  previous?: QuestionAnalysis | null,
  coveredConcepts: string[] = [],
): QuestionAnalysis {
  const cleaned = normalizeQuestion(question);
  const incomplete = isIncompleteQuestion(cleaned, previous);
  const classified = classifyIntent(cleaned);
  let intent = classified.intent;
  let confidence = classified.confidence;
  let rule = classified.rule;

  if (
    previous
    && looksLikeFollowUp(cleaned, previous)
    && (intent === "definition" || intent === "clarification" || rule === "default")
    && cleaned.split(/\s+/).length <= 12
  ) {
    if (/^why\b/i.test(cleaned)) {
      intent = "why";
      rule = "followup_why";
      confidence = 0.8;
    } else if (/fail|wrong|broke/i.test(cleaned)) {
      intent = "failure_handling";
      rule = "followup_fail";
      confidence = 0.82;
    } else if (/example/i.test(cleaned)) {
      intent = "example";
      rule = "followup_example";
      confidence = 0.86;
    } else if (/^how\b/i.test(cleaned)) {
      intent = "how_to_implement";
      rule = "followup_how";
      confidence = 0.72;
    } else {
      intent = "follow_up";
      rule = "followup_generic";
      confidence = 0.7;
    }
  }

  const inferredIntent = intent === "follow_up" && previous
    ? previous.intent
    : intent;

  const aliasTopic = detectAliasTopic(cleaned);
  const scoredTopic = scoredSubjects(cleaned)[0] || "general";
  const followUpShape = previous ? looksLikeFollowUp(cleaned, previous) : false;
  const explicitNew = previous ? namesNewTopic(cleaned, previous) : false;
  let topic: string;
  if (previous && followUpShape && !explicitNew) {
    topic = aliasTopic !== "general" ? aliasTopic : previous.topic;
  } else if (aliasTopic !== "general") {
    topic = aliasTopic;
  } else {
    topic = scoredTopic;
  }
  const rawTopic = aliasTopic !== "general" ? aliasTopic : scoredTopic;
  if (previous && followUpShape && aliasTopic === "general") {
    confidence = Math.min(confidence, Math.max(classified.confidence, 0.74));
  }
  if (rule === "default" || rule === "generic_how") {
    confidence = Math.min(confidence, 0.58);
  }

  const technologies = detectTechnologies(cleaned);
  const entities = detectEntities(cleaned);
  const scenario = detectScenario(cleaned);
  const subTopic = detectSubTopic(cleaned, entities);
  const depth = depthFor(cleaned, inferredIntent);
  const fingerprint = questionFingerprint(topic, inferredIntent, technologies, { subTopic, scenario });
  const { relation, isFollowUp } = relationToPrevious(
    { topic, intent: inferredIntent, fingerprint, question: cleaned, rawTopic },
    previous,
  );
  const avoid = relation === "new_topic" ? [] : coveredConcepts.slice(0, 8);
  if (incomplete) confidence = Math.min(confidence, 0.25);
  if (!isAnswerableQuestion(cleaned)) confidence = Math.min(confidence, 0.15);
  const primaryIntent: FineIntent = inferredIntent;
  const secondaryIntent = detectSecondaryIntent(cleaned, inferredIntent);

  return {
    question: cleaned,
    originalQuestion: String(question || "").trim(),
    topic,
    subTopic,
    intent: inferredIntent,
    primaryIntent,
    secondaryIntent,
    questionType: questionTypeFor(inferredIntent, technologies),
    scenario,
    technologies: technologies.length ? technologies : previous && isFollowUp ? previous.technologies : [],
    entities,
    expectedDepth: depth,
    complexity: complexityFor(cleaned, inferredIntent, depth),
    answerMode: answerModeFor(inferredIntent),
    isFollowUp,
    isAnswerable: isAnswerableQuestion(cleaned) && !incomplete,
    isIncomplete: incomplete,
    relationToPreviousQuestion: relation,
    fingerprint,
    conceptsAlreadyCovered: avoid,
    conceptsToAvoidRepeating: avoid,
    confidence,
    matchedRule: rule,
  };
}
