import assert from "node:assert/strict";
import { env } from "node:process";

env.HIKA_SKIP_MEMORY_PERSIST ||= "1";
import { analyzeQuestion, detectIntent, questionFingerprint } from "../../artifacts/api-server/src/lib/question-analyzer.ts";
import { planAnswer } from "../../artifacts/api-server/src/lib/answer-planner.ts";
import { applyRepetitionGuard, tokenOverlap, sequenceOverlap, conceptSequence, scoreRepetition } from "../../artifacts/api-server/src/lib/repetition-guard.ts";
import { subjectContext } from "../../artifacts/api-server/src/lib/subject-docs.ts";
import { isProcessQuestion, scoreEmployeeAnswer } from "../../artifacts/api-server/src/lib/answer-quality.ts";
import { analyzeWithMemory, getInterviewThread, recallSessionMemory, rememberAnswer } from "../../artifacts/api-server/src/lib/session-memory.ts";
import { rewriteUngroundedExperience } from "../../artifacts/api-server/src/lib/candidate-grounding.ts";
import type { PersonaCard } from "../../artifacts/api-server/src/lib/persona.ts";
import { FROZEN_INTERVIEW_PACK } from "../../artifacts/api-server/src/lib/interview-voice.ts";

const incremental = [
  { q: "What is incremental loading?", intent: "definition" },
  { q: "Why do you use incremental loading?", intent: "why" },
  { q: "How do you identify incremental changes?", intent: "how_to_identify" },
  { q: "How do you process incremental loads?", intent: "how_to_process" },
  { q: "How do you handle incremental load failures?", intent: "failure_handling" },
  { q: "How do you optimize incremental loads?", intent: "optimization" },
  { q: "Incremental vs full load?", intent: "comparison" },
  { q: "What happens if the watermark isn't updated?", intent: "failure_handling" },
  { q: "How do you handle late arriving records?", intent: "how_to_handle" },
  { q: "How do you make incremental processing idempotent?", intent: "how_to_handle" },
] as const;

const extra = [
  { q: "What is Delta Lake?", intent: "definition", topic: "delta" },
  { q: "Why do you use Delta Lake?", intent: "why", topic: "delta" },
  { q: "How do you implement Delta Lake?", intent: "how_to_implement", topic: "delta" },
  { q: "How do you optimize Delta Lake?", intent: "optimization", topic: "delta" },
  { q: "What happens if Delta MERGE fails?", intent: "failure_handling", topic: "delta" },
  { q: "Delta Lake vs Parquet?", intent: "comparison", topic: "delta" },
  { q: "Have you worked with Delta Lake?", intent: "experience", topic: "delta" },
  { q: "What is Azure Data Factory?", intent: "definition", topic: "adf" },
  { q: "How do you implement a pipeline in ADF?", intent: "how_to_implement", topic: "adf" },
  { q: "What is data skew?", intent: "definition" },
  { q: "How do you handle data skew?", intent: "how_to_handle" },
  { q: "What is a broadcast join?", intent: "definition" },
  { q: "How do you implement SCD Type 2?", intent: "how_to_implement", topic: "scd" },
  { q: "Walk me through medallion architecture", intent: "architecture", topic: "lakehouse" },
  { q: "What is ADF Integration Runtime?", intent: "definition" },
  { q: "How do you do CI/CD for data pipelines?", intent: "how_to_implement" },
  { q: "Design a scalable data platform", intent: "architecture" },
  { q: "Write a PySpark query to MERGE incremental records", intent: "coding" },
];

let intentHits = 0;
for (const row of incremental) {
  const analysis = analyzeQuestion(row.q);
  assert.equal(analysis.intent, row.intent, `${row.q} intent=${analysis.intent} expected ${row.intent}`);
  assert.equal(analysis.topic, "incremental", `${row.q} topic=${analysis.topic}`);
  assert.equal(analysis.isAnswerable, true);
  intentHits += 1;
}

for (const row of extra) {
  const analysis = analyzeQuestion(row.q);
  assert.equal(analysis.intent, row.intent, `${row.q} intent=${analysis.intent} expected ${row.intent}`);
  if (row.topic) assert.equal(analysis.topic, row.topic, `${row.q} topic=${analysis.topic}`);
  intentHits += 1;
}

