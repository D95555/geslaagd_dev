# Credits, Pakketten & Beheer-uitbreidingen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a credit/package system (Trial/Basis/Plus/Beheerder), package-tiered activation keys with upgrade support, a trial-verification flow via support tickets, a split Accounts/Sessions admin area with persistent per-account and global notifications, and an admin-editable changelog with a version badge.

**Architecture:** All new state lives in Postgres (Supabase), read/written through the existing `restService`/`rest` REST helpers — this codebase has no ORM. User identity is `auth.users` (Supabase Auth); there is **no `public.accounts` table**, so per-user product state (package, credits) lives in a new `public.account_billing` table keyed by `user_id uuid primary key references auth.users(id)`. A new `lib/credits.ts` module is the single place that reads/writes balances, so no route ever touches `account_billing.credits` directly. New Express routes follow the existing per-domain-file pattern (`routes/*.ts`), validated with zod schemas generated into `@workspace/api-zod` from `lib/api-spec/openapi.yaml`. Frontend pages follow the existing `AdminShell`/`@workspace/geslaagd-momentum` component patterns.

**Tech Stack:** Express + TypeScript (api-server), React + Vite + wouter (geslaagd-app), Supabase (Postgres + Auth + Realtime), zod (generated via orval from `openapi.yaml`), pnpm workspaces.

**Spec:** [docs/superpowers/specs/2026-09-05-credits-packages-admin-design.md](../specs/2026-09-05-credits-packages-admin-design.md)

## Global Constraints

- No real payment processing exists or is added — packages are granted only via activation key or admin action. No UI copy anywhere may say "betaald"/"paid" package.
- No unit-test framework exists in this codebase. Verification is via throwaway `scratch-*.ts` scripts (`npx tsx --env-file-if-exists=.env <file>.ts`) run against the real Supabase/OpenAI backends with explicitly-created, immediately-cleaned-up rows, plus manual browser verification for UI. Never leave a `scratch-*.ts` file committed — delete it once its check has run.
- Every `openapi.yaml` change must be followed by `pnpm --filter @workspace/api-spec run codegen` before the frontend/backend code that consumes the new types is written, so the generated `@workspace/api-zod` / `@workspace/api-client-react` types exist.
- Migrations are written to `supabase/migrations/YYYYMMDDNN_name.sql` AND applied via the Supabase MCP `apply_migration` tool — both must happen; the file is the durable record, the tool call is what actually changes the live database.
- `beheerder` accounts always bypass credit checks, monthly-cap checks, and `can_create_subjects` checks entirely — never add a code path that could block an admin.
- Match existing code style exactly: `restService<Row[]>(...)` for service-role Postgres access, `rest<T>(token, ...)` for user-scoped access, zod `safeParse` on every request body/params, Dutch user-facing error strings, `req.log.warn({ error }, "...")` on caught errors.

---

## File Structure

**New backend files:**
- `artifacts/api-server/src/lib/credits.ts` — the credit ledger: `spendCredits`, `grantCredits`, `getBilling`, `ensureMonthlyTopup`, `PACKAGES` lookup.
- `artifacts/api-server/src/lib/notifications.ts` — `listNotificationsFor(userId)`, `dismissNotification`, `createNotification`.
- `artifacts/api-server/src/routes/admin-sessions.ts` — split out of `admin.ts`: session list/revoke, broadcasts, private per-account notifications.
- `artifacts/api-server/src/routes/admin-accounts.ts` — split out of `admin.ts`: account list/detail/block/unblock/delete, now with package + recent credit activity, admin package change.
- `artifacts/api-server/src/routes/notifications.ts` — student/self-service: `GET /notifications`, `POST /notifications/:id/dismiss`.
- `artifacts/api-server/src/routes/changelog.ts` — `GET /changelog` (any authenticated user), `GET/POST/PATCH /admin/changelog`.

**Modified backend files:**
- `artifacts/api-server/src/lib/activation-keys.ts` — add `package`, rank comparison, `applyUpgradeKey`.
- `artifacts/api-server/src/routes/admin.ts` — deleted; contents moved into `admin-accounts.ts` / `admin-sessions.ts`.
- `artifacts/api-server/src/routes/events.ts` — `/auth/signup` assigns package/credits from the key; new `/auth/signup-trial` route.
- `artifacts/api-server/src/routes/sources.ts` — enforce `can_create_subjects`, the monthly cap, and the 10-credit spend on `POST /sources/request-subject`.
- `artifacts/api-server/src/routes/subjects.ts` — 5-credit spend on first `POST /subjects/:subjectId/select`.
- `artifacts/api-server/src/routes/support.ts` — trial-verification ticket category, admin "grant package" action.
- `artifacts/api-server/src/lib/support-tickets.ts` — real display name/email per ticket and per message.
- `artifacts/api-server/src/routes/index.ts` — register the new/renamed routers.

**New frontend files:**
- `artifacts/geslaagd-app/src/pages/admin-sessions-page.tsx` — replaces `admin-page.tsx`.
- `artifacts/geslaagd-app/src/pages/admin-accounts-page.tsx` — promotes `admin-accounts.tsx` from a tab panel to a full page.
- `artifacts/geslaagd-app/src/pages/changelog-page.tsx` — public changelog view.
- `artifacts/geslaagd-app/src/pages/admin-changelog-page.tsx` — admin add/edit.
- `artifacts/geslaagd-app/src/components/shell/notifications-stack.tsx` — stacked, dismissible notification list (replaces the single ephemeral broadcast banner).
- `artifacts/geslaagd-app/src/components/shell/version-badge.tsx` — small version link in the shell.

**Modified frontend files:**
- `artifacts/geslaagd-app/src/pages/admin-page.tsx` — deleted.
- `artifacts/geslaagd-app/src/pages/admin-accounts.tsx` — deleted (merged into `admin-accounts-page.tsx`).
- `artifacts/geslaagd-app/src/pages/admin-activation-keys-page.tsx` — package selector on key creation.
- `artifacts/geslaagd-app/src/pages/admin-support-page.tsx` — real names, pakket_verificatie handling.
- `artifacts/geslaagd-app/src/pages/auth-page.tsx` — trial signup path, upgrade-key field for logged-in users.
- `artifacts/geslaagd-app/src/components/shell/admin-sidebar.tsx` — split nav item, add Changelog.
- `artifacts/geslaagd-app/src/auth/auth-context.tsx` — replace single `broadcast` state with the notifications list.
- `artifacts/geslaagd-app/src/App.tsx` — new/changed routes.
- `artifacts/geslaagd-app/src/index.css` — styles for the new UI pieces.

---

### Task 1: Database schema — packages, credit ledger, purchases, keys, notifications, changelog

**Files:**
- Create: `supabase/migrations/2026090501_credits_and_packages.sql`

**Interfaces:**
- Produces tables/columns every later task reads/writes: `public.packages`, `public.account_billing(user_id, package, credits, last_credit_topup_at)`, `public.credit_transactions(id, account_id, delta, reason, related_subject_id, note, created_at)`, `public.subject_purchases(account_id, subject_id, purchased_at)`, `public.activation_keys.package`, `public.notifications(id, account_id, message, created_at)`, `public.notification_dismissals(notification_id, account_id, dismissed_at)`, `public.changelog_entries(id, version, released_at, summary, bullets, created_by, created_at)`.

- [ ] **Step 1: Write the migration file**

```sql
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
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid references auth.users(id) on delete cascade,
  message     text not null,
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
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP tool: `apply_migration` with `project_id = xpguhyuvooeizrjjrpkw`, `name = credits_and_packages`, and the SQL body above.

- [ ] **Step 3: Verify with a scratch script**

Create `artifacts/api-server/scratch-verify-schema.ts`:

```ts
import { restService } from "./src/lib/supabase";

async function main() {
  const packages = await restService<unknown[]>("packages?select=*");
  console.log("packages:", packages);
  const sample = await restService<unknown[]>("account_billing?select=*&limit=3");
  console.log("account_billing sample:", sample);
}

main();
```

Run: `npx tsx --env-file-if-exists=.env artifacts/api-server/scratch-verify-schema.ts`
Expected: 4 package rows (trial/basis/plus/beheerder with the correct credit amounts), and existing users show up in `account_billing` with `package: 'basis', credits: 30`.

- [ ] **Step 4: Delete the scratch script and commit**

```bash
rm artifacts/api-server/scratch-verify-schema.ts
git add supabase/migrations/2026090501_credits_and_packages.sql
git commit -m "Schema: pakketten, credit-ledger, key-pakketten, notificaties, changelog"
```

---

### Task 2: Credit ledger module (`lib/credits.ts`)

**Files:**
- Create: `artifacts/api-server/src/lib/credits.ts`

**Interfaces:**
- Consumes: `restService` from `../lib/supabase` (existing).
- Produces (used by Tasks 4, 5, 6, 9, 12):
  - `type Package = { key: string; label: string; rank: number; startCredits: number | null; monthlyCredits: number | null; canCreateSubjects: boolean }`
  - `getPackage(key: string): Promise<Package>`
  - `getBilling(userId: string): Promise<{ package: Package; credits: number }>` — also runs the lazy monthly top-up as a side effect before returning.
  - `spendCredits(userId: string, amount: number, reason: SpendReason, relatedSubjectId?: string): Promise<void>` — throws `InsufficientCreditsError` if the balance is too low (skipped entirely for `beheerder`).
  - `grantCredits(userId: string, amount: number, reason: GrantReason, note?: string): Promise<void>` — caps at `package.startCredits` (no cap for `beheerder`).
  - `class InsufficientCreditsError extends Error {}`

- [ ] **Step 1: Write `lib/credits.ts`**

```ts
import { restService } from "./supabase";

type Row = Record<string, unknown>;

export type PackageKey = "trial" | "basis" | "plus" | "beheerder";

export type Package = {
  key: PackageKey;
  label: string;
  rank: number;
  startCredits: number | null;
  monthlyCredits: number | null;
  canCreateSubjects: boolean;
};

export type SpendReason = "subject_open" | "subject_create";
export type GrantReason = "signup_grant" | "monthly_topup" | "package_upgrade" | "admin_adjustment" | "migration_grandfather";

export class InsufficientCreditsError extends Error {
  constructor() {
    super("Onvoldoende credits.");
  }
}

