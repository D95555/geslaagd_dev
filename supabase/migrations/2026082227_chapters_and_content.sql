-- ─── Chapters ───────────────────────────────────────────────────────────────

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.crawl_subjects(id) on delete cascade,
  position integer not null,
  title text not null,
  description text not null default '',
  is_important boolean not null default false,
  topic_tags text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'ready')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, position)
);

create index chapters_subject_idx on public.chapters(subject_id, position);

-- ─── Chapter ↔ Source mapping ───────────────────────────────────────────────

create table public.chapter_sources (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  relevance_note text not null default '',
  created_at timestamptz not null default now(),
  unique (chapter_id, source_id)
);

create index chapter_sources_chapter_idx on public.chapter_sources(chapter_id);
create index chapter_sources_source_idx on public.chapter_sources(source_id);

-- ─── Generated study content ────────────────────────────────────────────────

create table public.study_content (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references public.chapters(id) on delete cascade,
  subject_id uuid not null references public.crawl_subjects(id) on delete cascade,
  content_type text not null check (content_type in (
    'summary', 'key_notes', 'exercise_bank', 'exam',
    'exam_rubric', 'diagnostic_questionnaire'
  )),
  content jsonb not null default '{}',
  generated_by_model text not null default '',
  version integer not null default 1,
  status text not null default 'generating' check (status in ('generating', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- chapter_id is null for subject-level content (diagnostic_questionnaire)
-- subject_id is always set for easy querying

create index study_content_chapter_idx on public.study_content(chapter_id, content_type);
create index study_content_subject_idx on public.study_content(subject_id, content_type);

-- ─── Extend crawl_subjects ─────────────────────────────────────────────────

alter table public.crawl_subjects
  add column if not exists description text,
  add column if not exists difficulty_level text,
  add column if not exists publish_status text not null default 'incomplete'
    check (publish_status in ('incomplete', 'ready', 'published')),
  add column if not exists chapter_count integer;

-- ─── Extend sources ────────────────────────────────────────────────────────

alter table public.sources
  add column if not exists full_content text;

-- Widen the type check to include 'paper'
alter table public.sources drop constraint if exists sources_type_check;
alter table public.sources add constraint sources_type_check
  check (type in ('article', 'book', 'pdf', 'video', 'website', 'paper'));

-- ─── Excluded domains ──────────────────────────────────────────────────────

create table public.excluded_domains (
  domain text primary key,
  reason text not null default '',
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.chapters enable row level security;
alter table public.chapter_sources enable row level security;
alter table public.study_content enable row level security;
alter table public.excluded_domains enable row level security;

revoke all on public.chapters from public, anon, authenticated;
revoke all on public.chapter_sources from public, anon, authenticated;
revoke all on public.study_content from public, anon, authenticated;
revoke all on public.excluded_domains from public, anon, authenticated;

grant select on public.chapters to authenticated;
grant select on public.chapter_sources to authenticated;
grant select on public.study_content to authenticated;

-- Chapters/content readable for published subjects only
create policy "authenticated_read_chapters_of_published_subjects"
  on public.chapters for select to authenticated
  using (
    exists (
      select 1 from public.crawl_subjects
      where id = chapters.subject_id and publish_status = 'published'
    )
  );

create policy "authenticated_read_chapter_sources"
  on public.chapter_sources for select to authenticated using (true);

create policy "authenticated_read_study_content_of_published_subjects"
  on public.study_content for select to authenticated
  using (
    exists (
      select 1 from public.crawl_subjects
      where id = study_content.subject_id and publish_status = 'published'
    )
  );