const identify = analyzeQuestion("How do you identify incremental loads?");
const process = analyzeQuestion("How do you process incremental loads?");
const handle = analyzeQuestion("How do you handle incremental loads?");
assert.notEqual(identify.fingerprint, process.fingerprint);
assert.notEqual(process.fingerprint, handle.fingerprint);
assert.equal(identify.intent, "how_to_identify");
assert.equal(process.intent, "how_to_process");
assert.equal(handle.intent, "how_to_handle");

const identifyPlan = planAnswer(identify);
const processPlan = planAnswer(process);
const handlePlan = planAnswer(handle);
assert.ok(identifyPlan.mustCover.some((item) => /watermark|cdc|change/i.test(item)));
assert.ok(!identifyPlan.mustCover.some((item) => /MERGE/i.test(item)));
assert.ok(processPlan.mustCover.some((item) => /MERGE|extract|watermark after success/i.test(item)));
assert.ok(handlePlan.mustCover.some((item) => /idempotent|late|monitor/i.test(item)));
assert.notDeepEqual(identifyPlan.mustCover, processPlan.mustCover);
assert.notDeepEqual(processPlan.mustCover, handlePlan.mustCover);

const identifyCtx = subjectContext(identify.question, identify.intent);
const processCtx = subjectContext(process.question, process.intent);
const failCtx = subjectContext("How do you handle incremental load failures?", "failure_handling");
assert.match(identifyCtx, /watermark|CDC|change/i);
assert.match(processCtx, /MERGE|watermark/i);
assert.match(failCtx, /rerun|watermark/i);

const first = analyzeQuestion("What is incremental loading?");
const follow = analyzeQuestion("How do you identify it?", first, ["only changed rows"]);
assert.equal(follow.isFollowUp, true);
assert.equal(follow.topic, "incremental");
assert.equal(follow.intent, "how_to_identify");
assert.equal(follow.relationToPreviousQuestion, "related_but_different");
assert.ok(follow.conceptsToAvoidRepeating.includes("only changed rows"));

const userId = "eval-user";
const thread = getInterviewThread(userId, 1);
thread.lastAnalysis = first;
thread.currentTopic = first.topic;
thread.conceptsAlreadyCovered = ["watermark", "cdc"];
thread.conceptsToAvoidRepeating = ["watermark"];
thread.questionsAnswered = [{
  question: first.question,
  topic: first.topic,
  intent: first.intent,
  fingerprint: first.fingerprint,
  conceptsCovered: ["watermark"],
}];
const next = analyzeWithMemory(userId, "How do you actually process those records?", 1);
assert.equal(next.topic, "incremental");
assert.equal(next.intent, "how_to_process");
assert.equal(next.isFollowUp, true);
const cue = recallSessionMemory(userId, next.question, 1);
assert.match(cue, /SESSION THREAD/);
assert.match(cue, /do not repeat/i);

assert.equal(isAnswerableFiller(), true);
function isAnswerableFiller() {
  assert.equal(analyzeQuestion("Okay, moving on...").isAnswerable, false);
  assert.equal(analyzeQuestion("Right, right...").isAnswerable, false);
  assert.equal(analyzeQuestion("Can you explain Delta Lake?").isAnswerable, true);
  return true;
}

const guarded = applyRepetitionGuard(
  "In my role as an Azure Data Engineer and Databricks Administrator, I handle incremental loads across the platform. I usually start with a watermark.",
  ["In my role as an Azure Data Engineer and Databricks Administrator, I handle incremental loads across the platform."],
  [],
);
assert.doesNotMatch(guarded, /In my role as/i);
assert.match(guarded, /watermark/i);

assert.equal(
  scoreEmployeeAnswer("In my role as an Azure Data Engineer and Databricks Administrator, I handle incremental loads every day.").ok,
  false,
);

assert.ok(tokenOverlap("watermark cdc timestamp", "watermark and cdc") > 0.3);

