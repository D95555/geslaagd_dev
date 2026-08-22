alter table public.app_sessions add column auth_session_id uuid;

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
    ) then
    raise exception 'Only liveness may be updated by a session owner';
  end if;
  return new;
end;
$$;

create or replace function public.register_app_session(
  p_client_session_id uuid,
  p_device_label text,
  p_auth_access_token_ciphertext text,
  p_auth_session_id uuid
)
returns public.app_sessions
language plpgsql
security definer
set search_path = public
as $$
declare result public.app_sessions;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists (select 1 from public.app_sessions where client_session_id = p_client_session_id and user_id <> auth.uid()) then
    raise exception 'Session does not belong to caller';
  end if;
  perform set_config('app.registering_session', 'on', true);
  insert into public.app_sessions (client_session_id, user_id, email, device_label, auth_access_token_ciphertext, auth_session_id, last_seen_at)
  values (p_client_session_id, auth.uid(), auth.jwt() ->> 'email', p_device_label, p_auth_access_token_ciphertext, p_auth_session_id, now())
  on conflict (client_session_id) do update
  set device_label = excluded.device_label, auth_access_token_ciphertext = excluded.auth_access_token_ciphertext,
      auth_session_id = excluded.auth_session_id, last_seen_at = now()
  where public.app_sessions.user_id = auth.uid()
  returning * into result;
  if result.client_session_id is null then raise exception 'Could not register session'; end if;
  return result;
end;
$$;

revoke execute on function public.register_app_session(uuid, text, text) from authenticated;
grant execute on function public.register_app_session(uuid, text, text, uuid) to authenticated;

create or replace function public.revoke_auth_session(p_auth_session_id uuid)
returns void
language plpgsql
security definer
set search_path = auth, public
as $$
begin
  if (auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'admin' then raise exception 'Admin required'; end if;
  delete from auth.sessions where id = p_auth_session_id;
end;
$$;
grant execute on function public.revoke_auth_session(uuid) to authenticated;