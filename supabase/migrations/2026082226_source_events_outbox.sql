create table public.source_events_outbox (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  source_id uuid not null references public.sources(id) on delete cascade,
  source_url text not null,
  source_title text,
  subject_name text,
  crawl_id uuid references public.crawls(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'delivered')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  lease_expires_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index source_events_outbox_pending_idx
  on public.source_events_outbox(next_attempt_at, lease_expires_at)
  where status = 'pending';

alter table public.source_events_outbox enable row level security;
revoke all on public.source_events_outbox from public, anon, authenticated;

create or replace function public.enqueue_source_event(
  p_dedupe_key text,
  p_source_id uuid,
  p_source_url text,
  p_source_title text default null,
  p_subject_name text default null,
  p_crawl_id uuid default null
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

  insert into public.source_events_outbox(
    dedupe_key, source_id, source_url, source_title, subject_name, crawl_id
  )
  values (
    p_dedupe_key, p_source_id, p_source_url, p_source_title, p_subject_name, p_crawl_id
  )
  on conflict (dedupe_key) do update
    set dedupe_key = excluded.dedupe_key
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function public.claim_pending_source_events(p_limit integer default 20)
returns table(
  id uuid,
  source_id uuid,
  source_url text,
  source_title text,
  subject_name text,
  crawl_id uuid
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
      from public.source_events_outbox as events
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
  update public.source_events_outbox as events
     set attempt_count = events.attempt_count + 1,
         lease_expires_at = now() + interval '2 minutes'
    from candidates
   where events.id = candidates.id
  returning
    events.id,
    events.source_id,
    events.source_url,
    events.source_title,
    events.subject_name,
    events.crawl_id;
end;
$$;

create or replace function public.complete_source_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;

  update public.source_events_outbox
     set status = 'delivered',
         delivered_at = now(),
         lease_expires_at = null
   where id = p_event_id
     and status = 'pending';
end;
$$;

create or replace function public.release_source_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;

  update public.source_events_outbox
     set lease_expires_at = null,
         next_attempt_at = now() + interval '30 seconds'
   where id = p_event_id
     and status = 'pending';
end;
$$;

revoke all on function public.enqueue_source_event(text, uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.enqueue_source_event(text, uuid, text, text, text, uuid) to service_role;

revoke all on function public.claim_pending_source_events(integer) from public, anon, authenticated;
grant execute on function public.claim_pending_source_events(integer) to service_role;

revoke all on function public.complete_source_event(uuid) from public, anon, authenticated;
grant execute on function public.complete_source_event(uuid) to service_role;

revoke all on function public.release_source_event(uuid) from public, anon, authenticated;
grant execute on function public.release_source_event(uuid) to service_role;
