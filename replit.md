# geslaagd.app

geslaagd.app is a Dutch study companion that helps VWO and first-year bachelor students turn study topics into focused, checked learning material.

## Run & Operate

- `pnpm --filter @workspace/geslaagd-app run dev` — run the frontend (the artifact workflow supplies `PORT` and `BASE_PATH`)
- `pnpm --filter @workspace/api-server run dev` — run the API server (the artifact workflow supplies `PORT`)
- `pnpm run typecheck` — full typecheck across all packages
- `PORT=21090 BASE_PATH=/ pnpm --filter @workspace/geslaagd-app run build` — build the frontend locally
- `pnpm --filter @workspace/api-server run build` — build the API bundle
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push Drizzle schema changes (only when working on the separate DB package)
- Required secrets: `SUPABASE_SERVICE_ROLE_KEY`, `SLACK_BOT_TOKEN`
- Replit-managed secrets: `SESSION_SECRET`, `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`
- Public Supabase configuration is stored as non-secret environment configuration: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
- Slack logging expects channels named `signup-logs` and `sec-logs`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite
- API: Express 5
- Auth and data: Supabase Auth and PostgREST/RPC
- Event delivery: Slack bot with a durable Supabase outbox
- AI: OpenAI-compatible Replit AI Integration
- Validation: Zod
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/geslaagd-app` — React/Vite web application and Supabase browser client
- `artifacts/api-server` — Express API, Supabase server client, study routes, and Slack event delivery
- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/api-zod` and `lib/api-client-react` — generated API validation/types and React client
- `lib/db/src/schema` — Drizzle schema package for the workspace database tooling
- `artifacts/*/.replit-artifact/artifact.toml` — artifact preview paths, service ports, and managed workflows

## Architecture decisions

- Supabase access tokens are validated server-side before protected API operations.
- Auth events are written to a Supabase-backed outbox before Slack delivery, so transient Slack failures can be retried.
- Slack retries use the outbox event ID as the client message ID to avoid duplicate messages.
- The frontend and API remain separate artifacts and communicate through the `/api` path.

## Product

- Supabase email authentication and password recovery
- Study catalog browsing and personal study spaces
- AI-assisted study-topic proposals
- Auth/security event logging to Slack

## User preferences

No project-specific preferences recorded.

## Gotchas

- The artifact workflows inject `PORT` and `BASE_PATH`; standalone Vite builds need both values explicitly.
- The API eagerly initializes its AI client, so the Replit OpenAI integration variables must be present before the API starts.
- Keep the Slack bot installed in the workspace and grant it access to `signup-logs` and `sec-logs`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