assert.equal(detectIntent("How would you implement that in ADF?"), "how_to_implement");
assert.equal(questionFingerprint("incremental", "how_to_identify"), "incremental|how_to_identify");

const paraphrases = [
  { q: "What's your approach to incremental data?", intent: "how_to_handle", topic: "incremental" },
  { q: "Walk me through how you'd deal with changed records.", intent: "how_to_process", topic: "incremental" },
  { q: "Suppose the source doesn't give you a reliable timestamp. What would you do?", intent: "scenario", topic: "incremental" },
  { q: "Can you take me through the implementation?", intent: "how_to_implement" },
  { q: "What would happen if the job failed halfway through?", intent: "failure_handling" },
  { q: "Why did you choose this approach?", intent: "why" },
  { q: "Would you still use the same design at 10TB?", intent: "scalability" },
  { q: "Can you give me a real example?", intent: "example" },
  { q: "How would you make that reliable?", intent: "how_to_handle" },
  { q: "What's the downside of that approach?", intent: "disadvantages" },
];
let paraphraseHits = 0;
for (const row of paraphrases) {
  const analysis = analyzeQuestion(row.q);
  assert.equal(analysis.intent, row.intent, `paraphrase "${row.q}" intent=${analysis.intent}`);
  if (row.topic) assert.equal(analysis.topic, row.topic, `paraphrase "${row.q}" topic=${analysis.topic}`);
  assert.ok(analysis.confidence >= 0.7, `paraphrase "${row.q}" confidence=${analysis.confidence}`);
  paraphraseHits += 1;
}

const delta1 = analyzeQuestion("What is Delta Lake?");
const delta2 = analyzeQuestion("Why did you choose it?", delta1);
const delta3 = analyzeQuestion("What's the downside?", delta2);
const delta4 = analyzeQuestion("What if the table becomes very large?", delta3);
const delta5 = analyzeQuestion("How would you optimize it?", delta4);
const delta6 = analyzeQuestion("Can you give me an example?", delta5);
assert.equal(delta1.intent, "definition");
assert.equal(delta2.intent, "why");
assert.equal(delta2.relationToPreviousQuestion, "why_follow_up");
assert.equal(delta2.topic, "delta");
assert.equal(delta3.intent, "disadvantages");
assert.equal(delta3.relationToPreviousQuestion, "counter_argument");
assert.equal(delta4.intent, "scalability");
assert.equal(delta4.relationToPreviousQuestion, "deep_dive");
assert.equal(delta5.intent, "optimization");
assert.equal(delta6.intent, "example");
assert.equal(delta6.relationToPreviousQuestion, "example_request");
assert.ok(delta2.isFollowUp && delta3.isFollowUp && delta6.isFollowUp);

assert.equal(analyzeQuestion("How would you...").isIncomplete, true);
assert.equal(analyzeQuestion("How would you handle...").isIncomplete, true);
assert.equal(analyzeQuestion("How would you handle a").isIncomplete, true);
assert.equal(analyzeQuestion("How would you handle a Delta merge failure?").isIncomplete, false);
assert.equal(analyzeQuestion("How would you handle a Delta merge failure?").isAnswerable, true);
assert.equal(analyzeQuestion("How would you...", first).isIncomplete, true);
assert.equal(analyzeQuestion("How would you...", first).isAnswerable, false);
assert.ok(analyzeQuestion("How would you...", first).confidence < 0.3);

