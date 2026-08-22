alter table public.study_proposals
  add column if not exists alternatives jsonb not null default '[]'::jsonb,
  add column if not exists clarification_question text,
  add column if not exists study_space_id uuid unique references public.study_spaces(id) on delete set null;

alter table public.study_proposals
  drop constraint if exists study_proposals_alternatives_array;
alter table public.study_proposals
  add constraint study_proposals_alternatives_array
  check (jsonb_typeof(alternatives) = 'array');

create table if not exists public.study_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  education_level text not null check (education_level in ('vwo6', 'bachelor1')),
  study_profile text not null default '',
  learning_goals text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.study_preferences enable row level security;

drop policy if exists "Users read own study preferences" on public.study_preferences;
create policy "Users read own study preferences"
  on public.study_preferences for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users create own study preferences" on public.study_preferences;
create policy "Users create own study preferences"
  on public.study_preferences for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users update own study preferences" on public.study_preferences;
create policy "Users update own study preferences"
  on public.study_preferences for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.confirm_study_proposal(
  p_proposal_id uuid,
  p_title text default null
)
returns setof public.study_spaces
language plpgsql
security invoker
set search_path = public
as $$
declare
  proposal public.study_proposals;
  space public.study_spaces;
begin
  select *
    into proposal
    from public.study_proposals
   where id = p_proposal_id
     and user_id = auth.uid()
   for update;

  if not found then
    raise exception 'study_proposal_not_found' using errcode = 'P0002';
  end if;

  if proposal.status = 'confirmed' and proposal.study_space_id is not null then
    return query
      select *
        from public.study_spaces
       where id = proposal.study_space_id
         and user_id = auth.uid();
    return;
  end if;

  if proposal.status <> 'pending' then
    raise exception 'study_proposal_not_pending' using errcode = 'P0001';
  end if;

  insert into public.study_spaces (
    user_id,
    title,
    source_type,
    subject_id,
    original_input
  ) values (
    auth.uid(),
    coalesce(nullif(trim(p_title), ''), proposal.proposed_topic),
    'ai',
    proposal.subject_id,
    proposal.original_input
  )
  returning * into space;

  update public.study_proposals
     set status = 'confirmed',
         confirmed_at = now(),
         study_space_id = space.id
   where id = proposal.id;

  return next space;
end;
$$;

revoke all on function public.confirm_study_proposal(uuid, text) from public;
grant execute on function public.confirm_study_proposal(uuid, text) to authenticated;