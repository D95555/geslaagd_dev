create extension if not exists pg_cron;

revoke all privileges on table public.app_sessions from anon, authenticated;
grant select, insert, update, delete on table public.app_sessions to service_role;

revoke all on function public.register_app_session(uuid, text, text, uuid)
  from public, anon, authenticated;

create or replace function public.register_app_session_service(
  p_client_session_id uuid,
  p_user_id uuid,
  p_device_label text,
  p_auth_access_token_ciphertext text,
  p_auth_session_id uuid,
  p_ip_address inet
)
returns public.app_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.app_sessions;
  verified_email text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;

  select email into verified_email
  from auth.users
  where id = p_user_id;
  if verified_email is null then
    raise exception 'User not found';
  end if;

  if not exists (
    select 1
    from auth.sessions
    where id = p_auth_session_id
      and user_id = p_user_id
  ) then
    raise exception 'Auth session does not belong to user';
  end if;

  insert into public.app_sessions (
    client_session_id,
    user_id,
    email,
    device_label,
    auth_access_token_ciphertext,
    auth_session_id,
    ip_address,
    last_seen_at
  )
  values (
    p_client_session_id,
    p_user_id,
    verified_email,
    p_device_label,
    p_auth_access_token_ciphertext,
    p_auth_session_id,
    p_ip_address,
    now()
  )
  on conflict (client_session_id) do update
  set email = excluded.email,
      device_label = excluded.device_label,
      auth_access_token_ciphertext = excluded.auth_access_token_ciphertext,
      auth_session_id = excluded.auth_session_id,
      ip_address = excluded.ip_address,
      last_seen_at = now()
  where public.app_sessions.user_id = p_user_id
  returning * into result;

  if result.client_session_id is null then
    raise exception 'Could not register session';
  end if;
  return result;
end;
$$;

revoke all on function public.register_app_session_service(uuid, uuid, text, text, uuid, inet)
  from public, anon, authenticated;
grant execute on function public.register_app_session_service(uuid, uuid, text, text, uuid, inet)
  to service_role;

create or replace function public.prune_stale_session_ip_addresses()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  pruned_count bigint;
begin
  update public.app_sessions
  set ip_address = null
  where ip_address is not null
    and last_seen_at < now() - interval '90 days';

  get diagnostics pruned_count = row_count;
  return pruned_count;
end;
$$;

revoke all on function public.prune_stale_session_ip_addresses()
  from public, anon, authenticated;
grant execute on function public.prune_stale_session_ip_addresses()
  to service_role;

do $$
begin
  if not exists (
    select 1
    from cron.job
    where jobname = 'prune-stale-session-ip-addresses'
  ) then
    perform cron.schedule(
      'prune-stale-session-ip-addresses',
      '17 3 * * *',
      'select public.prune_stale_session_ip_addresses();'
    );
  end if;
end;
$$;