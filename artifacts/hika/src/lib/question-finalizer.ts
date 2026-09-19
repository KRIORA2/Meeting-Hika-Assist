/** Keep in sync with artifacts/api-server/src/lib/question-finalizer.ts */

const INCOMPLETE_STEM = /^(how would you|how do you|how can you|what about|can you|could you|walk me through|so how|and then|what if|suppose)(\s+(handle|do|implement|process|deal with|make|use|choose))?(\s+a)?\s*[.?,]*$/i;
const TRAILING_FUNCTION = /\b(the|a|an|to|for|with|of|and|or|if)\s*[.?,]*$/i;

export function mergeSpokenTranscript(existing: string, incoming: string): string {
  const next = String(incoming || "").replace(/\s+/g, " ").trim();
  const current = String(existing || "").replace(/\s+/g, " ").trim();
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

export function isIncompleteQuestion(text: string): boolean {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return true;
  if (INCOMPLETE_STEM.test(value)) return true;
  if (/\b(how would you|how do you|how can you)\s*$/i.test(value)) return true;
  if (/\.{2,}$|…$/.test(value)) return true;
  if (TRAILING_FUNCTION.test(value)) return true;
  const words = value.split(/\s+/);
  const namedTech = /\b(fail|merge|load|skew|join|lake|factory|spark|sql|cdc|watermark|delta|adf|pipeline|fabric|snowflake|kafka|pyspark|databricks|scd(?:\s*type)?|unity catalog|direct lake|power bi|synapse|dlt|lakehouse|parquet)\b/i;
  if (words.length <= 3 && /^(how|what|why|can|could|walk)\b/i.test(value) && !/[?]/.test(value) && !namedTech.test(value)) return true;
  if (
    words.length < 7
    && /^(how|what|why|can you)\b/i.test(value)
    && !/[?]/.test(value)
    && !namedTech.test(value)
  ) {
    return true;
  }
  return false;
}
