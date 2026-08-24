-- ─── Student progress per chapter ──────────────────────────────────────────

create table public.student_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  summary_read boolean not null default false,
  exercise_best_score numeric(3,1),
  exam_best_score numeric(3,1),
  exercise_attempts integer not null default 0,
  exam_attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, chapter_id)
);

create index student_progress_user_idx on public.student_progress(user_id);

-- Scores are 1.0 – 10.0
alter table public.student_progress
  add constraint exercise_score_range
    check (exercise_best_score is null or (exercise_best_score >= 1.0 and exercise_best_score <= 10.0)),
  add constraint exam_score_range
    check (exam_best_score is null or (exam_best_score >= 1.0 and exam_best_score <= 10.0));

-- ─── Individual question answers (weakness tracking) ───────────────────────

create table public.student_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  content_id uuid not null references public.study_content(id) on delete cascade,
  question_index integer not null,
  topic_tag text not null,
  is_correct boolean not null,
  score numeric(4,1),
  max_score numeric(4,1),
  created_at timestamptz not null default now()
);

create index student_answers_user_topic_idx
  on public.student_answers(user_id, topic_tag);

create index student_answers_user_chapter_idx
  on public.student_answers(user_id, chapter_id);

-- ─── Real exam scheduling ──────────────────────────────────────────────────

create table public.student_exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.crawl_subjects(id) on delete cascade,
  exam_date date not null,
  chapter_ids uuid[] not null default '{}',
  spaced_repetition_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index student_exams_user_idx on public.student_exams(user_id, subject_id);

-- ─── Chat messages ─────────────────────────────────────────────────────────

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.crawl_subjects(id) on delete cascade,
  role text not null check (role in ('student', 'assistant')),
  content text not null,
  chapter_id uuid references public.chapters(id) on delete set null,
  citations jsonb,
  created_at timestamptz not null default now()
);

create index chat_messages_user_subject_idx
  on public.chat_messages(user_id, subject_id, created_at desc);

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.student_progress enable row level security;
alter table public.student_answers enable row level security;
alter table public.student_exams enable row level security;
alter table public.chat_messages enable row level security;

revoke all on public.student_progress from public, anon, authenticated;
revoke all on public.student_answers from public, anon, authenticated;
revoke all on public.student_exams from public, anon, authenticated;
revoke all on public.chat_messages from public, anon, authenticated;

grant select, insert, update on public.student_progress to authenticated;
grant select, insert on public.student_answers to authenticated;
grant select, insert, update, delete on public.student_exams to authenticated;
grant select, insert on public.chat_messages to authenticated;

create policy "users_read_own_progress"
  on public.student_progress for select to authenticated
  using (user_id = auth.uid());

create policy "users_write_own_progress"
  on public.student_progress for insert to authenticated
  with check (user_id = auth.uid());

create policy "users_update_own_progress"
  on public.student_progress for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "users_read_own_answers"
  on public.student_answers for select to authenticated
  using (user_id = auth.uid());

create policy "users_write_own_answers"
  on public.student_answers for insert to authenticated
  with check (user_id = auth.uid());

create policy "users_read_own_exams"
  on public.student_exams for select to authenticated
  using (user_id = auth.uid());

create policy "users_write_own_exams"
  on public.student_exams for insert to authenticated
  with check (user_id = auth.uid());

create policy "users_update_own_exams"
  on public.student_exams for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "users_delete_own_exams"
  on public.student_exams for delete to authenticated
  using (user_id = auth.uid());

create policy "users_read_own_chat"
  on public.chat_messages for select to authenticated
  using (user_id = auth.uid());

create policy "users_write_own_chat"
  on public.chat_messages for insert to authenticated
  with check (user_id = auth.uid());
