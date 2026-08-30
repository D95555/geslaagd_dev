-- Learned memory for the crawl system: one global row plus one row per
-- subject, and a per-domain accept/decline track record. Both are read by
-- the crawl brain (phase 2b) to inform future queries and scoring; this
-- phase only builds the storage and starts collecting data.

create table if not exists public.crawl_memory (
  id uuid primary key default gen_random_uuid(),
  -- null = the global memory shared across every subject.
  subject_id uuid references public.crawl_subjects(id) on delete cascade,
  content text not null default '',
  updated_at timestamptz not null default now()
);

-- Exactly one row per real subject, and exactly one global row (subject_id
-- null) -- NULL alone wouldn't collide in a plain unique index, so every
-- global row is coalesced onto the same sentinel key instead.
create unique index if not exists crawl_memory_subject_unique
  on public.crawl_memory (coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.crawl_memory enable row level security;
revoke all on public.crawl_memory from public, anon, authenticated;

create table if not exists public.domain_reputation (
  domain text primary key,
  accepted_count integer not null default 0,
  declined_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.domain_reputation enable row level security;
revoke all on public.domain_reputation from public, anon, authenticated;
