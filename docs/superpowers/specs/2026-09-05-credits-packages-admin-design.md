# Credits, pakketten & beheer-uitbreidingen — Design

**Status:** Approved by user, ready for implementation planning.
**Scope note:** This is sub-project 1 of a larger request. The social platform
(profiles, DMs, group chats, photos, admin moderation, Discord-like chat
redesign) is a separate, much larger sub-project and is intentionally **not**
covered here — it needs its own brainstorming/design pass before a spec is
written for it. Build order agreed with the user: this spec first, social
platform second.

## Context

geslaagd.app currently lets any account with a valid one-time activation key
sign up and use every subject with no usage limits. The user (platform owner,
personally vetting access) wants to move to a metered, tiered model: credits
that gate subject creation/use, four package tiers with different credit
allowances, keys that carry a package and can be used post-signup to upgrade,
a free/unpaid trial path with a manual student-verification flow via support
tickets, a split of the combined admin "Accounts & sessies" page into two
pages (with per-user persistent notifications added to Sessions), and a
lightweight admin-editable changelog surfaced to users.

**Explicitly out of scope for now:** no real payment processing. "Paid
package" language must not appear anywhere in UI/copy — packages are
manually granted (via key or admin action) while the owner tests the model
for the first few days.

## Data model

### `packages` (reference table, 4 fixed rows, no user-facing CRUD)

| column | type | notes |
|---|---|---|
| `key` | text primary key | `'trial'` \| `'basis'` \| `'plus'` \| `'beheerder'` |
| `label` | text | "Trial", "Basis", "Plus", "Beheerder" |
| `rank` | int | 0, 1, 2, 3 — upgrade ordering |
| `start_credits` | int, nullable | 10 / 30 / 60 / `null` (`null` = unlimited) |
| `monthly_credits` | int, nullable | 0 / 10 / 25 / `null` |
| `can_create_subjects` | boolean | `false` for trial, `true` otherwise |

### `accounts` — new columns

- `package text references packages(key) default 'trial'`
- `credits int not null default 10` — materialized balance, always written
  through the ledger functions below, never updated directly elsewhere.
- `last_credit_topup_at timestamptz` — drives the lazy monthly top-up check.

Migration note: existing accounts get `package = 'basis'`, `credits = 30`,
`last_credit_topup_at = now()` (matches Basis's start amount, avoids an
awkward "everyone starts at trial" regression for current users). Every
subject an existing account already has access to gets a row inserted into
`subject_purchases` (see below) at migration time via a
`migration_grandfather` ledger reason, so nothing is retroactively charged.

### `credit_transactions` (the ledger — source of truth for balance and history)

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `account_id` | uuid references accounts(id) | |
| `delta` | int | positive or negative |
| `reason` | text | `'signup_grant'` \| `'monthly_topup'` \| `'subject_open'` \| `'subject_create'` \| `'package_upgrade'` \| `'admin_adjustment'` \| `'migration_grandfather'` |
| `related_subject_id` | uuid references crawl_subjects(id), nullable | |
| `note` | text, nullable | free text, e.g. for `admin_adjustment` |
| `created_at` | timestamptz default now() | |

This table is also what powers the "laatste acties" column on the new
Accounts admin page (see below) — it is queried directly, no separate
activity-log table.

### `activation_keys` — new column

- `package text references packages(key)` — which package this key grants.
  `status`/`source` are unchanged.

### `subject_purchases` (new)

| column | type |
|---|---|
| `account_id` | uuid references accounts(id) |
| `subject_id` | uuid references crawl_subjects(id) |
| `purchased_at` | timestamptz default now() |

Presence of a row = "this account has already paid the one-time cost for
this subject" — reopening never charges again, no per-open ledger check
needed once the row exists.

### `notifications` (new — replaces/extends the current global-only mechanism)

| column | type |
|---|---|
| `id` | uuid pk |
| `account_id` | uuid, nullable | `null` = global notification |
| `message` | text |
| `created_at` | timestamptz default now() |

### `notification_dismissals` (new)

