import { readUserDocument } from "./store";
import { extractDocumentTextFromBuffer } from "./document-text";

export type PersonaDoc = { id?: string; name?: string };

export type CandidateFact = {
  fact: string;
  source: string;
  confidence: number;
  kind: "skill" | "project" | "employer" | "years" | "tool";
};

export type PersonaCard = {
  card: string;
  name: string;
  skills: string[];
  hasResume: boolean;
  hasJd: boolean;
  docIds: string[];
  facts: CandidateFact[];
  experienceYears: number | null;
  technologies: string[];
};

const SKILL_TERMS = [
  "azure data factory", "data factory", "adf", "azure databricks", "databricks", "pyspark", "apache spark", "spark",
  "python", "sql", "scala", "java", "adls", "adls gen2", "delta lake", "delta", "unity catalog", "azure sql",
  "synapse", "event hub", "event hubs", "kafka", "snowflake", "dbt", "airflow", "microsoft fabric", "fabric",
  "bigquery", "gcp", "aws", "glue", "redshift", "s3", "terraform", "docker", "kubernetes", "ci/cd", "github actions",
  "azure devops", "power bi", "tableau", "pandas", "hive", "oracle", "mysql", "postgres", "postgresql", "mongodb",
  "cosmos db", "ssis", "informatica", "autoloader", "delta live tables", "dlt", "structured streaming", "cdc",
  "scd", "medallion", "data lake", "lakehouse", "key vault", "azure monitor", "log analytics", "git", "linux",
  "rest api", "microservices", "hadoop", "nifi", "talend", "looker", "dbt core", "great expectations",
];

const textByDocId = new Map<string, { name: string; text: string }>();
const latestByUser = new Map<string, PersonaCard>();
const inflightByKey = new Map<string, Promise<PersonaCard | null>>();

function docCacheKey(userId: string, id: string) {
  return `${userId}:${id}`;
}

export function isResumeLikeFile(name: string) {
  return /(resume|cv|curriculum|profile|experience|bio)/i.test(name);
}

export function isJdLikeFile(name: string) {
  return /(job.?desc|\bjd\b|requisition|role.?desc|posting|opening)/i.test(name);
}

export async function ingestDocument(userId: string, id: string, name: string, buffer: Buffer) {
  const text = (await extractDocumentTextFromBuffer(name, buffer)).replace(/\s+/g, " ").trim();
  if (text) textByDocId.set(docCacheKey(userId, id), { name, text });
}

export function forgetPersona(userId: string) {
  latestByUser.delete(userId);
  for (const key of [...inflightByKey.keys()]) {
    if (key.startsWith(`${userId}:`)) inflightByKey.delete(key);
  }
  for (const key of [...textByDocId.keys()]) {
    if (key.startsWith(`${userId}:`)) textByDocId.delete(key);
  }
}

async function readDocText(userId: string, id: string, name: string): Promise<{ name: string; text: string } | null> {
  const cached = textByDocId.get(docCacheKey(userId, id));
  if (cached?.text) return cached;
  const stored = await readUserDocument(userId, id);
  if (!stored) return null;
  const text = (await extractDocumentTextFromBuffer(stored.name, stored.buffer)).replace(/\s+/g, " ").trim();
  if (!text) return null;
  const entry = { name: name || stored.name, text };
  textByDocId.set(docCacheKey(userId, id), entry);
  return entry;
}

function classifyDoc(name: string, text: string): "resume" | "jd" | "other" {
  if (isJdLikeFile(name) || /\b(job description|responsibilities|qualifications|requirements|we are looking)\b/i.test(text.slice(0, 800))) {
    if (!isResumeLikeFile(name)) return "jd";
  }
  if (isResumeLikeFile(name) || /\b(professional summary|work experience|technical skills|education)\b/i.test(text.slice(0, 800))) {
    return "resume";
  }
  return "other";
}

