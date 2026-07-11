# Hika.ai

A real-time AI co-pilot for meetings — listens to your microphone, optionally captures your screen, transcribes speech, and surfaces instant answers and action items while you're live in Zoom, Teams, or Google Meet.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/hika run dev` — run the Hika.ai frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY` — provisioned via Replit AI Integrations

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind (dark theme, cyan accent)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- AI: OpenAI via Replit AI Integrations (gpt-5-mini for analysis, gpt-4o-mini-transcribe for audio)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/sessions.ts` — sessions table
- `lib/db/src/schema/insights.ts` — insights table
- `artifacts/api-server/src/routes/` — Express route handlers (sessions, insights, stats, openai)
- `artifacts/hika/src/pages/Copilot.tsx` — main co-pilot page (screen + mic capture, transcript, AI answers)
- `artifacts/hika/src/pages/Sessions.tsx` — session history
- `artifacts/hika/src/pages/SessionDetail.tsx` — session detail with insight timeline

## Architecture decisions

- Screen capture via `getDisplayMedia` (browser), mic via `getUserMedia` — entirely browser-side, no server-side streaming
- Audio chunked every 8s via MediaRecorder → base64 → `/api/openai/transcribe` (OpenAI Whisper)
- Context analysis every 30s (or on demand) → `/api/openai/analyze` with transcript + optional JPEG screenshot
- AI responses use `gpt-5-mini` with JSON mode for structured `{ answer, suggestions, confidence }`
- Insights stored in DB per session for persistent history
- Dark-only theme (forced via `document.documentElement.classList.add("dark")`)

## Product

- **Co-pilot page**: Start a meeting session, share screen + mic, see live rolling transcript, and get AI answers in real time. Ask specific questions manually anytime.
- **Sessions page**: Browse all past sessions with platform, duration, and insight count.
- **Session detail**: Full timeline of AI insights from a session.

## User preferences

_Populate as you build._

## Gotchas

- `openai` package must be in `artifacts/api-server/package.json` dependencies (not just the integration lib)
- After each OpenAPI spec change, re-run codegen before using the updated types
- Browser screen capture requires HTTPS in production (works on localhost)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `lib/integrations-openai-ai-server/` for the OpenAI client setup
