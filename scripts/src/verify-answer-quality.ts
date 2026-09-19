import assert from "node:assert/strict";
import {
  isCodeIntent,
  isPointwiseQuestion,
  looksLikeUsEnglish,
  scoreEmployeeAnswer,
  scoreSpokenStyle,
  toSpokenAnswer,
} from "../../artifacts/api-server/src/lib/answer-quality.ts";
import {
  FROZEN_INTERVIEW_PACK as pack,
  knowledgeStats,
  matchFrozenAnswer,
  matchingSubjects,
  subjectContext,
} from "../../artifacts/api-server/src/lib/interview-voice.ts";
import { mergeSpokenTranscript } from "../../artifacts/api-server/src/lib/question-finalizer.ts";
import {
  formatCodingAnswer,
  hasExecutableCode,
  repairIncompleteMerge,
  extractCodingSpec,
  isCodingQuestion,
  validateCodingAnswer,
} from "../../artifacts/api-server/src/lib/coding-intelligence.ts";

assert.ok(pack.length >= 15, "Golden pack must freeze at least 15 interview questions");

for (const item of pack) {
  const keepPoints = isPointwiseQuestion(item.question);
  const good = scoreEmployeeAnswer(item.good, isCodeIntent(item.question), keepPoints);
  const bad = scoreEmployeeAnswer(item.bad, isCodeIntent(item.question), keepPoints);
  assert.equal(good.ok, true, `${item.id} good answer failed: ${good.reason}`);
  assert.equal(bad.ok, false, `${item.id} bad answer was accepted`);
}

assert.equal(isPointwiseQuestion("What are the transformations you have used in your project to load the data?"), true);
assert.equal(isPointwiseQuestion("So what do you mean by left join, right join and inner join?"), true);
assert.equal(isPointwiseQuestion("What are the main components of Azure Data Factory?"), true);
assert.equal(isPointwiseQuestion("What is Azure Data Factory?"), false);
assert.equal(isPointwiseQuestion("Tell me about yourself"), false);
assert.equal(isPointwiseQuestion("Write a PySpark query to read the data from the external storage"), false);
assert.equal(isPointwiseQuestion("How do you implement incremental loading?"), false);
assert.equal(isPointwiseQuestion("How do you optimize Databricks?"), false);
assert.equal(isPointwiseQuestion("Walk me through your current project."), false);
assert.equal(isCodeIntent("Could you please explain about data skew?"), false);
assert.equal(isCodeIntent("So what do you mean by left join, right join and inner join?"), false);
assert.equal(isCodeIntent("What is lake view and where we use this lake view?"), false);
assert.equal(isCodeIntent("A new data engineer joined. How can you provide access?"), false);
assert.equal(isCodeIntent("Write a SQL query to dedupe events by id keeping the latest timestamp"), true);
assert.equal(isCodeIntent("Write a PySpark query to read the data from the external storage"), true);
assert.equal(matchFrozenAnswer("What are the transformations you have used in your project to load the data?")?.id, "load-transforms");
assert.equal(matchFrozenAnswer("So what do you mean by left join, right join and inner join?")?.id, "sql-joins-meaning");
assert.equal(matchFrozenAnswer("What is lake view and where we use this lake view?")?.id, "lake-view");
assert.equal(matchingSubjects("What is lake view and where we use this lake view?")[0], "lakeview");
assert.equal(matchFrozenAnswer("Could you please explain about data skew?")?.id, "data-skew");
assert.equal(matchFrozenAnswer("What is Unity Cloud and where we use it in your current project?")?.id, "unity-catalog");
assert.equal(matchFrozenAnswer("Have you worked on RBAC?")?.id, "uc-rbac");
assert.equal(matchFrozenAnswer("What is Snowflake and how would you use it?")?.id, "what-is-snowflake");
assert.equal(matchFrozenAnswer("Walk me through a GCP data platform end to end")?.id, "gcp-e2e");
assert.equal(matchFrozenAnswer("How do you do CI/CD with GitHub for data pipelines?")?.id, "cicd-github");
assert.equal(matchFrozenAnswer("What is Azure Key Vault and how do you use it?")?.id, "key-vault");
assert.equal(matchFrozenAnswer("What is Azure Synapse Analytics?")?.id, "synapse-overview");
assert.equal(matchFrozenAnswer("What are the main components of Azure Data Factory?")?.id, "adf-components");
assert.equal(matchFrozenAnswer("What is a Fabric lakehouse?")?.id, "fabric-lakehouse");
assert.equal(matchFrozenAnswer("How do you apply the Azure Well-Architected Framework to a data platform?")?.id, "well-architected");
assert.equal(matchFrozenAnswer("Walk me through the Azure big-data architecture style")?.id, "big-data-style");
assert.equal(matchFrozenAnswer("How do you CI/CD an Azure Data Factory across Dev Test and Prod?")?.id, "adf-cicd-git");
assert.equal(matchFrozenAnswer("Explain the CAP theorem for a data platform")?.id, "cap-theorem");
assert.equal(matchFrozenAnswer("What is Apache Kafka and how would you use it with Spark?")?.id, "kafka-design");
assert.equal(matchFrozenAnswer("How do you tune Spark SQL performance?")?.id, "spark-aqe");
assert.equal(matchFrozenAnswer("How would you map this Azure data platform onto AWS?")?.id, "aws-map");
assert.equal(matchFrozenAnswer("What is the difference between Docker and Kubernetes?")?.id, "k8s-vs-docker");
assert.equal(matchFrozenAnswer("What is RAG and how would you ground an assistant on internal docs?")?.id, "what-is-rag");
assert.equal(looksLikeUsEnglish("Could you please explain about data skew?"), true);
assert.equal(looksLikeUsEnglish("Why Delta?"), true);
assert.equal(looksLikeUsEnglish("Direct Lake?"), true);
assert.equal(looksLikeUsEnglish("ADF vs Databricks?"), true);
assert.equal(looksLikeUsEnglish("No tardo mucho, diario kocham"), false);
assert.equal(looksLikeUsEnglish("Alsof de hemel het"), false);
assert.equal(
  mergeSpokenTranscript("How do you implement", "How do you implement incremental loading in ADF?"),
  "How do you implement incremental loading in ADF?",
);
assert.equal(isCodeIntent("Write a sample code of SCD Type 1 in SQL"), true);
assert.equal(isCodeIntent("What is SCD Type 1?"), false);
assert.equal(isCodeIntent("Explain SCD Type 1."), false);
assert.equal(isCodeIntent("How does SCD Type 1 work?"), false);
assert.equal(isCodeIntent("How do you write an incremental MERGE in SQL?"), false);
assert.equal(isCodeIntent("Give me the code."), true);
assert.equal(isCodeIntent("Find duplicate records."), true);
assert.equal(isCodeIntent("Find the latest record for every customer."), true);
assert.equal(isCodingQuestion("Can you do the same in PySpark?", "coding"), true);
assert.equal(isCodingQuestion("What if there are duplicate timestamps?", "coding"), true);
assert.equal(extractCodingSpec("Write a SQL MERGE for SCD Type 1.").codingOperation, "scd1");
assert.equal(extractCodingSpec("Write SQL for SCD Type 2.").codingOperation, "scd2");
assert.equal(extractCodingSpec("Write Databricks SQL MERGE").dialect, "databricks_sql");
assert.equal(extractCodingSpec("Write PySpark code to keep the latest record per customer.").language, "pyspark");
assert.equal(extractCodingSpec("Write PySpark code to keep the latest record per customer.").codingOperation, "deduplication");
assert.equal(extractCodingSpec("Write PySpark code to keep the latest record per customer.").businessKey, "customer_id");
assert.equal(extractCodingSpec("Write Python code to read a JSON API and handle pagination.").language, "python");
assert.equal(extractCodingSpec("Write Python code to read a JSON API and handle pagination.").codingOperation, "api");

