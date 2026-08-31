-- AI/LLM token usage for the crawl brain's own calls (scoring, curriculum
-- query planning, source review, memory compression, PDF extraction) --
-- mirrors firecrawl_usage so admins get a full cost picture, not just the
-- Firecrawl side. Token counts only, no fabricated dollar amounts: per-token
-- pricing for the configured models isn't something to guess at here.

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references public.crawl_subjects(id) on delete set null,
  task_type text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_subject_idx on public.ai_usage (subject_id, created_at);

alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from public, anon, authenticated;
