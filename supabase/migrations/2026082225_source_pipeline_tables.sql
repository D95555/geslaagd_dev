create table public.crawl_subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  year_level text not null check (year_level in ('vwo', 'bachelor1')),
  status text not null default 'pending' check (status in ('pending', 'active', 'denied', 'needs_refinement')),
  requested_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subject_requests (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references public.crawl_subjects(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'needs_refinement')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crawls (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.crawl_subjects(id) on delete restrict,
  status text not null default 'running' check (status in ('running', 'complete', 'failed')),
  prompt_used text,
  credits_used integer,
  sources_found integer,
  sources_accepted integer,
  efficiency_ratio numeric(6,4),
  triggered_by uuid references auth.users(id) on delete set null,
  retry_of_crawl_id uuid references public.crawls(id) on delete set null,
  raw_stored boolean not null default false,
  error_detail text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  title text,
  content_preview text,
  type text check (type in ('article', 'book', 'pdf', 'video', 'website')),
  release_date date,
  language text,
  quality_score integer check (quality_score between 1 and 5),
  confidence_score numeric(3,2),
  ai_summary text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  decline_reason text,
  first_crawl_id uuid references public.crawls(id) on delete set null,
  reconsideration_requests integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.source_subjects (
  source_id uuid not null references public.sources(id) on delete cascade,
  subject_id uuid not null references public.crawl_subjects(id) on delete cascade,
  linked_at timestamptz not null default now(),
  primary key (source_id, subject_id)
);

create table public.source_reconsideration_requests (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now()
);

-- RLS
alter table public.crawl_subjects enable row level security;
alter table public.subject_requests enable row level security;
alter table public.crawls enable row level security;
alter table public.sources enable row level security;
alter table public.source_subjects enable row level security;
alter table public.source_reconsideration_requests enable row level security;

revoke all on public.crawl_subjects from public, anon, authenticated;
revoke all on public.subject_requests from public, anon, authenticated;
revoke all on public.crawls from public, anon, authenticated;
revoke all on public.sources from public, anon, authenticated;
revoke all on public.source_subjects from public, anon, authenticated;
revoke all on public.source_reconsideration_requests from public, anon, authenticated;

grant select on public.sources to authenticated;
grant select on public.source_subjects to authenticated;
grant select on public.crawl_subjects to authenticated;
grant select on public.subject_requests to authenticated;
grant select on public.source_reconsideration_requests to authenticated;

create policy "authenticated_read_sources"
  on public.sources for select to authenticated using (true);

create policy "authenticated_read_source_subjects"
  on public.source_subjects for select to authenticated using (true);

create policy "authenticated_read_active_crawl_subjects"
  on public.crawl_subjects for select to authenticated using (status = 'active');

create policy "authenticated_read_own_subject_requests"
  on public.subject_requests for select to authenticated using (student_id = auth.uid());

create policy "authenticated_read_own_reconsideration_requests"
  on public.source_reconsideration_requests for select to authenticated using (student_id = auth.uid());