const brokenMerge = `MERGE INTO target_table AS target
USING staging_table AS source
ON target.id = source.id

 UPDATE SET target.name = source.name,
 target.value = source.value
WHEN NOT MATCHED THEN
 INSERT (id, name, value)
 VALUES (source.id, source.name, source.value);`;
const repaired = repairIncompleteMerge(brokenMerge);
assert.match(repaired, /WHEN MATCHED THEN/i);
assert.match(repaired, /WHEN NOT MATCHED THEN/i);
const formatted = formatCodingAnswer(brokenMerge, extractCodingSpec("Write a MERGE statement."));
assert.match(formatted, /WHEN MATCHED THEN/i);
assert.match(formatted, /WHEN NOT MATCHED THEN/i);
assert.equal(validateCodingAnswer(formatted, extractCodingSpec("Write a MERGE statement.")).ok, true);
const doubled = formatCodingAnswer("```sql\n```\n\nsql\n" + brokenMerge + "\n```\n```\n\nFenced complete code first, then 1–2 spoken sentences", extractCodingSpec("Write a MERGE statement."));
assert.match(doubled, /WHEN MATCHED THEN/i);
assert.doesNotMatch(doubled, /```sql\s*```/);
assert.doesNotMatch(doubled, /Fenced complete code first/);

const pysparkRaw = `from pyspark.sql.functions import col
w = Window.partitionBy("customer_id").orderBy(col("updated_at").desc())
df.withColumn("rn", row_number().over(w)).filter(col("rn") == 1)`;
const pysparkFormatted = formatCodingAnswer(pysparkRaw, extractCodingSpec("Write PySpark code to keep the latest record per customer."));
assert.match(pysparkFormatted, /from pyspark\.sql\.window import Window/);
assert.match(pysparkFormatted, /row_number/);
assert.equal(validateCodingAnswer(pysparkFormatted, extractCodingSpec("Write PySpark code to keep the latest record per customer.")).ok, true);

const scd2Incomplete = validateCodingAnswer(
  "```sql\nMERGE INTO t USING s ON t.id = s.id\nWHEN MATCHED THEN UPDATE SET t.name = s.name\nWHEN NOT MATCHED THEN INSERT (id) VALUES (s.id);\n```",
  extractCodingSpec("Write SQL for SCD Type 2."),
);
assert.equal(scd2Incomplete.ok, false);

