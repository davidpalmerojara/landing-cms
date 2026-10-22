# Paxl: frontend

Next.js (App Router), React, TypeScript, Zustand and Tailwind CSS. The editor, the dashboard, the marketing pages and the server-rendered published pages (`/p/[slug]`) live here; the API is the Django project in `../backend`.

Everything about the project (setup, architecture, conventions, API) is in the repository root:

- [`../README.md`](../README.md): what Paxl is, how to run it, known limitations.
- [`../AGENTS.md`](../AGENTS.md): the guide to the code (structure, store, blocks, endpoints, conventions).
- [`../DECISIONS.md`](../DECISIONS.md): architecture decisions (ADR).

From the repository root, `make install` and `make dev` start both parts. Inside this folder:

```bash
npm run dev        # http://localhost:3000 (needs the backend on :8001)
npm test           # Vitest
npm run lint
npm run typecheck
npm run e2e        # Playwright against the real stack
```

Environment variables are documented in `.env.example`.
