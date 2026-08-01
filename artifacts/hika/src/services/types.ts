// ===============================================
// Hika Realtime AI Types
// ===============================================

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface TranscriptChunk {
  id: string;
  text: string;
  timestamp: number;
  final: boolean;
}

export interface AIResponse {
  id: string;
  question?: string;
  answer: string;
  confidence?: "low" | "medium" | "high";
  createdAt: number;
}

export interface SessionConfig {
  apiKey?: string;
  model: string;
}

export interface RealtimeEvents {
  onConnected?: () => void;

  onDisconnected?: () => void;

  onTranscript?: (text: string, final: boolean) => void;

  onAIResponse?: (response: AIResponse) => void;

  onError?: (error: Error) => void;
}