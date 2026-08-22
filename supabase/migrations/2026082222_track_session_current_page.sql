alter table public.app_sessions
  add column if not exists current_page text
  check (current_page is null or char_length(current_page) <= 200);

comment on column public.app_sessions.current_page is
  'Latest client-reported route (path only, no query string), refreshed on the heartbeat cadence. Sanitized and truncated server-side.';

-- guard_app_session_update() only blocks columns explicitly listed in its
-- `is distinct from` check. current_page is deliberately left out of that
-- list (same treatment as last_seen_at/ip_address) so heartbeat updates to
-- it pass through without a trigger change. Re-declared here only for audit
-- consistency with how 2026082218 re-declared it when adding ip_address.
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
