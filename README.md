# Hikanest Meeting Assistant

Hikanest is an AI meeting and interview assistant. Its desktop overlay captures
meeting audio, produces a live transcript, and shows context-aware answers or
runnable code. The answer style adapts between interview and professional
meeting modes.

## Workspace

```text
artifacts/hika/          React + Vite web application
artifacts/api-server/    Express API (OpenAI proxy + Firebase Admin)
artifacts/hika-desktop/  Electron desktop overlay
lib/api-spec/            OpenAPI source and code generation
lib/api-client-react/    Generated React Query client
lib/api-zod/             Generated API validation schemas
lib/integrations-*/      Shared OpenAI and audio helpers
scripts/                 Verification and maintenance scripts
```

Despite its historical name, `artifacts/` contains primary application source.
Generated `dist/` and `release/` folders are build output.

## Requirements

- Node.js 20+
- pnpm 10.14.0
- A Firebase project with Authentication, Firestore, and Storage
- An OpenAI API key

## Local setup

```bash
git clone https://github.com/KRIORA2/Meeting-Hika-Assist.git
cd Meeting-Hika-Assist
pnpm install
copy .env.example .env
```

Set at least `OPENAI_API_KEY`, `PORT=5000`, the `VITE_FIREBASE_*` web keys, and
the Firebase Admin keys (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
`FIREBASE_PRIVATE_KEY`, `FIREBASE_STORAGE_BUCKET`). In Firebase Console, enable
Email/Password and Google sign-in, then deploy `firestore.rules` and
`storage.rules`.

Run the API and web app together:

```bash
pnpm dev
```

Or run each surface separately:

```bash
pnpm dev:api
pnpm dev:web
pnpm dev:desktop
```

The desktop app uses the hosted API by default. Set `HIKA_API_URL` and
`HIKA_WEB_APP_URL` when testing against another environment.

## Quality checks

```bash
pnpm typecheck
pnpm verify:realtime
pnpm build
```

Build a Windows installer:

```bash
pnpm --filter @workspace/hika run build
pnpm --filter @workspace/hika-desktop run build:win
```

## Deployment

- **Web:** Vercel reads `vercel.json`. Set `VITE_API_URL` and the `VITE_FIREBASE_*` keys.
- **API:** Render reads `render.yaml`. Set `OPENAI_API_KEY`, `CORS_ALLOWED_ORIGINS`, and Firebase Admin credentials.
- **Desktop:** pushing a `v*` tag runs `.github/workflows/release.yml` and
  publishes the Windows installer to this repository's GitHub Releases.

Accounts, sessions, insights, and documents are stored in Firebase. The Express
API verifies Firebase ID tokens and keeps the OpenAI key on the server.

Windows installers should be code-signed before a public release. Configure
`CSC_LINK` and `CSC_KEY_PASSWORD` as GitHub Actions secrets.

## Security notes

- The permanent OpenAI API key remains on the API server.
- Browser and Electron clients receive short-lived Realtime credentials.
- Meetings, insights, documents, and OpenAI routes require a Firebase ID token
  or a short-lived desktop handoff token.
- Uploaded documents are isolated per account and validated by type and size.
- Keep `.env` files and generated installers out of Git history.

## License

MIT
