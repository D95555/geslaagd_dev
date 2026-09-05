# Social platform — Design

**Status:** Approved by user, ready for implementation planning.
**Scope note:** This is the deferred second sub-project from the original
credits/packages/social-platform request (see
[2026-09-05-credits-packages-admin-design.md](2026-09-05-credits-packages-admin-design.md)
for the first sub-project, already shipped). This spec covers profiles, the
user directory, DMs, group chats ("groepsapps"), photo sharing, blocking,
inline `#vak`/`#hoofdstuk` references, an in-chat `/ai` assistant, site-admin
moderation of group chats, and a shared Discord-like chat UI applied to this
new chat surface **and** retrofitted onto the two chat surfaces that already
exist (the AI study-chat panel and the support-ticket thread).

## Context

geslaagd.app currently has no way for students to contact each other. The
two existing "chat" surfaces (the per-chapter AI study assistant, and the
admin support-ticket thread) both feel "stroef": neither updates live — the
AI chat loads once per open, the support thread polls every 8 seconds — and
neither has the visual polish (message grouping, avatars-with-context,
smooth arrival) of a modern chat app. The user wants a full social layer
building on top of that fix, and wants this document detailed enough to
hand to a fresh Claude Code session for implementation.

## Architecture

**Transport:** server-authoritative REST + manual Realtime broadcast,
matching the pattern already used everywhere in this codebase for anything
live (session-logout commands, the notification-refresh pings shipped in
the credits sub-project). No table in this system is ever readable or
writable by the client directly — every table is `revoke all from public,
anon, authenticated`, and every read/write goes through an Express route
using the service-role key. Sending a message is a normal
`POST /conversations/:id/messages`; right after the insert succeeds, the
route calls `broadcast(token, "conversation:<id>", "new-message", {...})`,
and every client currently viewing that conversation is subscribed to that
channel and appends the message immediately. This was chosen over letting
clients subscribe directly to Postgres-Changes-based Realtime (which would
require opening RLS policies on chat tables — a first-time deviation from
this app's fully server-authoritative security model, and one that's
genuinely fiddly to get right for DM/group/blocking visibility) and over
polling (which is exactly the "stroef" feeling being fixed).

**One shared chat UI, three consumers.** Rather than building a new chat UI
for social and separately restyling the two existing ones, this spec builds
one reusable `MessageList` / `MessageComposer` component family and points
all three surfaces at it: the new social DMs/group chats, the existing
per-chapter AI study-chat panel, and the existing admin support-ticket
thread. This guarantees the three look and behave identically and means
future chat improvements only need to be built once.

## Data model

### `profiles` (1:1 with an account, mandatory before using the social features)

| column | type | notes |
|---|---|---|
| `user_id` | uuid primary key references auth.users(id) | |
| `username` | text, unique, not null | `@handle` for search/mentions; validated (lowercase, alphanumeric + `_`, 3-24 chars) |
| `display_name` | text, not null | |
| `avatar_url` | text, nullable | `null` = a default avatar, chosen client-side from a fixed set via a hash of `user_id` so it's stable |
| `institution` | text, nullable | |
| `study_program` | text, nullable | |
| `description` | text, nullable | |
| `created_at` / `updated_at` | timestamptz | |

Vakken are **not** a field here — a profile's "vakken" section is rendered
live from the existing `student_selected_subjects` table, so it can never
drift out of sync with what the student actually selected.

### `blocks`

| column | type |
|---|---|
| `blocker_id` | uuid references auth.users(id) |
| `blocked_id` | uuid references auth.users(id) |
| `created_at` | timestamptz |

Primary key `(blocker_id, blocked_id)`. Enforced **symmetrically** at read
time: if a row exists in either direction between two users, neither can
view the other's profile or send the other a new message. Existing message
history in conversations they already shared stays visible — only new
sends and profile views are blocked. Whoever attempts a blocked action sees
"Je kunt dit profiel niet meer bekijken" (or the message-send equivalent).

