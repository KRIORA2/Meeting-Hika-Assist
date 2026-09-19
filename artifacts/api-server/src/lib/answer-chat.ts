import type {
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions";

export const FALLBACK_ANSWER_MODEL = "gpt-5.6-sol";
export const ANSWER_API_METHOD = "chat.completions.create";

export type UpstreamAiError = {
  status: number;
  code: string;
  type: string;
  param: string;
  message: string;
  requestID: string;
};

export function extractUpstreamError(err: unknown): UpstreamAiError {
  const anyErr = err as {
    status?: number;
    statusCode?: number;
    code?: string;
    type?: string;
    param?: string;
    message?: string;
    requestID?: string;
    request_id?: string;
    headers?: Record<string, string | undefined>;
    error?: { message?: string; type?: string; code?: string; param?: string; status?: number };
  };
  const nested = anyErr?.error && typeof anyErr.error === "object" ? anyErr.error : {};
  const message = String(nested.message || anyErr?.message || err || "");
  const code = String(anyErr?.code || nested.code || "");
  const type = String(anyErr?.type || nested.type || "");
  const param = String(anyErr?.param || nested.param || "");
  let status = Number(anyErr?.status || anyErr?.statusCode || nested.status) || 0;
  if (!status && /credit_balance_exhausted|insufficient_quota|credits remaining/i.test(`${code} ${type} ${message}`)) status = 429;
  if (!status && /rate_limit|rate limit/i.test(`${code} ${type} ${message}`)) status = 429;
  if (!status && /invalid_api_key|unauthorized/i.test(`${code} ${type} ${message}`)) status = 401;
  if (!status && /model_not_found|does not have access|forbidden/i.test(`${code} ${type} ${message}`)) status = 403;
  if (!status && /invalid_request|unsupported parameter|unknown parameter|missing required/i.test(`${code} ${type} ${message}`)) status = 400;
  return {
    status,
    code,
    type,
    param,
    message,
    requestID: String(anyErr?.requestID || anyErr?.request_id || anyErr?.headers?.["x-request-id"] || ""),
  };
}

export function annotateOpenAiError(
  err: unknown,
  extra: {
    model: string;
    method?: string;
    firstTokenArrived?: boolean;
    openAiRequestMs?: number;
  },
) {
  const upstream = extractUpstreamError(err);
  const target = (err && typeof err === "object" ? err : new Error(upstream.message)) as {
    status?: number;
    code?: string;
    type?: string;
    param?: string;
    requestID?: string;
    model?: string;
    method?: string;
    openAiStarted?: boolean;
    firstTokenArrived?: boolean;
    openAiCompleted?: boolean;
    openAiRequestMs?: number;
  };
  target.status = upstream.status || target.status || 500;
  target.code = upstream.code || target.code;
  target.type = upstream.type || target.type;
  target.param = upstream.param || target.param;
  target.requestID = upstream.requestID || target.requestID;
  target.model = extra.model;
  target.method = extra.method || ANSWER_API_METHOD;
  target.openAiStarted = true;
  target.firstTokenArrived = Boolean(extra.firstTokenArrived);
  target.openAiCompleted = false;
  target.openAiRequestMs = extra.openAiRequestMs;
  if (upstream.message && target instanceof Error) target.message = upstream.message;
  return target;
}

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