function toPackage(row: Row): Package {
  return {
    key: row.key as PackageKey,
    label: row.label as string,
    rank: row.rank as number,
    startCredits: (row.start_credits as number | null) ?? null,
    monthlyCredits: (row.monthly_credits as number | null) ?? null,
    canCreateSubjects: Boolean(row.can_create_subjects),
  };
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export async function getPackage(key: PackageKey): Promise<Package> {
  const rows = await restService<Row[]>(`packages?key=eq.${key}&select=*`);
  const row = rows[0];
  if (!row) throw new Error(`Unknown package: ${key}`);
  return toPackage(row);
}

async function insertLedgerRow(
  accountId: string,
  delta: number,
  reason: SpendReason | GrantReason,
  relatedSubjectId?: string,
  note?: string,
): Promise<void> {
  await restService("credit_transactions", {
    method: "POST",
    body: JSON.stringify({
      account_id: accountId,
      delta,
      reason,
      related_subject_id: relatedSubjectId ?? null,
      note: note ?? null,
    }),
  });
}

/**
 * Applies the lazy monthly top-up if 30+ days have passed since the last one,
 * then returns the (possibly just-updated) billing row. Called at the start
 * of getBilling/spendCredits/grantCredits so every credit-aware code path
 * benefits from it without a separate scheduler.
 */
async function ensureMonthlyTopup(userId: string): Promise<Row> {
  const rows = await restService<Row[]>(`account_billing?user_id=eq.${userId}&select=*`);
  const billing = rows[0];
  if (!billing) throw new Error(`No account_billing row for user ${userId}`);

  const lastTopup = new Date(billing.last_credit_topup_at as string).getTime();
  if (Date.now() - lastTopup < MONTH_MS) return billing;

  const pkg = await getPackage(billing.package as PackageKey);
  if (pkg.key === "beheerder" || !pkg.monthlyCredits) {
    await restService(`account_billing?user_id=eq.${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ last_credit_topup_at: new Date().toISOString() }),
    });
    return { ...billing, last_credit_topup_at: new Date().toISOString() };
  }

  const currentCredits = billing.credits as number;
  const cap = pkg.startCredits ?? currentCredits + pkg.monthlyCredits;
  const applied = Math.max(0, Math.min(pkg.monthlyCredits, cap - currentCredits));

  const updated = await restService<Row[]>(`account_billing?user_id=eq.${userId}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      credits: currentCredits + applied,
      last_credit_topup_at: new Date().toISOString(),
    }),
  });
  if (applied > 0) await insertLedgerRow(userId, applied, "monthly_topup");
  return updated[0] ?? billing;
}

export async function getBilling(userId: string): Promise<{ package: Package; credits: number }> {
  const billing = await ensureMonthlyTopup(userId);
  const pkg = await getPackage(billing.package as PackageKey);
  return { package: pkg, credits: billing.credits as number };
}

export async function spendCredits(
  userId: string,
  amount: number,
  reason: SpendReason,
  relatedSubjectId?: string,
): Promise<void> {
  const { package: pkg, credits } = await getBilling(userId);
  if (pkg.key === "beheerder") return;
  if (credits < amount) throw new InsufficientCreditsError();

  await restService(`account_billing?user_id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ credits: credits - amount }),
  });
  await insertLedgerRow(userId, -amount, reason, relatedSubjectId);
}

export async function grantCredits(
  userId: string,
  amount: number,
  reason: GrantReason,
  note?: string,
): Promise<void> {
  const { package: pkg, credits } = await getBilling(userId);
  const cap = pkg.startCredits ?? credits + amount;
  const applied = Math.max(0, Math.min(amount, cap - credits));

  await restService(`account_billing?user_id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ credits: credits + applied }),
  });
  await insertLedgerRow(userId, applied, reason, undefined, note);
}

/** Rolling-30-day count of subjects this account has requested (excludes beheerder, checked by caller). */
export async function subjectsCreatedThisMonth(userId: string): Promise<number> {
  const cutoff = new Date(Date.now() - MONTH_MS).toISOString();
  const rows = await restService<Row[]>(
    `crawl_subjects?requested_by=eq.${userId}&created_at=gte.${encodeURIComponent(cutoff)}&select=id`,
  );
  return rows.length;
}

export async function hasPurchasedSubject(userId: string, subjectId: string): Promise<boolean> {
  const rows = await restService<Row[]>(
    `subject_purchases?account_id=eq.${userId}&subject_id=eq.${subjectId}&select=account_id`,
  );
  return rows.length > 0;
}