### `conversations` (covers both DMs and group chats — `kind` distinguishes them)

| column | type | notes |
|---|---|---|
| `id` | uuid primary key | |
| `kind` | text check in `('dm','group')` | |
| `title` | text, nullable | group only; a DM's displayed title is always the other member's display name |
| `description` | text, nullable | group only |
| `photo_url` | text, nullable | group only |
| `owner_id` | uuid references auth.users(id), nullable | the "groepseigenaar"; null for a DM |
| `status` | text check in `('active','closed','deleted')`, default `'active'` | see Site-admin moderation below |
| `created_at` | timestamptz | |

### `conversation_members`

| column | type |
|---|---|
| `conversation_id` | uuid references conversations(id) |
| `user_id` | uuid references auth.users(id) |
| `joined_at` | timestamptz |
| `last_read_at` | timestamptz, nullable — drives the unread indicator |
| `muted` | boolean, default false — suppresses mention notifications for this conversation |

Primary key `(conversation_id, user_id)`.

### `messages`

| column | type | notes |
|---|---|---|
| `id` | uuid primary key | |
| `conversation_id` | uuid references conversations(id) | |
| `sender_id` | uuid references auth.users(id), nullable | null for an `/ai` response |
| `kind` | text check in `('user','ai')` | |
| `body` | text | |
| `photo_url` | text, nullable | one photo per message, max |
| `references` | jsonb, default `[]` | array of `{ subjectId, chapterId?: string, label: string }`, populated by the `#`-mention picker in the composer |
| `created_at` | timestamptz | |
| `deleted_at` | timestamptz, nullable | **only** ever set by a site-admin moderation action (see below) — never by the sender, never by the groepseigenaar. Renders as "Dit bericht is verwijderd door een beheerder" in place of the body. |

## Onboarding gate

Immediately after email confirmation / first login, before any other part
of the study environment is reachable, a mandatory short flow collects:
username (validated live for uniqueness), display name, institution, study
program, optional description, and an avatar (pick a default or upload
one). This is a hard gate, not a dismissible prompt — structurally similar
to how a trial signup already triggers a mandatory follow-up (a support
ticket) as a side effect of account creation, just synchronous here instead
of backgrounded.

## User directory & profiles

A new `/social` area lists all profiles, searchable by display name,
username, or study program. Opening a profile shows name, avatar,
institution, study program, live vakken (from `student_selected_subjects`),
description, and a "Stuur bericht" button. A blocked relationship in either
direction replaces the whole profile view with the block notice instead of
the profile content.

## DMs

Fully open — anyone can message anyone, no request/accept step. Clicking
"Stuur bericht" on a profile finds-or-creates the `kind='dm'` conversation
between the two users and opens it.

## Group chats ("groepsapps")

Any user can create one (title + initial members picked from the
directory); the creator becomes the **groepseigenaar** automatically. No
member limit.

**Groepseigenaar powers** (group-scoped only): add/remove members, edit
title/description/photo, transfer ownership to another member. A
groepseigenaar can **never** delete or edit a message — that capability
belongs exclusively to a sitebeheerder, and the two roles are named
distinctly throughout this spec (and should be in code/UI copy too) so they
are never confused: **groepseigenaar** = controls one group's membership
and metadata; **sitebeheerder** = the existing site-wide admin role, the
only one that can touch message content or shut a group down.

## `#vak`/`#hoofdstuk` references

Typing `#` in the composer opens a searchable dropdown over published
subjects and their chapters (visually similar to Discord's `#channel`
mention, and conceptually identical to the existing `CitedText` citation
tags already used in the study-chat summary view). Picking one inserts a
structured reference into `messages.references`; the rendered message shows
it as a clickable chip that navigates straight to that subject or chapter.

## Photos

