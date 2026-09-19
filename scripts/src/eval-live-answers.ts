/**
 * Live evaluation of the SAME production path used by POST /openai/analyze:
 * question → finalize → analyze → fingerprint → session → retrieve → plan
 * → generateInterviewAnswer → one streaming GPT call → repetition/grounding/quality.
 *
 * Usage: pnpm verify:live-answers
 * Live GPT runs only when a real OPENAI_API_KEY is loaded from .env.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateInterviewAnswer } from "../../artifacts/api-server/src/lib/answer-generator.ts";
import { scoreEmployeeAnswer, scoreSpokenStyle } from "../../artifacts/api-server/src/lib/answer-quality.ts";
import { rewriteUngroundedExperience } from "../../artifacts/api-server/src/lib/candidate-grounding.ts";
import type { PersonaCard } from "../../artifacts/api-server/src/lib/persona.ts";
import { analyzeQuestion } from "../../artifacts/api-server/src/lib/question-analyzer.ts";
import { isIncompleteQuestion } from "../../artifacts/api-server/src/lib/question-finalizer.ts";
import { conceptSequence, tokenOverlap } from "../../artifacts/api-server/src/lib/repetition-guard.ts";

function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("=").trim().replace(/^['"]|['"]$/g, "");
      if (key && !process.env[key]) process.env[key] = value;
    }
  } catch {
    // missing env files are allowed
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
loadEnvFile(resolve(repoRoot, ".env"));
loadEnvFile(resolve(repoRoot, "artifacts/api-server/.env"));
if (!process.env.HIKA_SKIP_MEMORY_PERSIST) process.env.HIKA_SKIP_MEMORY_PERSIST = "1";

function hasLiveOpenAiKey(): boolean {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key) return false;
  if (/^your-openai-api-key/i.test(key)) return false;
  if (key.length < 20) return false;
  return true;
}

const LIVE = hasLiveOpenAiKey();
const SMOKE = process.env.LIVE_EVAL_SMOKE === "1";

function loadPreviousAnswers(): Map<string, string> {
  try {
    const prev = JSON.parse(readFileSync(resolve(repoRoot, "scripts/eval-live-results.json"), "utf8"));
    const map = new Map<string, string>();
    const bundle = prev.liveBundle || {};
    for (const group of Object.values(bundle)) {
      if (!Array.isArray(group)) continue;
      for (const row of group as Array<Record<string, unknown>>) {
        if (typeof row.question === "string" && typeof row.finalAnswer === "string" && row.finalAnswer) {
          map.set(row.question, row.finalAnswer);
        }
      }
    }
    return map;
  } catch {
    return new Map();
  }
}
const previousAnswers = loadPreviousAnswers();

const resumeAdf: PersonaCard = {
  card: "Skills: adf, databricks, pyspark, sql",
  name: "Eval",
  skills: ["adf", "databricks", "pyspark", "sql"],
  hasResume: true,
  hasJd: false,
  docIds: [],
  facts: [{ fact: "Worked with ADF and Databricks", source: "resume.pdf", confidence: 0.98, kind: "skill" }],
  experienceYears: 5,
  technologies: ["adf", "databricks", "pyspark", "sql"],
};

type SuiteCase = {
  domain: string;
  q: string;
  intent?: string;
  topic?: string;
  followUp?: boolean;
  relation?: string;
  incomplete?: boolean;
  live?: boolean;
  session?: string;
  persist?: boolean;
  noFabricate?: string[];
  retrievalWant?: string[];
  retrievalAvoid?: string[];
  complexity?: "simple" | "normal" | "complex";
};

const isolated: SuiteCase[] = [
  { domain: "ADF", q: "What is Azure Data Factory?", intent: "definition", topic: "adf", complexity: "simple", retrievalWant: ["adf"] },
  { domain: "ADF", q: "Why would you use ADF?", intent: "why", topic: "adf", complexity: "simple" },
  { domain: "ADF", q: "How do you design a metadata-driven ADF framework?", intent: "how_to_design", topic: "adf", complexity: "complex" },
  { domain: "ADF", q: "How do you implement incremental loading in ADF?", intent: "how_to_implement", complexity: "normal", retrievalWant: ["incremental"] },
  { domain: "ADF", q: "How do you monitor ADF pipelines?", intent: "how_to_monitor", topic: "adf", complexity: "normal" },
  { domain: "ADF", q: "How do you troubleshoot a failed pipeline?", intent: "troubleshooting", complexity: "normal" },
  { domain: "ADF", q: "How do you control concurrency in ADF?", intent: "how_to_configure", topic: "adf", complexity: "normal" },
  { domain: "ADF", q: "How do you secure ADF?", intent: "security", topic: "adf", complexity: "normal" },
  { domain: "ADF", q: "How do you implement CI/CD for ADF?", intent: "how_to_implement", complexity: "normal", retrievalWant: ["devops", "adf"] },
  { domain: "ADF", q: "How do you process 100 tables dynamically?", intent: "how_to_process", complexity: "complex" },
  { domain: "ADF", q: "How would you handle a self-hosted IR failure?", intent: "how_to_handle", topic: "adf", complexity: "normal" },
  { domain: "ADF", q: "How do you handle a source system being unavailable?", intent: "how_to_handle", complexity: "normal" },
  { domain: "ADF", q: "ADF vs Databricks?", intent: "comparison", complexity: "normal" },
  { domain: "Databricks", q: "What is Databricks?", intent: "definition", topic: "databricks", complexity: "simple", retrievalWant: ["databricks"] },
  { domain: "Databricks", q: "Why Databricks?", intent: "why", topic: "databricks", complexity: "simple" },
  { domain: "Databricks", q: "How do you optimize a Databricks job?", intent: "optimization", topic: "databricks", complexity: "normal" },
  { domain: "Databricks", q: "Why is my Databricks job slow?", intent: "troubleshooting", topic: "databricks", complexity: "normal" },
  { domain: "Databricks", q: "How do you handle data skew?", intent: "how_to_handle", complexity: "normal", retrievalWant: ["spark"] },
  { domain: "Databricks", q: "How do you optimize joins?", intent: "optimization", complexity: "normal" },
  { domain: "Databricks", q: "How do you handle small files?", intent: "how_to_handle", complexity: "normal" },
  { domain: "Databricks", q: "How do you design Databricks clusters?", intent: "how_to_design", topic: "databricks", complexity: "normal" },
  { domain: "Databricks", q: "Job cluster vs all-purpose cluster?", intent: "comparison", topic: "databricks", complexity: "simple" },
  { domain: "Databricks", q: "How do you secure Databricks?", intent: "security", topic: "databricks", complexity: "normal" },
  { domain: "Databricks", q: "How do you use Unity Catalog?", intent: "how_to_implement", topic: "unity", complexity: "normal", retrievalWant: ["unity"] },
  { domain: "Databricks", q: "How do you deploy Databricks notebooks?", intent: "how_to_deploy", topic: "databricks", complexity: "normal" },
  { domain: "Databricks", q: "How do you troubleshoot executor OOM?", intent: "troubleshooting", complexity: "normal" },
  { domain: "Databricks", q: "How would you process 10 TB?", intent: "scalability", complexity: "complex" },
  { domain: "Spark", q: "Explain Spark architecture.", intent: "architecture", topic: "spark", complexity: "normal", retrievalWant: ["spark"] },
  { domain: "Spark", q: "What happens when a Spark job runs?", intent: "how_to_process", topic: "spark", complexity: "normal" },
  { domain: "Spark", q: "Why is Spark lazy?", intent: "why", topic: "spark", complexity: "simple" },
  { domain: "Spark", q: "Transformation vs action?", intent: "comparison", topic: "spark", complexity: "simple" },
  { domain: "Spark", q: "How does partitioning work?", intent: "how_to_implement", complexity: "normal" },
  { domain: "Spark", q: "repartition vs coalesce?", intent: "comparison", complexity: "simple" },
  { domain: "Spark", q: "How do you optimize a Spark join?", intent: "optimization", topic: "spark", complexity: "normal" },
  { domain: "Spark", q: "How do you handle skew?", intent: "how_to_handle", complexity: "normal" },
  { domain: "Spark", q: "How do you remove duplicates?", intent: "how_to_implement", complexity: "normal" },
  { domain: "Spark", q: "How do you optimize PySpark?", intent: "optimization", topic: "spark", complexity: "normal" },
  { domain: "Spark", q: "Why avoid Python UDFs?", intent: "why", complexity: "simple" },
  { domain: "Spark", q: "What causes executor OOM?", intent: "troubleshooting", complexity: "normal" },
  { domain: "Spark", q: "How do you implement SCD2 in PySpark?", intent: "how_to_implement", complexity: "complex" },
  { domain: "Spark", q: "Write a PySpark query to remove duplicates", intent: "coding", complexity: "normal" },
  { domain: "SQL", q: "Find duplicate records.", intent: "coding", complexity: "simple" },
  { domain: "SQL", q: "Find the latest record for every customer.", intent: "coding", complexity: "simple" },
  { domain: "SQL", q: "Write a MERGE statement.", intent: "coding", complexity: "normal" },
  { domain: "SQL", q: "Write a sample SQL MERGE for SCD Type 1.", intent: "coding", complexity: "normal" },
  { domain: "SQL", q: "Write SQL for SCD Type 2.", intent: "coding", topic: "scd", complexity: "complex" },
  { domain: "SQL", q: "Write a SQL query to find the second highest salary.", intent: "coding", complexity: "normal" },
  { domain: "Python", q: "Write Python code to find the second largest number.", intent: "coding", complexity: "simple" },
  { domain: "Python", q: "Write Python code to read a JSON API and handle pagination.", intent: "coding", complexity: "normal" },
  { domain: "Spark", q: "Write PySpark code to keep the latest record per customer.", intent: "coding", complexity: "normal" },
  { domain: "Spark", q: "Write PySpark code to join two DataFrames.", intent: "coding", complexity: "normal" },
  { domain: "SQL", q: "Implement SCD Type 2.", intent: "how_to_implement", topic: "scd", complexity: "complex" },
  { domain: "SQL", q: "Explain ROW_NUMBER.", intent: "definition", topic: "sql", complexity: "simple" },
  { domain: "SQL", q: "RANK vs DENSE_RANK.", intent: "comparison", complexity: "simple" },
  { domain: "SQL", q: "WHERE vs HAVING.", intent: "comparison", complexity: "simple" },
  { domain: "SQL", q: "How do you optimize a slow query?", intent: "optimization", complexity: "normal" },
  { domain: "SQL", q: "How do you read an execution plan?", intent: "how_to_implement", complexity: "normal" },
  { domain: "SQL", q: "How do you implement incremental processing in SQL?", intent: "how_to_implement", complexity: "normal" },
  { domain: "Delta", q: "What is Delta Lake?", intent: "definition", topic: "delta", complexity: "simple", retrievalWant: ["delta"], retrievalAvoid: ["adf"] },
  { domain: "Delta", q: "Why Delta instead of Parquet?", intent: "why", topic: "delta", complexity: "simple" },
  { domain: "Delta", q: "How does Delta provide ACID?", intent: "how_to_implement", topic: "delta", complexity: "normal" },
  { domain: "Delta", q: "How does MERGE work?", intent: "how_to_implement", complexity: "normal" },
  { domain: "Delta", q: "What is Time Travel?", intent: "definition", complexity: "simple" },
  { domain: "Delta", q: "What does VACUUM do?", intent: "definition", topic: "delta", complexity: "simple" },
  { domain: "Delta", q: "How do you optimize Delta tables?", intent: "optimization", topic: "delta", complexity: "normal" },
  { domain: "Delta", q: "How do you handle small files?", intent: "how_to_handle", complexity: "normal" },
  { domain: "Delta", q: "How do you handle schema evolution?", intent: "how_to_handle", complexity: "normal" },
  { domain: "Delta", q: "How do you implement SCD2?", intent: "how_to_implement", topic: "scd", complexity: "complex" },
  { domain: "Delta", q: "What are Delta pipeline expectations?", intent: "definition", topic: "dlt", complexity: "normal" },
  { domain: "Delta", q: "How do you handle bad records?", intent: "how_to_handle", complexity: "normal" },
  { domain: "Fabric", q: "What is Microsoft Fabric?", intent: "definition", topic: "fabric", complexity: "simple", retrievalWant: ["fabric"], retrievalAvoid: ["adf", "watermark"] },
  { domain: "Fabric", q: "What is OneLake?", intent: "definition", topic: "fabric", complexity: "simple" },
  { domain: "Fabric", q: "What is a Fabric Lakehouse?", intent: "definition", topic: "fabric", complexity: "simple" },
  { domain: "Fabric", q: "Lakehouse vs Warehouse?", intent: "comparison", complexity: "simple" },
  { domain: "Fabric", q: "How do Fabric pipelines work?", intent: "how_to_implement", topic: "fabric", complexity: "normal" },
  { domain: "Fabric", q: "What is Direct Lake?", intent: "definition", topic: "fabric", complexity: "simple" },
  { domain: "Fabric", q: "Direct Lake vs Import?", intent: "comparison", topic: "fabric", complexity: "simple" },
  { domain: "Fabric", q: "How do you implement Fabric CI/CD?", intent: "how_to_implement", topic: "fabric", complexity: "normal" },
  { domain: "Fabric", q: "How do you secure Fabric?", intent: "security", topic: "fabric", complexity: "normal" },
  { domain: "Fabric", q: "How would you design a Fabric data platform?", intent: "how_to_design", topic: "fabric", complexity: "complex" },
  { domain: "Fabric", q: "Fabric vs Databricks?", intent: "comparison", complexity: "normal" },
  { domain: "Snowflake", q: "What is Snowflake?", intent: "definition", topic: "snowflake", complexity: "simple", retrievalWant: ["snowflake"], retrievalAvoid: ["databricks"] },
  { domain: "Snowflake", q: "Explain Snowflake architecture.", intent: "architecture", topic: "snowflake", complexity: "normal" },
  { domain: "Snowflake", q: "What are virtual warehouses?", intent: "definition", topic: "snowflake", complexity: "simple" },
  { domain: "Snowflake", q: "How do you optimize Snowflake?", intent: "optimization", topic: "snowflake", complexity: "normal" },
  { domain: "Snowflake", q: "How do you control Snowflake cost?", intent: "cost", topic: "snowflake", complexity: "normal" },
  { domain: "Snowflake", q: "What is Snowpipe?", intent: "definition", topic: "snowflake", complexity: "simple" },
  { domain: "Snowflake", q: "Streams vs Tasks?", intent: "comparison", topic: "snowflake", complexity: "simple" },
  { domain: "Snowflake", q: "What is Time Travel?", intent: "definition", complexity: "simple" },
  { domain: "Snowflake", q: "How do you secure Snowflake?", intent: "security", topic: "snowflake", complexity: "normal" },
  { domain: "Snowflake", q: "How do you implement incremental processing?", intent: "how_to_implement", complexity: "normal" },
  { domain: "PowerBI", q: "How do you design a Power BI model?", intent: "how_to_design", topic: "powerbi", complexity: "normal", retrievalWant: ["powerbi"], retrievalAvoid: ["watermark", "adf"] },
  { domain: "PowerBI", q: "Why star schema?", intent: "why", topic: "modeling", complexity: "simple" },
  { domain: "PowerBI", q: "Import vs DirectQuery?", intent: "comparison", topic: "powerbi", complexity: "simple" },
  { domain: "PowerBI", q: "What is Direct Lake?", intent: "definition", complexity: "simple" },
  { domain: "PowerBI", q: "How do you optimize Power BI?", intent: "optimization", topic: "powerbi", complexity: "normal", retrievalWant: ["powerbi", "folding", "dax"] },
  { domain: "PowerBI", q: "What is query folding?", intent: "definition", topic: "powerbi", complexity: "simple" },
  { domain: "PowerBI", q: "Measure vs calculated column?", intent: "comparison", complexity: "simple" },
  { domain: "PowerBI", q: "How do you implement RLS?", intent: "how_to_implement", topic: "powerbi", complexity: "normal" },
  { domain: "PowerBI", q: "How do you troubleshoot a slow report?", intent: "troubleshooting", complexity: "normal" },
  { domain: "PowerBI", q: "How does incremental refresh work?", intent: "how_to_implement", topic: "powerbi", complexity: "normal" },
  { domain: "PowerBI", q: "How do you deploy Power BI?", intent: "how_to_deploy", topic: "powerbi", complexity: "normal" },
  { domain: "API", q: "How do you ingest data from a REST API?", intent: "how_to_implement", topic: "api", complexity: "normal", retrievalWant: ["api"] },
  { domain: "API", q: "How do you handle pagination?", intent: "how_to_handle", topic: "api", complexity: "normal" },
  { domain: "API", q: "How do you handle API rate limits?", intent: "how_to_handle", topic: "api", complexity: "normal" },
  { domain: "API", q: "What happens with HTTP 429?", intent: "failure_handling", complexity: "simple" },
  { domain: "API", q: "How do you retry failed API calls?", intent: "how_to_handle", topic: "api", complexity: "normal" },
  { domain: "API", q: "How do you authenticate?", intent: "how_to_implement", complexity: "normal" },
  { domain: "API", q: "How do you secure API credentials?", intent: "security", topic: "api", complexity: "normal" },
  { domain: "API", q: "How do you process nested JSON?", intent: "how_to_process", complexity: "normal" },
  { domain: "API", q: "How do you implement incremental API extraction?", intent: "how_to_implement", complexity: "normal" },
  { domain: "API", q: "How do you make API ingestion idempotent?", intent: "how_to_handle", topic: "api", complexity: "normal" },
  { domain: "Kafka", q: "How does Kafka work?", intent: "how_to_implement", topic: "kafka", complexity: "normal", retrievalWant: ["kafka"], retrievalAvoid: ["adf"] },
  { domain: "Kafka", q: "What is a partition?", intent: "definition", complexity: "simple" },
  { domain: "Kafka", q: "What is a consumer group?", intent: "definition", topic: "kafka", complexity: "simple" },
  { domain: "Kafka", q: "How do offsets work?", intent: "how_to_implement", complexity: "normal" },
  { domain: "Kafka", q: "How do you handle duplicate events?", intent: "how_to_handle", complexity: "normal" },
  { domain: "Kafka", q: "How do you guarantee ordering?", intent: "how_to_implement", complexity: "normal" },
  { domain: "Kafka", q: "How do you replay messages?", intent: "how_to_implement", complexity: "normal" },
  { domain: "Kafka", q: "How do you handle late events?", intent: "how_to_handle", complexity: "normal" },
  { domain: "Kafka", q: "Kafka vs Event Hubs?", intent: "comparison", topic: "kafka", complexity: "simple" },
  { domain: "Kafka", q: "How would you design real-time ingestion?", intent: "how_to_design", complexity: "complex" },
  { domain: "CICD", q: "Explain your CI/CD process.", intent: "how_to_implement", topic: "devops", complexity: "normal", retrievalWant: ["devops"] },
  { domain: "CICD", q: "How do you deploy ADF?", intent: "how_to_deploy", topic: "adf", complexity: "normal" },
  { domain: "CICD", q: "How do you deploy Databricks?", intent: "how_to_deploy", topic: "databricks", complexity: "normal" },
  { domain: "CICD", q: "How do you promote Dev to UAT to Prod?", intent: "how_to_deploy", complexity: "normal" },
  { domain: "CICD", q: "How do you manage environment-specific configuration?", intent: "how_to_configure", complexity: "normal" },
  { domain: "CICD", q: "How do you manage secrets?", intent: "security", complexity: "normal" },
  { domain: "CICD", q: "What happens when deployment fails?", intent: "failure_handling", complexity: "normal" },
  { domain: "CICD", q: "How do you rollback?", intent: "how_to_deploy", complexity: "normal" },
  { domain: "CICD", q: "How do you handle Git conflicts?", intent: "how_to_handle", complexity: "normal" },
  { domain: "CICD", q: "How do you implement automated testing?", intent: "how_to_implement", complexity: "normal" },
  { domain: "CICD", q: "How would you deploy Fabric?", intent: "how_to_deploy", topic: "fabric", complexity: "normal" },
  { domain: "CICD", q: "How would you deploy Power BI?", intent: "how_to_deploy", topic: "powerbi", complexity: "normal" },
  { domain: "Cross", q: "How would you ingest REST API data using ADF?", intent: "how_to_implement", complexity: "complex" },
  { domain: "Cross", q: "How would you store it in ADLS?", intent: "how_to_implement", topic: "adls", complexity: "normal" },
  { domain: "Cross", q: "How would you process it in Databricks?", intent: "how_to_process", topic: "databricks", complexity: "normal" },
  { domain: "Cross", q: "Why Delta?", intent: "why", topic: "delta", complexity: "simple" },
  { domain: "Cross", q: "How would Power BI consume the curated data?", intent: "how_to_implement", topic: "powerbi", complexity: "normal" },
  { domain: "Cross", q: "How would you deploy the solution through Azure DevOps?", intent: "how_to_deploy", topic: "devops", complexity: "normal" },
  { domain: "Cross", q: "How would you secure the entire architecture?", intent: "security", complexity: "complex" },
  { domain: "Cross", q: "How would you monitor it?", intent: "how_to_monitor", complexity: "normal" },
  { domain: "Modeling", q: "How do you design a dimensional model?", intent: "how_to_design", topic: "modeling", complexity: "normal" },
  { domain: "SCD", q: "How do you implement SCD Type 2?", intent: "how_to_implement", topic: "scd", complexity: "complex" },
  { domain: "Quality", q: "How do you implement data quality checks?", intent: "data_quality", topic: "quality", complexity: "normal" },
  { domain: "Security", q: "How do you secure a data platform?", intent: "security", topic: "security", complexity: "normal" },
  { domain: "Monitoring", q: "How do you monitor a data platform?", intent: "how_to_monitor", complexity: "normal" },
  { domain: "SystemDesign", q: "How would you design a lakehouse platform?", intent: "how_to_design", complexity: "complex" },
];

const codingFollowSequence: SuiteCase[] = [
  { domain: "CodingFollow", q: "Write SQL to find the latest customer record.", intent: "coding", session: "code", persist: true, complexity: "normal" },
  { domain: "CodingFollow", q: "What if there are duplicate timestamps?", intent: "coding", followUp: true, session: "code", persist: true, complexity: "normal" },
  { domain: "CodingFollow", q: "Can you do the same in PySpark?", intent: "coding", followUp: true, session: "code", persist: true, complexity: "normal" },
];

const followUpSequence: SuiteCase[] = [
  { domain: "FollowUp", q: "How do you implement incremental loading?", intent: "how_to_implement", session: "follow", persist: true, complexity: "normal" },
  { domain: "FollowUp", q: "Why did you choose watermarking?", intent: "why", followUp: true, relation: "why_follow_up", session: "follow", persist: true, complexity: "normal" },
  { domain: "FollowUp", q: "Wouldn't watermarking fail?", followUp: true, session: "follow", persist: true, complexity: "normal" },
  { domain: "FollowUp", q: "What if the source updates an old record?", intent: "scenario", followUp: true, session: "follow", persist: true, complexity: "normal" },
  { domain: "FollowUp", q: "Would that work for 10 TB?", intent: "scalability", followUp: true, session: "follow", persist: true, complexity: "complex" },
  { domain: "FollowUp", q: "What happens if the pipeline fails halfway?", intent: "failure_handling", followUp: true, session: "follow", persist: true, complexity: "normal" },
  { domain: "FollowUp", q: "How would you monitor it?", intent: "how_to_monitor", followUp: true, session: "follow", persist: true, complexity: "normal" },
  { domain: "FollowUp", q: "What would you change if performance became an issue?", intent: "optimization", followUp: true, session: "follow", persist: true, complexity: "normal" },
];

const repetitionSequence: SuiteCase[] = [
  { domain: "Repetition", q: "How do you implement incremental loading?", intent: "how_to_implement", session: "rep", persist: true },
  { domain: "Repetition", q: "How do you identify changed rows?", intent: "how_to_identify", followUp: true, session: "rep", persist: true },
  { domain: "Repetition", q: "How do you handle incremental processing failures?", intent: "failure_handling", followUp: true, session: "rep", persist: true },
  { domain: "Repetition", q: "How do you optimize incremental processing?", intent: "optimization", followUp: true, session: "rep", persist: true },
];

const ambiguousSequence: SuiteCase[] = [
  { domain: "Ambiguous", q: "How do you implement incremental loading in ADF?", intent: "how_to_implement", session: "amb", persist: true },
  { domain: "Ambiguous", q: "How do you handle it?", followUp: true, session: "amb", persist: true },
  { domain: "Ambiguous", q: "How do you optimize it?", intent: "optimization", followUp: true, session: "amb", persist: true },
  { domain: "Ambiguous", q: "What happens if it fails?", intent: "failure_handling", followUp: true, session: "amb", persist: true },
  { domain: "Ambiguous", q: "Why did you choose it?", intent: "why", followUp: true, session: "amb", persist: true },
  { domain: "Ambiguous", q: "What about performance?", followUp: true, session: "amb", persist: true },
  { domain: "Ambiguous", q: "What about Databricks?", topic: "databricks", followUp: false, relation: "new_topic", session: "amb", persist: true },
];

const interviewSimulation: SuiteCase[] = [
  { domain: "Interview", q: "Tell me about your current project.", intent: "experience", session: "iv", persist: true, complexity: "normal" },
  { domain: "Interview", q: "Walk me through the ingestion architecture.", intent: "architecture", session: "iv", persist: true, complexity: "complex" },
  { domain: "Interview", q: "How do you handle incremental loads?", intent: "how_to_handle", session: "iv", persist: true, complexity: "normal" },
  { domain: "Interview", q: "Why did you choose that approach?", intent: "why", followUp: true, session: "iv", persist: true, complexity: "normal" },
  { domain: "Interview", q: "Suppose the source updates an old record.", intent: "scenario", followUp: true, session: "iv", persist: true, complexity: "normal" },
  { domain: "Interview", q: "Would that scale to 10 TB?", intent: "scalability", followUp: true, session: "iv", persist: true, complexity: "complex" },
  { domain: "Interview", q: "How do you troubleshoot a slow Databricks job?", intent: "troubleshooting", session: "iv", persist: true, complexity: "normal" },
  { domain: "Interview", q: "What about data skew?", followUp: true, session: "iv", persist: true, complexity: "normal" },
  { domain: "Interview", q: "How do you deploy this?", intent: "how_to_deploy", session: "iv", persist: true, complexity: "normal" },
  { domain: "Interview", q: "How would Power BI consume the curated data?", intent: "how_to_implement", topic: "powerbi", session: "iv", persist: true, complexity: "normal" },
  { domain: "Interview", q: "How would you redesign this in Fabric?", topic: "fabric", session: "iv", persist: true, complexity: "complex" },
  { domain: "Interview", q: "Why Delta?", intent: "why", topic: "delta", session: "iv", persist: true, complexity: "simple" },
  { domain: "Interview", q: "How would you secure it?", intent: "security", session: "iv", persist: true, complexity: "normal" },
  { domain: "Interview", q: "What's the biggest production challenge?", session: "iv", persist: true, complexity: "normal" },
];

const groundingCases: SuiteCase[] = [
  { domain: "Grounding", q: "Have you worked with Snowflake?", intent: "experience", topic: "snowflake", noFabricate: ["snowflake"] },
  { domain: "Grounding", q: "Have you implemented Kafka?", intent: "experience", topic: "kafka", noFabricate: ["kafka"] },
  { domain: "Grounding", q: "How would you implement this in Snowflake?", topic: "snowflake", noFabricate: ["snowflake"] },
  { domain: "Grounding", q: "How would you design a Kafka consumer for this pipeline?", topic: "kafka", noFabricate: ["kafka"] },
];

const sttCases: SuiteCase[] = [
  { domain: "STT", q: "How do you...", incomplete: true, live: false },
  { domain: "STT", q: "What would you...", incomplete: true, live: false },
  { domain: "STT", q: "Why did...", incomplete: true, live: false },
  { domain: "STT", q: "Why Delta?", incomplete: false, intent: "why", topic: "delta", live: false },
  { domain: "STT", q: "ADF vs Databricks?", incomplete: false, intent: "comparison", live: false },
  { domain: "STT", q: "Direct Lake?", incomplete: false, live: false },
];

const BANNED_SPOKEN = [
  /in my role as an azure data engineer/i,
  /certainly, as an azure data engineer/i,
  /let me explain this in detail/i,
  /absolutely, this is an important concept/i,
  /without further ado/i,
  /let'?s delve/i,
];

const WATERMARK_LOOP = /watermark.{0,80}(filter|changed rows).{0,80}(load|merge)/i;

type Scorecard = Record<string, unknown>;

function wordCount(text: string): number {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function lengthBand(complexity: SuiteCase["complexity"], words: number): "short" | "ok" | "long" | "skipped" {
  if (!complexity) return "skipped";
  const ranges = {
    simple: [20, 90],
    normal: [40, 180],
    complex: [80, 360],
  } as const;
  const [min, max] = ranges[complexity];
  if (words < min) return "short";
  if (words > max) return "long";
  return "ok";
}

function opener(text: string): string {
  return String(text || "").trim().split(/[.!?\n]/)[0]?.slice(0, 80) || "";
}

function capture(row: SuiteCase, result: Awaited<ReturnType<typeof generateInterviewAnswer>>, previous?: Scorecard): Scorecard {
  const analysis = result.analysis;
  const answer = result.finalAnswer;
  const hay = `${result.retrievalSubjects.join(" ")} ${result.retrieval}`.toLowerCase();
  const spoken = scoreEmployeeAnswer(answer, result.askedForCode);
  const spokenStyle = scoreSpokenStyle(answer, analysis.intent);
  const fabricated = (row.noFabricate || []).filter((tech) => {
    const re = new RegExp(`(i have (worked with|used|implemented) ${tech}|in my (current )?project,? we use ${tech})`, "i");
    return re.test(answer);
  });
  const banned = BANNED_SPOKEN.filter((re) => re.test(answer)).map((re) => re.source);
  const retrievalHits = (row.retrievalWant || []).filter((item) => hay.includes(item.toLowerCase()));
  const retrievalMiss = (row.retrievalWant || []).filter((item) => !hay.includes(item.toLowerCase()));
  const retrievalBad = (row.retrievalAvoid || []).filter((item) => hay.includes(item.toLowerCase()));
  const flags: string[] = [];
  if (row.intent && analysis.intent !== row.intent) flags.push(`intent:${analysis.intent}!=${row.intent}`);
  if (row.topic && analysis.topic !== row.topic) flags.push(`topic:${analysis.topic}!=${row.topic}`);
  if (row.followUp != null && analysis.isFollowUp !== row.followUp) flags.push(`followUp:${analysis.isFollowUp}!=${row.followUp}`);
  if (row.relation && analysis.relationToPreviousQuestion !== row.relation) flags.push(`relation:${analysis.relationToPreviousQuestion}!=${row.relation}`);
  if (row.incomplete != null && analysis.isIncomplete !== row.incomplete) flags.push(`incomplete:${analysis.isIncomplete}!=${row.incomplete}`);
  if (retrievalMiss.length) flags.push(`retrieval_miss:${retrievalMiss.join(",")}`);
  if (retrievalBad.length) flags.push(`retrieval_wrong:${retrievalBad.join(",")}`);
  if (fabricated.length) flags.push(`fabricated:${fabricated.join(",")}`);
  if (banned.length) flags.push("robotic_opener");
  if (result.live && !spoken.ok) flags.push(`spoken:${spoken.reason}`);
  if (result.live && !result.askedForCode && spokenStyle.documentationHeavy) flags.push("documentation_heavy");
  if (result.live && !result.askedForCode && spokenStyle.productPageOpener) flags.push("product_page_opener");
  if (result.live && !result.askedForCode && spokenStyle.tutorialOpener) flags.push("tutorial_opener");
  if (result.live && !result.askedForCode && spokenStyle.bulletCount >= 3) flags.push("bullet_notes");
  if (result.live && result.askedForCode && /\bMERGE\b/i.test(answer) && !/\bWHEN\s+MATCHED\b/i.test(answer)) {
    flags.push("incomplete_merge");
  }
  if (result.live && result.askedForCode && /\bMERGE\b/i.test(answer) && !/\bWHEN\s+NOT\s+MATCHED\b/i.test(answer)) {
    flags.push("incomplete_merge");
  }
  if (result.live && /I don't grant people one by one/i.test(answer) && !/access|grant|onboard|admin/i.test(row.q)) {
    flags.push("canned_access_fallback");
  }
  const spokenWeak = banned.length > 0 || (!result.askedForCode && spokenStyle.documentationHeavy);
  const previousAnswerSimilarity = previous ? tokenOverlap(String(previous.finalAnswer || ""), answer) : 0;
  if (previous && result.live) {
    const concepts = conceptSequence(answer);
    const prevConcepts = conceptSequence(String(previous.finalAnswer || ""));
    const shared = concepts.filter((item) => prevConcepts.includes(item));
    if (previousAnswerSimilarity > 0.62) flags.push("semantic_overlap");
    if (shared.length >= 3) flags.push(`concept_overlap:${shared.join(",")}`);
    if (opener(answer) && opener(answer) === opener(String(previous.finalAnswer || ""))) flags.push("opening_overlap");
  }
  const topicHay = `${analysis.topic} ${analysis.technologies.join(" ")}`.toLowerCase();
  const technicalTopicMatch = !topicHay.trim() || topicHay.split(/\s+/).some((token) => token.length > 3 && answer.toLowerCase().includes(token));
  if (result.live && !result.askedForCode && !technicalTopicMatch) flags.push("topic_mismatch");
  return {
    question: row.q,
    normalizedQuestion: analysis.question,
    domain: row.domain,
    topic: analysis.topic,
    subTopic: analysis.subTopic,
    technology: analysis.technologies,
    primaryIntent: analysis.primaryIntent,
    secondaryIntent: analysis.secondaryIntent,
    scenario: analysis.scenario,
    complexity: analysis.complexity,
    confidence: analysis.confidence,
    fingerprint: analysis.fingerprint,
    followUp: analysis.isFollowUp,
    relationToPrevious: analysis.relationToPreviousQuestion,
    retrieval: result.retrievalSubjects,
    answerPlan: result.plan.structure,
    rawAnswer: result.rawAnswer,
    finalAnswer: answer,
    repetitionResult: result.repetition,
    groundingResult: result.grounding,
    firstTokenMs: result.firstTokenMs,
    totalLatencyMs: result.totalMs,
    finalizeMs: result.finalizeMs,
    classifyMs: result.classifyMs,
    retrievalMs: result.retrievalMs,
    planMs: result.planMs,
    live: result.live,
    skippedLlm: result.skippedLlm,
    scorecard: {
      intentCorrect: !row.intent || analysis.intent === row.intent,
      topicCorrect: !row.topic || analysis.topic === row.topic,
      followUpCorrect: row.followUp == null || analysis.isFollowUp === row.followUp,
      technicalAccuracy: fabricated.length ? "fabricated_experience" : "unchecked_without_sme",
      relevance: retrievalBad.length ? "retrieval_mismatch" : retrievalMiss.length ? "retrieval_weak" : "ok",
      candidateGrounding: fabricated.length ? "fail" : "ok",
      spokenQuality: result.live ? (spokenWeak ? "weak" : "ok") : "not_live",
      length: result.askedForCode ? "skipped" : lengthBand(row.complexity, wordCount(answer)),
      depth: analysis.expectedDepth,
      retrievalRelevance: retrievalHits,
      repetition: result.repetition.score,
      latency: result.totalMs,
      confidence: analysis.confidence,
    },
    flags,
    wordCount: wordCount(answer),
    length: wordCount(answer),
    firstPersonUsage: spokenStyle.firstPersonUsage,
    documentationPatternCount: spokenStyle.documentationPatternCount,
    bulletCount: spokenStyle.bulletCount,
    genericOpenerCount: spokenStyle.genericOpenerCount,
    productPageOpener: spokenStyle.productPageOpener,
    tutorialOpener: spokenStyle.tutorialOpener,
    previousAnswerSimilarity,
    technicalTopicMatch,
    candidateGrounding: fabricated.length ? "fail" : "ok",
    latency: result.totalMs,
    opener: opener(answer),
  };
}

const sessionIds: Record<string, number> = {
  follow: 501,
  rep: 502,
  amb: 503,
  iv: 504,
  code: 505,
};

async function runCase(row: SuiteCase, index: number, live: boolean): Promise<Scorecard> {
  const session = row.session ? sessionIds[row.session] : 600 + index;
  const result = await generateInterviewAnswer({
    question: row.q,
    userId: row.session ? `eval-live-${row.session}` : `eval-live-iso-${index}`,
    sessionId: session,
    persona: resumeAdf,
    live,
    persist: row.persist ?? Boolean(row.session),
    model: process.env.OPENAI_MODEL || "gpt-5.6-sol",
  });
  return capture(row, result);
}

async function runSequence(rows: SuiteCase[], live: boolean): Promise<Scorecard[]> {
  const out: Scorecard[] = [];
  for (const [index, row] of rows.entries()) {
    const session = row.session ? sessionIds[row.session] : 700 + index;
    const result = await generateInterviewAnswer({
      question: row.q,
      userId: `eval-live-${row.session || "seq"}`,
      sessionId: session,
      persona: resumeAdf,
      live,
      persist: true,
      model: process.env.OPENAI_MODEL || "gpt-5.6-sol",
    });
    out.push(capture(row, result, out[out.length - 1]));
  }
  return out;
}

const localRows: Scorecard[] = [];
for (const [index, row] of [...isolated, ...sttCases].entries()) {
  localRows.push(await runCase(row, index, false));
}
const localFollow = await runSequence(followUpSequence, false);
const localCodingFollow = await runSequence(codingFollowSequence, false);
const localRep = await runSequence(repetitionSequence, false);
const localAmb = await runSequence(ambiguousSequence, false);
const localGround = [];
for (const [index, row] of groundingCases.entries()) {
  localGround.push(await runCase({ ...row, persist: false }, 800 + index, false));
}

const sttLocal = sttCases.map((row) => {
  const incomplete = isIncompleteQuestion(row.q);
  const analysis = analyzeQuestion(row.q);
  if (row.incomplete != null && incomplete !== row.incomplete) {
    throw new Error(`STT "${row.q}" incomplete=${incomplete} expected ${row.incomplete}`);
  }
  if (row.intent && analysis.intent !== row.intent) {
    throw new Error(`STT "${row.q}" intent=${analysis.intent} expected ${row.intent}`);
  }
  if (row.topic && analysis.topic !== row.topic) {
    throw new Error(`STT "${row.q}" topic=${analysis.topic} expected ${row.topic}`);
  }
  return { question: row.q, incomplete, intent: analysis.intent, topic: analysis.topic };
});

const whyDb = analyzeQuestion("Why Databricks?");
const optDb = analyzeQuestion("How do you optimize Databricks?");
if (whyDb.fingerprint === optDb.fingerprint) {
  throw new Error("Why Databricks? and How do you optimize Databricks? collapsed to the same fingerprint");
}

const snowflakeGround = rewriteUngroundedExperience(
  "In my current project, we use Snowflake for the warehouse.",
  resumeAdf,
);
if (/in my current project, we use snowflake/i.test(snowflakeGround.text)) {
  throw new Error("Grounding failed to rewrite fabricated Snowflake project experience");
}

const intentChecked = [...isolated, ...followUpSequence, ...repetitionSequence, ...groundingCases].filter((row) => row.intent);
const intentHits = intentChecked.filter((row) => analyzeQuestion(row.q).intent === row.intent).length;
const topicChecked = isolated.filter((row) => row.topic);
const topicHits = topicChecked.filter((row) => analyzeQuestion(row.q).topic === row.topic).length;
function followAccuracy(rows: SuiteCase[]): number {
  let prev = null as ReturnType<typeof analyzeQuestion> | null;
  let hits = 0;
  let total = 0;
  for (const row of rows) {
    const analysis = analyzeQuestion(row.q, prev);
    if (row.followUp != null) {
      total += 1;
      if (analysis.isFollowUp === row.followUp) hits += 1;
    }
    prev = analysis;
  }
  return total ? hits / total : 1;
}
const followUpAccuracy = Number((
  (followAccuracy(followUpSequence) + followAccuracy(repetitionSequence) + followAccuracy(ambiguousSequence) + followAccuracy(codingFollowSequence)) / 4
).toFixed(3));

const domains = [...new Set(isolated.map((row) => row.domain))];

type LiveBundle = {
  isolated: Scorecard[];
  followUp: Scorecard[];
  codingFollow: Scorecard[];
  repetition: Scorecard[];
  ambiguous: Scorecard[];
  interview: Scorecard[];
  grounding: Scorecard[];
  modelComparison: Array<Record<string, unknown>>;
};

let liveBundle: LiveBundle | null = null;
let liveError = "";

if (LIVE) {
  const smokeKeep = new Set([
    "What is Azure Data Factory?",
    "Why would you use ADF?",
    "How do you implement incremental loading in ADF?",
    "How do you optimize a Databricks job?",
    "Why Databricks?",
    "Why is my Databricks job slow?",
    "How do you optimize a Spark join?",
    "How do you handle data skew?",
    "How do you use Unity Catalog?",
    "How would you store it in ADLS?",
    "Write a MERGE statement.",
    "Write a sample SQL MERGE for SCD Type 1.",
    "Write SQL for SCD Type 2.",
    "Write a PySpark query to remove duplicates",
    "Write Python code to find the second largest number.",
    "What is Delta Lake?",
    "Why Delta instead of Parquet?",
    "What is Direct Lake?",
    "How do you control Snowflake cost?",
    "How do you optimize Power BI?",
    "How do you ingest data from a REST API?",
    "How does Kafka work?",
    "How do you deploy ADF?",
    "How would you ingest REST API data using ADF?",
    "How would you design a lakehouse platform?",
    "Have you worked with Snowflake?",
  ]);
  const liveIsolatedSource = SMOKE ? isolated.filter((row) => smokeKeep.has(row.q)) : isolated;
  const liveIsolated: Scorecard[] = [];
  for (const [index, row] of liveIsolatedSource.entries()) {
    if (row.live === false) continue;
    try {
      liveIsolated.push(await runCase(row, 1000 + index, true));
    } catch (err) {
      liveIsolated.push({ question: row.q, domain: row.domain, error: String(err), live: true, flags: ["llm_error"] });
    }
  }
  const liveFollow = await runSequence(followUpSequence, true);
  const liveCodingFollow = await runSequence(codingFollowSequence, true);
  const liveRep = await runSequence(repetitionSequence, true);
  const liveAmb = await runSequence(ambiguousSequence, true);
  const liveInterview = await runSequence(interviewSimulation, true);
  const liveGround: Scorecard[] = [];
  for (const [index, row] of groundingCases.entries()) {
    liveGround.push(await runCase({ ...row, persist: false }, 2000 + index, true));
  }

  const compareQs = [
    "Why Databricks?",
    "How do you optimize a Databricks job?",
    "How do you implement incremental loading in ADF?",
    "How do you optimize Power BI?",
    "How would you implement this in Snowflake?",
    "Walk me through your current project.",
  ];
  const modelComparison: Array<Record<string, unknown>> = [];
  for (const model of [process.env.OPENAI_MODEL || "gpt-5.6-sol"]) {
    for (const q of compareQs) {
      try {
        const result = await generateInterviewAnswer({
          question: q,
          userId: `eval-model-${model}`,
          sessionId: 900,
          persona: resumeAdf,
          live: true,
          persist: false,
          model,
        });
        modelComparison.push({
          model,
          question: q,
          firstTokenMs: result.firstTokenMs,
          totalLatencyMs: result.totalMs,
          wordCount: wordCount(result.finalAnswer),
          spokenOk: scoreEmployeeAnswer(result.finalAnswer, result.askedForCode).ok,
          spokenStyle: scoreSpokenStyle(result.finalAnswer, result.analysis.intent),
          grounding: result.ungrounded,
          repetition: result.repetition.score,
          opener: opener(result.finalAnswer),
          answer: result.finalAnswer,
        });
      } catch (err) {
        modelComparison.push({ model, question: q, error: String(err) });
      }
    }
  }
  liveBundle = {
    isolated: liveIsolated,
    followUp: liveFollow,
    codingFollow: liveCodingFollow,
    repetition: liveRep,
    ambiguous: liveAmb,
    interview: liveInterview,
    grounding: liveGround,
    modelComparison,
  };
} else {
  liveError = "LIVE GPT EVALUATION NOT RUN — OPENAI_API_KEY unavailable.";
}

function summarize(rows: Scorecard[]) {
  const flags = rows.flatMap((row) => (row.flags as string[] | undefined) || []);
  const latencies = rows.map((row) => Number(row.firstTokenMs)).filter((ms) => Number.isFinite(ms) && ms > 0);
  const totals = rows.map((row) => Number(row.totalLatencyMs)).filter((ms) => Number.isFinite(ms) && ms > 0);
  const avg = (values: number[]) => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null);
  const docs = rows.map((row) => Number(row.documentationPatternCount) || 0);
  const bullets = rows.map((row) => Number(row.bulletCount) || 0);
  return {
    count: rows.length,
    flagged: rows.filter((row) => ((row.flags as string[] | undefined) || []).length > 0).length,
    flagCounts: flags.reduce<Record<string, number>>((acc, flag) => {
      const key = flag.split(":")[0] || flag;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
    documentationStyleRate: rows.length ? Number((rows.filter((row) => row.documentationPatternCount || (row.bulletCount as number) >= 3).length / rows.length).toFixed(3)) : 0,
    firstPersonRate: rows.length ? Number((rows.filter((row) => row.firstPersonUsage).length / rows.length).toFixed(3)) : 0,
    avgDocumentationPatterns: avg(docs),
    avgBullets: avg(bullets),
    avgFirstTokenMs: avg(latencies),
    avgTotalMs: avg(totals),
    maxFirstTokenMs: latencies.length ? Math.max(...latencies) : null,
    maxTotalMs: totals.length ? Math.max(...totals) : null,
  };
}

function pickRow(rows: Scorecard[], ...questions: string[]): Scorecard | undefined {
  for (const question of questions) {
    const hit = rows.find((row) => row.question === question);
    if (hit) return hit;
  }
  return undefined;
}

function representativeFrom(row: Scorecard | undefined, type: string) {
  if (!row) return { type, missing: true };
  const previous = previousAnswers.get(String(row.question || ""));
  return {
    type,
    question: row.question,
    intent: row.primaryIntent,
    relation: row.relationToPrevious,
    opener: row.opener,
    wordCount: row.wordCount,
    spokenQuality: (row.scorecard as Record<string, unknown> | undefined)?.spokenQuality,
    documentationPatternCount: row.documentationPatternCount,
    productPageOpener: row.productPageOpener,
    tutorialOpener: row.tutorialOpener,
    firstPersonUsage: row.firstPersonUsage,
    repetition: row.repetitionResult,
    grounding: row.groundingResult,
    firstTokenMs: row.firstTokenMs,
    totalLatencyMs: row.totalLatencyMs,
    flags: row.flags,
    previousAnswer: previous || undefined,
    answer: row.finalAnswer,
  };
}

function collectRepresentatives(bundle: LiveBundle) {
  const rows = [...bundle.isolated, ...bundle.followUp, ...(bundle.codingFollow || []), ...bundle.interview, ...bundle.grounding, ...bundle.repetition];
  return [
    representativeFrom(pickRow(rows, "What is Delta Lake?", "What is Azure Data Factory?", "What is Direct Lake?"), "definition"),
    representativeFrom(pickRow(rows, "Why Databricks?", "Why would you use ADF?", "Why Delta instead of Parquet?", "Why Delta?"), "why"),
    representativeFrom(pickRow(rows, "How do you implement incremental loading in ADF?", "How do you implement incremental loading?"), "implementation"),
    representativeFrom(pickRow(rows, "Why is my Databricks job slow?", "How do you troubleshoot a slow Databricks job?"), "troubleshooting"),
    representativeFrom(pickRow(rows, "What happens if the pipeline fails halfway?"), "failure"),
    representativeFrom(pickRow(rows, "How do you optimize a Databricks job?", "How do you optimize Power BI?", "How do you optimize a Spark join?"), "optimization"),
    representativeFrom(pickRow(rows, "ADF vs Databricks?", "Kafka vs Event Hubs?"), "comparison"),
    representativeFrom(pickRow(rows, "Why did you choose watermarking?", "Why did you choose that approach?"), "follow-up"),
    representativeFrom(pickRow(rows, "Wouldn't watermarking fail?", "Would that scale to 10 TB?", "Would that work for 10 TB?"), "challenge"),
    representativeFrom(pickRow(rows, "Tell me about your current project.", "Have you worked with Snowflake?"), "experience"),
    representativeFrom(pickRow(rows, "Write a sample SQL MERGE for SCD Type 1.", "Write a MERGE statement.", "Write PySpark code to keep the latest record per customer."), "coding"),
    representativeFrom(pickRow(rows, "Write SQL for SCD Type 2."), "coding-scd2"),
    representativeFrom(pickRow(rows, "Can you do the same in PySpark?"), "coding-follow-up"),
    representativeFrom(pickRow(rows, "How would you design a lakehouse platform?", "Walk me through the ingestion architecture."), "system-design"),
  ];
}

const report = {
  liveLlm: LIVE,
  liveError: liveError || undefined,
  productionPath: "POST /openai/analyze → generateInterviewAnswer (finalize → analyze → retrieve → plan → one streaming GPT call → repetition/grounding/quality)",
  local: {
    questions: isolated.length + followUpSequence.length + codingFollowSequence.length + repetitionSequence.length + ambiguousSequence.length + groundingCases.length + sttCases.length,
    domains: domains.length,
    intentAccuracy: intentChecked.length ? Number((intentHits / intentChecked.length).toFixed(3)) : null,
    topicAccuracy: topicChecked.length ? Number((topicHits / topicChecked.length).toFixed(3)) : null,
    followUpAccuracy,
    stt: sttLocal,
    whyVsOptimizeDistinct: whyDb.fingerprint !== optDb.fingerprint,
  },
  live: liveBundle
    ? {
        questions:
          liveBundle.isolated.length
          + liveBundle.followUp.length
          + (liveBundle.codingFollow?.length || 0)
          + liveBundle.repetition.length
          + liveBundle.ambiguous.length
          + liveBundle.interview.length
          + liveBundle.grounding.length,
        isolated: summarize(liveBundle.isolated),
        followUp: summarize(liveBundle.followUp),
        codingFollow: summarize(liveBundle.codingFollow || []),
        repetition: summarize(liveBundle.repetition),
        ambiguous: summarize(liveBundle.ambiguous),
        interview: summarize(liveBundle.interview),
        grounding: summarize(liveBundle.grounding),
        modelComparison: liveBundle.modelComparison,
        representatives: collectRepresentatives(liveBundle),
        sampleFlags: [...liveBundle.isolated, ...liveBundle.followUp, ...liveBundle.interview, ...liveBundle.grounding]
          .filter((row) => ((row.flags as string[]) || []).length)
          .slice(0, 40)
          .map((row) => ({ question: row.question, flags: row.flags, opener: row.opener })),
      }
    : null,
};

writeFileSync(resolve(repoRoot, "scripts/eval-live-results.json"), JSON.stringify({ report, liveBundle, localFollow, localCodingFollow, localRep, localAmb, localGround, localRows: localRows.slice(0, 8) }, null, 2));

if (!LIVE) {
  console.log("LIVE GPT EVALUATION NOT RUN — OPENAI_API_KEY unavailable.");
}
console.log(JSON.stringify(report, null, 2));
