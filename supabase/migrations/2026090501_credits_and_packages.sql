-- ─── Packages & credits ────────────────────────────────────────────────────
-- Product tiers. Fixed reference data (4 rows), not user-editable.
create table public.packages (
  key                  text primary key,
  label                text not null,
  rank                 int not null,
  start_credits        int,               -- null = unlimited (beheerder)
  monthly_credits      int,               -- null = no monthly top-up
  can_create_subjects  boolean not null default true
);

insert into public.packages (key, label, rank, start_credits, monthly_credits, can_create_subjects) values
  ('trial', 'Trial', 0, 10, 0, false),
  ('basis', 'Basis', 1, 30, 10, true),
  ('plus', 'Plus', 2, 60, 25, true),
  ('beheerder', 'Beheerder', 3, null, null, true);

alter table public.packages enable row level security;
revoke all on public.packages from public, anon, authenticated;

-- Per-user product state. Keyed on the Supabase Auth user, since there is no
-- separate `accounts` table in this schema.
create table public.account_billing (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  package               text not null references public.packages(key) default 'trial',
  credits               int not null default 10,
  last_credit_topup_at  timestamptz not null default now()
);

alter table public.account_billing enable row level security;
revoke all on public.account_billing from public, anon, authenticated;

-- The ledger: every credit change, ever. account_billing.credits is always a
-- cache of "sum of credit_transactions for this user" — write both together,
-- never one without the other (lib/credits.ts is the only writer).
create table public.credit_transactions (
  id                  uuid primary key default gen_random_uuid(),
  account_id          uuid not null references auth.users(id) on delete cascade,
  delta               int not null,
  reason              text not null check (reason in (
    'signup_grant', 'monthly_topup', 'subject_open', 'subject_create',
    'package_upgrade', 'admin_adjustment', 'migration_grandfather'
  )),
  related_subject_id  uuid references public.crawl_subjects(id) on delete set null,
  note                text,
  created_at          timestamptz not null default now()
);

create index credit_transactions_account_idx on public.credit_transactions(account_id, created_at desc);

alter table public.credit_transactions enable row level security;
revoke all on public.credit_transactions from public, anon, authenticated;

-- One row per (account, subject) once that subject has been paid for. Its
-- mere existence means "never charge this account for this subject again."
create table public.subject_purchases (
  account_id    uuid not null references auth.users(id) on delete cascade,
  subject_id    uuid not null references public.crawl_subjects(id) on delete cascade,
  purchased_at  timestamptz not null default now(),
  primary key (account_id, subject_id)
);

alter table public.subject_purchases enable row level security;
revoke all on public.subject_purchases from public, anon, authenticated;

-- ─── Activation keys gain a package ─────────────────────────────────────────
alter table public.activation_keys
  add column package text not null default 'basis' references public.packages(key);

-- ─── Notifications (replaces the single ephemeral broadcast) ───────────────
-- account_id null = global notification, shown to every logged-in user.
-- title/body (not a single "message") to match the shape the admin broadcast
-- form already sends.
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid references auth.users(id) on delete cascade,
  title       text not null,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index notifications_account_idx on public.notifications(account_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;

create table public.notification_dismissals (
  notification_id  uuid not null references public.notifications(id) on delete cascade,
  account_id       uuid not null references auth.users(id) on delete cascade,
  dismissed_at     timestamptz not null default now(),
  primary key (notification_id, account_id)
);

alter table public.notification_dismissals enable row level security;
revoke all on public.notification_dismissals from public, anon, authenticated;

-- ─── Changelog ───────────────────────────────────────────────────────────────
create table public.changelog_entries (
  id           uuid primary key default gen_random_uuid(),
  version      text not null,
  released_at  date not null,
  summary      text not null,
  bullets      text[] not null default '{}',
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index changelog_entries_released_idx on public.changelog_entries(released_at desc);

alter table public.changelog_entries enable row level security;
revoke all on public.changelog_entries from public, anon, authenticated;

-- ─── Support tickets gain a category ─────────────────────────────────────────
-- Used to flag trial-signup verification tickets so the admin UI can offer a
-- dedicated "grant package" action on them.
alter table public.support_tickets add column category text;

-- ─── Grandfather existing users ──────────────────────────────────────────────
-- Every existing Supabase Auth user gets Basis + 30 credits (matches Basis's
-- start amount — nobody regresses), and every subject they already had
-- selected is marked purchased so nothing is retroactively charged.
insert into public.account_billing (user_id, package, credits, last_credit_topup_at)
select id, 'basis', 30, now() from auth.users
on conflict (user_id) do nothing;

insert into public.credit_transactions (account_id, delta, reason, note)
select id, 30, 'migration_grandfather', 'Bestaand account bij invoering pakketten'
from auth.users;

insert into public.subject_purchases (account_id, subject_id)
select user_id, subject_id from public.student_selected_subjects
on conflict do nothing;
