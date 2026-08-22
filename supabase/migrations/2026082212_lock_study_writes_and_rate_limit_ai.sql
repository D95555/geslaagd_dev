drop policy if exists "Users create own study spaces" on public.study_spaces;
drop policy if exists "Users update own study spaces" on public.study_spaces;
drop policy if exists "Users create own study proposals" on public.study_proposals;
drop policy if exists "Users update own study proposals" on public.study_proposals;
drop policy if exists "Users create own study preferences" on public.study_preferences;
drop policy if exists "Users update own study preferences" on public.study_preferences;

revoke insert, update, delete on public.study_spaces from anon, authenticated;
revoke insert, update, delete on public.study_proposals from anon, authenticated;
revoke insert, update, delete on public.study_preferences from anon, authenticated;

drop function if exists public.confirm_study_proposal(uuid, text);

create or replace function public.confirm_study_proposal(
  p_user_id uuid,
  p_proposal_id uuid,
  p_title text,
  p_apply_adjustment boolean,
  p_subject_id text,
  p_proposed_subject text,
  p_proposed_topic text
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
    original_input
  ) values (
    p_user_id,
    coalesce(nullif(trim(p_title), ''), chosen_topic),
    'ai',
    chosen_subject_id,
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

revoke all on function public.confirm_study_proposal(uuid, uuid, text, boolean, text, text, text) from public;
revoke all on function public.confirm_study_proposal(uuid, uuid, text, boolean, text, text, text) from anon;
revoke all on function public.confirm_study_proposal(uuid, uuid, text, boolean, text, text, text) from authenticated;
grant execute on function public.confirm_study_proposal(uuid, uuid, text, boolean, text, text, text) to service_role;

create table if not exists public.study_ai_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);

create index if not exists study_ai_requests_user_time_idx
  on public.study_ai_requests(user_id, requested_at desc);

alter table public.study_ai_requests enable row level security;
revoke all on public.study_ai_requests from anon, authenticated;

create or replace function public.claim_study_ai_request(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;

  delete from public.study_ai_requests
   where requested_at < now() - interval '24 hours';

  if (
    select count(*)
      from public.study_ai_requests
     where user_id = p_user_id
       and requested_at >= now() - interval '15 minutes'
  ) >= 12 then
    return false;
  end if;

  insert into public.study_ai_requests(user_id) values (p_user_id);
  return true;
end;
$$;

revoke all on function public.claim_study_ai_request(uuid) from public;
revoke all on function public.claim_study_ai_request(uuid) from anon;
revoke all on function public.claim_study_ai_request(uuid) from authenticated;
grant execute on function public.claim_study_ai_request(uuid) to service_role;