export async function recordSubjectPurchase(userId: string, subjectId: string): Promise<void> {
  await restService("subject_purchases?on_conflict=account_id,subject_id", {
    method: "POST",
    headers: { prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify({ account_id: userId, subject_id: subjectId }),
  });
}
```

- [ ] **Step 2: Verify with a scratch script**

Create `artifacts/api-server/scratch-verify-credits.ts` that: picks any real existing `auth.users` id from `account_billing`, reads `getBilling`, calls `spendCredits(id, 1000000, "subject_open")` and confirms it throws `InsufficientCreditsError`, then calls `grantCredits(id, 5, "admin_adjustment", "test")` and confirms `credits` did not exceed the package's `startCredits` cap, then deletes the two `credit_transactions` rows it just created (by `note = 'test'` / matching timestamp) and restores the original `credits` value via direct `restService` PATCH so the account is left exactly as found.

Run: `npx tsx --env-file-if-exists=.env artifacts/api-server/scratch-verify-credits.ts`
Expected: no thrown errors other than the expected `InsufficientCreditsError`; final printed balance equals the original balance.

- [ ] **Step 3: Delete the scratch script and commit**

```bash
rm artifacts/api-server/scratch-verify-credits.ts
git add artifacts/api-server/src/lib/credits.ts
git commit -m "Credit-ledger module: spend/grant met pakket-cap en maandelijkse top-up"
```

---

### Task 3: Activation keys — package + upgrade rank check

**Files:**
- Modify: `artifacts/api-server/src/lib/activation-keys.ts`

**Interfaces:**
- Consumes: `getPackage` from `./credits` (Task 2).
- Produces: `ActivationKey.package: PackageKey` (added field); `createActivationKeys(count, packageKey)` (signature change — was `(count)`); `claimUpgradeKey(code, currentPackageKey): Promise<ActivationKey | null>` (new — claims the key AND checks rank; returns `null` if the key is invalid/used **or** its rank is not strictly greater than `currentPackageKey`'s rank, leaving the key untouched in the reject case).

- [ ] **Step 1: Update the type, `toActivationKey`, and `createActivationKeys`**

In `artifacts/api-server/src/lib/activation-keys.ts`:

```ts
import { getPackage, type PackageKey } from "./credits";

export type ActivationKey = {
  id: string;
  code: string;
  status: "open" | "used";
  source: "admin" | "purchase";
  package: PackageKey;
  createdAt: string;
  usedAt: string | null;
  usedByUserId: string | null;
  usedByEmail: string | null;
};

function toActivationKey(row: Row): ActivationKey {
  return {
    id: row.id as string,
    code: row.code as string,
    status: row.status as "open" | "used",
    source: row.source as "admin" | "purchase",
    package: row.package as PackageKey,
    createdAt: row.created_at as string,
    usedAt: (row.used_at as string | null) ?? null,
    usedByUserId: (row.used_by_user_id as string | null) ?? null,
    usedByEmail: (row.used_by_email as string | null) ?? null,
  };
}
```

Replace `createActivationKeys`:

```ts
export async function createActivationKeys(count: number, packageKey: PackageKey): Promise<ActivationKey[]> {
  const body = Array.from({ length: count }, () => ({ code: generateCode(), package: packageKey }));
  const rows = await restService<Row[]>("activation_keys", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  return rows.map(toActivationKey);
}
```

- [ ] **Step 2: Add `claimUpgradeKey`**

```ts
/**
 * Like claimActivationKey, but additionally rejects (without touching the
 * key) any key whose package rank is not strictly higher than the caller's
 * current package. Used for the logged-in "enter an upgrade key" flow.
 */
export async function claimUpgradeKey(code: string, currentPackage: PackageKey): Promise<ActivationKey | null> {
  const rows = await restService<Row[]>(
    `activation_keys?code=eq.${encodeURIComponent(code)}&status=eq.open&select=*`,
  );
  const candidate = rows[0];
  if (!candidate) return null;

  const [currentPkg, keyPkg] = await Promise.all([
    getPackage(currentPackage),
    getPackage(candidate.package as PackageKey),
  ]);
  if (keyPkg.rank <= currentPkg.rank) return null;

  return claimActivationKey(code);
}
```

- [ ] **Step 3: Update the one existing caller of `createActivationKeys`**

`artifacts/api-server/src/routes/admin.ts:118` (`createActivationKeys(input.data.count)`) will be moved to `admin-accounts.ts` in Task 7 with the new `packageKey` argument wired from the request body — no standalone fix needed here, just note the signature changed so Task 7 must pass it.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: fails only on the one call site in `admin.ts` (expected — fixed in Task 7). If anything else fails, fix it now.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/activation-keys.ts
git commit -m "Activatiecodes: pakket per key, upgrade-rangorde-check"
```

---

### Task 4: `openapi.yaml` — schemas and paths for this feature, then codegen

**Files:**
- Modify: `lib/api-spec/openapi.yaml`

**Interfaces:**
- Produces the zod schemas and TS types every subsequent backend/frontend task imports from `@workspace/api-zod` / `@workspace/api-client-react`.

- [ ] **Step 1: Add/extend schemas**

Add a reusable `PackageKey` enum and extend `CreateActivationKeysBody`:

```yaml
    PackageKey:
      type: string
      enum: [trial, basis, plus, beheerder]

    CreateActivationKeysBody:
      type: object
      required: [count, package]
      properties:
        count: { type: integer, minimum: 1, maximum: 100 }
        package: { $ref: '#/components/schemas/PackageKey' }

    ActivationKey:
      type: object
      required: [id, code, status, source, package, createdAt, usedAt, usedByUserId, usedByEmail]
      properties:
        id: { type: string, format: uuid }
        code: { type: string }
        status: { type: string, enum: [open, used] }
        source: { type: string, enum: [admin, purchase] }
        package: { $ref: '#/components/schemas/PackageKey' }
        createdAt: { type: string, format: date-time }
        usedAt: { type: string, format: date-time, nullable: true }
        usedByUserId: { type: string, format: uuid, nullable: true }
        usedByEmail: { type: string, nullable: true }

    BillingSummary:
      type: object
      required: [package, credits, canCreateSubjects]
      properties:
        package: { $ref: '#/components/schemas/PackageKey' }
        credits: { type: integer, nullable: true }
        canCreateSubjects: { type: boolean }

    ApplyUpgradeKeyBody:
      type: object
      required: [code]
      properties:
        code: { type: string }

    SignUpTrialBody:
      type: object
      required: [email, password, device]
      properties:
        email: { type: string, format: email }
        password: { type: string, minLength: 6 }
        device: { type: string }

    CreditActivity:
      type: object
      required: [id, delta, reason, createdAt]
      properties:
        id: { type: string, format: uuid }
        delta: { type: integer }
        reason: { type: string }
        createdAt: { type: string, format: date-time }

    AdminAccountSummary:
      # existing schema — add two required fields:
      properties:
        package: { $ref: '#/components/schemas/PackageKey' }
        recentActions:
          type: array
          items: { $ref: '#/components/schemas/CreditActivity' }

    SetAdminAccountPackageBody:
      type: object
      required: [package]
      properties:
        package: { $ref: '#/components/schemas/PackageKey' }

    SendPrivateNotificationParams:
      type: object
      required: [userId]
      properties:
        userId: { type: string, format: uuid }

    SendNotificationBody:
      type: object
      required: [message]
      properties:
        message: { type: string, minLength: 1, maxLength: 320 }

    Notification:
      type: object
      required: [id, message, createdAt, isGlobal]
      properties:
        id: { type: string, format: uuid }
        message: { type: string }
        createdAt: { type: string, format: date-time }
        isGlobal: { type: boolean }

    ListNotificationsResponse:
      type: object
      required: [notifications]
      properties:
        notifications:
          type: array
          items: { $ref: '#/components/schemas/Notification' }

    ChangelogEntry:
      type: object
      required: [id, version, releasedAt, summary, bullets]
      properties:
        id: { type: string, format: uuid }
        version: { type: string }
        releasedAt: { type: string, format: date }
        summary: { type: string }
        bullets: { type: array, items: { type: string } }

    ListChangelogResponse:
      type: object
      required: [entries]
      properties:
        entries:
          type: array
          items: { $ref: '#/components/schemas/ChangelogEntry' }

    CreateChangelogEntryBody:
      type: object
      required: [version, releasedAt, summary, bullets]
      properties:
        version: { type: string, minLength: 1, maxLength: 20 }
        releasedAt: { type: string, format: date }
        summary: { type: string, minLength: 1, maxLength: 200 }
        bullets: { type: array, items: { type: string }, minItems: 1 }

    UpdateChangelogEntryParams:
      type: object
      required: [entryId]
      properties:
        entryId: { type: string, format: uuid }
```

- [ ] **Step 2: Add paths**

```yaml
  /billing/me:
    get:
      operationId: getMyBilling
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/BillingSummary' }

  /activation/upgrade:
    post:
      operationId: applyUpgradeKey
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/ApplyUpgradeKeyBody' }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/BillingSummary' }
        '400':
          description: Invalid or non-upgrade key

  /auth/signup-trial:
    post:
      operationId: signUpTrial
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/SignUpTrialBody' }
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema: { $ref: '#/components/schemas/SignUpWithActivationKeyResponse' }

  /notifications:
    get:
      operationId: listNotifications
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ListNotificationsResponse' }

  /notifications/{notificationId}/dismiss:
    post:
      operationId: dismissNotification
      parameters:
        - { name: notificationId, in: path, required: true, schema: { type: string, format: uuid } }
      responses:
        '204':
          description: No Content

  /admin/accounts/{userId}/package:
    post:
      operationId: setAdminAccountPackage
      parameters:
        - { name: userId, in: path, required: true, schema: { type: string, format: uuid } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/SetAdminAccountPackageBody' }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/AdminAccountSummary' }

  /admin/accounts/{userId}/notify:
    post:
      operationId: sendPrivateNotification
      parameters:
        - { name: userId, in: path, required: true, schema: { type: string, format: uuid } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/SendNotificationBody' }
      responses:
        '204':
          description: No Content

  /changelog:
    get:
      operationId: getChangelog
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ListChangelogResponse' }

  /admin/changelog:
    get:
      operationId: listChangelogAdmin
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ListChangelogResponse' }
    post:
      operationId: createChangelogEntry
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CreateChangelogEntryBody' }
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ChangelogEntry' }

  /admin/changelog/{entryId}:
    patch:
      operationId: updateChangelogEntry
      parameters:
        - { name: entryId, in: path, required: true, schema: { type: string, format: uuid } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CreateChangelogEntryBody' }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ChangelogEntry' }
```

Also update the existing `SendAdminBroadcastBody`/`/admin/broadcasts` path's description to note it now writes a persisted global `Notification` row rather than only pushing an ephemeral realtime event (no schema shape change needed — same `{title, body}` body maps into one `message` string as `"{title}\n\n{body}"`, OR simplest: keep title+body as-is and store `message` as a JSON-stringified `{title, body}` — **use the second approach** so the frontend can keep rendering title/body distinctly; update `Notification.message` doc comment to say it may contain `title`/`body` JSON for broadcast-originated rows).

Actually, simplify: change `Notification` to carry both fields directly instead of packing JSON:

```yaml
    Notification:
      type: object
      required: [id, title, body, createdAt, isGlobal]
      properties:
        id: { type: string, format: uuid }
        title: { type: string }
        body: { type: string }
        createdAt: { type: string, format: date-time }
        isGlobal: { type: boolean }
```

(This replaces the single-`message` version above — use `title`/`body`, matching what `SendAdminBroadcastBody` and the new `SendNotificationBody` already send. Update `SendNotificationBody` to `{title, body}` matching `SendAdminBroadcastBody`'s existing shape for consistency.)

```yaml
    SendNotificationBody:
      type: object
      required: [title, body]
      properties:
        title: { type: string, minLength: 1, maxLength: 70 }
        body: { type: string, minLength: 1, maxLength: 320 }
```

And the `notifications` table's `message` column from Task 1 stores `title` and `body` as two separate columns instead — **fix Task 1's migration before applying it**: replace the single `message text not null` column with `title text not null` and `body text not null`. (If Task 1 was already applied before this is noticed, add a follow-up migration `2026090502_notification_title_body.sql` doing `alter table public.notifications rename column message to body; alter table public.notifications add column title text not null default '';` — but since these tasks execute in order, fix it inline in Task 1 instead.)

- [ ] **Step 3: Run codegen**

```bash
pnpm --filter @workspace/api-spec run codegen
```

Expected: completes without error; `lib/api-zod` and `lib/api-client-react` regenerate with the new types (`ActivationKey.package`, `BillingSummary`, `Notification`, `ChangelogEntry`, etc.).

- [ ] **Step 4: Typecheck the whole workspace**

```bash
pnpm -w run typecheck
```

Expected: fails in `activation-keys.ts`'s caller sites and nowhere the new schemas were just added generate types for (those failures are expected — Tasks 5-12 fix them). If codegen itself errors, fix the yaml and re-run before continuing.

- [ ] **Step 5: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react
git commit -m "API-spec: schemas en routes voor credits, pakketten, notificaties, changelog"
```

---

### Task 5: Fix Task 1's migration (title/body split) before it's live elsewhere

**Files:**
- Modify: `supabase/migrations/2026090501_credits_and_packages.sql` (only if Task 1 has not yet been applied — see below).

**Interfaces:**
- Produces: `public.notifications(title, body)` instead of `public.notifications(message)`.

- [ ] **Step 1: Check whether Task 1 was already applied**

If Task 1's migration was applied to the live database before this task runs, do NOT edit the already-applied file (`apply_migration` is idempotent-by-name but editing history is confusing) — instead create `supabase/migrations/2026090502_notification_title_body.sql`:

```sql
alter table public.notifications rename column message to body;
alter table public.notifications add column title text not null default '';
alter table public.notifications alter column title drop default;
```

Otherwise (Task 1 not yet applied — likely, since this plan executes tasks in order and Task 4 comes right after Task 1), simply edit the `create table public.notifications (...)` block in `2026090501_credits_and_packages.sql` to:

```sql
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid references auth.users(id) on delete cascade,
  title       text not null,
  body        text not null,
  created_at  timestamptz not null default now()
);
```

- [ ] **Step 2: Apply (if using the follow-up file) and verify**

If a follow-up migration file was created, apply it via the Supabase MCP `apply_migration` tool, then verify with a throwaway `restService("notifications?select=*&limit=1")` call in a scratch script — expect no error, columns `title`/`body` present.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/
git commit -m "Notificaties: title/body kolommen i.p.v. één message-veld"
```

---

### Task 6: Signup flow — package from key, trial signup, auto verification ticket

**Files:**
- Modify: `artifacts/api-server/src/routes/events.ts`
- Modify: `artifacts/api-server/src/lib/activation-keys.ts` (already has `package` from Task 3 — no further change)

**Interfaces:**
- Consumes: `grantCredits`, `getPackage` from `../lib/credits`; `createTicket`, `insertMessage` from `../lib/support-tickets`.
- Produces: `POST /auth/signup` now also creates `account_billing` + a `signup_grant` ledger row matching the key's package; new `POST /auth/signup-trial`.

- [ ] **Step 1: Update `POST /auth/signup` to initialize billing**

In `artifacts/api-server/src/routes/events.ts`, after the existing `await attachActivationKeyToUser(claimed.id, signUpResult.userId, email);` line, add:

```ts
    const pkg = await getPackage(claimed.package as PackageKey);
    await restService("account_billing", {
      method: "POST",
      body: JSON.stringify({
        user_id: signUpResult.userId,
        package: pkg.key,
        credits: pkg.startCredits ?? 0,
      }),
    });
    await restService("credit_transactions", {
      method: "POST",
      body: JSON.stringify({
        account_id: signUpResult.userId,
        delta: pkg.startCredits ?? 0,
        reason: "signup_grant",
      }),
    });
```

Add the needed imports at the top: `import { getPackage, type PackageKey } from "../lib/credits";` and `restService` is already imported.

- [ ] **Step 2: Add `POST /auth/signup-trial`**

```ts
router.post("/auth/signup-trial", async (req, res): Promise<void> => {
  const input = SignUpTrialBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Ongeldige aanmeldgegevens." });
    return;
  }

  const attemptAllowed = await claimAttempt(`signup:ip:${req.ip ?? "unknown"}`, 10);
  if (!attemptAllowed) {
    res.status(429).json({ error: "Te veel pogingen. Probeer het later opnieuw." });
    return;
  }

  const email = input.data.email.trim().toLowerCase();

  try {
    const signUpResult = await signUpWithPassword(email, input.data.password, signupRedirect());
    if (!signUpResult.ok) {
      res.status(400).json({ error: readableSignupError(signUpResult.errorCode, signUpResult.message) });
      return;
    }

    const trialPkg = await getPackage("trial");
    await restService("account_billing", {
      method: "POST",
      body: JSON.stringify({
        user_id: signUpResult.userId,
        package: "trial",
        credits: trialPkg.startCredits ?? 0,
      }),
    });
    await restService("credit_transactions", {
      method: "POST",
      body: JSON.stringify({
        account_id: signUpResult.userId,
        delta: trialPkg.startCredits ?? 0,
        reason: "signup_grant",
      }),
    });

    const ticket = await createTicket(signUpResult.userId, "Verificatie studentenstatus");
    await insertMessage(
      ticket.id,
      "admin",
      "Welkom bij geslaagd.app! Om toegang te krijgen tot een ander pakket (Basis/Plus), moet een beheerder even bevestigen dat je een studerende gebruiker bent. Beantwoord hieronder kort:\n1. Voor- en achternaam\n2. Onderwijsinstelling\n3. Studierichting\n4. Waarvoor wil je geslaagd.app gebruiken?\n\nEen beheerder reageert zo snel mogelijk.",
      null,
    );
    await restService(`support_tickets?id=eq.${ticket.id}`, {
      method: "PATCH",
      body: JSON.stringify({ category: "pakket_verificatie" }),
    });

    await enqueueAuthEvent({
      dedupeKey: `signup:${signUpResult.userId}`,
      event: "signup",
      userId: signUpResult.userId,
      device: input.data.device,
      ipAddress: req.ip ?? null,
    }).catch((error) => req.log.warn({ error }, "Could not enqueue signup auth event"));

    res.status(201).json(SignUpWithActivationKeyResponse.parse({ userId: signUpResult.userId }));
  } catch (error) {
    req.log.warn({ error }, "Trial signup failed");
    res.status(500).json({ error: "Aanmaken van het account is mislukt. Probeer het opnieuw." });
  }
});
```

Add `SignUpTrialBody` to the import from `@workspace/api-zod`, and `createTicket, insertMessage` to a new import `from "../lib/support-tickets"`.

- [ ] **Step 2b: Add the `category` column `support_tickets` needs**

This is a small addition to Task 1's migration (or a follow-up if already applied) — add:

```sql
alter table public.support_tickets add column category text;
```

Fold this into whichever of Task 1 / Task 5's follow-up migration hasn't been applied yet; if both are already applied, create `supabase/migrations/2026090503_support_ticket_category.sql` with just that line and apply it via the MCP tool.

- [ ] **Step 3: Verify with a scratch script**

Create `artifacts/api-server/scratch-verify-signup.ts` that calls the running dev server's `/auth/signup-trial` endpoint (or directly exercises `signUpWithPassword` + the same insert logic) with a disposable test email (e.g. `test+trial-<timestamp>@example.com`), confirms `account_billing` shows `package: 'trial', credits: 10`, confirms a `support_tickets` row exists with `category: 'pakket_verificatie'` and one message, then deletes the test user via `authAdmin`/Supabase Auth Admin delete, which cascades to `account_billing` and `support_tickets` via `on delete cascade`/foreign keys (verify `support_tickets.user_id` also cascades — check its migration; if it does not cascade, delete the ticket row manually first).

Run: `npx tsx --env-file-if-exists=.env artifacts/api-server/scratch-verify-signup.ts`
Expected: trial billing row correct, ticket created with the template message, cleanup leaves no orphan rows.

- [ ] **Step 4: Delete the scratch script, typecheck, commit**

```bash
rm artifacts/api-server/scratch-verify-signup.ts
pnpm --filter @workspace/api-server run typecheck
git add artifacts/api-server/src/routes/events.ts supabase/migrations/
git commit -m "Signup: pakket-toekenning bij key, trial-pad met automatisch verificatieticket"
```

---

### Task 7: Upgrade-key endpoint and billing-summary endpoint

**Files:**
- Create: `artifacts/api-server/src/routes/billing.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`

**Interfaces:**
- Consumes: `getBilling` (Task 2), `claimUpgradeKey` (Task 3).
- Produces: `GET /billing/me`, `POST /activation/upgrade`, both mounted in `index.ts`.

- [ ] **Step 1: Write `routes/billing.ts`**

```ts
import { Router, type IRouter } from "express";
import { ApplyUpgradeKeyBody, BillingSummary } from "@workspace/api-zod";
import { getAuthenticatedUser, restService } from "../lib/supabase";
import { getBilling } from "../lib/credits";
import { claimUpgradeKey } from "../lib/activation-keys";

const router: IRouter = Router();

router.get("/billing/me", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { package: pkg, credits } = await getBilling(user.id);
    res.json(BillingSummary.parse({
      package: pkg.key,
      credits: pkg.startCredits === null ? null : credits,
      canCreateSubjects: pkg.canCreateSubjects,
    }));
  } catch (error) {
    req.log.warn({ error }, "Could not load billing summary");
    res.status(500).json({ error: "Pakketinformatie kon niet worden geladen." });
  }
});

router.post("/activation/upgrade", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const input = ApplyUpgradeKeyBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Ongeldige code." }); return; }

  try {
    const current = await restService<Record<string, unknown>[]>(
      `account_billing?user_id=eq.${user.id}&select=package`,
    );
    const currentPackage = (current[0]?.package as string) ?? "trial";
    const claimed = await claimUpgradeKey(input.data.code.trim().toUpperCase(), currentPackage as never);
    if (!claimed) {
      res.status(400).json({ error: "Deze code is ongeldig, al gebruikt, of geen upgrade t.o.v. je huidige pakket." });
      return;
    }

    const pkgRows = await restService<Record<string, unknown>[]>(`packages?key=eq.${claimed.package}&select=*`);
    const startCredits = (pkgRows[0]?.start_credits as number | null) ?? 0;

    await restService(`account_billing?user_id=eq.${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ package: claimed.package, credits: startCredits }),
    });
    await restService("credit_transactions", {
      method: "POST",
      body: JSON.stringify({
        account_id: user.id,
        delta: startCredits,
        reason: "package_upgrade",
        note: `Upgrade naar ${claimed.package} via key`,
      }),
    });

    const { package: pkg, credits } = await getBilling(user.id);
    res.json(BillingSummary.parse({
      package: pkg.key,
      credits: pkg.startCredits === null ? null : credits,
      canCreateSubjects: pkg.canCreateSubjects,
    }));
  } catch (error) {
    req.log.warn({ error }, "Could not apply upgrade key");
    res.status(500).json({ error: "Upgrade is mislukt." });
  }
});

