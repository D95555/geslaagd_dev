-- ─── Support tickets ───────────────────────────────────────────────────────
-- A student opens a ticket; an AI answers by default. The AI can flag a
-- ticket for admin attention, and an admin can take over a ticket (their own
-- reply does this too) which stops the AI from auto-replying. Admins can see
-- every ticket regardless of flag/handler state.

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  subject text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  handled_by text not null default 'ai' check (handled_by in ('ai', 'admin')),
  flagged boolean not null default false,
  flag_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create index support_tickets_user_idx on public.support_tickets(user_id, last_message_at desc);
create index support_tickets_status_idx on public.support_tickets(status, flagged, last_message_at desc);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender text not null check (sender in ('user', 'ai', 'admin')),
  sender_user_id uuid,
  body text not null,
  created_at timestamptz not null default now()
);

create index support_messages_ticket_idx on public.support_messages(ticket_id, created_at asc);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
revoke all on public.support_tickets from public, anon, authenticated;
revoke all on public.support_messages from public, anon, authenticated;
-- Server-only: the API checks ticket ownership (or admin) itself, the same
-- way it already does for every other user-owned resource in this app.
