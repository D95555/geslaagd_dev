-- Adds subject-detail and topic-configuration fields to study_spaces so a
-- topic can be described with a level, subtopics, desired sources, a
-- vak-description and example topics, saved as a draft, and linked back to
-- the user's chosen subject (catalog-backed or custom) for the new subject
-- detail route. All new columns are nullable-or-defaulted so existing rows
-- and existing API callers remain valid.

alter table public.study_spaces
  add column if not exists selected_subject_id uuid references public.study_selected_subjects(id) on delete set null,
  add column if not exists level text,
  add column if not exists subtopics text[] not null default '{}',
  add column if not exists sources text[] not null default '{}',
  add column if not exists subject_description text not null default '',
  add column if not exists example_topics text[] not null default '{}',
  add column if not exists status text not null default 'active',
  add column if not exists last_viewed_at timestamptz not null default now();

alter table public.study_spaces
  drop constraint if exists study_spaces_level_check;
alter table public.study_spaces
  add constraint study_spaces_level_check
  check (level is null or level in ('basis', 'gemiddeld', 'verdieping'));

alter table public.study_spaces
  drop constraint if exists study_spaces_status_check;
alter table public.study_spaces
  add constraint study_spaces_status_check
  check (status in ('draft', 'active'));

alter table public.study_spaces
  drop constraint if exists study_spaces_subtopics_array;
alter table public.study_spaces
  add constraint study_spaces_subtopics_array
  check (cardinality(subtopics) <= 8);

alter table public.study_spaces
  drop constraint if exists study_spaces_sources_array;
alter table public.study_spaces
  add constraint study_spaces_sources_array
  check (cardinality(sources) <= 6);

alter table public.study_spaces
  drop constraint if exists study_spaces_example_topics_array;
alter table public.study_spaces
  add constraint study_spaces_example_topics_array
  check (cardinality(example_topics) <= 6);

create index if not exists study_spaces_selected_subject_idx
  on public.study_spaces(selected_subject_id, updated_at desc)
  where selected_subject_id is not null;

-- Replace confirm_study_proposal to accept the same topic-configuration
-- fields as the plain create-space path, so the studiecoach flow and the
-- manual "nieuw onderwerp" flow share one persistence contract.
drop function if exists public.confirm_study_proposal(uuid, uuid, text, boolean, text, text, text);

create or replace function public.confirm_study_proposal(
  p_user_id uuid,
  p_proposal_id uuid,
  p_title text,
  p_apply_adjustment boolean,
  p_subject_id text,
  p_proposed_subject text,
  p_proposed_topic text,
  p_selected_subject_id uuid default null,
  p_level text default null,
  p_subtopics text[] default '{}',
  p_sources text[] default '{}',
  p_subject_description text default '',
  p_example_topics text[] default '{}',
  p_status text default 'active'
)
returns setof public.study_spaces
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  proposal public.study_proposals;
  space public.study_spaces;
  chosen_subject_id text;
  chosen_subject text;
  chosen_topic text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;

  select *
    into proposal
    from public.study_proposals
   where id = p_proposal_id
     and user_id = p_user_id
   for update;

  if not found then
    raise exception 'study_proposal_not_found' using errcode = 'P0002';
  end if;

  if proposal.status = 'confirmed' and proposal.study_space_id is not null then
    return query
      select *
        from public.study_spaces
       where id = proposal.study_space_id
         and user_id = p_user_id;
    return;
  end if;

  if proposal.status <> 'pending' then
    raise exception 'study_proposal_not_pending' using errcode = 'P0001';
  end if;

  if p_apply_adjustment then
    if nullif(trim(p_proposed_subject), '') is null
      or nullif(trim(p_proposed_topic), '') is null then
      raise exception 'invalid_study_proposal_adjustment';
    end if;
    chosen_subject_id := p_subject_id;
    chosen_subject := trim(p_proposed_subject);
    chosen_topic := trim(p_proposed_topic);
  else
    chosen_subject_id := proposal.subject_id;
    chosen_subject := proposal.proposed_subject;
    chosen_topic := proposal.proposed_topic;
  end if;

  if chosen_subject_id is not null
    and not exists (select 1 from public.study_subjects where id = chosen_subject_id) then
    raise exception 'study_subject_not_found';
  end if;

  if p_selected_subject_id is not null
    and not exists (
      select 1 from public.study_selected_subjects
       where id = p_selected_subject_id and user_id = p_user_id
    ) then
    raise exception 'study_selected_subject_not_found';
  end if;

  if p_status not in ('draft', 'active') then
    raise exception 'invalid_study_space_status';
  end if;

  update public.study_proposals
     set subject_id = chosen_subject_id,
         proposed_subject = chosen_subject,
         proposed_topic = chosen_topic
   where id = proposal.id;

  insert into public.study_spaces (
    user_id,
    title,
    source_type,
    subject_id,
    original_input,
    selected_subject_id,
    level,
    subtopics,
    sources,
    subject_description,
    example_topics,
    status
  ) values (
    p_user_id,
    coalesce(nullif(trim(p_title), ''), chosen_topic),
    'ai',
    chosen_subject_id,
    proposal.original_input,
    p_selected_subject_id,
    p_level,
    coalesce(p_subtopics, '{}'),
    coalesce(p_sources, '{}'),
    coalesce(p_subject_description, ''),
    coalesce(p_example_topics, '{}'),
    coalesce(p_status, 'active')
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

revoke all on function public.confirm_study_proposal(uuid, uuid, text, boolean, text, text, text, uuid, text, text[], text[], text, text[], text) from public;
revoke all on function public.confirm_study_proposal(uuid, uuid, text, boolean, text, text, text, uuid, text, text[], text[], text, text[], text) from anon;
revoke all on function public.confirm_study_proposal(uuid, uuid, text, boolean, text, text, text, uuid, text, text[], text[], text, text[], text) from authenticated;
grant execute on function public.confirm_study_proposal(uuid, uuid, text, boolean, text, text, text, uuid, text, text[], text[], text, text[], text) to service_role;
