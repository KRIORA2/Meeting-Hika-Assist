/** Shared question-finalization heuristics. Keep overlay.js in sync with these patterns. */

export const FILLER = /^(okay|ok|alright|right|yeah|yep|yup|mm+|uh-?huh|thanks|thank you|got it|cool|sure|moving on|let'?s move on|next question)([\s,!.]+(moving on|got it|thanks|next|right)[\s.!]*)*$/i;

export const INCOMPLETE_STEM = /^(how would you|how do you|how can you|what about|what would you|can you|could you|walk me through|so how|and then|what if|suppose|tell me|explain)(\s+(handle|do|implement|process|deal with|make|use|choose|explain|about))?(\s+a)?\s*[.?,]*$/i;

export const TRAILING_FUNCTION = /\b(the|a|an|to|for|with|of|and|or|if)\s*[.?,]*$/i;

export const ANAPHORA = /\b(it|that|those|them|this|the same|your approach|the (pipeline|job|load|table|source|design|records?|changes?|query|system|process|storage))\b/i;

export const CONTINUATION = /^(why\b|what if\b|suppose\b|and\b|so\b|okay\b|now\b|can you give|what's the (downside|drawback)|would you|how would you (optimize|handle|make|monitor|secure|deploy)|what happens if|what would happen if|what would you change|wouldn'?t\b|are you sure)/i;

export const QUESTION_STABLE_MS = 180;

export const NAMED_TECH = /\b(fail|merge|load|loading|skew|join|lake|factory|spark|sql|cdc|watermark|delta|adf|pipeline|fabric|snowflake|kafka|pyspark|python|databricks|scd(?:\s*type)?|unity catalog|direct lake|power bi|synapse|dlt|lakehouse|parquet|duplicate|schema|salary|incremental|code|query|script)\b/i;

export function unwrapAnswerThis(text: string): string {
  return String(text || "")
    .replace(/^ANSWER THIS:\s*"/i, "")
    .replace(/"\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSpokenQuestion(text: string): string {
  return unwrapAnswerThis(text);
}

/**
 * Light local speech cleanup only. Does not invent a different question.
 * Lets downstream intent rules see "how do you implement" instead of "how you implement".
 */
export function normalizeInterviewEnglish(text: string): string {
  let t = unwrapAnswerThis(text);
  if (!t) return "";

  t = t.replace(/\b(um+|uh+|er+|ah+)\b/gi, " ").replace(/\s+/g, " ").trim();
  t = t.replace(/^could you explain me\s+/i, "Could you explain ");
  t = t.replace(/^explain me\s+/i, "Explain ");
  t = t.replace(/^tell(?: me)? difference\b/i, "tell me the difference between");
  t = t.replace(/\bhow you\b/gi, "how do you");
  t = t.replace(/\bhow (optimize|implement|handle|remove|write|code)\b/gi, "how do you $1");
  t = t.replace(/^(.+?)\s+(what is|what's)\s*\??$/i, (_, topic) => `What is ${String(topic).trim()}?`);
  t = t.replace(/^(.+?)\s+means what\s*\??$/i, (_, topic) => `What does ${String(topic).trim()} mean?`);
  t = t.replace(/^what actually (.+?) means\s*\??$/i, (_, topic) => `What does ${String(topic).trim()} mean?`);
  t = t.replace(/\bwrite (?:a )?(pyspark|sql|python|spark)(?:\s+code)?\s+(?!to\b)/i, "write $1 code to ");
  t = t.replace(/\bcan you write (scd\s*2|scd2|scd\s*1|scd1|scd)\b/i, "can you write $1 code");
  return t.replace(/\s+/g, " ").trim();
}

export function newQuestionIdentity(transcript = ""): { questionId: string; generationId: string; transcript: string } {
  const stamp = Date.now().toString(36);
  const rand = () => Math.random().toString(36).slice(2, 8);
  return {
    questionId: `q_${stamp}_${rand()}`,
    generationId: `g_${stamp}_${rand()}`,
    transcript: String(transcript || ""),
  };
}

export function isIncompleteQuestion(question: string): boolean {
  const text = unwrapAnswerThis(question);
  if (!text) return true;
  if (INCOMPLETE_STEM.test(text)) return true;
  if (/\b(how would you|how do you|how can you|what would you|can you explain|could you explain|walk me through)\s*$/i.test(text)) return true;
  if (/\.{2,}$|…$/.test(text)) return true;
  if (TRAILING_FUNCTION.test(text)) return true;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 2 && !NAMED_TECH.test(text) && !/[?]/.test(text)) return true;
  if (words.length <= 3 && /^(how|what|why|can|could|walk)\b/i.test(text) && !/[?]/.test(text) && !NAMED_TECH.test(text)) {
    return true;
  }
  return false;
}

export function mergeSpokenTranscript(existing: string, incoming: string): string {
  const next = unwrapAnswerThis(incoming);
  const current = unwrapAnswerThis(existing);
  if (!next) return current;
  if (!current) return next;
  if (current === next || current.endsWith(next)) return current;
  if (next.startsWith(current) && next.length > current.length) return next;
  if (current.includes(next) && current.length >= next.length) return current;
  if (next.includes(current) && next.length > current.length) return next;
  const maxChars = Math.min(current.length, next.length);
  for (let n = maxChars; n >= 8; n -= 1) {
    if (current.slice(-n) === next.slice(0, n)) {
      return `${current}${next.slice(n)}`.replace(/\s+/g, " ").trim();
    }
  }
  const curWords = current.split(/\s+/);
  const nextWords = next.split(/\s+/);
  for (let n = Math.min(curWords.length, nextWords.length); n >= 2; n -= 1) {
    if (curWords.slice(-n).join(" ") === nextWords.slice(0, n).join(" ")) {
      return [...curWords, ...nextWords.slice(n)].join(" ");
    }
  }
  return `${current} ${next}`.replace(/\s+/g, " ").trim();
}

export function looksLikeFollowUpShape(question: string): boolean {
  const q = question.toLowerCase();
  const words = q.split(/\s+/).length;
  if (ANAPHORA.test(q) && words <= 24) return true;
  if (CONTINUATION.test(q) && words <= 24) return true;
  if (/^(what|why|how|and\b|can you|could you|for example|what if|okay|now how|would you|suppose|take me)/i.test(q) && words <= 10) {
    return !/^(what is|what are|what's|have you|tell me about)\b/i.test(q) || ANAPHORA.test(q);
  }
  return false;
}
