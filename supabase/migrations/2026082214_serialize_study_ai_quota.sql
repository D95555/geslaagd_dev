create or replace function public.claim_study_ai_request(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;

  -- Serialize claims for this user so concurrent requests cannot all observe
  -- the same pre-insert count and exceed the rolling quota.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  delete from public.study_ai_requests
   where requested_at < now() - interval '24 hours';

  if (
    select count(*)
      from public.study_ai_requests
     where user_id = p_user_id
       and requested_at >= now() - interval '15 minutes'
  ) >= 12 then
    return false;
  end if;

  insert into public.study_ai_requests(user_id) values (p_user_id);
  return true;
end;
$$;

revoke all on function public.claim_study_ai_request(uuid) from public;
revoke all on function public.claim_study_ai_request(uuid) from anon;
revoke all on function public.claim_study_ai_request(uuid) from authenticated;
grant execute on function public.claim_study_ai_request(uuid) to service_role;