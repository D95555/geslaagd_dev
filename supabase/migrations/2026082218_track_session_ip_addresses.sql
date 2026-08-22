alter table public.app_sessions
  add column if not exists ip_address inet;

comment on column public.app_sessions.ip_address is
  'Latest server-observed IP address for this browser session; cleared after 90 days without activity.';

create index if not exists app_sessions_ip_address_last_seen_idx
  on public.app_sessions (ip_address, last_seen_at desc)
  where ip_address is not null;

create or replace function public.guard_app_session_update()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.registering_session', true) = 'on' then
    return new;
  end if;
  if auth.role() is distinct from 'service_role'
    and (auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'admin'
    and (
      new.user_id is distinct from old.user_id
      or new.email is distinct from old.email
      or new.device_label is distinct from old.device_label
      or new.created_at is distinct from old.created_at
      or new.revoked_at is distinct from old.revoked_at
      or new.revoked_by is distinct from old.revoked_by
      or new.auth_access_token_ciphertext is distinct from old.auth_access_token_ciphertext
      or new.auth_session_id is distinct from old.auth_session_id
      or new.ip_address is distinct from old.ip_address
    ) then
    raise exception 'Only liveness may be updated by a session owner';
  end if;
  return new;
end;
$$;

create or replace function public.prune_stale_session_ip_addresses()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  pruned_count bigint;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;

  update public.app_sessions
  set ip_address = null
  where ip_address is not null
    and last_seen_at < now() - interval '90 days';

  get diagnostics pruned_count = row_count;
  return pruned_count;
end;
$$;

revoke all on function public.prune_stale_session_ip_addresses() from public, anon, authenticated;
grant execute on function public.prune_stale_session_ip_addresses() to service_role;