| column | type |
|---|---|
| `notification_id` | uuid references notifications(id) |
| `account_id` | uuid references accounts(id) |
| `dismissed_at` | timestamptz default now() |

A notification (global or personal) stays visible, stacked with any others,
until the viewing account has a dismissal row for it. Global notifications
are not delivered to logged-out visitors — there is no account to attach a
dismissal to, and (per discussion) that's fine: nothing forces a
not-logged-in visitor to see it, and it will simply be there once they log
in.

### `changelog_entries` (new)

| column | type |
|---|---|
| `id` | uuid pk |
| `version` | text | e.g. "v0.51" |
| `released_at` | date | |
| `summary` | text | short title/summary |
| `bullets` | text[] | list of change lines |
| `created_by` | uuid references accounts(id) | |

## Credit rules

**Central functions**, used everywhere credits move (no direct
`UPDATE accounts SET credits = ...` anywhere else in the codebase):

- `spendCredits(accountId, amount, reason, relatedSubjectId?)` — for
  `beheerder` accounts, skip the balance check entirely (unlimited). For
  everyone else: error if balance `< amount`; otherwise insert the ledger
  row and decrement `accounts.credits` in the same transaction. The error
  surfaces to the API as a clear "insufficient credits" failure.
- `grantCredits(accountId, amount, reason, note?)` — inserts a positive
  ledger row and increments `accounts.credits`, capped so the balance never
  exceeds that account's `package.start_credits` (skip the cap for
  `beheerder`, whose `start_credits` is `null`/unlimited). The ledger delta
  recorded is the amount actually applied (0 if already at the cap), so the
  ledger stays truthful even when the cap absorbs the full requested amount.

**Spend points:**

- **Opening a subject not yet purchased** — check `subject_purchases`; if
  absent, `spendCredits(5, 'subject_open')` then insert into
  `subject_purchases`. Every subsequent open is free (existence of the row
  is the only check — no repeated ledger entries).
- **Requesting a new subject** — first check `package.can_create_subjects`
  (reject trial outright, with a message directing them to support to
  request an upgrade); then check the rolling monthly cap (below); then
  `spendCredits(10, 'subject_create')`; then insert a `subject_purchases`
  row for that account immediately (they just paid for it, so opening it
  right after must not charge again).

**Monthly subject-creation cap (3, non-admins):** no counter column —
computed on demand as
`count(*) from crawl_subjects where requested_by = accountId and created_at > now() - interval '30 days'`.
`beheerder` accounts skip this check.

**Monthly credit top-up:** lazy, no scheduler. On any request where credits
matter (e.g. loading the subjects page, or opening/creating a subject),
check whether `now() - last_credit_topup_at >= interval '30 days'`; if so,
call `grantCredits(monthly_credits, 'monthly_topup')` and set
`last_credit_topup_at = now()`. `beheerder`/`trial` (whose `monthly_credits`
is `null`/0 respectively) naturally no-op here.

## Trial signup & verification flow

The activation page gains a "Start gratis met Trial" path alongside the
existing key field. It creates the account directly with
`package = 'trial'`, `credits = 10`, no key required.

Immediately after that account is created, a support ticket is opened on
its behalf with a fixed `category: 'pakket_verificatie'` and a canned first
message (system template, not AI):

> **Onderwerp:** Verificatie studentenstatus
> Welkom bij geslaagd.app! Om toegang te krijgen tot een ander pakket
> (Basis/Plus), moet een beheerder even bevestigen dat je een studerende
> gebruiker bent. Beantwoord hieronder kort:
> 1. Voor- en achternaam
> 2. Onderwijsinstelling
> 3. Studierichting
> 4. Waarvoor wil je geslaagd.app gebruiken?
>
> Een beheerder reageert zo snel mogelijk.

No "betaald"/"paid" wording anywhere in this template or its surrounding UI.

In the admin ticket view, a `pakket_verificatie` ticket gets a "Pakket
toekennen" action: an admin picks Basis or Plus, which generates a key of
that package and applies it to the account immediately (no manual code
entry), and marks the ticket resolved. An admin can also just close the
ticket without granting anything.