export default router;
```

- [ ] **Step 2: Register the router**

In `artifacts/api-server/src/routes/index.ts`, add the import and `router.use(billingRouter)` alongside the other route mounts (follow the exact pattern already used there for `sourcesRouter`/`subjectsRouter` etc.).

- [ ] **Step 3: Verify with a scratch script**

Create a scratch script that: reads a disposable test user's current package (from grandfathering, likely `basis`), creates one `plus`-package activation key via `createActivationKeys(1, "plus")`, calls the upgrade logic (either via HTTP against the running dev server, or by directly invoking `claimUpgradeKey`) and confirms it succeeds and sets credits to 60; then creates a second `basis`-package key and confirms attempting to "upgrade" to it is rejected (same-or-lower rank). Clean up the two key rows and restore the test user's original package/credits afterward.

Run: `npx tsx --env-file-if-exists=.env artifacts/api-server/scratch-verify-upgrade.ts`
Expected: plus-upgrade succeeds with credits=60; basis "upgrade" rejected with no state change.

- [ ] **Step 4: Delete scratch script, typecheck, commit**

```bash
rm artifacts/api-server/scratch-verify-upgrade.ts
pnpm --filter @workspace/api-server run typecheck
git add artifacts/api-server/src/routes/billing.ts artifacts/api-server/src/routes/index.ts
git commit -m "Billing: eigen pakket opvragen en upgraden via key"
```

---

### Task 8: Charge credits — subject creation and subject selection

**Files:**
- Modify: `artifacts/api-server/src/routes/sources.ts`
- Modify: `artifacts/api-server/src/routes/subjects.ts`

**Interfaces:**
- Consumes: `getBilling`, `spendCredits`, `subjectsCreatedThisMonth`, `hasPurchasedSubject`, `recordSubjectPurchase`, `InsufficientCreditsError` from `../lib/credits`.

- [ ] **Step 1: `sources.ts` — gate and charge `POST /sources/request-subject`**

In `artifacts/api-server/src/routes/sources.ts`, inside `router.post("/sources/request-subject", ...)`, right after the existing duplicate-name check and before the `crawl_subjects` insert, add:

```ts
    const { package: pkg } = await getBilling(identity.user.id);
    if (!pkg.canCreateSubjects) {
      res.status(403).json({ error: "Je pakket staat geen nieuwe vakken toe. Vraag via support een upgrade aan." });
      return;
    }
    if (pkg.key !== "beheerder") {
      const createdThisMonth = await subjectsCreatedThisMonth(identity.user.id);
      if (createdThisMonth >= 3) {
        res.status(429).json({ error: "Je hebt deze maand al 3 nieuwe vakken aangemaakt." });
        return;
      }
    }
    try {
      await spendCredits(identity.user.id, 10, "subject_create");
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        res.status(402).json({ error: "Onvoldoende credits om een nieuw vak aan te maken." });
        return;
      }
      throw error;
    }
```

Then, right after the `crawl_subjects` insert succeeds (after `if (!subject) throw new Error(...)`), add:

```ts
    await recordSubjectPurchase(identity.user.id, subject.id as string);
```

Add the import: `import { getBilling, spendCredits, subjectsCreatedThisMonth, recordSubjectPurchase, InsufficientCreditsError } from "../lib/credits";`

- [ ] **Step 2: `subjects.ts` — charge on first `select`**

In `artifacts/api-server/src/routes/subjects.ts`, inside `router.post("/subjects/:subjectId/select", ...)`, after the existing `loadPublishedSubject` check and before the `student_selected_subjects` insert, add:

```ts
    const alreadyPurchased = await hasPurchasedSubject(identity.user.id, params.data.subjectId);
    if (!alreadyPurchased) {
      try {
        await spendCredits(identity.user.id, 5, "subject_open", params.data.subjectId);
      } catch (error) {
        if (error instanceof InsufficientCreditsError) {
          res.status(402).json({ error: "Onvoldoende credits om dit vak te gebruiken." });
          return;
        }
        throw error;
      }
      await recordSubjectPurchase(identity.user.id, params.data.subjectId);
    }
