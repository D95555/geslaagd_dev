-- ─── Drop the AI hand-off machinery from support tickets ──────────────────
-- The AI auto-reply had no real product knowledge and couldn't actually
-- help, so it's gone. These columns only existed to track which "actor"
-- (AI or admin) was responsible for a ticket -- without an AI, every ticket
-- is simply an admin's job, so there is nothing left to track.
--
-- support_messages.sender keeps allowing 'ai' (unchanged) so the handful of
-- already-written AI replies still display correctly as history; nothing
-- writes that value going forward.

alter table public.support_tickets
  drop column handled_by,
  drop column flagged,
  drop column flag_reason;

drop index if exists support_tickets_status_idx;
create index support_tickets_status_idx on public.support_tickets(status, last_message_at desc);
