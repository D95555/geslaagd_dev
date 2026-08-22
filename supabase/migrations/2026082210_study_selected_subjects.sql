create table if not exists public.study_selected_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id text references public.study_subjects(id) on delete cascade,
  custom_name text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint study_selected_subjects_source check (
    (subject_id is not null and custom_name is null)
    or (subject_id is null and custom_name is not null)
  )
);

create unique index if not exists study_selected_subjects_user_subject_uq
  on public.study_selected_subjects(user_id, subject_id)
  where subject_id is not null;
create index if not exists study_selected_subjects_user_idx
  on public.study_selected_subjects(user_id, sort_order);

alter table public.study_selected_subjects enable row level security;

drop policy if exists "Users read own selected subjects" on public.study_selected_subjects;
create policy "Users read own selected subjects"
  on public.study_selected_subjects for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users create own selected subjects" on public.study_selected_subjects;
create policy "Users create own selected subjects"
  on public.study_selected_subjects for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users update own selected subjects" on public.study_selected_subjects;
create policy "Users update own selected subjects"
  on public.study_selected_subjects for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own selected subjects" on public.study_selected_subjects;
create policy "Users delete own selected subjects"
  on public.study_selected_subjects for delete to authenticated
  using (auth.uid() = user_id);

-- Defense in depth: the API enforces the five-subject limit, but a DB trigger
-- guards against races or direct database access bypassing the API layer.
create or replace function public.enforce_selected_subjects_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.study_selected_subjects where user_id = new.user_id) >= 5 then
    raise exception 'study_selected_subjects_limit_reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists study_selected_subjects_limit on public.study_selected_subjects;
create trigger study_selected_subjects_limit
  before insert on public.study_selected_subjects
  for each row execute function public.enforce_selected_subjects_limit();
