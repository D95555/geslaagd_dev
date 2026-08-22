create table public.app_sessions (
  client_session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  device_label text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id)
);

alter table public.app_sessions enable row level security;
create policy "users_register_own_session" on public.app_sessions for insert to authenticated with check (auth.uid() = user_id and email = (auth.jwt() ->> 'email'));
create policy "users_refresh_own_session" on public.app_sessions for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "admins_manage_sessions" on public.app_sessions for all to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "session_owner_receives_commands" on realtime.messages for select to authenticated using (realtime.topic() = 'app:broadcasts' or split_part(realtime.topic(), ':', 2) = auth.uid()::text);
create policy "admins_send_realtime_commands" on realtime.messages for insert to authenticated with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');