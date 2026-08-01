import { openai } from "../client";

/**
 * Placeholder for the future Realtime API service.
 * We'll expand this class step by step.
 */
export class RealtimeService {
  constructor() {}

  getClient() {
    return openai;
  }
}

/** Singleton instance */
export const realtimeService = new RealtimeService();