-- ─── Profiles ────────────────────────────────────────────────────────────────
create table public.profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  username       text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name   text not null check (char_length(display_name) between 1 and 60),
  avatar_url     text,
  institution    text,
  study_program  text,
  description    text check (description is null or char_length(description) <= 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index profiles_username_idx on public.profiles(username);

alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;

-- ─── Blocks ──────────────────────────────────────────────────────────────────
create table public.blocks (
  blocker_id  uuid not null references auth.users(id) on delete cascade,
  blocked_id  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

alter table public.blocks enable row level security;
revoke all on public.blocks from public, anon, authenticated;

-- ─── Conversations ───────────────────────────────────────────────────────────
create table public.conversations (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('dm', 'group')),
  title        text,
  description  text,
  photo_url    text,
  owner_id     uuid references auth.users(id) on delete set null,
  status       text not null default 'active' check (status in ('active', 'closed', 'deleted')),
  created_at   timestamptz not null default now()
);

alter table public.conversations enable row level security;
revoke all on public.conversations from public, anon, authenticated;

create table public.conversation_members (
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  joined_at        timestamptz not null default now(),
  last_read_at     timestamptz,
  muted            boolean not null default false,
  primary key (conversation_id, user_id)
);

create index conversation_members_user_idx on public.conversation_members(user_id);

alter table public.conversation_members enable row level security;
revoke all on public.conversation_members from public, anon, authenticated;

-- ─── Messages ────────────────────────────────────────────────────────────────
create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  sender_id        uuid references auth.users(id) on delete set null,
  kind             text not null check (kind in ('user', 'ai')),
  body             text not null,
  photo_url        text,
  "references"     jsonb not null default '[]',
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index messages_conversation_idx on public.messages(conversation_id, created_at desc);

alter table public.messages enable row level security;
revoke all on public.messages from public, anon, authenticated;

-- ─── Storage bucket for shared photos ────────────────────────────────────────
-- Private: never readable via a public URL. The server always mints a
-- short-lived signed URL with the service role key.
insert into storage.buckets (id, name, public)
values ('social-photos', 'social-photos', false)
on conflict (id) do nothing;

-- ─── Realtime authorization for the new broadcast topics ────────────────────
-- Every existing broadcast() call site in this codebase is admin-triggered
-- (session logout, notification refresh), so the existing realtime.messages
-- policies only cover 'app:broadcasts' / a user's own 'user:<id>:...' topics
-- and restrict INSERT to admins. This is the first feature where an ordinary
-- user sends and receives their own broadcasts (a chat message, a typing
-- ping), on topics keyed by conversation/ticket id rather than by their own
-- user id -- so new policies are needed, scoped by actual membership rather
-- than opened up broadly.
create policy "conversation_members_receive_broadcasts" on realtime.messages
  for select to authenticated
  using (
    split_part(realtime.topic(), ':', 1) = 'conversation'
    and exists (
      select 1 from public.conversation_members
      where conversation_id = split_part(realtime.topic(), ':', 2)::uuid
        and user_id = auth.uid()
    )
  );

create policy "conversation_members_send_broadcasts" on realtime.messages
  for insert to authenticated
  with check (
    split_part(realtime.topic(), ':', 1) = 'conversation'
    and exists (
      select 1 from public.conversation_members
      where conversation_id = split_part(realtime.topic(), ':', 2)::uuid
        and user_id = auth.uid()
    )
  );

create policy "ticket_participants_receive_broadcasts" on realtime.messages
  for select to authenticated
  using (
    split_part(realtime.topic(), ':', 1) = 'ticket'
    and (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
      or exists (
        select 1 from public.support_tickets
        where id = split_part(realtime.topic(), ':', 2)::uuid
          and user_id = auth.uid()
      )
    )
  );

create policy "ticket_participants_send_broadcasts" on realtime.messages
  for insert to authenticated
  with check (
    split_part(realtime.topic(), ':', 1) = 'ticket'
    and (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
      or exists (
        select 1 from public.support_tickets
        where id = split_part(realtime.topic(), ':', 2)::uuid
          and user_id = auth.uid()
      )
    )
  );