function extractName(text: string): string {
  const lines = text.split(/\n|(?<=[.])\s+/).map((line) => line.trim()).filter(Boolean).slice(0, 8);
  for (const line of lines) {
    if (/@|http|linkedin|github|phone|\d{3,}/i.test(line)) continue;
    if (line.length < 4 || line.length > 48) continue;
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && words.every((word) => /^[A-Za-z][A-Za-z.'-]*$/.test(word))) {
      return line;
    }
  }
  return "";
}

function extractSkills(text: string): string[] {
  const hay = text.toLowerCase();
  const found: string[] = [];
  for (const skill of SKILL_TERMS) {
    const needle = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?:^|[^a-z0-9])${needle}(?:$|[^a-z0-9])`, "i").test(hay) && !found.includes(skill)) {
      found.push(skill);
    }
  }
  return found.slice(0, 16);
}

function extractHeadline(text: string): string {
  const years = text.match(/(\d{1,2})\+?\s+years?/i)?.[0];
  const role = text.match(/\b((senior |lead |principal |staff )?(data engineer|data architect|analytics engineer|etl developer|spark developer|technical lead)s?)\b/i)?.[1];
  return [role, years].filter(Boolean).join(" · ").slice(0, 80);
}

function resumeSignal(text: string): string {
  const keep = text
    .split(/(?<=[.!?])\s+/)
    .filter((line) =>
      /(experience|project|responsib|achievement|delivered|implemented|designed|optimized|migration|azure|databricks|spark|python|sql|etl|pipeline|production|client|lead|mentored|company|role)/i.test(line),
    )
    .slice(0, 10);
  return keep.join(" ").replace(/\s+/g, " ").trim().slice(0, 700);
}

function jdSignal(text: string): string {
  const keep = text
    .split(/(?<=[.!?])\s+/)
    .filter((line) =>
      /(require|must|looking for|responsib|qualification|skill|experience|databricks|adf|spark|sql|python|azure|pipeline|cloud)/i.test(line),
    )
    .slice(0, 8);
  return keep.join(" ").replace(/\s+/g, " ").trim().slice(0, 500);
}

function extractYears(text: string): number | null {
  const match = text.match(/(\d{1,2})\+?\s+years?/i);
  if (!match) return null;
  const years = Number.parseInt(match[1] || "", 10);
  return Number.isFinite(years) ? years : null;
}

function buildFacts(args: {
  sourceName: string;
  skills: string[];
  resume: string;
  years: number | null;
}): CandidateFact[] {
  const facts: CandidateFact[] = args.skills.slice(0, 12).map((skill) => ({
    fact: `Worked with ${skill}`,
    source: args.sourceName || "resume",
    confidence: 0.9,
    kind: "skill" as const,
  }));
  if (args.years) {
    facts.unshift({
      fact: `${args.years}+ years of experience`,
      source: args.sourceName || "resume",
      confidence: 0.8,
      kind: "years",
    });
  }
  const projectHits = args.resume.match(/\b((?:implemented|designed|built|migrated|led) [^.]{12,80})/gi) || [];
  for (const hit of projectHits.slice(0, 4)) {
    facts.push({
      fact: hit.replace(/\s+/g, " ").trim(),
      source: args.sourceName || "resume",
      confidence: 0.7,
      kind: "project",
    });
  }
  return facts.slice(0, 16);
}

function buildCard(args: {
  name: string;
  headline: string;
  skills: string[];
  resume: string;
  jd: string;
  facts: CandidateFact[];
}): string {
  const factLines = args.facts.slice(0, 8).map((fact) => `- ${fact.fact} [${fact.source}]`);
  const lines = [
    args.name ? `Name: ${args.name}` : "",
    args.headline ? `Profile: ${args.headline}` : "",
    args.skills.length ? `Skills and expertise: ${args.skills.join(", ")}` : "",
    factLines.length ? `Grounded facts:\n${factLines.join("\n")}` : "",
    args.resume ? `Resume evidence:\n${args.resume}` : "",
    args.jd ? `This job description (optional, tilt answers toward this role without inventing JD-only experience):\n${args.jd}` : "",
    "Speak as this person when they ask about you. For technical questions, answer the mechanism — never open with job title or In my role as. If a fact is missing, say 'A production approach is…'.",
  ].filter(Boolean);
  return lines.join("\n").slice(0, 1400);
}

export async function preparePersona(
  userId: string,
  docs: PersonaDoc[] = [],
  jobDescription = "",
): Promise<PersonaCard | null> {
  const flightKey = `${userId}:${docs.map((doc) => String(doc.id || "")).filter(Boolean).sort().join(",")}:${jobDescription.length}`;
  const existing = inflightByKey.get(flightKey);
  if (existing) return existing;

  const work = (async () => {
    const resumeParts: string[] = [];
    const jdParts: string[] = [];
    const docIds: string[] = [];
    let fileNameHint = "";

    for (const doc of docs.slice(0, 3)) {
      const id = String(doc.id || "");
      if (!id) continue;
      docIds.push(id);
      try {
        const entry = await readDocText(userId, id, doc.name || "");
        if (!entry?.text) continue;
        fileNameHint = fileNameHint || entry.name;
        const kind = classifyDoc(entry.name, entry.text);
        if (kind === "jd") jdParts.push(entry.text);
        else resumeParts.push(entry.text);
      } catch {
        // Optional context must not block live answers.
      }
    }

    const pastedJd = String(jobDescription || "").replace(/\s+/g, " ").trim();
    if (pastedJd) jdParts.push(pastedJd);

    const resumeText = resumeParts.join(" ").trim();
    const jdText = jdParts.join(" ").trim();
    if (!resumeText && !jdText) return null;

    const source = resumeText || jdText;
    const skills = extractSkills(`${resumeText} ${jdText}`);
    const years = extractYears(source);
    const facts = buildFacts({
      sourceName: fileNameHint || "resume",
      skills,
      resume: resumeSignal(resumeText || source),
      years,
    });
    const card: PersonaCard = {
      name: extractName(resumeText) || extractName(source),
      skills,
      hasResume: Boolean(resumeText),
      hasJd: Boolean(jdText),
      docIds,
      facts,
      experienceYears: years,
      technologies: skills.slice(0, 12),
      card: buildCard({
        name: extractName(resumeText) || extractName(source),
        headline: extractHeadline(source) || fileNameHint,
        skills,
        resume: resumeSignal(resumeText || source),
        jd: jdText ? jdSignal(jdText) : "",
        facts,
      }),
    };
    const previous = latestByUser.get(userId);
    const richer = !previous
      || card.card.length >= previous.card.length
      || (card.hasResume && card.hasJd && !(previous.hasResume && previous.hasJd));
    if (richer) latestByUser.set(userId, card);
    return card;
  })();

  inflightByKey.set(flightKey, work);
  try {
    return await work;
  } finally {
    inflightByKey.delete(flightKey);
  }
}

export async function resolvePersona(
  userId: string,
  docs?: PersonaDoc[] | null,
  jobDescription = "",
): Promise<PersonaCard | null> {
  const latest = latestByUser.get(userId);
  if (latest) return latest;
  if ((docs && docs.length > 0) || jobDescription.trim()) {
    return preparePersona(userId, docs || [], jobDescription);
  }
  return null;
}
