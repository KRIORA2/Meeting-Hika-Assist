/** Keep in sync with artifacts/api-server/src/lib/question-finalizer.ts */

const INCOMPLETE_STEM = /^(how would you|how do you|how can you|what about|can you|could you|walk me through|so how|and then|what if|suppose)(\s+(handle|do|implement|process|deal with|make|use|choose))?(\s+a)?\s*[.?,]*$/i;
const TRAILING_FUNCTION = /\b(the|a|an|to|for|with|of|and|or|if)\s*[.?,]*$/i;

export function isIncompleteQuestion(text: string): boolean {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return true;
  if (INCOMPLETE_STEM.test(value)) return true;
  if (/\b(how would you|how do you|how can you)\s*$/i.test(value)) return true;
  if (/\.{2,}$|…$/.test(value)) return true;
  if (TRAILING_FUNCTION.test(value)) return true;
  const words = value.split(/\s+/);
  if (words.length <= 3 && /^(how|what|why|can|could|walk)\b/i.test(value) && !/[?]/.test(value)) return true;
  if (
    words.length < 7
    && /^(how|what|why|can you)\b/i.test(value)
    && !/[?]/.test(value)
    && !/\b(fail|merge|load|skew|join|lake|factory|spark|sql|cdc|watermark|delta|adf|pipeline|fabric|snowflake|kafka)\b/i.test(value)
  ) {
    return true;
  }
  return false;
}
