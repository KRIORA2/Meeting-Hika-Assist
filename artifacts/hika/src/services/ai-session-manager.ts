export type AIStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "listening"
  | "thinking"
  | "responding";

export interface TranscriptEvent {
  text: string;
  timestamp: number;
}

export interface SuggestionEvent {
  text: string;
  confidence?: number;
}

export class AISessionManager {
  private status: AIStatus = "disconnected";

  connect() {
    console.log("Connecting to AI...");
    this.status = "connecting";
  }

  disconnect() {
    console.log("Disconnected");
    this.status = "disconnected";
  }

  startListening() {
    console.log("Listening...");
    this.status = "listening";
  }

  stopListening() {
    console.log("Stopped listening");
    this.status = "connected";
  }

  sendAudioChunk(chunk: ArrayBuffer) {
    console.log("Sending audio chunk", chunk.byteLength);
  }

  onTranscript(callback: (event: TranscriptEvent) => void) {
    console.log("Transcript listener registered");
  }

  onSuggestion(callback: (event: SuggestionEvent) => void) {
    console.log("Suggestion listener registered");
  }

  getStatus() {
    return this.status;
  }
}

export const aiSessionManager = new AISessionManager();