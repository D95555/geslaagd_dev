create or replace function public.register_app_session(
  p_client_session_id uuid,
  p_device_label text,
  p_auth_access_token_ciphertext text
)
returns public.app_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.app_sessions;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if exists (
    select 1 from public.app_sessions
    where client_session_id = p_client_session_id and user_id <> auth.uid()
  ) then
    raise exception 'Session does not belong to caller';
  end if;

  insert into public.app_sessions (
    client_session_id, user_id, email, device_label, auth_access_token_ciphertext, last_seen_at
  ) values (
    p_client_session_id, auth.uid(), auth.jwt() ->> 'email', p_device_label, p_auth_access_token_ciphertext, now()
  )
  on conflict (client_session_id) do update
  set device_label = excluded.device_label,
      auth_access_token_ciphertext = excluded.auth_access_token_ciphertext,
      last_seen_at = now()
  where public.app_sessions.user_id = auth.uid()
  returning * into result;

  if result.client_session_id is null then
    raise exception 'Could not register session';
  end if;
  return result;
end;
$$;

grant execute on function public.register_app_session(uuid, text, text) to authenticated;