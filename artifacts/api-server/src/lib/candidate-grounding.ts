import type { PersonaCard } from "./persona";

const TECH = [
  "kafka", "spark", "pyspark", "databricks", "adf", "azure data factory",
  "delta", "snowflake", "airflow", "dbt", "terraform", "kubernetes",
  "docker", "react", "node", "aws", "gcp", "synapse", "fabric", "sql server",
];

const CLAIM = /\b(i('ve| have| had)? (worked with|used|implemented|built|run)|in my (current )?project we (use|used)|we used|i used)\b(.{0,40})/gi;

function skillSet(persona?: PersonaCard | null): Set<string> {
  const values = [...(persona?.skills || []), ...(persona?.technologies || [])]
    .map((item) => item.toLowerCase());
  return new Set(values);
}

const TECH_ALIASES: Record<string, string[]> = {
  adf: ["adf", "azure data factory", "data factory"],
  "azure data factory": ["adf", "azure data factory", "data factory"],
  databricks: ["databricks", "azure databricks"],
  "azure databricks": ["databricks", "azure databricks"],
  delta: ["delta", "delta lake"],
  "delta lake": ["delta", "delta lake"],
};

function aliasesFor(tech: string): string[] {
  const needle = tech.toLowerCase().trim();
  return TECH_ALIASES[needle] || [needle];
}

function isGrounded(tech: string, skills: Set<string>): boolean {
  const aliases = aliasesFor(tech);
  for (const skill of skills) {
    const skillAliases = aliasesFor(skill);
    for (const alias of aliases) {
      for (const known of skillAliases) {
        if (alias === known || alias.includes(known) || known.includes(alias)) return true;
      }
    }
  }
  return false;
}

export function rewriteUngroundedExperience(answer: string, persona?: PersonaCard | null): {
  text: string;
  stripped: string[];
} {
  const skills = skillSet(persona);
  const stripped: string[] = [];
  let text = String(answer || "");
  const fences: string[] = [];
  text = text.replace(/```[\s\S]*?```/g, (block) => {
    fences.push(block);
    return `\n%%HIKA_CODE_${fences.length - 1}%%\n`;
  });

  for (const tech of TECH) {
    if (isGrounded(tech, skills)) continue;
    const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const claimRe = new RegExp(
      `\\b(I(?:'ve| have| had)? (?:worked with|used|implemented|built)|in my (?:current )?project,? we (?:use|used)|we (?:currently )?use(?:d)?|I currently use) ${escaped}\\b[^.!?]{0,80}`,
      "gi",
    );
    text = text.replace(claimRe, (match) => {
      stripped.push(tech);
      return `I haven't worked with ${tech} directly, but technically I would`;
    });
  }

  if (!skills.size) {
    text = text.replace(CLAIM, (match) => {
      if (/a production approach|typically i would|one way to/i.test(match)) return match;
      stripped.push("ungrounded-claim");
      return match.replace(/^(I(?:'ve| have| had)? (?:worked with|used|implemented)|in my (?:current )?project we (?:use|used)|we used)/i, "A typical production approach uses");
    });
  }

  text = text.replace(/%%HIKA_CODE_(\d+)%%/g, (_, index) => fences[Number(index)] || "");
  return { text: text.replace(/[ \t]+\n/g, "\n").trim(), stripped: [...new Set(stripped)] };
}

export function personaKnows(persona: PersonaCard | null | undefined, tech: string): boolean {
  return isGrounded(tech, skillSet(persona));
}