```

Add the import: `import { hasPurchasedSubject, spendCredits, recordSubjectPurchase, InsufficientCreditsError } from "../lib/credits";`

- [ ] **Step 3: Verify with a scratch script**

Create a scratch script using a disposable test user (create one via Supabase Auth Admin + `account_billing` row with `package: 'basis', credits: 5`): call the same logic `hasPurchasedSubject` → `spendCredits(5, 'subject_open', <real published subject id>)` → `recordSubjectPurchase`, confirm credits drop to 0 and a second identical call does NOT charge again (since `subject_purchases` now has the row). Then confirm a third distinct subject with credits at 0 throws `InsufficientCreditsError`. Delete the test user afterward (cascades clean up `account_billing`/`credit_transactions`/`subject_purchases`).

Run: `npx tsx --env-file-if-exists=.env artifacts/api-server/scratch-verify-charging.ts`
Expected: exactly one charge for the first open, no charge on reopen, `InsufficientCreditsError` on the next distinct subject.

- [ ] **Step 4: Delete scratch script, typecheck, commit**

```bash
rm artifacts/api-server/scratch-verify-charging.ts
pnpm --filter @workspace/api-server run typecheck
git add artifacts/api-server/src/routes/sources.ts artifacts/api-server/src/routes/subjects.ts
git commit -m "Credits afschrijven bij vak aanmaken en eerste keer gebruiken"
```

---

### Task 9: Split admin.ts into admin-accounts.ts and admin-sessions.ts, with package + recent-activity + admin package change + private notifications

**Files:**
- Create: `artifacts/api-server/src/routes/admin-accounts.ts`
- Create: `artifacts/api-server/src/routes/admin-sessions.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`
- Delete: `artifacts/api-server/src/routes/admin.ts`

**Interfaces:**
- Consumes: `getBilling`, `grantCredits` reason `admin_adjustment` pattern from Task 2/7 (package change re-uses the same "set to new package's start credits" logic as upgrade, just without the rank check).
- Produces: `GET/POST /admin/activation-keys` (now package-aware), all existing `/admin/accounts*` routes plus `POST /admin/accounts/:userId/package`, all existing `/admin/sessions*` and `/admin/broadcasts` routes plus `POST /admin/accounts/:userId/notify`.

- [ ] **Step 1: Create `admin-sessions.ts`**

Copy the full content of the current `admin.ts` (helpers `toSession`, `admin`, `accountStatus` is accounts-only so leave it in accounts, `authAdmin`), keeping only: the activation-keys routes are NOT here (they move to accounts, see below — actually keep activation keys in `admin-sessions.ts` OR `admin-accounts.ts`; put them in `admin-accounts.ts` since keys are about account/package provisioning, not sessions), the session list/revoke routes, and `/admin/broadcasts`. Update `/admin/broadcasts` to also persist a notification row:

```ts
router.post("/admin/broadcasts", async (req, res): Promise<void> => {
  const input = SendAdminBroadcastBody.safeParse(req.body);
  const identity = await admin(req);
  if (!input.success || !identity) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    await restService("notifications", {
      method: "POST",
      body: JSON.stringify({ account_id: null, title: input.data.title, body: input.data.body }),
    });
    await broadcast(identity.token, "app:notifications", "refresh", {});
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not send broadcast");
    res.status(502).json({ error: "Broadcast failed" });
  }
});
```

Add the new private-notification route:

```ts
router.post("/admin/accounts/:userId/notify", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const params = SendPrivateNotificationParams.safeParse(req.params);
  const input = SendNotificationBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Invalid request" }); return; }
  try {
    await restService("notifications", {
      method: "POST",
      body: JSON.stringify({ account_id: params.data.userId, title: input.data.title, body: input.data.body }),
    });
    await broadcast(identity.token, `user:${params.data.userId}:notifications`, "refresh", {});
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not send private notification");
    res.status(502).json({ error: "Melding versturen is mislukt." });
  }
});
```

(This route lives physically in `admin-sessions.ts` per the file-structure list, even though its path is under `/admin/accounts` — it's about the notification/session-adjacent feature the "Sessies" tab exposes, matching the spec's "knop zit op de sessie-rij" decision. If that split feels odd once written, keeping it in `admin-accounts.ts` instead is equally correct — just pick one and mount it once.)

Import additions needed: `SendPrivateNotificationParams, SendNotificationBody` from `@workspace/api-zod`.

- [ ] **Step 2: Create `admin-accounts.ts`**

Copy the account list/detail/block/unblock/delete routes and the `authAdmin`, `SupabaseAuthUser`, `accountStatus`, `toAccountSummary` helpers from the old `admin.ts`, plus the activation-keys routes (`GET/POST /admin/activation-keys`, now requiring `package` in the POST body — see Task 3/4):

```ts
router.post("/admin/activation-keys", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const input = CreateActivationKeysBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Ongeldig aantal of pakket." }); return; }
  try {
    const keys = await createActivationKeys(input.data.count, input.data.package);
    res.status(201).json({ keys });
  } catch (error) {
    req.log.warn({ error }, "Could not create activation keys");
    res.status(500).json({ error: "Activatiecodes konden niet worden aangemaakt." });
  }
});
```

Update `toAccountSummary` to also load package + recent ledger activity. Since `toAccountSummary` is synchronous and per-row today, change the account-list route to fetch billing/ledger in bulk (same pattern as the existing `sessionByUser` bulk-fetch) rather than N+1 queries:

```ts
function toAccountSummary(
  user: SupabaseAuthUser,
  sessionCount = 0,
  lastSeenAt: string | null = null,
  billing?: { package: string; recentActions: { id: string; delta: number; reason: string; createdAt: string }[] },
) {
  return {
    userId: user.id,
    email: user.email ?? "",
    status: accountStatus(user),
    createdAt: user.created_at ?? "",
    lastSignInAt: user.last_sign_in_at ?? null,
    bannedUntil: user.banned_until ?? null,
    sessionCount,
    lastSeenAt,
    package: billing?.package ?? "trial",
    recentActions: billing?.recentActions ?? [],
  };
}
```

In `GET /admin/accounts`, after computing `sessionByUser`, add a parallel bulk fetch:

```ts
    let billingRows: Record<string, unknown>[] = [];
    let ledgerRows: Record<string, unknown>[] = [];
    if (userIds.length > 0) {
      [billingRows, ledgerRows] = await Promise.all([
        restService<Record<string, unknown>[]>(
          `account_billing?user_id=in.(${userIds.map((id) => encodeURIComponent(id)).join(",")})&select=user_id,package`,
        ),
        restService<Record<string, unknown>[]>(
          `credit_transactions?account_id=in.(${userIds.map((id) => encodeURIComponent(id)).join(",")})&select=id,account_id,delta,reason,created_at&order=created_at.desc&limit=200`,
        ),
      ]);
    }
    const packageByUser = new Map(billingRows.map((r) => [r.user_id as string, r.package as string]));
    const actionsByUser = new Map<string, { id: string; delta: number; reason: string; createdAt: string }[]>();
    for (const row of ledgerRows) {
      const uid = row.account_id as string;
      const list = actionsByUser.get(uid) ?? [];
      if (list.length < 5) list.push({ id: row.id as string, delta: row.delta as number, reason: row.reason as string, createdAt: row.created_at as string });
      actionsByUser.set(uid, list);
    }

    const accounts = users.map((u) => {
      const s = sessionByUser.get(u.id);
      return toAccountSummary(u, s?.count ?? 0, s?.lastSeenAt ?? null, {
        package: packageByUser.get(u.id) ?? "trial",
        recentActions: actionsByUser.get(u.id) ?? [],
      });
    });
```

(The `credit_transactions?...&limit=200` global cap keeps this one query cheap; per-account slicing to 5 happens in memory. Fine at this app's scale — revisit only if the admin account list becomes slow.)

Add the package-change route:

```ts
router.post("/admin/accounts/:userId/package", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const params = GetAdminAccountParams.safeParse(req.params);
  const input = SetAdminAccountPackageBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Invalid request" }); return; }
  try {
    const pkgRows = await restService<Record<string, unknown>[]>(`packages?key=eq.${input.data.package}&select=*`);
    const startCredits = (pkgRows[0]?.start_credits as number | null) ?? 0;
    await restService(`account_billing?user_id=eq.${params.data.userId}`, {
      method: "PATCH",
      body: JSON.stringify({ package: input.data.package, credits: startCredits }),
    });
    await restService("credit_transactions", {
      method: "POST",
      body: JSON.stringify({
        account_id: params.data.userId,
        delta: startCredits,
        reason: "admin_adjustment",
        note: `Pakket door beheerder gezet op ${input.data.package}`,
      }),
    });
    const authUser = await getServiceUserById(params.data.userId);
    res.json(toAccountSummary(authUser as SupabaseAuthUser, 0, null, { package: input.data.package, recentActions: [] }));
  } catch (error) {
    req.log.warn({ error }, "Could not set account package");
    res.status(500).json({ error: "Pakket aanpassen is mislukt." });
  }
});
```

- [ ] **Step 3: Register both routers, delete `admin.ts`**

In `artifacts/api-server/src/routes/index.ts`, replace the single `adminRouter` import/mount with `adminAccountsRouter` and `adminSessionsRouter`. Delete `artifacts/api-server/src/routes/admin.ts`.

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @workspace/api-server run typecheck
```
Expected: passes (all `admin.ts` symbols now live in the two new files; no dangling imports).

- [ ] **Step 5: Verify with a scratch script**

Create a scratch script hitting the running dev server (or calling the underlying logic directly) to: list `/admin/accounts` and confirm `package`/`recentActions` are present on a known grandfathered account; call the package-change route on a disposable test account and confirm `account_billing` reflects the new package/credits and a `credit_transactions` row with `reason: 'admin_adjustment'` was written.

Run: `npx tsx --env-file-if-exists=.env artifacts/api-server/scratch-verify-admin-accounts.ts`
Expected: fields present and correct; cleanup restores the test account's prior state.

- [ ] **Step 6: Delete scratch script, commit**

```bash
rm artifacts/api-server/scratch-verify-admin-accounts.ts
git add artifacts/api-server/src/routes/admin-accounts.ts artifacts/api-server/src/routes/admin-sessions.ts artifacts/api-server/src/routes/index.ts
git rm artifacts/api-server/src/routes/admin.ts
git commit -m "Beheer: accounts- en sessies-routes gesplitst, pakket + laatste acties + privé-melding"
```

---

### Task 10: Self-service notifications endpoint (`routes/notifications.ts`)

**Files:**
- Create: `artifacts/api-server/src/routes/notifications.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`

