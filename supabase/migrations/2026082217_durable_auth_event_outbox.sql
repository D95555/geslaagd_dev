create table public.auth_event_outbox (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique check (char_length(dedupe_key) between 1 and 160),
  event_type text not null check (
    event_type in (
      'signup',
      'login',
      'logout',
      'password-reset-request',
      'password-changed',
      'session-revoked'
    )
  ),
  user_id uuid not null,
  device text check (device is null or char_length(device) <= 160),
  extra text check (extra is null or char_length(extra) <= 500),
  status text not null default 'pending' check (status in ('pending', 'delivered')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  lease_expires_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index auth_event_outbox_pending_idx
  on public.auth_event_outbox(next_attempt_at, lease_expires_at)
  where status = 'pending';

alter table public.auth_event_outbox enable row level security;
revoke all on public.auth_event_outbox from public, anon, authenticated;

create table public.auth_event_rate_limits (
  client_key text primary key check (client_key ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 1 check (attempt_count > 0)
);

alter table public.auth_event_rate_limits enable row level security;
revoke all on public.auth_event_rate_limits from public, anon, authenticated;

create or replace function public.enqueue_auth_event(
  p_dedupe_key text,
  p_event_type text,
  p_user_id uuid,
  p_device text default null,
  p_extra text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_event_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;

  insert into public.auth_event_outbox(
    dedupe_key,
    event_type,
    user_id,
    device,
    extra
  )
  values (
    p_dedupe_key,
    p_event_type,
    p_user_id,
    p_device,
    p_extra
  )
  on conflict (dedupe_key) do update
    set dedupe_key = excluded.dedupe_key
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function public.claim_pending_auth_events(p_limit integer default 20)
returns table(
  id uuid,
  event_type text,
  user_id uuid,
  device text,
  extra text
)
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
    select events.id
      from public.auth_event_outbox as events
     where events.status = 'pending'
       and events.next_attempt_at <= now()
       and (
         events.lease_expires_at is null
         or events.lease_expires_at <= now()
       )
     order by events.created_at
     for update skip locked
     limit p_limit
  )
  update public.auth_event_outbox as events
     set attempt_count = events.attempt_count + 1,
         lease_expires_at = now() + interval '2 minutes'
    from candidates
   where events.id = candidates.id
  returning
    events.id,
    events.event_type,
    events.user_id,
    events.device,
    events.extra;
end;
$$;

create or replace function public.complete_auth_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;

  update public.auth_event_outbox
     set status = 'delivered',
         delivered_at = now(),
         lease_expires_at = null
   where id = p_event_id
     and status = 'pending';
end;
$$;

create or replace function public.release_auth_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;

  update public.auth_event_outbox
     set lease_expires_at = null,
         next_attempt_at = now() + interval '30 seconds'
   where id = p_event_id
     and status = 'pending';
end;
$$;

create or replace function public.claim_auth_event_attempt(
  p_client_key text,
  p_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_attempt_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_client_key !~ '^[0-9a-f]{64}$' or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid_rate_limit';
  end if;

  insert into public.auth_event_rate_limits(
    client_key,
    window_started_at,
    attempt_count
  )
  values (p_client_key, now(), 1)
  on conflict (client_key) do update
    set window_started_at = case
          when auth_event_rate_limits.window_started_at <= now() - interval '15 minutes'
          then now()
          else auth_event_rate_limits.window_started_at
        end,
        attempt_count = case
          when auth_event_rate_limits.window_started_at <= now() - interval '15 minutes'
          then 1
          else least(auth_event_rate_limits.attempt_count + 1, p_limit + 1)
        end
  returning attempt_count into v_attempt_count;

  delete from public.auth_event_rate_limits
   where window_started_at < now() - interval '24 hours';

  return v_attempt_count <= p_limit;
end;
$$;

create or replace function public.get_auth_user_id_by_email(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;

  select users.id
    into v_user_id
    from auth.users as users
   where lower(users.email) = lower(trim(p_email))
   limit 1;

  return v_user_id;
end;
$$;

insert into public.auth_event_outbox(
  dedupe_key,
  event_type,
  user_id,
  status,
  attempt_count,
  lease_expires_at,
  next_attempt_at,
  created_at,
  delivered_at
)
select
  'signup:' || claims.user_id::text,
  'signup',
  claims.user_id,
  claims.status,
  claims.attempt_count,
  claims.lease_expires_at,
  claims.next_attempt_at,
  claims.claimed_at,
  claims.delivered_at
from public.signup_auth_event_claims as claims
on conflict (dedupe_key) do nothing;

revoke all on function public.enqueue_auth_event(text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.enqueue_auth_event(text, text, uuid, text, text) to service_role;

revoke all on function public.claim_pending_auth_events(integer) from public, anon, authenticated;
grant execute on function public.claim_pending_auth_events(integer) to service_role;

revoke all on function public.complete_auth_event(uuid) from public, anon, authenticated;
grant execute on function public.complete_auth_event(uuid) to service_role;

revoke all on function public.release_auth_event(uuid) from public, anon, authenticated;
grant execute on function public.release_auth_event(uuid) to service_role;

revoke all on function public.claim_auth_event_attempt(text, integer) from public, anon, authenticated;
grant execute on function public.claim_auth_event_attempt(text, integer) to service_role;

revoke all on function public.get_auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.get_auth_user_id_by_email(text) to service_role;