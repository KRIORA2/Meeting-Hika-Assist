import type {
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions";

export const FALLBACK_ANSWER_MODEL = "gpt-5.6-sol";

export function resolveAnswerModel(requested?: string | null): string {
  const fromEnv = String(process.env.OPENAI_MODEL || "").trim();
  const allowed = new Set(
    (process.env.OPENAI_ALLOWED_MODELS || `${FALLBACK_ANSWER_MODEL},gpt-4.1,gpt-4o`)
      .split(",")
      .map((model) => model.trim())
      .filter(Boolean),
  );
  allowed.add(FALLBACK_ANSWER_MODEL);
  if (fromEnv) allowed.add(fromEnv);
  if (requested && allowed.has(requested)) return requested;
  return fromEnv || FALLBACK_ANSWER_MODEL;
}

function isGpt5Family(model: string) {
  return /^gpt-5(\b|[.-])/i.test(model);
}

type AnswerChatArgs = {
  model?: string;
  messages: ChatCompletionCreateParams["messages"];
  maxOutputTokens: number;
  temperature?: number;
  topP?: number;
};

function answerChatBody(args: AnswerChatArgs) {
  const model = process.env.OPENAI_MODEL || args.model || FALLBACK_ANSWER_MODEL;
  const shared = {
    model,
    messages: args.messages,
    response_format: { type: "json_object" as const },
  };
  if (isGpt5Family(model)) {
    return {
      ...shared,
      max_completion_tokens: args.maxOutputTokens,
      reasoning_effort: "none" as const,
    };
  }
  return {
    ...shared,
    max_tokens: args.maxOutputTokens,
    temperature: args.temperature,
    top_p: args.topP,
  };
}

export function buildAnswerChatParams(args: AnswerChatArgs & { stream: true }): ChatCompletionCreateParamsStreaming;
export function buildAnswerChatParams(args: AnswerChatArgs & { stream: false }): ChatCompletionCreateParamsNonStreaming;
export function buildAnswerChatParams(args: AnswerChatArgs & { stream: boolean }): ChatCompletionCreateParams {
  return {
    ...answerChatBody(args),
    stream: args.stream,
  };
}