One photo per message (`messages.photo_url`), stored in a **private**
Supabase Storage bucket — no public URLs; the server always returns a
short-lived signed URL, keeping the same server-authoritative posture as
everything else. On upload, the server re-encodes to max ~1600px width /
JPEG ~80% quality. Quota: 50MB per user, 200MB per group chat; exceeding it
is a clear rejected-upload error, with no automatic deletion of older
photos to make room.

## `/ai` in chat

Typing `/ai <question>` (optionally with an attached photo — e.g. a
homework photo) in any conversation triggers a study-assistant reply,
inserted as a `kind='ai'` message visible to every member of that
conversation (not just the person who asked, since everyone in a group
benefits from the answer). Reuses the existing
`claim_study_ai_request(user_id)` rate limiter (max 12 calls / 15 minutes /
user) already guarding the per-chapter study chat — no new quota mechanism.
The assistant is given the question (and photo, if any) plus only the last
few messages of the conversation as context, not the full history, to keep
each call fast and bounded in cost.

## Site-admin moderation

A hidden `/beheer/groepsapps` page (invisible to regular users) lists every
group chat — title, groepseigenaar, member count, last activity — for abuse
detection. A sitebeheerder can:

- **Sluiten** (`status = 'closed'`): read-only — history stays visible to
  members, nobody can send further messages. Reversible.
- **Verwijderen** (`status = 'deleted'`): hard delete, irreversible,
  confirmed with an extra step before it takes effect.
- **Delete an individual message**: sets `messages.deleted_at`; the message
  renders as "Dit bericht is verwijderd door een beheerder" instead of its
  content. This is the only way any message is ever removed — not
  available to the groepseigenaar, not available to the sender.

## Shared chat UI and "Discord-like" behaviors

One `MessageList`/`MessageComposer` component family, used by the new
social conversations, the existing AI study-chat panel
(`chat-panel.tsx`), and the existing admin support-ticket thread. Concrete
behaviors that make it feel like the target ("Discord-achtig") rather than
the current "stroef" feel:

- **Message grouping** — consecutive messages from the same sender within a
  short window collapse under one avatar/name header instead of repeating
  it per message. This is the single biggest visual contributor to feeling
  smooth rather than stiff.
- **Unread indicator** — a dot/bold conversation title in the list, driven
  by comparing a conversation's latest message time to the viewer's
  `conversation_members.last_read_at`.
- **Typing indicator** — a short-lived `broadcast()` event, no database
  write, consistent with the already-adopted realtime pattern.
- **@mentions trigger a notification** — typing `@username` sends that
  person a personal notification ("X vermeldde je in Y"), reusing the
  notifications system already shipped in the credits sub-project rather
  than building a second one.
- **Mute a conversation** — `conversation_members.muted` suppresses mention
  notifications for a noisy group without leaving it.
- **Reference chips** reuse the existing `CitedText` citation-tag visual
  pattern, so `#vak` mentions feel like something the app already does
  rather than a new interaction to learn.

## Testing approach

Consistent with the rest of this codebase: no unit-test framework exists,
so verification is via throwaway `scratch-*.ts` scripts against the real
Supabase backend with disposable test accounts/conversations, cleaned up
immediately after each check, plus manual browser verification for the new
pages and the retrofitted chat UI on the two existing surfaces.

## Explicitly deferred / out of scope

- Voice/video calling, message reactions (emoji), read receipts beyond the
  simple unread-dot, and message editing by the sender are all out of
  scope for this spec — none were requested, and each would add real
  complexity (reactions need their own table and realtime fan-out; editing
  raises the same "who's allowed to touch a message" question the
  groepseigenaar/sitebeheerder split was designed to keep simple).
- Payment/monetization of any social feature — none requested, none added.
- Rate-limiting message sends itself (as opposed to `/ai` calls) is not
  addressed here; if abuse becomes a real problem post-launch, the existing
  sitebeheerder moderation page is the intended first line of response
  (close or delete), with a dedicated send-rate-limit as a possible later
  addition rather than something this spec needs to solve up front.
