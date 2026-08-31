-- ─── Activation keys ───────────────────────────────────────────────────────
-- Gates account creation. Admin-issued for now; the `source` column exists so
-- a later real purchase flow can insert rows the same way without a schema
-- change.

create table public.activation_keys (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'open' check (status in ('open', 'used')),
  source text not null default 'admin' check (source in ('admin', 'purchase')),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by_user_id uuid,
  used_by_email text
);

create index activation_keys_status_idx on public.activation_keys(status, created_at desc);

alter table public.activation_keys enable row level security;
revoke all on public.activation_keys from public, anon, authenticated;
-- Server-only, like pipeline_tasks: the API validates and claims keys with
-- the service role, never exposing this table to PostgREST directly.
