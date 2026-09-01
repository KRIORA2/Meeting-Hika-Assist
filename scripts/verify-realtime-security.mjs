import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const web = read("../artifacts/hika/src/pages/MeetingAssistant.tsx");
const overlay = read("../artifacts/hika-desktop/overlay/overlay.js");
const server = read("../artifacts/api-server/src/routes/openai.ts");

assert(!web.includes("OPENAI_API_KEY"), "Permanent OpenAI key reference found in web renderer");
assert(!overlay.includes("OPENAI_API_KEY"), "Permanent OpenAI key reference found in Electron renderer");
assert(server.includes("/v1/realtime/client_secrets"), "Server must mint short-lived Realtime client secrets");
assert(server.includes("INTERVIEW_VAD_SILENCE_MS") && server.includes("MEETING_VAD_SILENCE_MS"), "VAD timings must be configurable");
assert(web.includes("response.cancel"), "Web renderer must cancel an interrupted response");
assert(web.includes("realtimePeerRef.current?.connectionState === \"connected\""), "Web renderer must guard against duplicate peers");

console.log("Realtime security and lifecycle guard checks passed.");
