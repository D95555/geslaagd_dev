-- Firecrawl credit guardrails. A per-subject budget the crawl brain must stay
-- under, a build-start marker so spend is counted per build (a re-run resets
-- the window), and a usage ledger the in-code kill-switch reads before every
-- Firecrawl call and appends to after. Together these make an uncapped credit
-- blow-up structurally impossible: no crawl path can bill past the ceiling.

alter table public.crawl_subjects
  add column if not exists credit_budget integer not null default 300,
  add column if not exists build_started_at timestamptz;

create table if not exists public.firecrawl_usage (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references public.crawl_subjects(id) on delete set null,
  crawl_id uuid references public.crawls(id) on delete set null,
  operation text not null,
  credits integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists firecrawl_usage_subject_idx
  on public.firecrawl_usage (subject_id, created_at);
create index if not exists firecrawl_usage_created_idx
  on public.firecrawl_usage (created_at);

-- Server-only, like the other pipeline tables; admins read it through the API.
alter table public.firecrawl_usage enable row level security;
revoke all on public.firecrawl_usage from public, anon, authenticated;
