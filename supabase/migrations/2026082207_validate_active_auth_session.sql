create or replace function public.is_current_auth_session_active()
returns boolean
language sql
security definer
set search_path = auth, public
as $$
  select exists (
    select 1 from auth.sessions
    where id = (auth.jwt() ->> 'session_id')::uuid
  );
$$;

grant execute on function public.is_current_auth_session_active() to authenticated;