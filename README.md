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



