-- ─── Pipeline task logs ────────────────────────────────────────────────────
-- Every step a task takes, so an admin can see why the pipeline decided what
-- it decided instead of only its final status.

create table public.pipeline_task_logs (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.pipeline_tasks(id) on delete cascade,
  subject_id uuid references public.crawl_subjects(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete set null,
  level text not null default 'info' check (level in ('info', 'warn', 'error')),
  phase text not null default '',
  message text not null,
  data jsonb,
  created_at timestamptz not null default now()
);

create index pipeline_task_logs_task_idx
  on public.pipeline_task_logs(task_id, id);

-- Drives the console feed, which reads the newest entries across all tasks.
create index pipeline_task_logs_recent_idx
  on public.pipeline_task_logs(created_at desc);

create index pipeline_task_logs_subject_idx
  on public.pipeline_task_logs(subject_id, created_at desc);

-- The one-paragraph Dutch conclusion a handler writes when it finishes.
alter table public.pipeline_tasks
  add column if not exists summary text;

alter table public.pipeline_task_logs enable row level security;
revoke all on public.pipeline_task_logs from public, anon, authenticated;
-- Server-only, like pipeline_tasks itself; admins read it through the API.
