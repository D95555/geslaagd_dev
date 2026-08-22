---
name: Supabase migration application
description: How to apply pending SQL migrations to the live external Supabase project from this workspace.
---

`SUPABASE_ACCESS_TOKEN` is a working Supabase Management API personal access token in
this workspace (verified 2026-08-22). Use it to run arbitrary SQL (including multi-statement
DDL/migrations) directly against the live project via:

```
POST https://api.supabase.com/v1/projects/{project_ref}/database/query
Authorization: Bearer $SUPABASE_ACCESS_TOKEN
Content-Type: application/json
Body: {"query": "<sql>"}
```

Get `project_ref` (and confirm the token works) via `GET https://api.supabase.com/v1/projects`
with the same bearer token — it returns `id`/`ref`, region, and db host for every accessible project.

A successful DDL/DML run returns `[]` (or row data for SELECT). Do this via `ShellExec`
`curl` (not CodeExecution's impure `fetch`, which cannot read `process.env` secrets) so the
token stays in the shell's env and never appears in code or logs.

Direct `psql`/`PGPASSWORD` connections to `db.<ref>.supabase.co` failed silently in this
workspace even with `SUPABASE_DB_PASSWORD` set — use the Management API query endpoint
instead, not a direct Postgres connection.

**Why:** An earlier session incorrectly concluded no management token was available and
left a schema migration unapplied, causing new API routes to 500 until this was
rediscovered and fixed mid-task. Always verify token/API access empirically before
declaring a capability unavailable and asking the user to run SQL manually.

**How to apply:** Before flagging a new migration as "pending, needs manual application",
try this Management API path first. Only fall back to asking the user to run it via the
Supabase dashboard SQL editor if the `SUPABASE_ACCESS_TOKEN` request itself fails
(401/403/network error).
