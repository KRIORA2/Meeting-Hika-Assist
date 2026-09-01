\# Hika Meeting Assistant



Hika Meeting Assistant is an AI-powered desktop application that provides real-time meeting assistance. It captures meeting audio, generates live transcripts, analyzes conversations, and provides intelligent responses and insights during meetings.



\## Features



\* 🎤 Live meeting transcription

\* 🤖 AI-powered real-time answers

\* 💡 Meeting insights and analysis

\* 🖥️ Cross-platform Electron desktop application

\* ⚡ Built with React, Electron, TypeScript, and PNPM Workspace

\* 🔒 Secure local desktop experience



\## Technology Stack



\* Electron

\* React

\* TypeScript

\* Vite

\* PNPM Workspace

\* OpenAI API

\* PostgreSQL

\* Drizzle ORM



\## Project Structure



```text

lib/            Shared libraries

scripts/        Utility scripts

artifacts/      Local build output (ignored by Git)

```



\## Installation



Clone the repository:



```bash

git clone https://github.com/A2Forge/hika-assist.git

cd hika-assist

```



Install dependencies:



```bash

pnpm install

```



\## Running the Application



Start the development environment:



```bash

pnpm dev

```



\## Building the Desktop Application



```bash

pnpm build

```



\## Environment Variables



Create a `.env` file based on `.env.example`.



Example:



```env

OPENAI\_API\_KEY=

DATABASE\_URL=

PORT=3000

```



\## V1 Deployment

Deploy the API to Render using `render.yaml` from the repository root. Set
`DATABASE_URL`, `OPENAI_API_KEY`, `GOOGLE_CLIENT_ID` (when Google sign-in is
enabled), and `CORS_ALLOWED_ORIGINS` in Render. Set `CORS_ALLOWED_ORIGINS` to
the Vercel production URL, for example `https://your-project.vercel.app`.

Deploy the frontend as a Vercel project from the repository root. Vercel reads
`vercel.json`; add `VITE_API_URL` with the Render API URL, for example
`https://your-render-api.onrender.com`, then redeploy the frontend.

For Google sign-in, create a Google OAuth **Web application** client. Add the
Vercel URL to its Authorized JavaScript origins. In Vercel, set
`VITE_GOOGLE_CLIENT_ID` to that client ID. In Render, set `GOOGLE_CLIENT_IDS`
to the exact same value (or set `GOOGLE_CLIENT_ID` to it). After changing a
Vercel `VITE_` variable, redeploy the frontend because it is embedded at build
time.

For this first version, uploaded resume and job-description files are stored
on the Render instance filesystem. They remain available while that instance
is running, but are removed by instance restarts or redeployments. Use object
storage before relying on uploads for persistent production records.

\## Roadmap



\* Improve AI response latency

\* Automatic desktop updates

\* User authentication

\* Cloud synchronization

\* Meeting history dashboard

\* Production deployment



\## License



Copyright © A2Forge.



All rights reserved.



