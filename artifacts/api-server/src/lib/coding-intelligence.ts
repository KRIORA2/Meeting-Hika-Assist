/**
 * Deterministic coding interview layer (no extra LLM call):
 * classify language/task → planner/prompt uses the spec → one GPT call → validate/repair code.
 */

export type CodingLanguage = "sql" | "python" | "pyspark" | "spark" | "pandas" | "adf" | "bash" | "unknown";
export type CodingDialect = "ansi" | "tsql" | "databricks_sql" | "spark_sql" | "postgres" | "generic" | "";

export type CodingSpec = {
  isCodingQuestion: boolean;
  language: CodingLanguage;
  dialect: CodingDialect;
  codingTask: string;
  codingOperation: string;
  businessKey: string;
  orderingColumn: string;
  keepStrategy: string;
  inputSchema: string;
  outputExpectation: string;
  constraints: string[];
  edgeCases: string[];
  requiredLibraries: string[];
  expectedComplexity: "simple" | "normal" | "complex";
  candidateExperienceRelevance: string;
};

const PROCESS_NOT_CODE = /(handle this situation|provide access|grant access|onboard|new (resource|user))/i;
const THEORY_STEM = /^(what is|what are|what's|explain|define |how does .{0,80} work)\b/i;
const HOW_YOU = /^(how (do|would|can) (you|we)\b)/i;
const IMPERATIVE = /^(can you |could you |please |now |okay,? )?(write|show|give|paste|provide)\b/i;
const CODE_NOUN = /\b(code|sql|query|script|snippet|pyspark|python|merge|scd|scd1|scd2|window)\b/i;
const EXPLICIT_CODE = /sample code|executable code|\bsql for\b|sql query|pyspark code|python code|write a (merge|cte|query|select)|write the (merge|query|code)|show me (the |a )?(sql|code|query|merge)|give me the code/i;
const PROBLEM_PROMPT = /^(find|remove|dedupe|deduplicate|keep|return|select) (the )?(duplicate|latest|second highest|nth |top n)/i;
const CONVERT = /(convert .{0,40} to (sql|pyspark|python)|do (it|that|the same) in (sql|pyspark|python|spark)|make it (sql|pyspark|python))/i;
const CODING_FOLLOW = /^(can you |could you |now |and |okay,? )?(optimize that|handle (duplicates|nulls)|convert|do (it|that|the same)|make it|write (it|the code)|show (it|the code)|in pyspark|in sql|in python|what if |add |also )/i;
const SQL_CLAUSE_LINE = /^\s*(WHEN (NOT )?MATCHED|MERGE INTO|SELECT|FROM|WHERE|GROUP BY|ORDER BY|PARTITION BY|INSERT( INTO)?|UPDATE|DELETE|CASE|ELSE|END|UNION|HAVING|JOIN|INNER JOIN|LEFT JOIN|RIGHT JOIN|FULL JOIN|WITH|USING|QUALIFY|CREATE TABLE|VALUES|SET)\b/i;

export function isCodingQuestion(text: string, previousIntent?: string): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  if (PROCESS_NOT_CODE.test(t) && !EXPLICIT_CODE.test(t) && !IMPERATIVE.test(t)) return false;
  if (THEORY_STEM.test(t) && !EXPLICIT_CODE.test(t) && !IMPERATIVE.test(t)) return false;
  if (HOW_YOU.test(t) && !EXPLICIT_CODE.test(t) && !CONVERT.test(t)) return false;
  if (EXPLICIT_CODE.test(t) || PROBLEM_PROMPT.test(t) || CONVERT.test(t)) return true;
  if (IMPERATIVE.test(t) && CODE_NOUN.test(t)) return true;
  if (/\b(write|show|give)\b.{0,40}\b(scd|scd1|scd2|pyspark|sql|python)\b/i.test(t)) return true;
  if (previousIntent === "coding" && CODING_FOLLOW.test(t)) return true;
  return false;
}

