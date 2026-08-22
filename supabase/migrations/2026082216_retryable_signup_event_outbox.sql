alter table public.signup_auth_event_claims
  add column status text not null default 'pending',
  add column attempt_count integer not null default 0,
  add column lease_expires_at timestamptz,
  add column next_attempt_at timestamptz not null default now(),
  add column delivered_at timestamptz,
  add constraint signup_auth_event_claims_status_check
    check (status in ('pending', 'delivered')),
  add constraint signup_auth_event_claims_attempt_count_check
    check (attempt_count >= 0);

create index signup_auth_event_claims_pending_idx
  on public.signup_auth_event_claims(next_attempt_at, lease_expires_at)
  where status = 'pending';

create or replace function public.claim_signup_auth_event(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_claimed boolean := false;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;

  insert into public.signup_auth_event_claims(
    user_id,
    status,
    attempt_count,
    lease_expires_at,
    next_attempt_at
  )
  values (
    p_user_id,
    'pending',
    1,
    now() + interval '2 minutes',
    now()
  )
  on conflict (user_id) do update
    set attempt_count = signup_auth_event_claims.attempt_count + 1,
        lease_expires_at = now() + interval '2 minutes'
    where signup_auth_event_claims.status = 'pending'
      and signup_auth_event_claims.next_attempt_at <= now()
      and (
        signup_auth_event_claims.lease_expires_at is null
        or signup_auth_event_claims.lease_expires_at <= now()
      )
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

create or replace function public.claim_pending_signup_auth_events(p_limit integer default 20)
returns table(user_id uuid)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_limit < 1 or p_limit > 100 then
    raise exception 'invalid_limit';
  end if;

  return query
  with candidates as (
    select claims.user_id
      from public.signup_auth_event_claims as claims
     where claims.status = 'pending'
       and claims.next_attempt_at <= now()
       and (
         claims.lease_expires_at is null
         or claims.lease_expires_at <= now()
       )
     order by claims.claimed_at
     for update skip locked
     limit p_limit
  )
  update public.signup_auth_event_claims as claims
     set attempt_count = claims.attempt_count + 1,
         lease_expires_at = now() + interval '2 minutes'
    from candidates
   where claims.user_id = candidates.user_id
  returning claims.user_id;
end;
$$;

create or replace function public.complete_signup_auth_event(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;

  update public.signup_auth_event_claims
     set status = 'delivered',
         delivered_at = now(),
         lease_expires_at = null
   where user_id = p_user_id
     and status = 'pending';
end;
$$;

create or replace function public.release_signup_auth_event(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;

  update public.signup_auth_event_claims
     set lease_expires_at = null,
         next_attempt_at = now() + interval '30 seconds'
   where user_id = p_user_id
     and status = 'pending';
end;
$$;

revoke all on function public.claim_signup_auth_event(uuid) from public;
revoke all on function public.claim_signup_auth_event(uuid) from anon;
revoke all on function public.claim_signup_auth_event(uuid) from authenticated;
grant execute on function public.claim_signup_auth_event(uuid) to service_role;

revoke all on function public.claim_pending_signup_auth_events(integer) from public;
revoke all on function public.claim_pending_signup_auth_events(integer) from anon;
revoke all on function public.claim_pending_signup_auth_events(integer) from authenticated;
grant execute on function public.claim_pending_signup_auth_events(integer) to service_role;

revoke all on function public.complete_signup_auth_event(uuid) from public;
revoke all on function public.complete_signup_auth_event(uuid) from anon;
revoke all on function public.complete_signup_auth_event(uuid) from authenticated;
grant execute on function public.complete_signup_auth_event(uuid) to service_role;

revoke all on function public.release_signup_auth_event(uuid) from public;
revoke all on function public.release_signup_auth_event(uuid) from anon;
revoke all on function public.release_signup_auth_event(uuid) from authenticated;
grant execute on function public.release_signup_auth_event(uuid) to service_role;