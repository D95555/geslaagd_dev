-- ─── Selected subjects (Study Module) ──────────────────────────────────────
-- The older study_selected_subjects table keys on study_subjects(id text) and
-- cannot hold a crawl_subjects uuid, so the Study Module keeps its own list.

create table public.student_selected_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.crawl_subjects(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, subject_id)
);

create index student_selected_subjects_user_idx
  on public.student_selected_subjects(user_id, sort_order);

-- ─── Diagnostic questionnaire responses ────────────────────────────────────

create table public.student_questionnaire_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.crawl_subjects(id) on delete cascade,
  content_id uuid not null references public.study_content(id) on delete cascade,
  answers jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (user_id, content_id)
);

create index student_questionnaire_responses_user_idx
  on public.student_questionnaire_responses(user_id, subject_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.student_selected_subjects enable row level security;
alter table public.student_questionnaire_responses enable row level security;

revoke all on public.student_selected_subjects from public, anon, authenticated;
revoke all on public.student_questionnaire_responses from public, anon, authenticated;

grant select, insert, delete on public.student_selected_subjects to authenticated;
grant select, insert, update on public.student_questionnaire_responses to authenticated;

create policy "users_read_own_selected_subjects"
  on public.student_selected_subjects for select to authenticated
  using (user_id = auth.uid());

create policy "users_write_own_selected_subjects"
  on public.student_selected_subjects for insert to authenticated
  with check (user_id = auth.uid());

create policy "users_delete_own_selected_subjects"
  on public.student_selected_subjects for delete to authenticated
  using (user_id = auth.uid());

create policy "users_read_own_questionnaire_responses"
  on public.student_questionnaire_responses for select to authenticated
  using (user_id = auth.uid());

create policy "users_write_own_questionnaire_responses"
  on public.student_questionnaire_responses for insert to authenticated
  with check (user_id = auth.uid());

create policy "users_update_own_questionnaire_responses"
  on public.student_questionnaire_responses for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
