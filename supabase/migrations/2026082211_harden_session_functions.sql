alter function public.guard_app_session_update()
  set search_path = public, auth;

revoke all on function public.guard_app_session_update() from public;
revoke all on function public.guard_app_session_update() from anon;
revoke all on function public.guard_app_session_update() from authenticated;

revoke all on function public.register_app_session(uuid, text, text) from public;
revoke all on function public.register_app_session(uuid, text, text) from anon;
revoke all on function public.register_app_session(uuid, text, text) from authenticated;

revoke all on function public.register_app_session(uuid, text, text, uuid) from public;
revoke all on function public.register_app_session(uuid, text, text, uuid) from anon;
grant execute on function public.register_app_session(uuid, text, text, uuid) to authenticated;

revoke all on function public.is_current_auth_session_active() from public;
revoke all on function public.is_current_auth_session_active() from anon;
grant execute on function public.is_current_auth_session_active() to authenticated;

revoke all on function public.revoke_auth_session(uuid) from public;
revoke all on function public.revoke_auth_session(uuid) from anon;
grant execute on function public.revoke_auth_session(uuid) to authenticated;