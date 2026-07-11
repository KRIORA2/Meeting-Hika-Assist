---
name: MediaRecorder WebM fragmentation
description: Why MediaRecorder timeslice produces corrupted audio that OpenAI rejects, and the fix.
---

**Rule:** Never use `MediaRecorder.start(timeslice)` when sending individual chunks to OpenAI audio transcription APIs.

**Why:** With `timeslice`, `ondataavailable` fires every N ms with a WebM *fragment*. Only the first fragment has the EBML container header (which WebM/Matroska requires). All subsequent fragments are raw cluster data without it. OpenAI sees these as "corrupted or unsupported" files → 400 error.

**How to apply:** Use the stop/restart cycle pattern instead:
1. `recorder.start()` — no timeslice
2. After 8 s, call `recorder.stop()`
3. `onstop` fires → now `ondataavailable` has the complete, finalized file → send to API
4. In `onstop`, immediately start a new recorder for the next window
Track a `micActiveRef` boolean so `onstop` knows whether to restart or halt.

**Also applies to:** Any chunked recording sent to Whisper / gpt-4o-mini-transcribe. The fix is browser-side, not server-side.

**Model note:** `whisper-1` is NOT available through the Replit AI integration proxy → use `gpt-4o-mini-transcribe`.
