alter function public.guard_app_session_update()
  set search_path = public, pg_temp;