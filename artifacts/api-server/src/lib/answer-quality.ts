export const ENGLISH_QUESTION = /\b(what|why|how|when|where|who|which|tell|explain|describe|walk|can you|could you|would you)\b/i;
const ENGLISH_FUNCTION_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "you", "i", "we", "they", "to", "of", "and", "in",
  "that", "it", "for", "on", "with", "this", "have", "be", "what", "how", "why", "can", "do", "does",
  "tell", "me", "about", "your", "my", "so", "yeah", "okay", "ok", "like", "just", "when", "if", "or",
  "not", "but", "from", "at", "as", "would", "could", "should", "will", "there", "here", "please",
  "yes", "no", "right", "well", "hello", "hi", "hey", "explain",
]);
const WEAK_ENGLISH_WORDS = new Set(["a", "an", "i", "no", "ok", "to", "or"]);
const FOREIGN_FUNCTION_WORDS = new Set([
  "alsof", "hemel", "het", "een", "van", "niet", "jij", "jullie", "und", "der", "die", "das", "ich",
  "nicht", "que", "para", "como", "esto", "esta", "les", "des", "une", "pas", "avec", "oui",
  "el", "los", "las", "por", "una", "sehr", "ist", "che", "per", "con", "kya", "hai", "aap",
  "kaise", "nahi", "nahin", "haan", "theek", "acha", "accha", "bhai", "kyun", "kyon", "mera",
  "meri", "tum", "hum", "kaun", "kab", "kahan", "woh", "yeh", "aur", "itu", "bagus", "sekali",
  "saya", "tidak", "yang", "untuk", "ada", "ini", "hallo", "wie", "geht", "dir", "nuk", "kuptoj",
  "tardo", "diario", "kocham", "bueno", "gracias", "hola", "porque", "pero", "muy", "aqui", "ahora",
]);
const HALLUCINATED_TRANSCRIPT = /thanks for watching|thank you for watching|please subscribe|the boy ran quickly|\[music\]|\[silence\]|rewrite:|clarifying:|greeting:|translation:|subtitle:|respond to /i;
const TITLED_BOX = /^\s*(contextual explanation|cluster inventory confirmation|explanation|interview tip|follow-?up|details|notes|what is data skew.*|architecture|definition|implementation|best practices)\s*:?\s*$/im;
const ALL_CAPS_TITLE = /^\s*[A-Z][A-Z0-9 /,&:\-]{10,}\s*$/m;
const GENERIC_AI = /\b(as an ai|great question|based on the (information|conversation|transcript) provided|as a data engineer with \d+)\b|certainly[!.,]|passionate and results-driven|proven track record|organizational excellence|stakeholder management/i;
const EVASIVE = /\b(i['’]m not aware|not aware of any|check with the admin|absolutely sure|various best practices|comprehensive (suite|solution|platform)|interconnected components|limitless analytics|as of now)\b/i;
const WIKIPEDIA_OPENER = /^(data skew is a (phenomenon|condition)|in distributed (computing|systems)|unity catalog is a (feature|governance)|a cluster is a set of|the medallion architecture is a data design|azure data factory consists of|apache kafka is a distributed event)/i;
const CASUAL_OPENER = /^(yeah[,.]?\s+|yup[,.]?\s+|so basically[,.]?\s+|right,? so[,.]?\s+)/i;
const SPOKEN_MARKER = /\b(I|I'm|I'd|I've|we|we're|we'd|I'll|for example|the reason|one (issue|challenge|thing)|first I'd|in that situation|from a production|in practice|I wouldn't|I'd (first|start|check|approach|use|look))\b/i;
const CATCH_PHRASE = /didn't catch a clear english question/i;
const INVENTED_FICTION = /\bs3a:\/\/my-bucket\b|\bs3:\/\/my-bucket\b|\/\/my-bucket\/|i set up a slack alert|slack alert\b/i;
const FUNCTION_CATALOG = /variety of (pyspark )?transformations|filter, select, withcolumn|withcolumn and withcolumnrenamed/i;
const STRONG_POINT = /\b(for example|from a production|in practice|day to day|typically|the reason|I (use|used|wouldn't|usually|generally|also)|we (use|used|land|write|keep|run))\b/i;

export function looksLikeUsEnglish(text: string) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return false;
  if (/[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F]/.test(value)) {
    return false;
  }
  if (HALLUCINATED_TRANSCRIPT.test(value)) return false;
  const words = value.toLowerCase().replace(/[^a-z'\s]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;
  const englishHits = words.filter((word) => ENGLISH_FUNCTION_WORDS.has(word)).length;
  const strongEnglish = words.filter((word) => ENGLISH_FUNCTION_WORDS.has(word) && !WEAK_ENGLISH_WORDS.has(word)).length;
  const foreignHits = words.filter((word) => FOREIGN_FUNCTION_WORDS.has(word)).length;
  if (foreignHits > 0 && foreignHits >= strongEnglish) return false;
  if (words.length < 5 && !ENGLISH_QUESTION.test(value)) return false;
  if (strongEnglish === 0 && words.length < 6) return false;
  if (englishHits === 0) return false;
  return true;
}

export function isProcessQuestion(text: string): boolean {
  const t = text.toLowerCase();
  return /(how (can|do|would) (you|we)|handle this situation|provide access|grant access|onboard|new (resource|user|joiner|employee|engineer|hire)|give him access|give them access|workspace access|as an admin)/i.test(t);
}

export function isMeaningQuestion(text: string): boolean {
  const t = String(text || "").toLowerCase();
  if (/(write|show me|give me|paste|implement)\b.{0,40}\b(code|query|script|sql|pyspark|python)\b/i.test(t)) {
    return false;
  }
  return /(what do you mean|what does .{0,40} mean|what is|what are|what's|explain|define |where (do|would|we) (we )?use|when (do|would) (you|we) use)/i.test(t);
}

export function isExperienceQuestion(text: string): boolean {
  const t = String(text || "").toLowerCase();
  return /(in your (current )?project|you have used|have you used|how did you (implement|handle|use)|what (are|were) the transformations|transformations you have used|roles and responsibilities)/i.test(t);
}

export function isCodeIntent(text: string): boolean {
  const t = text.toLowerCase();
  if (isProcessQuestion(t)) return false;
  if (isMeaningQuestion(t)) return false;
  return /(write (me )?(a |the )?(code|query|script|function)|give me (the )?(code|sql|query|script)|show me (the )?(code|sql|pyspark|query)|paste the (code|query)|executable code|implement (this|it) in|python script|pyspark (code|script)|sql query to|write a query|write the query|write a pyspark)/i.test(t);
}

export function isPointwiseQuestion(text: string): boolean {
  const t = String(text || "").toLowerCase();
  if (isCodeIntent(t)) return false;
  if (/(tell me about yourself|introduce yourself|why should we hire you)/i.test(t)) return false;
  return /(what are the|list (the |out )?|components|types of|kinds of|steps|walk me through|end[- ]to[- ]end|difference between|\bvs\.?\b|versus|compare |advantages|disadvantages|pros and cons|left join|right join|inner join|transformations you have used|what (are|were) the transformations|bronze.{0,20}silver|how (do|did|would) you|how can you|stages|layers|where (do we|we) use)/i.test(t);
}

export function looksLikeCodeDump(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  if (/DATABRICKS_INSTANCE|preview\/scim|Bearer \{|your-databricks-personal-access-token|<your-/i.test(t)) return true;
  if (/^import\s+\w+/m.test(t) && /requests\.(get|post|patch)|json\.dumps/.test(t)) return true;
  if (/^```/.test(t)) return true;
  return /^(select|with|insert|update|create table|from pyspark|def\s+\w+\s*\()/i.test(t) && t.includes("\n");
}

export function stripCodeFences(text: string) {
  return String(text || "").replace(/```[\s\S]*?```/g, " ").replace(/\s+/g, " ").trim();
}

function ensurePeriod(value: string) {
  const trimmed = value.replace(/\s+/g, " ").trim().replace(/[•\-]\s*/, "");
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function lowerFirst(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^[A-Z]{2,}/.test(trimmed) || /^(ADF|ADLS|SQL|I|I'd|I'm|We)\b/.test(trimmed)) return trimmed;
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

export function looksThinInterview(text: string): boolean {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return true;
  const sentences = cleaned.split(/(?<=[.!?])\s+/).map((line) => line.trim()).filter((line) => line.length > 18);
  const words = cleaned.split(/\s+/).filter(Boolean);
  return sentences.length < 2 && words.length < 45;
}

export function looksLikeBulletNotes(text: string): boolean {
  const lines = String(text || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const bullets = lines.filter((line) => /^[•\-*]\s+/.test(line) || /^•/.test(line));
  if (bullets.length >= 3) return true;
  const bulletMarks = (String(text || "").match(/•/g) || []).length;
  return bulletMarks >= 3 && !SPOKEN_MARKER.test(text);
}

export function extractKeyPoints(answer: string, limit = 5): string[] {
  const names = [
    "Unity Catalog", "Auto Loader", "Event Hubs", "Power BI", "Key Vault", "Delta Lake",
    "PySpark", "Databricks", "ADLS Gen2", "ADLS", "ADF", "Kafka", "Spark UI",
    "Bronze/Silver/Gold", "Integration Runtime", "Terraform", "Kubernetes", "Airflow",
  ];
  const text = String(answer || "");
  const hits: string[] = [];
  for (const name of names) {
    if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text) && !hits.includes(name)) {
      hits.push(name);
    }
    if (hits.length >= limit) break;
  }
  return hits;
}

export function toSpokenAnswer(text: string, keepPoints = false) {
  const cleaned = String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*#{1,6}\s+.+$/gm, "")
    .replace(/^\s*\*\*[^*]+\*\*\s*:?\s*$/gm, "")
    .replace(TITLED_BOX, "")
    .replace(ALL_CAPS_TITLE, "")
    .replace(/\*\*/g, "")
    .replace(CASUAL_OPENER, "")
    .trim();

  if (!cleaned) return "";
  const hasBullets = /•|^\s*[-*]\s+\S|^\s*\d+[.)]\s+\S/m.test(cleaned);
  if (!hasBullets) {
    return cleaned.replace(/\n{3,}/g, "\n\n").trim();
  }
  if (keepPoints) {
    const rawLines = cleaned.split(/\n+/).map((line) => line.replace(CASUAL_OPENER, "").trim()).filter(Boolean);
    const opener: string[] = [];
    const points: string[] = [];
    for (const line of rawLines) {
      const isPoint = /^\s*(?:[-*]|•|\d+[.)])\s+/.test(line);
      const point = line.replace(/^\s*(?:[-*]|•|\d+[.)])\s+/, "").replace(/\s+/g, " ").trim();
      if (!point) continue;
      if (isPoint || points.length > 0) points.push(ensurePeriod(point));
      else opener.push(point);
    }
    const head = opener.join(" ").replace(/\s+/g, " ").trim();
    if (!points.length) return head;
    return [head, ...points.map((point) => `• ${point}`)].filter(Boolean).join("\n");
  }

  const lines = cleaned
    .split(/\n+/)
    .flatMap((line) => line.split("•"))
    .map((line) => line.replace(/^\s*(?:[-*]|•)\s+/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((line) => line.replace(CASUAL_OPENER, "").trim())
    .filter(Boolean);

  if (!lines.length) return "";
  if (lines.length === 1) return lines[0];

  const opener = ensurePeriod(lines[0]);
  const rest = lines.slice(1).map((line) => ensurePeriod(line));
  if (rest.length === 1) return `${opener} ${rest[0]}`.replace(/\s+/g, " ").trim();
  if (rest.length === 2) {
    return `${opener} For example, ${lowerFirst(rest[0])} ${rest[1]}`.replace(/\s+/g, " ").trim();
  }
  const mid = rest.slice(0, -1).map((line, index) => (index === 0 ? lowerFirst(line) : line)).join(" ");
  const last = lowerFirst(rest[rest.length - 1]);
  return `${opener} For example, ${mid} From a production perspective, ${last}`.replace(/\s+/g, " ").trim();
}

/** @deprecated Use toSpokenAnswer. Kept so older call sites keep compiling. */
export function toParakeetScript(text: string) {
  return toSpokenAnswer(text);
}

export type AnswerQuality = {
  ok: boolean;
  reason: "ok" | "code_dump" | "titled_box" | "wikipedia_paragraph" | "generic_ai" | "empty" | "bullet_notes" | "invented";
};

export function scoreEmployeeAnswer(answer: string, askedForCode = false, keepPoints = false): AnswerQuality {
  const text = String(answer || "").trim();
  if (!text) return { ok: false, reason: "empty" };
  if (CATCH_PHRASE.test(text)) return { ok: true, reason: "ok" };
  if (INVENTED_FICTION.test(text)) return { ok: false, reason: "invented" };
  if (!askedForCode && FUNCTION_CATALOG.test(text)) return { ok: false, reason: "generic_ai" };
  if (!askedForCode && looksLikeCodeDump(text)) return { ok: false, reason: "code_dump" };
  if (TITLED_BOX.test(text) || ALL_CAPS_TITLE.test(text)) return { ok: false, reason: "titled_box" };
  if (GENERIC_AI.test(text) || EVASIVE.test(text)) return { ok: false, reason: "generic_ai" };
  if (!askedForCode && !keepPoints && looksLikeBulletNotes(text)) return { ok: false, reason: "bullet_notes" };
  if (!askedForCode && WIKIPEDIA_OPENER.test(text)) return { ok: false, reason: "wikipedia_paragraph" };
  if (!askedForCode && CASUAL_OPENER.test(text)) return { ok: false, reason: "generic_ai" };
  if (!askedForCode && !SPOKEN_MARKER.test(text)) return { ok: false, reason: "wikipedia_paragraph" };
  if (!askedForCode && !keepPoints && looksThinInterview(text)) return { ok: false, reason: "wikipedia_paragraph" };
  if (!askedForCode && !STRONG_POINT.test(text) && !(keepPoints && /•/.test(text))) return { ok: false, reason: "wikipedia_paragraph" };
  return { ok: true, reason: "ok" };
}