const defPlan = planAnswer(analyzeQuestion("What is incremental loading?"));
const implPlan = planAnswer(analyzeQuestion("How do you implement incremental loading?"));
const troublePlan = planAnswer(analyzeQuestion("How do you troubleshoot incremental loading?"));
const optPlan = planAnswer(analyzeQuestion("How do you optimize incremental loading?"));
const whyPlan = planAnswer(analyzeQuestion("Why incremental instead of full load?"));
assert.notEqual(defPlan.structure, implPlan.structure);
assert.notEqual(implPlan.structure, troublePlan.structure);
assert.notEqual(optPlan.structure, whyPlan.structure);
assert.match(troublePlan.structure, /symptom|cause|fix/i);
assert.match(optPlan.structure, /bottleneck/i);
assert.match(defPlan.structure, /what-it-is/i);
assert.match(implPlan.structure, /first decision|how you'd build|tool sequence|extract/i);
assert.match(whyPlan.structure, /purpose|tradeoff/i);
assert.equal(analyzeQuestion("Why incremental instead of full load?").intent, "why");

const seqA = conceptSequence("I use a watermark then a source filter then I land the changed rows.");
const seqB = conceptSequence("We start from the watermark, filter the source, and pick up changed rows.");
assert.ok(sequenceOverlap(seqA, seqB) >= 0.6, "same concept chain should count as repetitive");
const rep = scoreRepetition(
  "We start from the watermark, filter the source, and pick up changed rows.",
  [],
  ["I use a watermark then a source filter then I land the changed rows."],
  ["watermark"],
);
assert.ok(rep.score >= 0.4, `repetition score ${rep.score}`);

const resumeAdf: PersonaCard = {
  card: "Skills: adf, databricks",
  name: "Test",
  skills: ["adf", "databricks"],
  hasResume: true,
  hasJd: false,
  docIds: [],
  facts: [{ fact: "Worked with ADF", source: "resume.pdf", confidence: 0.98, kind: "skill" }],
  experienceYears: 5,
  technologies: ["adf", "databricks"],
};
const kafkaClaim = rewriteUngroundedExperience(
  "I have worked with Kafka in my current project for event streaming.",
  resumeAdf,
);
assert.doesNotMatch(kafkaClaim.text, /I have worked with Kafka/i);
assert.ok(kafkaClaim.stripped.includes("kafka"));
const adfClaim = rewriteUngroundedExperience("I have worked with ADF for orchestration.", resumeAdf);
assert.match(adfClaim.text, /I have worked with ADF/i);
const snowflakeClaim = rewriteUngroundedExperience("I've used Snowflake for the warehouse layer.", resumeAdf);
assert.doesNotMatch(snowflakeClaim.text, /I've used Snowflake/i);
const kafkaResume: PersonaCard = { ...resumeAdf, skills: ["kafka"], technologies: ["kafka"], facts: [{ fact: "Worked with Kafka", source: "resume.pdf", confidence: 0.98, kind: "skill" }] };
const kafkaOk = rewriteUngroundedExperience("I have worked with Kafka in my current project for event streaming.", kafkaResume);
assert.match(kafkaOk.text, /I have worked with Kafka/i);
const kafkaPlan = planAnswer(analyzeQuestion("Have you worked with Kafka?"), resumeAdf);
assert.ok(kafkaPlan.ungroundedTech.includes("kafka"));
assert.ok(kafkaPlan.mustCover.some((item) => /do not claim/i.test(item)));

const clusters: Record<string, string> = {
  incremental: "incremental loading",
  delta: "Delta Lake",
  adf: "Azure Data Factory",
  databricks: "Databricks",
  spark: "Spark",
  pyspark: "PySpark",
  sql: "SQL window functions",
  scd: "SCD Type 2",
  lakehouse: "medallion architecture",
  skew: "data skew",
  partitioning: "partitioning",
  broadcast: "broadcast join",
  devops: "Azure DevOps",
  cicd: "CI/CD",
  systemdesign: "a scalable data platform",
};
const clusterIntents: Array<{ suffix: string; intent: string }> = [
  { suffix: "What is %?", intent: "definition" },
  { suffix: "Why do you use %?", intent: "why" },
  { suffix: "How do you implement %?", intent: "how_to_implement" },
  { suffix: "How do you optimize %?", intent: "optimization" },
  { suffix: "How do you troubleshoot %?", intent: "troubleshooting" },
  { suffix: "What happens if % fails?", intent: "failure_handling" },
  { suffix: "% vs the alternative?", intent: "comparison" },
  { suffix: "Suppose % breaks in production. What would you do?", intent: "scenario" },
  { suffix: "Have you worked with %?", intent: "experience" },
];
let clusterHits = 0;
let clusterTotal = 0;
let followHits = 0;
let followTotal = 0;
for (const label of Object.values(clusters)) {
  for (const row of clusterIntents) {
    clusterTotal += 1;
    const q = row.suffix.replace("%", label);
    const analysis = analyzeQuestion(q);
    if (analysis.intent === row.intent) clusterHits += 1;
    else {
      throw new Error(`cluster "${q}" intent=${analysis.intent} expected ${row.intent}`);
    }
  }
  const definition = analyzeQuestion(`What is ${label}?`);
  followTotal += 1;
  const whyFollow = analyzeQuestion("Why did you choose it?", definition);
  if (whyFollow.isFollowUp && whyFollow.relationToPreviousQuestion === "why_follow_up") followHits += 1;
  else throw new Error(`follow-up failed for ${label}: ${whyFollow.relationToPreviousQuestion}`);
  followTotal += 1;
  const challenge = analyzeQuestion("Wouldn't that fail in production?", whyFollow);
  if (challenge.isFollowUp && challenge.relationToPreviousQuestion === "challenge") followHits += 1;
  else throw new Error(`challenge failed for ${label}: ${challenge.relationToPreviousQuestion} intent=${challenge.intent}`);
}

const convo = [
  "What is incremental loading?",
  "How do you identify incremental changes?",
  "How do you process those records?",
  "What happens if the pipeline fails halfway?",
  "How would you optimize it?",
  "Why would you choose incremental over full load?",
  "Can you give me an example?",
  "What if the source doesn't provide a reliable timestamp?",
  "Would your approach work for 10TB?",
  "What would you change if the source was an API instead of SQL Server?",
];
const expectedConvo = [
  "definition",
  "how_to_identify",
  "how_to_process",
  "failure_handling",
  "optimization",
  "why",
  "example",
  "scenario",
  "scalability",
  "scenario",
];
let prev = null as ReturnType<typeof analyzeQuestion> | null;
const convoFingerprints: string[] = [];
let convoFollowHits = 0;
for (let i = 0; i < convo.length; i += 1) {
  const analysis = analyzeQuestion(convo[i], prev, prev ? ["watermark"] : []);
  assert.equal(analysis.intent, expectedConvo[i], `convo Q${i + 1} ${convo[i]} -> ${analysis.intent}`);
  if (i > 0) {
    assert.equal(analysis.isFollowUp, true, `convo Q${i + 1} should be follow-up`);
    convoFollowHits += 1;
  }
  assert.ok(analysis.confidence >= 0.7, `convo Q${i + 1} confidence=${analysis.confidence}`);
  convoFingerprints.push(analysis.fingerprint);
  prev = analysis;
}
assert.ok(new Set(convoFingerprints).size >= 8, "acceptance conversation must not collapse fingerprints");
assert.equal(analyzeQuestion(convo[3], analyzeQuestion(convo[2], analyzeQuestion(convo[0]))).topic, "incremental");
assert.match(subjectContext("What happens if the pipeline fails halfway?", "failure_handling", "incremental"), /watermark/i);

const consistUser = "eval-consistency";
const consistFirst = analyzeQuestion("How do you handle watermarking?");
await rememberAnswer(consistUser, consistFirst.question, "I keep a watermark in a control table and only advance it after MERGE succeeds.", consistFirst, 1);
const failCue = recallSessionMemory(consistUser, "What happens if the pipeline fails halfway?", 1);
assert.match(failCue, /Stay consistent with the last strategy/i);
assert.match(failCue, /watermark/i);

const spokenBad = [
  "In my role as an Azure Data Engineer, I handle incremental loads every day.",
  "In conclusion, incremental loading is the best approach.",
  "There are several key factors to consider when loading data.",
  "Let's delve into watermarks and CDC.",
  "First and foremost, CDC is important.",
];
for (const bad of spokenBad) {
  assert.equal(scoreEmployeeAnswer(bad).ok, false, `spoken reject: ${bad}`);
}

assert.ok(analyzeQuestion("Hmm data platform maybe").confidence < 0.6);
assert.ok(FROZEN_INTERVIEW_PACK.length >= 15);
assert.equal(analyzeQuestion(FROZEN_INTERVIEW_PACK[0].question).intent, "experience");

const classifyStarted = Date.now();
for (let i = 0; i < 200; i += 1) analyzeQuestion("How do you identify incremental changes?");
const classifyMs = Date.now() - classifyStarted;
assert.ok(classifyMs < 200, `local classifier too slow: ${classifyMs}ms for 200 calls`);

const localStarted = Date.now();
const localQ = analyzeQuestion("How do you process incremental loads?");
planAnswer(localQ);
subjectContext(localQ.question, localQ.intent, localQ.topic);
const localMs = Date.now() - localStarted;
assert.ok(localMs < 40, `local plan+retrieval too slow: ${localMs}ms`);

assert.equal(isProcessQuestion("How do you optimize a Spark join?"), false);
assert.equal(isProcessQuestion("How do you implement incremental loading in ADF?"), false);
assert.equal(isProcessQuestion("How do you grant workspace access to a new engineer?"), true);
assert.equal(analyzeQuestion("Walk me through your current project.").intent, "experience");
assert.equal(analyzeQuestion("Have you implemented Kafka?").intent, "experience");
assert.equal(analyzeQuestion("Write a MERGE statement.").intent, "coding");
assert.equal(analyzeQuestion("What is SCD Type 1?").intent, "definition");
assert.equal(analyzeQuestion("How do you write an incremental MERGE in SQL?").intent, "how_to_implement");
assert.equal(analyzeQuestion("Implement SCD Type 2.").intent, "how_to_implement");
assert.equal(analyzeQuestion("Find duplicate records.").intent, "coding");
assert.equal(analyzeQuestion("Write a sample code of SCD Type 1 in SQL").intent, "coding");
assert.equal(analyzeQuestion("Write a sample code of SCD Type 1 in SQL").coding?.codingOperation, "scd1");
assert.equal(analyzeQuestion("Write SQL for SCD Type 2.").coding?.codingOperation, "scd2");
assert.equal(analyzeQuestion("Give me the code.", analyzeQuestion("Write SQL for SCD Type 1.")).intent, "coding");
assert.equal(analyzeQuestion("Can you do the same in PySpark?", analyzeQuestion("Write SQL to find the latest customer record.")).coding?.language, "pyspark");
assert.equal(analyzeQuestion("What if there are duplicate timestamps?", analyzeQuestion("Write SQL to find the latest customer record.")).intent, "coding");
const scd1Plan = planAnswer(analyzeQuestion("Write a sample code of SCD Type 1 in SQL"));
assert.ok(scd1Plan.mustCover.some((item) => /WHEN MATCHED/i.test(item)));
const scd2Plan = planAnswer(analyzeQuestion("Write SQL for SCD Type 2."));
assert.ok(scd2Plan.mustCover.some((item) => /Type 2|expire|history/i.test(item)));
assert.ok(!scd1Plan.mustCover.some((item) => /expire the current row/i.test(item)));
assert.equal(analyzeQuestion("How do you deploy ADF?").intent, "how_to_deploy");
assert.equal(analyzeQuestion("How do you secure Databricks?").intent, "security");
assert.equal(analyzeQuestion("Why use Databricks?").intent, "why");
assert.notEqual(
  planAnswer(analyzeQuestion("Why use Databricks?")).structure,
  planAnswer(analyzeQuestion("How do you optimize Databricks?")).structure,
);
const incrementalImplPlan = planAnswer(analyzeQuestion("How do you implement incremental loading?"));
const whyFollowPlan = planAnswer(analyzeQuestion("Why did you choose watermarking?", analyzeQuestion("How do you implement incremental loading?")));
assert.ok(whyFollowPlan.targetDurationSeconds < incrementalImplPlan.targetDurationSeconds, "follow-ups should be shorter");
assert.notEqual(
  planAnswer(analyzeQuestion("How do you troubleshoot a Databricks job?")).structure,
  planAnswer(analyzeQuestion("How would you design a Databricks platform?")).structure,
);
assert.equal(analyzeQuestion("What is Microsoft Fabric?").topic, "fabric");
assert.equal(analyzeQuestion("Explain Snowflake architecture.").topic, "snowflake");
assert.equal(analyzeQuestion("How do you optimize Power BI performance?").topic, "powerbi");
assert.equal(analyzeQuestion("How do you handle API pagination?").topic, "api");
assert.equal(analyzeQuestion("What happens if a Kafka consumer fails?").intent, "failure_handling");
assert.equal(analyzeQuestion("Why Delta?").isIncomplete, false);
assert.equal(analyzeQuestion("Direct Lake?").isIncomplete, false);
assert.equal(analyzeQuestion("ADF vs Databricks?").isIncomplete, false);
assert.equal(analyzeQuestion("How do you...").isIncomplete, true);
assert.equal(analyzeQuestion("What would you...").isIncomplete, true);
assert.equal(analyzeQuestion("Why did...").isIncomplete, true);
const adfThread = analyzeQuestion("How do you implement incremental loading in ADF?");
const aboutDatabricks = analyzeQuestion("What about Databricks?", adfThread);
assert.equal(aboutDatabricks.topic, "databricks");
assert.equal(aboutDatabricks.isFollowUp, false);
assert.equal(aboutDatabricks.relationToPreviousQuestion, "new_topic");
const dbOpt = analyzeQuestion("How do you optimize Databricks?");
const aboutSkew = analyzeQuestion("What about data skew?", dbOpt);
assert.equal(aboutSkew.isFollowUp, true);
assert.notEqual(aboutSkew.relationToPreviousQuestion, "new_topic");
const snowflakeRewrite = rewriteUngroundedExperience("In my current project we use Snowflake for warehousing.", resumeAdf);
assert.match(snowflakeRewrite.text, /haven't worked with Snowflake directly/i);
assert.match(subjectContext("How do you optimize Power BI performance?", "optimization", "powerbi"), /folding|Direct|star/i);
assert.match(subjectContext("How do you secure Databricks?", "security", "unity"), /catalog|group|principal/i);

const db1 = analyzeQuestion("How do you implement incremental loading?");
const db2 = analyzeQuestion("Why did you choose watermark?", db1);
const db3 = analyzeQuestion("Wouldn't watermarking fail if the source updates an old record?", db2);
assert.equal(db2.isFollowUp, true);
assert.equal(db3.isFollowUp, true);
assert.equal(db3.topic, "incremental");
assert.equal(db3.scenario, "late_update");
assert.ok(db3.intent === "failure_handling" || db3.relationToPreviousQuestion === "challenge");
assert.equal(analyzeQuestion("Wouldn't watermarking fail?").intent, "limitations");
assert.equal(analyzeQuestion("Why is my Databricks job slow?").intent, "troubleshooting");
const adfLongClaim = rewriteUngroundedExperience("In my current project we use Azure Data Factory for orchestration.", resumeAdf);
assert.match(adfLongClaim.text, /Azure Data Factory/i);
assert.equal(adfLongClaim.stripped.length, 0);

const evalRows = [...incremental, ...extra];
const followUpAccuracy = (followHits + convoFollowHits + 5) / (followTotal + convoFollowHits + 5);
const report = {
  intentAccuracy: intentHits / evalRows.length,
  paraphraseAccuracy: paraphraseHits / paraphrases.length,
  followUpAccuracy,
  clusterAccuracy: clusterHits / clusterTotal,
  questionCount: evalRows.length + paraphrases.length + clusterTotal + followTotal + convo.length,
  uniqueIncrementalFingerprints: new Set([identify.fingerprint, process.fingerprint, handle.fingerprint]).size,
  classifyMsPer200: classifyMs,
  localPlanMs: localMs,
  retrievalHasIncremental: /incremental|watermark/i.test(identifyCtx),
};

assert.equal(report.intentAccuracy, 1);
assert.equal(report.paraphraseAccuracy, 1);
assert.equal(report.clusterAccuracy, 1);
assert.equal(report.followUpAccuracy, 1);
assert.equal(report.uniqueIncrementalFingerprints, 3);

console.log(
  `Interview intelligence hardened (${report.questionCount} questions, intent ${report.intentAccuracy}, paraphrase ${report.paraphraseAccuracy}, follow-up ${report.followUpAccuracy}, clusters ${report.clusterAccuracy}, classify ${classifyMs}ms/200).`,
);
