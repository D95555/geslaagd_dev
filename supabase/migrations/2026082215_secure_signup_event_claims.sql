create table if not exists public.signup_auth_event_claims (
  user_id uuid primary key references auth.users(id) on delete cascade,
  claimed_at timestamptz not null default now()
);

alter table public.signup_auth_event_claims enable row level security;
revoke all on public.signup_auth_event_claims from public, anon, authenticated;

create table if not exists public.signup_auth_event_attempts (
  client_key text primary key check (client_key ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 1 check (attempt_count > 0)
);

alter table public.signup_auth_event_attempts enable row level security;
revoke all on public.signup_auth_event_attempts from public, anon, authenticated;

create or replace function public.claim_signup_event_attempt(p_client_key text)
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
  if p_client_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_client_key';
  end if;

  insert into public.signup_auth_event_attempts(
    client_key,
    window_started_at,
    attempt_count
  )
  values (p_client_key, now(), 1)
  on conflict (client_key) do update
    set window_started_at = case
          when signup_auth_event_attempts.window_started_at <= now() - interval '15 minutes'
          then now()
          else signup_auth_event_attempts.window_started_at
        end,
        attempt_count = case
          when signup_auth_event_attempts.window_started_at <= now() - interval '15 minutes'
          then 1
          else signup_auth_event_attempts.attempt_count + 1
        end
  returning attempt_count into v_attempt_count;

  delete from public.signup_auth_event_attempts
   where window_started_at < now() - interval '24 hours';

  return v_attempt_count <= 10;
end;
$$;

create or replace function public.claim_signup_auth_event(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_inserted integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;

  insert into public.signup_auth_event_claims(user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

revoke all on function public.claim_signup_event_attempt(text) from public;
revoke all on function public.claim_signup_event_attempt(text) from anon;
revoke all on function public.claim_signup_event_attempt(text) from authenticated;
grant execute on function public.claim_signup_event_attempt(text) to service_role;

revoke all on function public.claim_signup_auth_event(uuid) from public;
revoke all on function public.claim_signup_auth_event(uuid) from anon;
revoke all on function public.claim_signup_auth_event(uuid) from authenticated;
grant execute on function public.claim_signup_auth_event(uuid) to service_role;