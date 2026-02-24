# LoveLab B2B Quote Calculator

## Cursor Cloud specific instructions

### Overview

Single Next.js 16 application (App Router) — a B2B quote building tool for a jewelry brand's sales team. No monorepo, no Docker, no test framework. Uses npm as package manager.

### Running the dev server

```bash
npm run dev
# Starts on http://localhost:3000
```

The app requires Supabase credentials to function beyond the login page. Without real secrets, the login page renders but authentication won't work. The main page (`/`) redirects to `/login` via middleware when unauthenticated.

### Lint

`npm run lint` calls `next lint`, which was **removed in Next.js 16**. There is no ESLint configuration or dependency in the project. Linting is currently non-functional. If adding linting, install `eslint` and `eslint-config-next` and create an `eslint.config.mjs`.

### Build

```bash
npm run build   # Turbopack production build — works with placeholder env vars
```

### Tests

No test framework is installed. No test files exist. If tests need to be added, consider installing a framework (e.g., Vitest or Jest).

### Environment variables

All secrets must be provided in `.env` (copy from `.env.example`). Required for full functionality:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (client-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side) |
| `ANTHROPIC_API_KEY` | Claude AI features |
| `PERPLEXITY_API_KEY` | Company lookup feature |

The build and dev server start fine with placeholder values, but authentication and all API features require real credentials.

### Gotchas

- Next.js 16 deprecates `middleware.js` in favor of `proxy`. The build emits a warning but still works.
- The project `package.json` specifies `next ^16.0.0` but `README.md` and `Resume.md` reference Next.js 14 — the project has been upgraded.
- No database runs locally; all data operations use cloud-hosted Supabase.
- Rate limiting is in-memory (per-process), not distributed.