export function extractCodingSpec(
  question: string,
  previous?: { intent?: string; coding?: CodingSpec | null; technologies?: string[] } | null,
): CodingSpec {
  const t = String(question || "").replace(/\s+/g, " ").trim();
  const prev = previous?.coding;
  const follow = Boolean(previous?.intent === "coding" && (CODING_FOLLOW.test(t) || isCodingQuestion(t, previous.intent)));
  const coding = isCodingQuestion(t, previous?.intent);
  let language = detectLanguage(t, follow ? prev?.language : undefined);
  if (language === "unknown" && /duplicate|latest record|salary|join |select /i.test(t)) language = "sql";
  const dialect = detectDialect(t, language, follow ? prev?.dialect : undefined, previous?.technologies);
  const operation = detectOperation(t, follow ? prev?.codingOperation : "");
  const keys = detectKeys(t, prev);
  return {
    isCodingQuestion: coding,
    language,
    dialect,
    codingTask: taskFor(language, operation),
    codingOperation: operation,
    businessKey: keys.businessKey,
    orderingColumn: keys.orderingColumn,
    keepStrategy: keys.keepStrategy,
    inputSchema: keys.businessKey ? `rows keyed by ${keys.businessKey}` : "",
    outputExpectation: outputFor(operation, keys),
    constraints: constraintsFor(t, operation, keys, dialect),
    edgeCases: edgeCasesFor(t, operation),
    requiredLibraries: librariesFor(language, t, operation),
    expectedComplexity: /scd type 2|window|pagination|incremental|10 million|skew/i.test(t)
      ? "complex"
      : /merge|dedup|join|api/i.test(t)
        ? "normal"
        : "simple",
    candidateExperienceRelevance: follow ? "Modify the previous snippet; do not restart from theory." : "",
  };
}

export function defaultCodingSpec(language: CodingLanguage = "sql"): CodingSpec {
  return {
    isCodingQuestion: true,
    language,
    dialect: language === "sql" ? "generic" : "",
    codingTask: "snippet",
    codingOperation: language === "sql" ? "merge" : "snippet",
    businessKey: "",
    orderingColumn: "",
    keepStrategy: "",
    inputSchema: "",
    outputExpectation: "",
    constraints: [],
    edgeCases: [],
    requiredLibraries: [],
    expectedComplexity: "normal",
    candidateExperienceRelevance: "",
  };
}

export function codingPlanLines(spec: CodingSpec | null | undefined): string[] {
  if (!spec?.isCodingQuestion) {
    return ["Complete fenced code first, then 1–2 spoken sentences."];
  }
  const lines = [
    `Complete ${spec.language.toUpperCase()} first in a fenced block, then 1–2 spoken sentences.`,
    dialectRule(spec),
  ];
  if (spec.codingOperation === "merge" || spec.codingOperation === "scd1") {
    lines.push("If MERGE is used it MUST include WHEN MATCHED THEN UPDATE SET and WHEN NOT MATCHED THEN INSERT. Never omit those clauses.");
    lines.push("SCD Type 1: matched business key updates attributes; new key inserts; no history versions.");
  }
  if (spec.codingOperation === "scd2") {
    lines.push("SCD Type 2: expire the current row AND insert a new version for changed keys. WHEN NOT MATCHED INSERT alone is Type 1-shaped — matched changes still need a new version row.");
  }
  if (spec.codingOperation === "deduplication") {
    lines.push(spec.businessKey
      ? `Deduplicate on ${spec.businessKey}${spec.orderingColumn ? `, ${spec.keepStrategy || "keep latest"} by ${spec.orderingColumn}` : " (exact duplicate rows if no order is named)"}.`
      : "If no key is named, drop exact duplicate rows.");
  }
  if (spec.codingOperation === "ranking") {
    lines.push("Use a portable ranking pattern (ROW_NUMBER/RANK or equivalent). State the tie-breaker.");
  }
  if (spec.language === "pyspark" || spec.language === "spark") {
    lines.push("Include required imports (pyspark.sql.functions, Window when using row_number/rank). Assume a SparkSession named spark unless you create one.");
  }
  if (spec.language === "python" && spec.codingOperation === "api") {
    lines.push("Include requests/json, pagination, and error handling in one runnable snippet.");
  }
  if (spec.businessKey) lines.push(`Business key: ${spec.businessKey}.`);
  if (spec.orderingColumn) lines.push(`Order by ${spec.orderingColumn} and ${spec.keepStrategy || "keep the latest row"}.`);
  if (spec.requiredLibraries.length) lines.push(`Include imports: ${spec.requiredLibraries.join(", ")}.`);
  if (spec.candidateExperienceRelevance) lines.push(spec.candidateExperienceRelevance);
  lines.push(...spec.constraints, ...spec.edgeCases.slice(0, 3));
  return lines.filter(Boolean);
}