**Interfaces:**
- Produces: `GET /notifications` (global + this user's, minus dismissed, newest first), `POST /notifications/:id/dismiss`.

- [ ] **Step 1: Write the route**

```ts
import { Router, type IRouter } from "express";
import { DismissNotificationParams, ListNotificationsResponse } from "@workspace/api-zod";
import { getAuthenticatedUser, restService } from "../lib/supabase";

const router: IRouter = Router();

type Row = Record<string, unknown>;

router.get("/notifications", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [rows, dismissals] = await Promise.all([
      restService<Row[]>(
        `notifications?or=(account_id.is.null,account_id.eq.${user.id})&select=*&order=created_at.desc&limit=50`,
      ),
      restService<Row[]>(`notification_dismissals?account_id=eq.${user.id}&select=notification_id`),
    ]);
    const dismissedIds = new Set(dismissals.map((d) => d.notification_id as string));
    const visible = rows.filter((row) => !dismissedIds.has(row.id as string));
    res.json(ListNotificationsResponse.parse({
      notifications: visible.map((row) => ({
        id: row.id as string,
        title: row.title as string,
        body: row.body as string,
        createdAt: row.created_at as string,
        isGlobal: row.account_id === null,
      })),
    }));
  } catch (error) {
    req.log.warn({ error }, "Could not list notifications");
    res.status(500).json({ error: "Meldingen konden niet worden geladen." });
  }
});

router.post("/notifications/:notificationId/dismiss", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = DismissNotificationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldige melding." }); return; }
  try {
    await restService("notification_dismissals?on_conflict=notification_id,account_id", {
      method: "POST",
      headers: { prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify({ notification_id: params.data.notificationId, account_id: user.id }),
    });
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not dismiss notification");
    res.status(500).json({ error: "Wegklikken is mislukt." });
  }
});

export default router;
```

Add `DismissNotificationParams` to `openapi.yaml` (parameters object for `notificationId` path param on the dismiss route — this was likely auto-generated already from the path definition in Task 4; if orval didn't emit a params schema because the path had no extra body, just inline `z.object({ notificationId: z.string().uuid() })` from `zod` directly instead of importing a generated params type — check what orval actually produced for parameter-only paths before assuming the import exists).

- [ ] **Step 2: Register in `index.ts`, typecheck**

```bash
pnpm --filter @workspace/api-server run typecheck
```

- [ ] **Step 3: Verify with a scratch script**

Create a scratch script that: inserts one global notification and one notification targeted at a disposable test user directly via `restService`, confirms `GET /notifications`-equivalent logic returns both for that user, dismisses the global one, confirms a second fetch returns only the personal one, then deletes both notification rows and the dismissal row.

Run: `npx tsx --env-file-if-exists=.env artifacts/api-server/scratch-verify-notifications.ts`
Expected: matches the described before/after dismiss behavior.

- [ ] **Step 4: Delete scratch script, commit**

```bash
rm artifacts/api-server/scratch-verify-notifications.ts
git add artifacts/api-server/src/routes/notifications.ts artifacts/api-server/src/routes/index.ts
git commit -m "Notificaties: eigen lijst ophalen en per-melding wegklikken"
```

---

### Task 11: Changelog routes

**Files:**
- Create: `artifacts/api-server/src/routes/changelog.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`

**Interfaces:**
- Produces: `GET /changelog` (any authenticated user), `GET/POST /admin/changelog`, `PATCH /admin/changelog/:entryId`.

- [ ] **Step 1: Write the route**

```ts
import { Router, type IRouter, type Request } from "express";
import {
  CreateChangelogEntryBody,
  ChangelogEntry as ChangelogEntrySchema,
  ListChangelogResponse,
  UpdateChangelogEntryParams,
} from "@workspace/api-zod";
import { getAuthenticatedUser, restService } from "../lib/supabase";

const router: IRouter = Router();

type Row = Record<string, unknown>;

function toEntry(row: Row) {
  return {
    id: row.id as string,
    version: row.version as string,
    releasedAt: row.released_at as string,
    summary: row.summary as string,
    bullets: (row.bullets as string[] | null) ?? [],
  };
}

async function admin(req: Request) {
  const user = await getAuthenticatedUser(req.header("authorization"));
  return user?.isAdmin ? user : null;
}

router.get("/changelog", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const rows = await restService<Row[]>("changelog_entries?select=*&order=released_at.desc");
    res.json(ListChangelogResponse.parse({ entries: rows.map(toEntry) }));
  } catch (error) {
    req.log.warn({ error }, "Could not list changelog");
    res.status(500).json({ error: "Changelog kon niet worden geladen." });
  }
});

router.get("/admin/changelog", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const rows = await restService<Row[]>("changelog_entries?select=*&order=released_at.desc");
    res.json(ListChangelogResponse.parse({ entries: rows.map(toEntry) }));
  } catch (error) {
    req.log.warn({ error }, "Could not list changelog");
    res.status(500).json({ error: "Changelog kon niet worden geladen." });
  }
});

router.post("/admin/changelog", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const input = CreateChangelogEntryBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Ongeldige changelog-invoer." }); return; }
  try {
    const rows = await restService<Row[]>("changelog_entries", {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        version: input.data.version,
        released_at: input.data.releasedAt,
        summary: input.data.summary,
        bullets: input.data.bullets,
        created_by: identity.id,
      }),
    });
    res.status(201).json(ChangelogEntrySchema.parse(toEntry(rows[0]!)));
  } catch (error) {
    req.log.warn({ error }, "Could not create changelog entry");
    res.status(500).json({ error: "Changelog-item kon niet worden aangemaakt." });
  }
});

router.patch("/admin/changelog/:entryId", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const params = UpdateChangelogEntryParams.safeParse(req.params);
  const input = CreateChangelogEntryBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Ongeldige changelog-invoer." }); return; }
  try {
    const rows = await restService<Row[]>(`changelog_entries?id=eq.${params.data.entryId}`, {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        version: input.data.version,
        released_at: input.data.releasedAt,
        summary: input.data.summary,
        bullets: input.data.bullets,
      }),
    });
    if (!rows[0]) { res.status(404).json({ error: "Changelog-item niet gevonden." }); return; }
    res.json(ChangelogEntrySchema.parse(toEntry(rows[0])));
  } catch (error) {
    req.log.warn({ error }, "Could not update changelog entry");
    res.status(500).json({ error: "Changelog-item kon niet worden aangepast." });
  }
});

export default router;
```

- [ ] **Step 2: Register in `index.ts`, typecheck, verify**

```bash
pnpm --filter @workspace/api-server run typecheck
```

Verify with a scratch script: create one changelog entry via the POST logic, patch it, confirm the GET list reflects the update, delete the row.

Run: `npx tsx --env-file-if-exists=.env artifacts/api-server/scratch-verify-changelog.ts`

- [ ] **Step 3: Delete scratch script, commit**

```bash
rm artifacts/api-server/scratch-verify-changelog.ts
git add artifacts/api-server/src/routes/changelog.ts artifacts/api-server/src/routes/index.ts
git commit -m "Changelog: openbare lijst en beheer-CRUD"
```

---

### Task 12: Ticket display names + trial-verification admin action

**Files:**
- Modify: `artifacts/api-server/src/lib/support-tickets.ts`
- Modify: `artifacts/api-server/src/routes/support.ts`
- Modify: `artifacts/geslaagd-app/src/pages/admin-support-page.tsx`

**Interfaces:**
- Produces: `SupportTicket.userEmail` already exists via `toSummary`'s `emailForUser` — the gap is `SupportMessage` doesn't carry a display name; add `SupportMessage.senderEmail: string | null` (populated via `emailForUser(senderUserId)` for `sender: 'admin' | 'user'` rows).

- [ ] **Step 1: `support-tickets.ts` — carry sender email**

Add to `listMessages`:

```ts
export async function listMessages(ticketId: string): Promise<SupportMessage[]> {
  const rows = await restService<Row[]>(
    `support_messages?ticket_id=eq.${ticketId}&select=*&order=created_at.asc`,
  );
  const messages = rows.map(toMessage);
  const withEmails = await Promise.all(messages.map(async (message) => ({
    ...message,
    senderEmail: message.senderUserId ? await emailForUser(message.senderUserId) : null,
  })));
  return withEmails;
}
```

Update the `SupportMessage` type to add `senderEmail: string | null`.

- [ ] **Step 2: Frontend — replace hardcoded "Student"/"Beheerder" labels**

In `artifacts/geslaagd-app/src/pages/admin-support-page.tsx`, find the `{ user: 'Student', ..., admin: 'Beheerder' }` label map (around line 37-39) and the place it's used to render a message's sender — replace with `message.senderEmail ?? (message.sender === 'admin' ? 'Beheerder' : 'Student')` (falls back to the old generic label only when no email is available, e.g. very old rows). Also render the ticket list itself using `ticket.userEmail` (should already be there per `toSummary`; if the current list view shows something else, switch it to `ticket.userEmail`).

- [ ] **Step 3: Add the trial-verification "grant package" admin action**

In `artifacts/api-server/src/routes/support.ts`, add:

```ts
router.post("/admin/support/tickets/:ticketId/grant-package", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const params = GrantPackageParams.safeParse(req.params);
  const input = GrantPackageBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    const ticket = await getTicket(params.data.ticketId);
    if (!ticket) { res.status(404).json({ error: "Ticket niet gevonden." }); return; }

    const pkgRows = await restService<Record<string, unknown>[]>(`packages?key=eq.${input.data.package}&select=*`);
    const startCredits = (pkgRows[0]?.start_credits as number | null) ?? 0;
    await restService(`account_billing?user_id=eq.${ticket.userId}`, {
      method: "PATCH",
      body: JSON.stringify({ package: input.data.package, credits: startCredits }),
    });
    await restService("credit_transactions", {
      method: "POST",
      body: JSON.stringify({
        account_id: ticket.userId,
        delta: startCredits,
        reason: "admin_adjustment",
        note: `Pakket toegekend via verificatieticket`,
      }),
    });
    await setTicketStatus(ticket.id, "closed");
    res.json(await toDetail((await getTicket(ticket.id))!));
  } catch (error) {
    req.log.warn({ error }, "Could not grant package from ticket");
    res.status(500).json({ error: "Pakket toekennen is mislukt." });
  }
});
```

Add `GrantPackageParams` (`{ ticketId: string }`, same shape as `CloseSupportTicketParams`) and `GrantPackageBody` (`{ package: PackageKey }`, restricted to `basis`/`plus` in the zod schema — reuse `PackageKey` enum from Task 4 but the endpoint should reject `trial`/`beheerder` at validation time since those aren't sensible grants here: add a dedicated enum `type: string, enum: [basis, plus]` in `openapi.yaml` for `GrantPackageBody.package`) to `openapi.yaml`, run codegen.

- [ ] **Step 4: Frontend — "Pakket toekennen" button on `pakket_verificatie` tickets**

In `admin-support-page.tsx`, where a ticket's detail is rendered, check `ticket.category === 'pakket_verificatie'` (this requires `category` to be added to `SupportTicket`'s type/`toTicket`/`toSummary` in `support-tickets.ts` and the openapi `SupportTicket`/`SupportTicketDetail` schema — do this alongside Step 1) and show a small `Select` (Basis/Plus) + button that calls a new `grantSupportTicketPackage(ticketId, { package })` client function (generated from the new endpoint) and refreshes the ticket.

- [ ] **Step 5: Typecheck, manual verification**

```bash
pnpm -w run typecheck
```

Start the dev server (`mcp__Claude_Browser__preview_start`), log in as an admin, open a `pakket_verificatie` ticket created via the trial-signup flow (Task 6), click "Pakket toekennen" → Basis, confirm the ticket closes and the target account's `account_billing.package` becomes `basis` with 30 credits (check via a quick `restService` scratch read, or the Accounts admin page from Task 14).

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/lib/support-tickets.ts artifacts/api-server/src/routes/support.ts artifacts/geslaagd-app/src/pages/admin-support-page.tsx lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react
git commit -m "Support: echte namen per ticket/bericht, pakket toekennen vanuit verificatieticket"
```

---

### Task 13: Admin frontend — split Accounts/Sessions pages, package UI, key creation package selector

**Files:**
- Create: `artifacts/geslaagd-app/src/pages/admin-sessions-page.tsx` (based on the "Monitoring" tab content of the current `admin-page.tsx`)
- Create: `artifacts/geslaagd-app/src/pages/admin-accounts-page.tsx` (promotes `admin-accounts.tsx`'s content to a standalone `AdminShell`-wrapped page)
- Delete: `artifacts/geslaagd-app/src/pages/admin-page.tsx`
- Delete: `artifacts/geslaagd-app/src/pages/admin-accounts.tsx`
- Modify: `artifacts/geslaagd-app/src/pages/admin-activation-keys-page.tsx`
- Modify: `artifacts/geslaagd-app/src/components/shell/admin-sidebar.tsx`
- Modify: `artifacts/geslaagd-app/src/App.tsx`

**Interfaces:**
- Consumes: `setAdminAccountPackage`, `sendPrivateNotification` (generated from Task 9's endpoints), `AdminAccountSummary.package`/`.recentActions` (Task 9).

- [ ] **Step 1: `admin-sessions-page.tsx`**

Take `admin-page.tsx`'s content (`AdminPage` component), remove the `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` wrapper and the `AdminAccountsPanel` import/usage entirely — render the "Monitoring" tab's JSX directly as the page body (session list + broadcast form). Add a "Stuur privé melding" button per session-group row (next to "Uitloggen"), opening a small dialog (title + body fields, same shape as the broadcast form) that calls a new `sendPrivateNotification(group.userId, { title, body })` client function. Rename the exported component to `AdminSessionsPage`, change the `AdminShell title` to `"Sessies"` and `intro` to `"Bekijk actieve sessies en stuur een melding."`.

Note: `SessionGroup` currently only carries `email`, not `userId` — add `userId: item.userId` to the `groupByUser` mapping (the `Session` type already has `userId` per `toSession` in the backend) so the private-notification dialog has a target.

- [ ] **Step 2: `admin-accounts-page.tsx`**

Take the full content of `admin-accounts.tsx` (the `AdminAccountsPanel` component), rename to `AdminAccountsPage`, wrap its returned JSX in `<AdminShell title="Accounts" intro="Alle gebruikers, hun pakket en recente credit-activiteit.">...</AdminShell>` (following the exact `AdminShell` usage pattern from `admin-activation-keys-page.tsx`), and remove the `AdminDenied`/forbidden-state pattern duplication if `AdminAccountsPanel` didn't have its own (check — if it relied on the parent `AdminPage`'s forbidden handling, add the same `useAuth()` + `AdminDenied` guard used in every other standalone admin page, e.g. `admin-activation-keys-page.tsx:41-43,75`).

Add a package column + select to each account row: display `account.package` as a `Badge`, and for non-self accounts an inline `Select` (trial/basis/plus/beheerder) that on change calls `setAdminAccountPackage(account.userId, { package: value })` and updates local state with the response. Add a small "Recente acties" expandable list under each account row rendering `account.recentActions` as `"{delta > 0 ? '+' : ''}{delta} credits · {reason} · {fmtDateTime(createdAt)}"`.

- [ ] **Step 3: `admin-activation-keys-page.tsx` — package selector**

Add a `Select` (Basis/Plus/Beheerder — Trial keys make no sense since trial needs no key, so restrict this dropdown to `basis`/`plus`/`beheerder`) next to the existing count `Input`, defaulting to `basis`. Update the `generate` function to call `createActivationKeys({ count: Math.min(value, 100), package: selectedPackage })`. Add a `package` Badge to each listed key row (`key.package`).

- [ ] **Step 4: Routing and nav**

In `App.tsx`, replace `<Route path="/beheer/accounts" component={AdminPage} />` with:
```tsx
<Route path="/beheer/sessies" component={AdminSessionsPage} />
<Route path="/beheer/accounts" component={AdminAccountsPage} />
```
Update imports accordingly, remove the old `AdminPage` import.

In `admin-sidebar.tsx`, replace the single `{ href: '/beheer/accounts', label: 'Accounts & sessies', ... }` entry with two entries:
```ts
{ href: '/beheer/sessies', label: 'Sessies', hint: 'Wie is online, broadcasts en privé-meldingen', icon: Activity },
{ href: '/beheer/accounts', label: 'Accounts', hint: 'Gebruikers, pakketten en credits', icon: Users },
```
(Add `Activity` to the lucide-react import list; `Users` is already imported.)

- [ ] **Step 5: Manual browser verification**

Start the dev server, log in as admin, visit `/beheer/sessies` (confirm session list + broadcast form render, send a test private notification to a known test account and confirm no console errors), visit `/beheer/accounts` (confirm package badges show, change one test account's package and confirm the row updates), visit `/beheer/activatiecodes` (confirm the package selector appears and generated keys show the chosen package).

- [ ] **Step 6: Typecheck and commit**

```bash
pnpm --filter geslaagd-app run typecheck
git add artifacts/geslaagd-app/src/pages/admin-sessions-page.tsx artifacts/geslaagd-app/src/pages/admin-accounts-page.tsx artifacts/geslaagd-app/src/pages/admin-activation-keys-page.tsx artifacts/geslaagd-app/src/components/shell/admin-sidebar.tsx artifacts/geslaagd-app/src/App.tsx
git rm artifacts/geslaagd-app/src/pages/admin-page.tsx artifacts/geslaagd-app/src/pages/admin-accounts.tsx
git commit -m "Beheer-UI: Accounts en Sessies gesplitst, pakketbeheer, privé-meldingen, keys per pakket"
```

---

### Task 14: Frontend notifications — persistent stacked list replacing the single ephemeral broadcast

**Files:**
- Create: `artifacts/geslaagd-app/src/components/shell/notifications-stack.tsx`
- Modify: `artifacts/geslaagd-app/src/auth/auth-context.tsx`
- Modify: wherever the current single `broadcast`/`dismissBroadcast` is rendered (search for `useAuth().broadcast` usage in the shell component to find the exact render site).

**Interfaces:**
- Consumes: `listNotifications`, `dismissNotification` (generated client functions from Task 10).
- Produces: `AuthContextValue.notifications: Notification[]` and `dismissNotificationLocally(id)` (replacing `broadcast`/`dismissBroadcast`).

- [ ] **Step 1: Find the current broadcast render site**

```bash
grep -rn "\.broadcast\b\|dismissBroadcast" artifacts/geslaagd-app/src
```

- [ ] **Step 2: Update `auth-context.tsx`**

Replace the `broadcast` single-object state with a `notifications: Notification[]` list, fetched via `listNotifications()` once on login and whenever the realtime channel receives a refresh ping. Change the realtime subscription from `app:broadcasts`/event `"message"` to `app:notifications`/event `"refresh"` (matching Task 9's `broadcast(identity.token, "app:notifications", "refresh", {})`), and ALSO subscribe to a new per-user channel `user:${user.id}:notifications` with the same `"refresh"` event (matching Task 9's private-notification broadcast) — on either event, re-fetch `listNotifications()` rather than trying to reconstruct the payload from the realtime event itself (keeps the DB the single source of truth). Also fetch once on mount (after `user`/`session` become available), same as the existing session-registration effect.

Replace `dismissBroadcast: () => setBroadcast(null)` with `dismissNotification: (id: string) => { void dismissNotification(id); setNotifications((all) => all.filter((n) => n.id !== id)); }` (optimistic local removal, matching how `revoke`/`send` elsewhere in this codebase don't block on refetch).

- [ ] **Step 3: `notifications-stack.tsx`**

```tsx
import { useAuth } from '@/auth/auth-context';
import { X } from 'lucide-react';

export function NotificationsStack() {
  const { notifications, dismissNotification } = useAuth();
  if (notifications.length === 0) return null;
  return (
    <div className="notifications-stack">
      {notifications.map((n) => (
        <div key={n.id} className="notification-card" role="status">
          <div>
            <strong>{n.title}</strong>
            <p>{n.body}</p>
          </div>
          <button type="button" onClick={() => dismissNotification(n.id)} aria-label="Melding wegklikken">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Mount it where the old broadcast banner was rendered**

Replace that render site's JSX with `<NotificationsStack />`.

- [ ] **Step 5: CSS**

Add to `artifacts/geslaagd-app/src/index.css`:

```css
.notifications-stack {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 22rem;
}
.notification-card {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  background: var(--card, #fff);
  border: 1px solid var(--border, #e2e2e2);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.notification-card p { margin: 0.25rem 0 0; font-size: 0.85rem; }
.notification-card button { background: none; border: none; cursor: pointer; opacity: 0.6; }
.notification-card button:hover { opacity: 1; }
```

- [ ] **Step 6: Manual browser verification**

Start the dev server, log in, use the admin Sessions page to send a broadcast, confirm it appears in the stack within a couple seconds and stacks correctly if a second one is sent before the first is dismissed, dismiss one and confirm it disappears and does not return on reload (persisted dismissal). Send a private notification to that same test account and confirm the same behavior.

- [ ] **Step 7: Typecheck and commit**

```bash
pnpm --filter geslaagd-app run typecheck
git add artifacts/geslaagd-app/src/components/shell/notifications-stack.tsx artifacts/geslaagd-app/src/auth/auth-context.tsx artifacts/geslaagd-app/src/index.css
git commit -m "Notificaties: persistente, stapelbare meldingen i.p.v. één vluchtige broadcast"
```

---

### Task 15: Changelog pages + version badge

**Files:**
- Create: `artifacts/geslaagd-app/src/pages/changelog-page.tsx`
- Create: `artifacts/geslaagd-app/src/pages/admin-changelog-page.tsx`
- Create: `artifacts/geslaagd-app/src/components/shell/version-badge.tsx`
- Modify: `artifacts/geslaagd-app/src/App.tsx`
- Modify: `artifacts/geslaagd-app/src/components/shell/admin-sidebar.tsx`
- Modify: wherever the app shell's sidebar footer is rendered (search for the sidebar footer component, likely `artifacts/geslaagd-app/src/components/shell/app-shell.tsx` or a dedicated sidebar-footer file).

**Interfaces:**
- Consumes: `getChangelog`, `listChangelogAdmin`, `createChangelogEntry`, `updateChangelogEntry` (Task 11).

- [ ] **Step 1: `changelog-page.tsx`**

Follow the `faq-page.tsx` pattern (static content page using the study-page shell components) but data-driven: fetch `getChangelog()` on mount, render each entry as a card (`version` + `releasedAt` formatted with `toLocaleDateString('nl-NL', ...)` + `summary` + a `<ul>` of `bullets`), newest first (already sorted by the backend).

- [ ] **Step 2: `admin-changelog-page.tsx`**

Follow the `admin-activation-keys-page.tsx` structure: `AdminShell` wrapper, a form (version text input, date input, summary textarea, bullets textarea split on newlines into an array) that calls `createChangelogEntry` on submit and clears; below it, the existing entries listed with an "Bewerken" button per entry that pre-fills the same form fields and switches the submit handler to `updateChangelogEntry(entry.id, ...)` instead of create (track this with a `editingId: string | null` state, same pattern used for `PendingAction` state elsewhere in this codebase).

- [ ] **Step 3: `version-badge.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { getChangelog } from '@workspace/api-client-react';

export function VersionBadge() {
  const [, setLocation] = useLocation();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    void getChangelog()
      .then((result) => setVersion(result.entries[0]?.version ?? null))
      .catch(() => setVersion(null));
  }, []);

  if (!version) return null;
  return (
    <button type="button" className="version-badge" onClick={() => setLocation('/changelog')}>
      {version}
    </button>
  );
}
```

- [ ] **Step 4: Mount `VersionBadge` in the shell footer, add routes and nav**

Find the sidebar footer render site (`grep -rn "SidebarFooter\|sidebar-footer" artifacts/geslaagd-app/src`) and add `<VersionBadge />` there.

In `App.tsx`, add:
```tsx
<Route path="/changelog" component={ChangelogPage} />
<Route path="/beheer/changelog" component={AdminChangelogPage} />
```

In `admin-sidebar.tsx`, add `{ href: '/beheer/changelog', label: 'Changelog', hint: 'Wat is er veranderd', icon: History }` to `ADMIN_NAV` (add `History` to the lucide-react import).

- [ ] **Step 5: CSS**

Add a minimal `.version-badge` style (small, muted, pill-shaped button) and `.changelog-entry`/`.changelog-page` styles to `index.css`, matching the visual weight of the existing `.faq-*` classes.

- [ ] **Step 6: Manual browser verification**

Visit `/beheer/changelog` as admin, add an entry, confirm it appears; visit `/changelog` as a regular view and confirm it renders; confirm the version badge in the sidebar footer shows that same version and links to `/changelog`.

- [ ] **Step 7: Typecheck and commit**

```bash
pnpm --filter geslaagd-app run typecheck
git add artifacts/geslaagd-app/src/pages/changelog-page.tsx artifacts/geslaagd-app/src/pages/admin-changelog-page.tsx artifacts/geslaagd-app/src/components/shell/version-badge.tsx artifacts/geslaagd-app/src/App.tsx artifacts/geslaagd-app/src/components/shell/admin-sidebar.tsx artifacts/geslaagd-app/src/index.css
git commit -m "Changelog-paginas en versie-badge in de shell"
```

---

### Task 16: Auth page — trial signup path and logged-in upgrade-key field

**Files:**
- Modify: `artifacts/geslaagd-app/src/pages/auth-page.tsx`
- Create or modify: a small settings/profile surface for the upgrade-key field — if no such page exists yet, add it as a small card at the bottom of `auth-page.tsx`'s own layout is wrong since that page is for logged-out users; instead add a minimal new section: check `artifacts/geslaagd-app/src/pages/` for an existing account-settings page first (`grep -rn "account.settings\|Mijn account" artifacts/geslaagd-app/src/pages`); if none exists, create `artifacts/geslaagd-app/src/pages/account-page.tsx` with just the billing summary + upgrade-key form, and add `<Route path="/account" component={AccountPage} />` plus a nav entry in the student shell.

**Interfaces:**
- Consumes: `signUpTrial`, `getMyBilling`, `applyUpgradeKey` (Task 6/7 generated clients).

- [ ] **Step 1: Trial signup path on `auth-page.tsx`**

Add a "Start gratis met Trial" secondary button/link near the existing activation-key signup form, toggling a simpler form (email + password only, no activation key field) that calls `signUpTrial({ email, password, device })` instead of `signUpWithActivationKey`. Reuse the existing error-handling pattern (`ApiError` catch block already on this page).

- [ ] **Step 2: Account page with upgrade-key field**

```tsx
import { useEffect, useState } from 'react';
import { applyUpgradeKey, getMyBilling, type BillingSummary } from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import { PageHeader } from '@workspace/geslaagd-momentum/components/layout/page-header';
import { StudyPageShell } from '@/components/study/study-page-shell';

export default function AccountPage() {
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => void getMyBilling().then(setBilling);
  useEffect(load, []);

  const submit = async () => {
    if (!code.trim()) return;
    setSubmitting(true);
    setNotice('');
    try {
      const result = await applyUpgradeKey({ code: code.trim().toUpperCase() });
      setBilling(result);
      setCode('');
      setNotice('Pakket bijgewerkt.');
    } catch {
      setNotice('Deze code is ongeldig, al gebruikt, of geen upgrade t.o.v. je huidige pakket.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StudyPageShell>
      <PageHeader title="Mijn account" description={billing ? `Pakket: ${billing.package} · Credits: ${billing.credits ?? '∞'}` : undefined} />
      <label>
        Upgrade-code
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX" />
      </label>
      {notice && <p className="admin-notice">{notice}</p>}
      <Button disabled={submitting || !code.trim()} onClick={() => void submit()}>Code toepassen</Button>
    </StudyPageShell>
  );
}
```

- [ ] **Step 3: Routing and nav**

Add `<Route path="/account" component={AccountPage} />` to `App.tsx`. Add a nav entry in the student sidebar (`study-sidebar.tsx`, following the same pattern used for the FAQ nav item added previously).

- [ ] **Step 4: Manual browser verification**

Sign up via the new Trial path, confirm the account lands with 10 credits and `package: trial` (check via `/account`), confirm a `pakket_verificatie` support ticket exists for that account. Generate a `plus` key as admin, apply it via `/account`, confirm the balance/package update.

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm --filter geslaagd-app run typecheck
git add artifacts/geslaagd-app/src/pages/auth-page.tsx artifacts/geslaagd-app/src/pages/account-page.tsx artifacts/geslaagd-app/src/App.tsx artifacts/geslaagd-app/src/components/shell/study-sidebar.tsx
git commit -m "Trial-aanmeldpad en accountpagina met upgrade-code"
```

---

### Task 17: Changelog backfill (historical entries + this feature's own entry)

**Files:**
- No new source files — this is a one-time data-population task run via a script, not committed code.

**Interfaces:**
- Consumes: `POST /admin/changelog` logic (Task 11), `git log`.

- [ ] **Step 1: Review commit history to draft entries**

```bash
git log --oneline --reverse | head -100
```

Group commits into sensible releases (the user's own convention: current state is v0.4; this feature ships as v0.51). Draft roughly 4-8 entries spanning v0.1 through v0.4 covering the major milestones visible in the log (initial catalog/study flow, crawl pipeline introduction, support tickets, activation keys, OpenAI migration, contradiction detection, etc. — use judgment grouping nearby commits into one entry rather than one entry per commit).

- [ ] **Step 2: Insert them**

Write a one-off `artifacts/api-server/scratch-backfill-changelog.ts` that POSTs each drafted entry through the same logic as `POST /admin/changelog` (direct `restService` inserts into `changelog_entries` are simplest here — no need to go through HTTP), including a final entry:

```
version: "v0.51"
summary: "Credits, pakketten en beheer-uitbreidingen"
bullets: [
  "Creditsysteem met vier pakketten (Trial, Basis, Plus, Beheerder)",
  "Activatiecodes zijn nu gekoppeld aan een pakket en kunnen gebruikt worden om te upgraden",
  "Trial-aanmelden zonder code, met verificatie via support",
  "Accounts en Sessies zijn nu aparte beheerpagina's, met privé-meldingen",
  "Meldingen blijven nu staan tot je ze wegklikt, en kunnen zich opstapelen",
  "Nieuwe changelog-pagina, met het huidige versienummer zichtbaar in de zijbalk",
]
```

Run: `npx tsx --env-file-if-exists=.env artifacts/api-server/scratch-backfill-changelog.ts`
Expected: `GET /changelog` (or a direct `restService` read) now shows all drafted entries, newest first.

- [ ] **Step 2: Delete the one-off script (the data it inserted stays — this script itself is not committed)**

```bash
rm artifacts/api-server/scratch-backfill-changelog.ts
```

No commit needed for this task beyond what's already in the database — there is no source change.

---

## Self-Review Notes

- **Spec coverage:** every section of the design spec maps to a task — data model → Task 1; credit rules → Tasks 2, 8; trial/verification → Task 6, 12; key upgrade → Tasks 3, 7; accounts/sessions split → Tasks 9, 13, 14; changelog → Tasks 11, 15, 17.
- **Corrected during planning:** the spec's data model referred to an `accounts` table; this codebase has no such table (user identity is Supabase Auth `auth.users`). Tasks use a new `account_billing` table keyed by `user_id` instead — same fields, same semantics, different table name. This is a naming correction only, not a product-level change, so it did not need to go back to the user.
- **Notification shape correction:** the spec described a single `message` column; Task 4/5 splits this into `title`/`body` to match the existing `SendAdminBroadcastBody` shape the frontend already sends, avoiding a JSON-packing hack.
- **Dependency order:** Task 4 (openapi/codegen) must run before any backend task that imports the new zod schemas (Tasks 6 onward) — Tasks 1-3 touch only hand-written types and don't depend on codegen.
