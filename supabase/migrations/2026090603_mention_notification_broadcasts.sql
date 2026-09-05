-- @mention notifications (routes/messages.ts) already insert a row into
-- public.notifications and were meant to wake up any tab the mentioned user
-- has open, the same way admin-triggered notifications already do (see
-- admins_send_realtime_commands in 2026082201_admin_session_controls.sql).
-- But that policy is admin-only, so a regular member mentioning another
-- member had no permissive policy covering `user:<id>:notifications` and the
-- broadcast silently failed RLS — the mention still landed, just never live.
--
-- Scoped to two users who actually share a conversation, since that's the
-- only situation the mention flow can arise from; the payload itself is
-- always empty (just a "go refetch your notifications" signal).
create policy "conversation_members_notify_mentions" on realtime.messages
  for insert to authenticated
  with check (
    split_part(realtime.topic(), ':', 1) = 'user'
    and split_part(realtime.topic(), ':', 3) = 'notifications'
    and exists (
      select 1 from public.conversation_members as mine
      join public.conversation_members as theirs on theirs.conversation_id = mine.conversation_id
      where mine.user_id = auth.uid()
        and theirs.user_id = split_part(realtime.topic(), ':', 2)::uuid
    )
  );