const SCHEMA_ECHO = /fenced complete code first[^.!\n]*|complete executable snippet/gi;

export function hasExecutableCode(text: string): boolean {
  return looksLikeCode(extractCode(text));
}

export function formatCodingAnswer(text: string, spec: CodingSpec): string {
  let answer = String(text || "").trim();
  if (!answer) return "";
  answer = answer.replace(/```[a-zA-Z0-9_-]*\n\s*```/g, "");
  answer = answer.replace(SCHEMA_ECHO, "").replace(/\n{3,}/g, "\n\n").trim();
  answer = preferCodeFirst(answer, spec.language);
  answer = repairIncompleteMerge(answer);
  answer = ensurePysparkImports(answer, spec);
  return answer.replace(/\n{4,}/g, "\n\n").trim();
}

export function validateCodingAnswer(text: string, spec: CodingSpec): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const code = extractCode(text);
  if (!code || !looksLikeCode(code)) {
    issues.push("missing_code");
    return { ok: false, issues };
  }
  if (balance(code, "(", ")") !== 0) issues.push("unbalanced_parentheses");
  if (balance(code, "[", "]") !== 0) issues.push("unbalanced_brackets");
  if ((code.match(/'/g) || []).length % 2 === 1 && (code.match(/"/g) || []).length % 2 === 1) {
    issues.push("unbalanced_quotes");
  }
  if (spec.language === "sql" || /\bMERGE\b/i.test(code)) {
    issues.push(...mergeIssues(code, spec));
    if (/\bCASE\b/i.test(code) && !/\bEND\b/i.test(code)) issues.push("incomplete_case");
    if (/\bWITH\s+\w+/i.test(code) && !/\bSELECT\b/i.test(code)) issues.push("incomplete_cte");
    if (/\bUPDATE\b/i.test(code) && !/\bSET\b/i.test(code)) issues.push("incomplete_update");
    if (/\bINSERT\s+INTO\b/i.test(code) && !/\b(VALUES|SELECT)\b/i.test(code)) issues.push("incomplete_insert");
    if (spec.codingOperation === "scd2" && !/(effective|valid_from|start_date|is_current|current_flag|end_date)/i.test(code)) {
      issues.push("scd2_missing_history_fields");
    }
  }
  if (spec.language === "python" || spec.language === "pyspark") {
    if (/Window\.partitionBy/.test(code) && !/from pyspark\.sql\.window import Window/.test(code)) {
      issues.push("missing_window_import");
    }
    if (/\brow_number\s*\(/.test(code) && !/pyspark\.sql\.functions/.test(code) && spec.language === "pyspark") {
      issues.push("missing_functions_import");
    }
    if (/SparkSession\.builder/.test(code) && !/from pyspark\.sql import SparkSession/.test(code)) {
      issues.push("missing_sparksession_import");
    }
    if (/\bdef\s+\w+\s*\([^)]*\)\s*$/m.test(code)) issues.push("missing_colon");
  }
  return { ok: issues.length === 0, issues };
}

export function isSqlClauseLine(line: string): boolean {
  return SQL_CLAUSE_LINE.test(line);
}

function detectLanguage(t: string, fallback?: CodingLanguage): CodingLanguage {
  if (/\bpyspark\b|spark\.sql|dataframe/i.test(t)) return "pyspark";
  if (/\bspark sql\b/i.test(t)) return "spark";
  if (/\bpandas\b/i.test(t)) return "pandas";
  if (/\b(t-?sql|sql server)\b/i.test(t)) return "sql";
  if (/\b(sql|merge|select |cte|query)\b/i.test(t) && !/\bpython\b/i.test(t)) return "sql";
  if (/\bpython\b/i.test(t)) return "python";
  if (/\badf expression|data factory expression/i.test(t)) return "adf";
  if (/\b(bash|shell)\b/i.test(t)) return "bash";
  return fallback && fallback !== "unknown" ? fallback : "unknown";
}

function detectDialect(
  t: string,
  language: CodingLanguage,
  fallback?: CodingDialect,
  technologies?: string[],
): CodingDialect {
  if (language !== "sql" && language !== "spark") return fallback || "";
  if (/\b(t-?sql|sql server)\b/i.test(t)) return "tsql";
  if (/\bpostgres|postgresql\b/i.test(t)) return "postgres";
  if (/\bdatabricks sql\b/i.test(t)) return "databricks_sql";
  if (/\bspark sql\b/i.test(t)) return "spark_sql";
  if ((/\bdatabricks\b/i.test(t) || technologies?.some((item) => /databricks/i.test(item))) && /\bmerge\b/i.test(t)) {
    return "databricks_sql";
  }
  if (fallback) return fallback;
  return language === "sql" ? "generic" : "";
}

function detectOperation(t: string, fallback = ""): string {
  if (/\bscd(\s*type)?\s*2\b|type\s*ii\b/i.test(t)) return "scd2";
  if (/\bscd(\s*type)?\s*1\b|type\s*i\b/i.test(t)) return "scd1";
  if (/\bmerge\b|\bupsert\b/i.test(t)) return "merge";
  if (/\bsecond (highest|largest)|top n|nth |\brank\b/i.test(t)) return "ranking";
  if (/\bdedup|duplicates?|latest record|row_number/i.test(t)) return "deduplication";
  if (/\bpaginat|rest api|requests\.|json api/i.test(t)) return "api";
  if (/\banti.?join|not in\b|in a but not/i.test(t)) return "anti_join";
  if (/\bjoin\b/i.test(t)) return "join";
  if (/\bgroup by|aggregat/i.test(t)) return "aggregation";
  if (/\bincremental|cdc\b/i.test(t)) return "incremental";
  if (/\bwindow\b/i.test(t)) return "window";
  if (/\bexplod/i.test(t)) return "explode";
  if (/\bflatten|nested json/i.test(t)) return "flatten";
  if (/\bretry|backoff/i.test(t)) return "retry";
  return fallback || "snippet";
}

function detectKeys(t: string, prev?: CodingSpec | null) {
  const keyHit = t.match(/\b(?:based on|on|by|key|per)\s+([a-z_][a-z0-9_]*)/i);
  const orderHit = t.match(/\b(latest|recent|updated|timestamp|updated_at|event_time|load_date)\b/i);
  const skipped = /^(sql|code|query|table|record|customer)$/i;
  const businessKey = keyHit?.[1] && !skipped.test(keyHit[1])
    ? keyHit[1]
    : /customer/i.test(t)
      ? "customer_id"
      : prev?.businessKey || "";
  const orderingColumn = /latest|recent|timestamp|updated/i.test(t)
    ? (orderHit?.[1] && /_/.test(orderHit[1]) ? orderHit[1] : prev?.orderingColumn || "updated_at")
    : prev?.orderingColumn || "";
  const keepStrategy = /latest|recent/i.test(t) ? "keep latest" : /oldest/i.test(t) ? "keep oldest" : prev?.keepStrategy || "";
  return { businessKey, orderingColumn, keepStrategy };
}

function taskFor(language: CodingLanguage, operation: string): string {
  if (operation === "api") return "API ingestion";
  if (operation.startsWith("scd")) return "slowly changing dimension";
  if (language === "sql") return "query";
  if (language === "pyspark") return "transformation";
  return "snippet";
}

function outputFor(operation: string, keys: { businessKey: string; keepStrategy: string }): string {
  if (operation === "scd1") return "in-place update of matching keys and insert of new keys";
  if (operation === "scd2") return "historical versions with current row closed and new version inserted";
  if (operation === "deduplication") return keys.keepStrategy || "one row per key";
  if (operation === "merge") return "upsert target from source";
  return "";
}

function constraintsFor(
  t: string,
  operation: string,
  keys: { businessKey: string; orderingColumn: string; keepStrategy: string },
  dialect: CodingDialect,
): string[] {
  const items: string[] = [];
  if (operation === "deduplication" && !keys.businessKey) {
    items.push("If no key is named, drop exact duplicate rows or use a clear customer_id default.");
  }
  if (/null/i.test(t)) items.push("Handle null keys without collapsing unrelated rows.");
  if (/10 million|at scale|skew/i.test(t)) items.push("Prefer set-based or Spark operations over row loops.");
  if (dialect === "generic" || dialect === "ansi") {
    items.push("Prefer portable SQL; avoid QUALIFY, TOP, DATEADD, GETDATE, TRY_CAST, ILIKE unless the dialect needs them.");
  }
  if (dialect === "tsql") items.push("Use SQL Server-compatible syntax (TOP, GETDATE) rather than LIMIT.");
  if (dialect === "databricks_sql") items.push("Use Databricks SQL / Delta-compatible MERGE syntax.");
  return items;
}

function edgeCasesFor(t: string, operation: string): string[] {
  const items: string[] = [];
  if (operation === "merge" || operation.startsWith("scd")) items.push("Mention duplicate source keys as the edge case.");
  if (operation === "deduplication" || operation === "ranking") items.push("Mention a deterministic tie-breaker when timestamps collide.");
  if (/null/i.test(t)) items.push("Null timestamps must not silently drop the row.");
  return items;
}

function librariesFor(language: CodingLanguage, t: string, operation: string): string[] {
  if (language === "pyspark") {
    const libs = ["pyspark.sql.functions"];
    if (/window|row_number|rank|latest/i.test(t) || operation === "deduplication" || operation === "scd2" || operation === "ranking") {
      libs.push("pyspark.sql.window");
    }
    return libs;
  }
  if (language === "python" && (operation === "api" || operation === "retry")) return ["requests", "json"];
  return [];
}

function dialectRule(spec: CodingSpec): string {
  if (spec.dialect && spec.dialect !== "generic") return `Dialect=${spec.dialect}. Do not mix vendor syntax.`;
  return "Use portable syntax unless the dialect is named.";
}

function looksLikeCode(code: string): boolean {
  return /\b(MERGE\s+INTO|SELECT\s+\S+|WITH\s+\w+\s+AS|INSERT\s+INTO|UPDATE\s+\w+|CREATE\s+TABLE|from pyspark\.sql|SparkSession|def\s+\w+\s*\(|^(import|from)\s+\w+|dropDuplicates|row_number\s*\()/im.test(code);
}

function extractCode(text: string): string {
  const fences = [...String(text || "").matchAll(/```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g)].filter((match) => String(match[1] || "").trim());
  if (fences.length) return fences.map((match) => match[1] || "").join("\n");
  const start = String(text || "").search(/\b(MERGE\s+INTO|SELECT\s+|WITH\s+\w+\s+AS|INSERT\s+INTO|UPDATE\s+\w+|CREATE\s+TABLE|from pyspark|SparkSession|^\s*def |^import )/im);
  return start >= 0 ? String(text).slice(start) : String(text || "");
}

function preferCodeFirst(text: string, language: CodingLanguage): string {
  const fenceLang = language === "unknown" ? "sql" : language === "pyspark" || language === "pandas" ? "python" : language;
  const fences = [...text.matchAll(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g)].filter((match) => match[2].trim());
  if (fences.length) {
    const first = fences[0];
    const block = `\`\`\`${first[1] || fenceLang}\n${first[2].trim()}\n\`\`\``;
    let rest = text;
    for (const match of fences) rest = rest.replace(match[0], "");
    rest = rest.replace(/```[a-zA-Z0-9_-]*\n\s*```/g, "").replace(/\n{3,}/g, "\n\n").trim();
    return rest ? `${block}\n\n${rest}` : block;
  }
  const code = extractCode(text);
  if (code && looksLikeCode(code)) {
    const prose = code === text ? "" : text.replace(code, "").replace(/\n{3,}/g, "\n\n").trim();
    return prose ? `\`\`\`${fenceLang}\n${code.trim()}\n\`\`\`\n\n${prose}` : `\`\`\`${fenceLang}\n${code.trim()}\n\`\`\``;
  }
  return text;
}

function mergeIssues(sql: string, spec: CodingSpec): string[] {
  if (!/\bMERGE\b/i.test(sql)) return [];
  const issues: string[] = [];
  if (!/\bUSING\b/i.test(sql)) issues.push("merge_missing_using");
  if (!/\bON\b/i.test(sql)) issues.push("merge_missing_on");
  const upsert = spec.codingOperation === "merge" || spec.codingOperation === "scd1" || spec.codingOperation === "scd2"
    || /\bUPDATE\s+SET\b/i.test(sql) || /\bINSERT\b/i.test(sql);
  if (upsert && !/\bWHEN\s+MATCHED\b/i.test(sql)) issues.push("merge_missing_when_matched");
  if (upsert && !/\bWHEN\s+NOT\s+MATCHED\b/i.test(sql)) issues.push("merge_missing_when_not_matched");
  return issues;
}

export function repairIncompleteMerge(text: string): string {
  if (!/\bMERGE\b/i.test(text)) return text;
  let next = text;
  if (/\bUPDATE\s+SET\b/i.test(next) && !/\bWHEN\s+MATCHED\b/i.test(next)) {
    next = next.replace(/(\bON\b[\s\S]*?)(\s*)(UPDATE\s+SET)/i, "$1\nWHEN MATCHED THEN\n$3");
    if (!/\bWHEN\s+MATCHED\b/i.test(next)) {
      next = next.replace(/(\bUPDATE\s+SET)/i, "WHEN MATCHED THEN\n$1");
    }
  }
  if (/\bINSERT\b/i.test(next) && !/\bWHEN\s+NOT\s+MATCHED\b/i.test(next)) {
    next = next.replace(/(\bUPDATE\s+SET[\s\S]*?)(\s*)(INSERT\b)/i, "$1\nWHEN NOT MATCHED THEN\n$3");
    if (!/\bWHEN\s+NOT\s+MATCHED\b/i.test(next)) {
      next = next.replace(/(\bINSERT\b)/i, "WHEN NOT MATCHED THEN\n$1");
    }
  }
  return next;
}

function ensurePysparkImports(text: string, spec: CodingSpec): string {
  if (spec.language !== "pyspark" && spec.language !== "spark") return text;
  const code = extractCode(text);
  const missing: string[] = [];
  if (/SparkSession\.builder/.test(code) && !/from pyspark\.sql import SparkSession/.test(text)) {
    missing.push("from pyspark.sql import SparkSession");
  }
  if (/Window\.partitionBy|\brow_number\s*\(/.test(code) && !/from pyspark\.sql\.window import Window/.test(text)) {
    missing.push("from pyspark.sql.window import Window");
  }
  if (/\b(row_number|col|lit|when|desc|sum|count|max)\s*\(/.test(code) && !/pyspark\.sql\.functions/.test(text)) {
    missing.push("from pyspark.sql.functions import col, row_number, desc, when, lit");
  }
  if (!missing.length) return text;
  const block = text.match(/```(?:python|py|pyspark)?\n([\s\S]*?)```/i);
  if (!block) return `${missing.join("\n")}\n${text}`;
  const injected = `${missing.join("\n")}\n${block[1]}`;
  return text.replace(block[0], `\`\`\`python\n${injected}\`\`\``);
}

function balance(text: string, open: string, close: string): number {
  let n = 0;
  for (const ch of text) {
    if (ch === open) n += 1;
    else if (ch === close) n -= 1;
  }
  return n;
}