const spokenMerge = toSpokenAnswer(`Here is the merge:\nWHEN MATCHED THEN\nUPDATE SET x = 1\nWHEN NOT MATCHED THEN\nINSERT (x) VALUES (1)`, false, { keepCode: true });
assert.match(spokenMerge, /WHEN MATCHED THEN/);
assert.equal(hasExecutableCode("Here's a complete SQL snippet for SCD Type 2. This assumes a source table with new data and a target table."), false);
assert.doesNotMatch(
  formatCodingAnswer(
    "Here's a complete SQL snippet for implementing SCD Type 2. This approach assumes you have a source table with new data and a target table where historical data is stored.",
    extractCodingSpec("Write SQL for SCD Type 2."),
  ),
  /```sql\nwith new data/i,
);

const queryAnswer = scoreEmployeeAnswer(
  "I use a window and keep row_number = 1.\n• Partition by event_id\n• Write that to silver",
  true,
);
assert.equal(queryAnswer.ok, true, "Query explanation should pass when they asked for SQL");

assert.equal(
  scoreEmployeeAnswer("ADF is a cloud ETL service.\n• Pipelines\n• Activities\n• Linked services\n• Datasets").ok,
  false,
  "Bullet notes must fail",
);
assert.equal(
  scoreEmployeeAnswer(
    "I don't think of load as a list of PySpark functions. In a typical Azure load I use bronze landing.\n• Filter and select so bronze junk never reaches silver.\n• withColumn for derived fields and standard names.\n• Join reference data, and groupBy only when gold needs an aggregate.",
    false,
    true,
  ).ok,
  true,
  "Employee opener plus process points must pass when the question needs points",
);
assert.equal(
  scoreEmployeeAnswer("When loading data in my projects, I use a variety of PySpark transformations like filter, select, withColumn, join, groupBy, distinct and orderBy.").ok,
  false,
  "Function catalog answers must fail",
);
assert.equal(
  scoreEmployeeAnswer("df = spark.read.format('parquet').load('s3a://my-bucket/data/employee/')", true).ok,
  false,
  "Invented S3 buckets must fail",
);
assert.equal(
  scoreEmployeeAnswer("An inner join is a type of join used in relational algebra and SQL.").ok,
  false,
  "Thin textbook answers without employee points must fail",
);
assert.equal(
  scoreEmployeeAnswer("The first thing I'd check is shuffle in the Spark UI before I resize the cluster. Memory pressure shows up as spill on the executors.").ok,
  true,
  "Bottleneck-first spoken answers must pass without 'for example'",
);
assert.equal(
  scoreEmployeeAnswer("Delta Lake is essentially a transaction layer on lake storage. The useful part is that MERGE, updates and deletes become safe.").ok,
  true,
  "Spoken definitions must pass without forced first-person filler",
);

assert.equal(
  scoreSpokenStyle("Databricks is a unified analytics platform that provides Spark.", "optimization").productPageOpener,
  true,
  "Product-page openings must flag on non-definition intents",
);
assert.equal(
  scoreSpokenStyle("Delta Lake is essentially a transaction layer on lake storage. The useful part is MERGE.", "definition").productPageOpener,
  false,
  "Spoken definitions may open with the product name",
);
assert.equal(
  scoreSpokenStyle("I'd start by identifying how the source exposes changes, then persist a watermark.", "how_to_implement").tutorialOpener,
  false,
  "Natural implementation openings must not be scored as tutorials",
);
assert.equal(
  scoreSpokenStyle("To implement incremental loading, first create a watermark table.", "how_to_implement").tutorialOpener,
  true,
  "To implement… openings must flag on implementation intents",
);
assert.equal(
  scoreSpokenStyle("Delta Lake is a great choice when you need reliable upserts.", "why").productPageOpener,
  false,
  "Spoken why answers may say 'X is a great choice'",
);

const stats = knowledgeStats();
assert.ok(stats.topics >= 30, "Topic pack should store 30+ processed subjects");
assert.ok(stats.sources >= 20, "Topic pack should keep provenance from official sources");
assert.equal(matchingSubjects("What is Auto Loader")[0], "autoloader");
assert.equal(matchingSubjects("What is Unity Catalog")[0], "unity-catalog");
const autoLoaderCtx = subjectContext("What is Auto Loader");
assert.match(autoLoaderCtx, /cloudFiles|Auto Loader/i);
assert.ok(autoLoaderCtx.length < 2400, `Auto Loader context should stay small, got ${autoLoaderCtx.length}`);
assert.doesNotMatch(autoLoaderCtx, /Pinecone|OWASP Top 10|GraphQL/i);
const adfCtx = subjectContext("What is Azure Data Factory?");
assert.match(adfCtx, /orchestr/i);
assert.ok(adfCtx.length < 2400, `ADF context should stay small, got ${adfCtx.length}`);

console.log(`Golden interview pack passed (${pack.length} questions, ${stats.topics} topics, ${stats.sources} sources).`);
