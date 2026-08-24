create table public.pipeline_tasks (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.crawl_subjects(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete cascade,
  task_type text not null check (task_type in (
    'triage', 'curriculum_design', 'source_gathering', 'source_review',
    'summary_generation', 'key_notes_generation', 'exercise_generation',
    'exam_generation', 'questionnaire_generation', 'readiness_check'
  )),
  depends_on uuid[] not null default '{}',
  status text not null default 'waiting' check (status in (
    'waiting', 'ready', 'running', 'done', 'failed'
  )),
  config jsonb,
  result jsonb,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  last_error text,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pipeline_tasks_poll_idx
  on public.pipeline_tasks(status, locked_until)
  where status in ('ready', 'running');

create index pipeline_tasks_subject_idx
  on public.pipeline_tasks(subject_id, task_type);

create index pipeline_tasks_depends_idx
  on public.pipeline_tasks using gin(depends_on);

alter table public.pipeline_tasks enable row level security;
revoke all on public.pipeline_tasks from public, anon, authenticated;
-- No authenticated access — pipeline_tasks is server-only via service role
