# Memory Index

- [Supabase auth session lifecycle gotchas](supabase-auth-session-lifecycle.md) — object-identity re-sync loops and signOut() races that silently drop authenticated requests.
- [E2E test accounts for Supabase apps](e2e-test-accounts-supabase.md) — create pre-confirmed accounts via the Admin API instead of the UI signup flow.
- [Reliable external audit delivery](reliable-external-audit-delivery.md) — use a durable outbox plus provider idempotency; claiming before delivery can silently lose security events.
- [Sensitive abuse telemetry boundaries](sensitive-abuse-telemetry.md) — derive at trusted servers, restrict DB columns—not just DTOs—and enforce retention with schedules.
- [Supabase migration application](supabase-migration-apply.md) — SUPABASE_ACCESS_TOKEN works with the Management API `database/query` endpoint to run SQL/migrations directly; verify before assuming manual-only.
- [CRLF files need byte-level edits](crlf-byte-level-edits.md) — study.ts, index.css, openapi.yaml and others use CRLF; plain Edit multi-line matches fail; use Python byte-level replace or append.
- [Orval schema naming](orval-schema-naming.md) — generated zod/type names follow operationId capitalization, not a domain prefix; grep generated output before importing.
