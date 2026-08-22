-- Admin account management: audit table, user notification outbox,
-- and extended event types for account-blocked / account-unblocked / account-deleted.

-- ─── 1. Extend auth_event_outbox event-type check ────────────────────────────
-- Drop and recreate the constraint to add three new values.
alter table public.auth_event_outbox
  drop constraint if exists auth_event_outbox_event_type_check;

alter table public.auth_event_outbox
  add constraint auth_event_outbox_event_type_check check (
    event_type in (
      'signup',
      'login',
      'logout',
      'password-reset-request',
      'password-changed',
      'session-revoked',
      'account-blocked',
      'account-unblocked',
      'account-deleted'
    )
  );

-- ─── 2. Durable admin action audit log ───────────────────────────────────────
create table public.admin_account_actions (
  id               uuid        primary key default gen_random_uuid(),
  idempotency_key  text        not null unique
                               check (char_length(idempotency_key) between 1 and 160),
  actor_id         uuid        not null,
  target_user_id   uuid        not null,
  action           text        not null
                               check (action in ('block', 'unblock', 'delete')),
  reason           text        not null
                               check (char_length(reason) between 1 and 500),
  result           text        not null
                               check (result in ('success', 'failed')),
  error_detail     text,
  created_at       timestamptz not null default now()
);

create index admin_account_actions_target_idx
  on public.admin_account_actions (target_user_id, created_at desc);
create index admin_account_actions_actor_idx
  on public.admin_account_actions (actor_id, created_at desc);

alter table public.admin_account_actions enable row level security;
revoke all on public.admin_account_actions from public, anon, authenticated;

create or replace function public.record_admin_account_action(
  p_idempotency_key  text,
  p_actor_id         uuid,
  p_target_user_id   uuid,
  p_action           text,
  p_reason           text,
  p_result           text,
  p_error_detail     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;

  insert into public.admin_account_actions(
    idempotency_key, actor_id, target_user_id,
    action, reason, result, error_detail
  )
  values (
    p_idempotency_key, p_actor_id, p_target_user_id,
    p_action, p_reason, p_result, p_error_detail
  )
  on conflict (idempotency_key) do update
    set idempotency_key = excluded.idempotency_key
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_admin_account_action(text, uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_admin_account_action(text, uuid, uuid, text, text, text, text)
  to service_role;

-- ─── 3. User notification outbox (email to affected user) ────────────────────
create table public.user_notification_outbox (
  id                uuid        primary key default gen_random_uuid(),
  idempotency_key   text        not null unique
                                check (char_length(idempotency_key) between 1 and 160),
  user_id           uuid        not null,
  email             text        not null,
  notification_type text        not null
                                check (notification_type in (
                                  'account-blocked', 'account-unblocked', 'account-deleted'
                                )),
  subject           text        not null check (char_length(subject) between 1 and 200),
  body_text         text        not null check (char_length(body_text) between 1 and 2000),
  status            text        not null default 'pending'
                                check (status in ('pending', 'delivered', 'failed')),
  attempt_count     integer     not null default 0 check (attempt_count >= 0),
  lease_expires_at  timestamptz,
  next_attempt_at   timestamptz not null default now(),
  last_error        text,
  created_at        timestamptz not null default now(),
  delivered_at      timestamptz
);

create index user_notification_outbox_pending_idx
  on public.user_notification_outbox (next_attempt_at, lease_expires_at)
  where status = 'pending';

alter table public.user_notification_outbox enable row level security;
revoke all on public.user_notification_outbox from public, anon, authenticated;

-- Enqueue a user notification
create or replace function public.enqueue_user_notification(
  p_idempotency_key  text,
  p_user_id          uuid,
  p_email            text,
  p_notification_type text,
  p_subject          text,
  p_body_text        text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;

  insert into public.user_notification_outbox(
    idempotency_key, user_id, email,
    notification_type, subject, body_text
  )
  values (
    p_idempotency_key, p_user_id, p_email,
    p_notification_type, p_subject, p_body_text
  )
  on conflict (idempotency_key) do update
    set idempotency_key = excluded.idempotency_key
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.enqueue_user_notification(text, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.enqueue_user_notification(text, uuid, text, text, text, text)
  to service_role;

-- Claim pending user notifications for delivery
create or replace function public.claim_pending_user_notifications(p_limit integer default 20)
returns table(
  id                uuid,
  user_id           uuid,
  email             text,
  notification_type text,
  subject           text,
  body_text         text
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
    select n.id
      from public.user_notification_outbox as n
     where n.status = 'pending'
       and n.next_attempt_at <= now()
       and (n.lease_expires_at is null or n.lease_expires_at <= now())
     order by n.created_at
     for update skip locked
     limit p_limit
  )
  update public.user_notification_outbox as n
     set attempt_count = n.attempt_count + 1,
         lease_expires_at = now() + interval '2 minutes'
    from candidates
   where n.id = candidates.id
  returning
    n.id,
    n.user_id,
    n.email,
    n.notification_type,
    n.subject,
    n.body_text;
end;
$$;

revoke all on function public.claim_pending_user_notifications(integer)
  from public, anon, authenticated;
grant execute on function public.claim_pending_user_notifications(integer)
  to service_role;

-- Mark a notification delivered
create or replace function public.complete_user_notification(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;

  update public.user_notification_outbox
     set status = 'delivered',
         delivered_at = now(),
         lease_expires_at = null
   where id = p_notification_id
     and status = 'pending';
end;
$$;

revoke all on function public.complete_user_notification(uuid)
  from public, anon, authenticated;
grant execute on function public.complete_user_notification(uuid)
  to service_role;

-- Release a notification back to pending with backoff on delivery failure
create or replace function public.release_user_notification(
  p_notification_id uuid,
  p_error           text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;

  update public.user_notification_outbox
     set lease_expires_at = null,
         last_error       = p_error,
         next_attempt_at  = now() + interval '30 seconds'
   where id = p_notification_id
     and status = 'pending';
end;
$$;

revoke all on function public.release_user_notification(uuid, text)
  from public, anon, authenticated;
grant execute on function public.release_user_notification(uuid, text)
  to service_role;

-- Mark a notification permanently failed (e.g. after 5 attempts)
create or replace function public.fail_user_notification(
  p_notification_id uuid,
  p_error           text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;

  update public.user_notification_outbox
     set status           = 'failed',
         last_error       = p_error,
         lease_expires_at = null
   where id = p_notification_id
     and status = 'pending';
end;
$$;

revoke all on function public.fail_user_notification(uuid, text)
  from public, anon, authenticated;
grant execute on function public.fail_user_notification(uuid, text)
  to service_role;
