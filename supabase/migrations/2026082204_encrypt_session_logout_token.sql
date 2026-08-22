alter table public.app_sessions add column auth_access_token_ciphertext text not null default '';

create or replace function public.guard_app_session_update()
returns trigger
language plpgsql
as $$
begin
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
    ) then
    raise exception 'Only liveness may be updated by a session owner';
  end if;
  return new;
end;
$$;