**Ticket display name fix (small, bundled here since it's directly next to
this work):** wherever a ticket/message currently shows the literal label
"Student" or "Beheerder", it is replaced with the real account name or
email, stored per-ticket (not just per-session) so tickets stay identifiable
and searchable by who they belong to.

## Key upgrade flow

Ranking is purely `packages.rank`. A key for package X can be applied to an
account only if `X.rank > account.package.rank`; equal-or-lower is rejected
with a clear error ("Deze key is voor een pakket dat gelijk is aan of lager
dan je huidige pakket").

- **New, key-based signup** — unchanged flow: activation page, key sets the
  account's initial package directly.
- **Logged-in upgrade** — the activation page (or a link from
  profile/settings) exposes an "upgrade key" field for logged-in users, thin
  new endpoint: validate key is open → rank check against current package →
  on success, `accounts.package = key.package`,
  `accounts.credits = package.start_credits` (ledger reason
  `package_upgrade`, per the user's explicit choice that upgrading resets
  balance to the new package's start amount, not adds to it) → mark key
  `used`.
- **Admin key creation** — the existing "create keys" admin action gains a
  required package selector; every batch of generated keys grants a single
  chosen package.

## Admin: Accounts/Sessions split

Two routes replace the current combined page:

- **`/admin/sessies`** — unchanged current content, plus a "Stuur privé
  melding" action per session row. The action targets the **account** (not
  the individual device/session) — visible on every session/device that
  account is logged into — since a notification tied to one device only
  would be confusing and the user confirmed this preference.
- **`/admin/accounts`** — unchanged current content, plus **pakket** and
  **laatste acties** columns. "Laatste acties" is the most recent N rows
  from `credit_transactions` for that account, rendered as a short list
  (e.g. "5 credits · vak geopend · 2 uur geleden"). Admins can change a
  user's package via a select; this reuses the same upgrade mechanism as a
  key (`credits = package.start_credits`, ledger reason
  `admin_adjustment`) and works in both directions (upgrade or downgrade,
  since it's an admin override, not the key rank-check path).

**Notifications UI:** both global (`account_id is null`) and personal
notifications render through the same component in the app shell, stacked
as a list (not replacing each other), each independently dismissible; a
dismissal is permanent (recorded in `notification_dismissals`) and does not
reappear.

## Changelog

Admin page `/admin/changelog`: list of entries newest-first, with a form to
**add** a new entry (version, date, summary, bullets as multi-line text) and
to **edit** an existing one. No delete UI for now.

Public-facing (within the logged-in shell, no separate unauthenticated
route needed) `/changelog` page lists all entries. A small version badge in
the shell (sidebar footer) links to it; the version shown is read from the
newest `changelog_entries` row, not a separate hardcoded constant, so there
is only one place to update per release.

**Backfill:** as part of implementation, historical entries (v0.1 through
the current v0.4) will be reconstructed from git commit history into
sensible summarized entries, plus a new entry for this feature set itself
(v0.51) once it ships. The user has asked that going forward, the assistant
(not the admin) is primarily responsible for drafting new changelog entries
when shipping features; admins retain the ability to add/edit manually when
needed.

## Testing approach

No unit-test framework exists in this codebase (per prior sessions);
verification will follow the established pattern of throwaway `scratch-*.ts`
scripts against the real Supabase backend with explicitly-created,
immediately-cleaned-up rows, plus manual UI verification in the browser
preview for the admin pages and activation/upgrade flows. Credit-ledger
math (spend, grant, cap enforcement, monthly top-up eligibility) is
straightforward enough to verify with a handful of scripted scenarios
covering: normal spend, insufficient balance, cap-limited grant, and
admin/beheerder unlimited bypass.

## Explicitly deferred

- The social platform (profiles, DMs, group chats, photos, admin
  moderation) and the Discord-like chat redesign — separate sub-project,
  separate spec.
- Real payment processing — none of this wires up actual billing; package
  changes are always key- or admin-driven for now.
