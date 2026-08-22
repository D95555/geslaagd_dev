alter table public.auth_event_outbox
  add column if not exists ip_address inet;

comment on column public.auth_event_outbox.ip_address is
  'Server-observed IP address at enqueue time; cleared after 90 days.';

create index if not exists auth_event_outbox_ip_address_created_idx
  on public.auth_event_outbox (ip_address, created_at desc)
  where ip_address is not null;

-- Adding a trailing parameter changes the function's argument-type
-- signature, so `create or replace` would leave the old 5-arg overload
-- behind instead of replacing it. Drop it explicitly first.
drop function if exists public.enqueue_auth_event(text, text, uuid, text, text);

create function public.enqueue_auth_event(
  p_dedupe_key text,
  p_event_type text,
  p_user_id uuid,
  p_device text default null,
  p_extra text default null,
  p_ip_address inet default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_event_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;

  insert into public.auth_event_outbox(
    dedupe_key,
    event_type,
    user_id,
    device,
    extra,
    ip_address
  )
  values (
    p_dedupe_key,
    p_event_type,
    p_user_id,
    p_device,
    p_extra,
    p_ip_address
  )
  on conflict (dedupe_key) do update
    set dedupe_key = excluded.dedupe_key
  returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function public.enqueue_auth_event(text, text, uuid, text, text, inet) from public, anon, authenticated;
grant execute on function public.enqueue_auth_event(text, text, uuid, text, text, inet) to service_role;

-- The returned column list is changing, which is a return-type change --
-- `create or replace` cannot do this, so drop and recreate.
drop function if exists public.claim_pending_auth_events(integer);

create function public.claim_pending_auth_events(p_limit integer default 20)
returns table(
  id uuid,
  event_type text,
  user_id uuid,
  device text,
  extra text,
  ip_address inet
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_limit < 1 or p_limit > 100 then
    raise exception 'invalid_limit';
  end if;

  return query
  with candidates as (
    select events.id
      from public.auth_event_outbox as events
     where events.status = 'pending'
       and events.next_attempt_at <= now()
       and (
         events.lease_expires_at is null
         or events.lease_expires_at <= now()
       )
     order by events.created_at
     for update skip locked
     limit p_limit
  )
  update public.auth_event_outbox as events
     set attempt_count = events.attempt_count + 1,
         lease_expires_at = now() + interval '2 minutes'
    from candidates
   where events.id = candidates.id
  returning
    events.id,
    events.event_type,
    events.user_id,
    events.device,
    events.extra,
    events.ip_address;
end;
$$;

revoke all on function public.claim_pending_auth_events(integer) from public, anon, authenticated;
grant execute on function public.claim_pending_auth_events(integer) to service_role;

create or replace function public.prune_stale_auth_event_ip_addresses()
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

  update public.auth_event_outbox
  set ip_address = null
  where ip_address is not null
    and created_at < now() - interval '90 days';

  get diagnostics pruned_count = row_count;
  return pruned_count;
end;
$$;

revoke all on function public.prune_stale_auth_event_ip_addresses() from public, anon, authenticated;
grant execute on function public.prune_stale_auth_event_ip_addresses() to service_role;

do $$
begin
  if not exists (
    select 1
    from cron.job
    where jobname = 'prune-stale-auth-event-ip-addresses'
  ) then
    perform cron.schedule(
      'prune-stale-auth-event-ip-addresses',
      '23 3 * * *',
      'select public.prune_stale_auth_event_ip_addresses();'
    );
  end if;
end;
$$;
