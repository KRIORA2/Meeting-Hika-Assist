export { openai } from "./client";
export { generateImageBuffer, editImages } from "./image";
export { batchProcess, batchProcessWithSSE, isRateLimitError, type BatchOptions } from "./batch";
export {
  speechToText,
  ensureCompatibleFormat,
  detectAudioFormat,
  type AudioFormat,
} from "./audio";

export { realtimeService, RealtimeService } from "./realtime";
