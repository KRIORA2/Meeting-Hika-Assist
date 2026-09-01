/** Small pure helpers shared by the Realtime UI and focused tests. */
export function appendRealtimeDelta(current: string, delta: string): string {
  if (!delta) return current;
  // Providers may replay a delta after a reconnect. Avoid rendering it twice.
  if (current.endsWith(delta)) return current;
  return delta.startsWith(current) ? delta : `${current}${delta}`;
}

export function acceptsRealtimeResponseEvent(
  activeResponseId: string | null,
  cancelledResponseIds: ReadonlySet<string>,
  incomingResponseId?: string,
): boolean {
  if (incomingResponseId && cancelledResponseIds.has(incomingResponseId)) return false;
  return !activeResponseId || !incomingResponseId || activeResponseId === incomingResponseId;
}

export class SingleRealtimeConnectionGate {
  private active = false;

  begin(): boolean {
    if (this.active) return false;
    this.active = true;
    return true;
  }

  end(): void {
    this.active = false;
  }

  get isActive(): boolean {
    return this.active;
  }
}
