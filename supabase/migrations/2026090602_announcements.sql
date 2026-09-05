-- Admin-editable announcements, shown publicly (merged with the changelog
-- feed on the frontend, per the user's request) at /announcements.
create table public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 160),
  body        text not null check (char_length(body) between 1 and 2000),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index announcements_created_idx on public.announcements(created_at desc);

alter table public.announcements enable row level security;
revoke all on public.announcements from public, anon, authenticated;
