import assert from "node:assert/strict";
import {
  isCodeIntent,
  isPointwiseQuestion,
  looksLikeUsEnglish,
  scoreEmployeeAnswer,
} from "../../artifacts/api-server/src/lib/answer-quality.ts";
import {
  FROZEN_INTERVIEW_PACK as pack,
  knowledgeStats,
  matchFrozenAnswer,
  matchingSubjects,
  subjectContext,
} from "../../artifacts/api-server/src/lib/interview-voice.ts";

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
assert.equal(looksLikeUsEnglish("No tardo mucho, diario kocham"), false);
assert.equal(looksLikeUsEnglish("Alsof de hemel het"), false);

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
  scoreEmployeeAnswer("I know inner join keeps matching keys. Left join keeps the left table.").ok,
  false,
  "Thin textbook answers without employee points must fail",
);
assert.equal(
  scoreEmployeeAnswer("Azure Data Factory is essentially the orchestration service we use in Azure. In my current project we use it to land data in ADLS and trigger Databricks.").ok,
  true,
  "Spoken conversation must pass",
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
