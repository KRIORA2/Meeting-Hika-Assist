import { ROLE_TITLE_OPENER } from "./answer-quality";
import type { QuestionAnalysis } from "./question-analyzer";

const CORPORATE = /^(in conclusion|to conclude|let'?s delve|first and foremost|there are several key (factors|points|aspects)|without further ado)\b[,:]?\s*/i;

function firstSentence(text: string): string {
  const match = String(text || "").trim().match(/^[^.!?\n]+[.!?]?/);
  return (match?.[0] || "").replace(/\s+/g, " ").trim();
}

function tokens(text: string): Set<string> {
  return new Set(
    String(text || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3),
  );
}

export function tokenOverlap(left: string, right: string): number {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const word of a) if (b.has(word)) hit += 1;
  return hit / Math.max(a.size, b.size);
}

export function extractOpener(answer: string): string {
  return firstSentence(answer).slice(0, 180);
}

const CONCEPT_ALIASES: Array<{ id: string; pattern: RegExp }> = [
  { id: "watermark", pattern: /\bwatermark/i },
  { id: "cdc", pattern: /\bcdc\b|change data capture/i },
  { id: "timestamp", pattern: /\btimestamp/i },
  { id: "source_filter", pattern: /source filter|filter the source|filter at (the )?source/i },
  { id: "changed_rows", pattern: /changed rows|changed records|new or changed/i },
  { id: "adf", pattern: /\badf\b|data factory/i },
  { id: "databricks", pattern: /databricks/i },
  { id: "merge", pattern: /delta merge|\bmerge\b/i },
  { id: "idempotent", pattern: /idempot/i },
  { id: "late_arriving", pattern: /late arriv/i },
  { id: "duplicate", pattern: /duplicate/i },
  { id: "retry", pattern: /\bretr(y|ies)\b/i },
  { id: "broadcast", pattern: /broadcast/i },
  { id: "skew", pattern: /\bskew/i },
  { id: "partition", pattern: /partition/i },
  { id: "zorder", pattern: /zorder/i },
  { id: "medallion", pattern: /medallion|bronze|silver|gold/i },
  { id: "unity_catalog", pattern: /unity catalog/i },
];

export function extractSpokenConcepts(answer: string): string[] {
  return conceptSequence(answer);
}

export function conceptSequence(answer: string): string[] {
  const hay = String(answer || "");
  const indexHits: Array<{ item: string; at: number }> = [];
  for (const row of CONCEPT_ALIASES) {
    const match = hay.match(row.pattern);
    if (!match || match.index == null) continue;
    indexHits.push({ item: row.id, at: match.index });
  }
  indexHits.sort((left, right) => left.at - right.at);
  const ordered: string[] = [];
  for (const hit of indexHits) {
    if (!ordered.includes(hit.item)) ordered.push(hit.item);
  }
  return ordered.slice(0, 8);
}

export function sequenceOverlap(left: string[], right: string[]): number {
  if (!left.length || !right.length) return 0;
  const shared = left.filter((item) => right.includes(item)).length;
  return shared / Math.max(left.length, right.length);
}

export type RepetitionReport = {
  score: number;
  reasons: string[];
};

export function scoreRepetition(
  answer: string,
  recentOpeners: string[] = [],
  recentAnswers: string[] = [],
  coveredConcepts: string[] = [],
): RepetitionReport {
  const reasons: string[] = [];
  let score = 0;
  const opener = extractOpener(answer);
  if (recentOpeners[0] && tokenOverlap(opener, recentOpeners[0]) >= 0.55) {
    score += 0.35;
    reasons.push("repeated_opener");
  }
  if (CORPORATE.test(answer) || ROLE_TITLE_OPENER.test(answer)) {
    score += 0.4;
    reasons.push("corporate_intro");
  }
  const seq = conceptSequence(answer);
  const prevSeq = conceptSequence(recentAnswers[0] || "");
  const seqScore = sequenceOverlap(seq, prevSeq);
  if (seqScore >= 0.6) {
    score += 0.4;
    reasons.push("repeated_concept_sequence");
  }
  const reusedCovered = seq.filter((item) => coveredConcepts.includes(item));
  if (reusedCovered.length >= 3) {
    score += 0.2;
    reasons.push("reused_covered_concepts");
  }
  return { score: Math.min(1, score), reasons };
}

export function applyRepetitionGuard(
  answer: string,
  recentOpeners: string[] = [],
  recentAnswers: string[] = [],
  analysis?: QuestionAnalysis,
): string {
  let text = String(answer || "").replace(ROLE_TITLE_OPENER, "").replace(CORPORATE, "").trim();
  if (!text) return text;

  const opener = firstSentence(text);
  const lastOpener = recentOpeners[0] || "";
  if (lastOpener && tokenOverlap(opener, lastOpener) >= 0.55) {
    const rest = text.slice(opener.length).trim();
    if (rest.split(/\s+/).length >= 18) text = rest.replace(/^[,;:\s]+/, "");
  }

  const previous = recentAnswers[0] || "";
  if (previous && analysis?.relationToPreviousQuestion !== "new_topic") {
    const prevSentences = previous.split(/(?<=[.!?])\s+/).map((line) => line.trim()).filter(Boolean);
    const nextSentences = text.split(/(?<=[.!?])\s+/).map((line) => line.trim()).filter(Boolean);
    const kept = nextSentences.filter((sentence) => {
      return !prevSentences.some((old) => tokenOverlap(sentence, old) >= 0.72 && sentence.split(/\s+/).length > 8);
    });
    if (kept.length >= 2) text = kept.join(" ");

    const prevSeq = conceptSequence(previous);
    const nextSeq = conceptSequence(text);
    if (
      sequenceOverlap(nextSeq, prevSeq) >= 0.7
      && analysis?.intent !== "clarification"
      && analysis?.intent !== "why"
      && analysis?.intent !== "limitations"
      && analysis?.relationToPreviousQuestion !== "challenge"
      && analysis?.relationToPreviousQuestion !== "why_follow_up"
    ) {
      const drop = new Set(prevSeq.slice(0, Math.min(3, prevSeq.length)));
      const filtered = text.split(/(?<=[.!?])\s+/).filter((sentence) => {
        const hits = conceptSequence(sentence);
        return hits.length === 0 || !hits.every((item) => drop.has(item));
      });
      if (filtered.join(" ").split(/\s+/).length >= 18) text = filtered.join(" ");
    }
  }

  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function looksLikeRepeatedOpener(answer: string, recentOpeners: string[]): boolean {
  const opener = extractOpener(answer);
  return recentOpeners.some((old) => old && tokenOverlap(opener, old) >= 0.6);
}
