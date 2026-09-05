# Social Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full social layer to geslaagd.app — mandatory profiles, a user directory, DMs, group chats with an owner role, blocking, `#vak`/`#hoofdstuk` message references, an in-chat `/ai` assistant, site-admin moderation of group chats, and one shared Discord-like chat UI used by the new chats **and** retrofitted onto the two chat surfaces that already exist.

**Architecture:** Server-authoritative REST + manual Supabase Realtime broadcast, identical to the pattern already shipped for sessions/notifications: every table is service-role-only, every write goes through an Express route, and "live" means the route calls `broadcast()` right after writing. One reusable `MessageList`/`MessageComposer` React component pair is built once and consumed by three surfaces: the new social conversations, the existing per-chapter AI study-chat panel, and the existing admin support-ticket thread.

**Tech Stack:** Express + TypeScript, React + Vite + wouter, Supabase (Postgres + Auth + Realtime + **Storage**, new to this project), zod via orval codegen, pnpm workspaces.

**Spec:** [docs/superpowers/specs/2026-09-05-social-platform-design.md](../specs/2026-09-05-social-platform-design.md)

## Global Constraints

- No table introduced here is ever readable/writable by anon or authenticated roles — `revoke all ... from public, anon, authenticated` on every new table, matching every existing migration in this repo.
- Blocking is symmetric: a `blocks` row in either direction hides both directions (profile view and new messages), but never retroactively hides message history in conversations that already existed.
- A groepseigenaar can never delete or edit a message. Only a sitebeheerder can (`messages.deleted_at`). These are two different roles with two different names, used consistently: **groepseigenaar** (group-scoped) vs. **sitebeheerder** (site-wide, the existing admin role).
- `/ai` in chat reuses the existing `claim_study_ai_request(p_user_id)` rate limiter (max 12/15min/user) — no new quota mechanism.
- Every new endpoint goes through `lib/api-spec/openapi.yaml` + `pnpm --filter @workspace/api-spec run codegen` before any code that imports its generated types is written.
- No unit-test framework exists in this codebase. Verification is via throwaway `scratch-*.ts` scripts (`npx tsx --env-file=artifacts/api-server/.env <file>.ts`) against the real Supabase backend with disposable test accounts, cleaned up immediately after. **Before mutating any account found by a broad query (no email filter), print and confirm it is an account you just created in that same script** — a prior session in this project once mutated a real user's account by grabbing "the first row" from an unfiltered query.
- Photos: private Supabase Storage bucket, max ~1600px/JPEG~80% on upload, 50MB/user and 200MB/group quotas, server always returns short-lived signed URLs — never a public bucket URL.

---

## File Structure

**New backend files:**
- `artifacts/api-server/src/lib/profiles.ts` — profile CRUD, username validation/uniqueness, directory search, live vakken lookup.
- `artifacts/api-server/src/lib/blocks.ts` — `isBlocked(a, b)`, `blockUser`, `unblockUser`.
- `artifacts/api-server/src/lib/conversations.ts` — find-or-create DM, create group, membership ops, ownership transfer, mute, mark-read.
- `artifacts/api-server/src/lib/messages.ts` — send (incl. `#ref` parsing, `/ai` detection, `@mention` detection), list with pagination, soft-delete.
- `artifacts/api-server/src/lib/social-storage.ts` — Supabase Storage upload (with compression call-out), signed URL, quota checks.
- `artifacts/api-server/src/routes/profiles.ts` — `GET/PUT /profiles/me`, `GET /profiles/:userId`, `GET /social/directory`.
- `artifacts/api-server/src/routes/blocks.ts` — `POST /blocks/:userId`, `DELETE /blocks/:userId`.
- `artifacts/api-server/src/routes/conversations.ts` — list/create/get conversations, group metadata, members, ownership transfer, mute, mark-read.
- `artifacts/api-server/src/routes/messages.ts` — send/list messages, photo upload.
- `artifacts/api-server/src/routes/admin-social.ts` — sitebeheerder moderation: list all groups, close/delete conversation, delete message.

**Modified backend files:**
- `artifacts/api-server/src/routes/index.ts` — register the five new routers.
- `artifacts/api-server/src/routes/support.ts` — support-ticket sends now also broadcast (Task 16).

**New frontend files:**
- `artifacts/geslaagd-app/src/components/chat/message-list.tsx` — shared, grouped message rendering.
- `artifacts/geslaagd-app/src/components/chat/message-composer.tsx` — shared input: text, `#ref` picker, `/ai`, photo attach, typing broadcast.
- `artifacts/geslaagd-app/src/components/chat/reference-chip.tsx` — renders a `#vak`/`#hoofdstuk` reference as a clickable chip (visual sibling of `citation-tag.tsx`).
- `artifacts/geslaagd-app/src/hooks/use-conversation-channel.ts` — subscribes to `conversation:<id>` broadcast, exposes `{messages, sendTyping, typingUsers}`.
- `artifacts/geslaagd-app/src/pages/onboarding-profile-page.tsx` — mandatory profile-creation gate.
- `artifacts/geslaagd-app/src/pages/social-directory-page.tsx` — searchable user list.
- `artifacts/geslaagd-app/src/pages/profile-page.tsx` — one user's profile, block-aware.
- `artifacts/geslaagd-app/src/pages/inbox-page.tsx` — conversation list (DMs + groups), unread dots.
- `artifacts/geslaagd-app/src/pages/conversation-page.tsx` — one open DM/group, uses the shared chat components; group header exposes owner settings when `kind==='group'`.
- `artifacts/geslaagd-app/src/pages/admin-groepsapps-page.tsx` — sitebeheerder moderation page.

**Modified frontend files:**
- `artifacts/geslaagd-app/src/components/study/chat-panel.tsx` — rebuilt on top of `MessageList`/`MessageComposer` (Task 15).
- `artifacts/geslaagd-app/src/pages/admin-support-page.tsx` — ticket thread rebuilt on the shared components + realtime instead of polling (Task 16).
- `artifacts/geslaagd-app/src/App.tsx`, `study-sidebar.tsx`, `admin-sidebar.tsx` — new routes/nav.
- `artifacts/geslaagd-app/src/auth/auth-context.tsx` — after login, redirect to onboarding if no profile exists yet.

---

### Task 1: Database schema — profiles, blocks, conversations, messages, storage bucket

**Files:**
- Create: `supabase/migrations/2026090601_social_platform.sql`

**Interfaces:**
- Produces every table/column referenced by every later task: `public.profiles`, `public.blocks`, `public.conversations`, `public.conversation_members`, `public.messages`, plus a `social-photos` Storage bucket.

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` tool with `project_id = xpguhyuvooeizrjjrpkw`, `name = social_platform`, and the SQL above.

- [ ] **Step 3: Verify with a scratch script**

```ts
// artifacts/api-server/scratch-verify-social-schema.ts
import { restService } from "./src/lib/supabase";

async function main() {
  console.log(await restService<unknown[]>("profiles?select=*&limit=1"));
  console.log(await restService<unknown[]>("conversations?select=*&limit=1"));
  console.log(await restService<unknown[]>("messages?select=*&limit=1"));
}
main();
```

Run: `npx tsx --env-file=artifacts/api-server/.env artifacts/api-server/scratch-verify-social-schema.ts`
Expected: three empty arrays, no errors (tables exist and are queryable via the service role).

- [ ] **Step 4: Delete the scratch script and commit**

```bash
rm artifacts/api-server/scratch-verify-social-schema.ts
git add supabase/migrations/2026090601_social_platform.sql
git commit -m "Schema: profielen, blokkades, gesprekken, berichten, fotobucket"
```

---

### Task 2: Profiles module and mandatory-onboarding check

**Files:**
- Create: `artifacts/api-server/src/lib/profiles.ts`

**Interfaces:**
- Consumes: `restService` from `../lib/supabase`.
- Produces (used by Tasks 3, 4, 5, 9, 12):
  - `type Profile = { userId, username, displayName, avatarUrl: string | null, institution: string | null, studyProgram: string | null, description: string | null, createdAt, updatedAt }`
  - `getProfile(userId): Promise<Profile | null>`
  - `hasProfile(userId): Promise<boolean>` — used to redirect to onboarding.
  - `isUsernameTaken(username, excludingUserId?): Promise<boolean>`
  - `createProfile(userId, input): Promise<Profile>`
  - `updateProfile(userId, input): Promise<Profile>`
  - `searchProfiles(query: string, limit: number): Promise<Profile[]>` — matches `username`/`display_name`/`study_program` via `ilike`.
  - `loadVakkenFor(userId): Promise<{ subjectId: string; name: string }[]>` — reads `student_selected_subjects` joined to `crawl_subjects` for the profile's "vakken" section (same join pattern already used in `admin-accounts.ts`'s `study_selected_subjects` read).

- [ ] **Step 1: Write `lib/profiles.ts`**

```ts
import { restService } from "./supabase";

type Row = Record<string, unknown>;

export type Profile = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  institution: string | null;
  studyProgram: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

function toProfile(row: Row): Profile {
  return {
    userId: row.user_id as string,
    username: row.username as string,
    displayName: row.display_name as string,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    institution: (row.institution as string | null) ?? null,
    studyProgram: (row.study_program as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const rows = await restService<Row[]>(`profiles?user_id=eq.${userId}&select=*`);
  return rows[0] ? toProfile(rows[0]) : null;
}

export async function hasProfile(userId: string): Promise<boolean> {
  return (await getProfile(userId)) !== null;
}

export async function isUsernameTaken(username: string, excludingUserId?: string): Promise<boolean> {
  const rows = await restService<Row[]>(`profiles?username=eq.${encodeURIComponent(username)}&select=user_id`);
  return rows.some((row) => row.user_id !== excludingUserId);
}

export type ProfileInput = {
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  institution?: string | null;
  studyProgram?: string | null;
  description?: string | null;
};

export async function createProfile(userId: string, input: ProfileInput): Promise<Profile> {
  const rows = await restService<Row[]>("profiles", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      user_id: userId,
      username: input.username,
      display_name: input.displayName,
      avatar_url: input.avatarUrl ?? null,
      institution: input.institution ?? null,
      study_program: input.studyProgram ?? null,
      description: input.description ?? null,
    }),
  });
  return toProfile(rows[0]!);
}

export async function updateProfile(userId: string, input: Partial<ProfileInput>): Promise<Profile> {
  const patch: Row = { updated_at: new Date().toISOString() };
  if (input.displayName !== undefined) patch.display_name = input.displayName;
  if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl;
  if (input.institution !== undefined) patch.institution = input.institution;
  if (input.studyProgram !== undefined) patch.study_program = input.studyProgram;
  if (input.description !== undefined) patch.description = input.description;

  const rows = await restService<Row[]>(`profiles?user_id=eq.${userId}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  return toProfile(rows[0]!);
}

export async function searchProfiles(query: string, limit: number): Promise<Profile[]> {
  const q = encodeURIComponent(`%${query}%`);
  const rows = await restService<Row[]>(
    `profiles?or=(username.ilike.${q},display_name.ilike.${q},study_program.ilike.${q})&select=*&limit=${limit}`,
  );
  return rows.map(toProfile);
}

export async function loadVakkenFor(userId: string): Promise<{ subjectId: string; name: string }[]> {
  const rows = await restService<Row[]>(
    `student_selected_subjects?user_id=eq.${userId}&select=subject_id,crawl_subjects(name)`,
  );
  return rows
    .map((row) => ({
      subjectId: row.subject_id as string,
      name: ((row.crawl_subjects as Row | null)?.name as string | undefined) ?? "",
    }))
    .filter((entry) => entry.name);
}
```

- [ ] **Step 2: Verify with a scratch script**

Create a disposable test user (via `signUpWithPassword`), call `hasProfile` (expect `false`), `createProfile` with a unique test username, `getProfile` (expect it back), `isUsernameTaken` with the same username but a *different* excludingUserId (expect `true`) and with the *same* excludingUserId (expect `false`), `updateProfile` changing `displayName`, then clean up: delete the `profiles` row and the auth user.

Run: `npx tsx --env-file=artifacts/api-server/.env artifacts/api-server/scratch-verify-profiles.ts`
Expected: all assertions above hold.

- [ ] **Step 3: Delete scratch script, typecheck, commit**

```bash
rm artifacts/api-server/scratch-verify-profiles.ts
pnpm --filter @workspace/api-server run typecheck
git add artifacts/api-server/src/lib/profiles.ts
git commit -m "Profielenmodule: CRUD, username-uniekheid, zoeken, vakken-lookup"
```

---

### Task 3: `openapi.yaml` — schemas and routes for profiles, blocks, directory (round 1 of 3)

**Files:**
- Modify: `lib/api-spec/openapi.yaml`

**Interfaces:**
- Produces the generated zod/client types Tasks 4-5 depend on. This is the first of three codegen rounds (profiles here; conversations/messages in Task 8; moderation in Task 13) — splitting the spec additions this way keeps each codegen diff reviewable instead of one 600-line yaml change.

- [ ] **Step 1: Add schemas** (append inside `components: schemas:`, following this file's existing inline-enum, double-quote-`$ref` style)

```yaml
    Profile:
      type: object
      required: [userId, username, displayName, avatarUrl, institution, studyProgram, description, vakken]
      properties:
        userId: { type: string, format: uuid }
        username: { type: string }
        displayName: { type: string }
        avatarUrl: { type: ["string", "null"] }
        institution: { type: ["string", "null"] }
        studyProgram: { type: ["string", "null"] }
        description: { type: ["string", "null"] }
        vakken:
          type: array
          items:
            type: object
            required: [subjectId, name]
            properties:
              subjectId: { type: string }
              name: { type: string }
        isBlocked:
          type: boolean
          description: True if the viewer and this profile's owner have blocked each other in either direction. When true, every other field above is omitted/blank by the server.

    CreateProfileInput:
      type: object
      required: [username, displayName]
      properties:
        username: { type: string, pattern: "^[a-z0-9_]{3,24}$" }
        displayName: { type: string, minLength: 1, maxLength: 60 }
        institution: { type: string, maxLength: 120 }
        studyProgram: { type: string, maxLength: 120 }
        description: { type: string, maxLength: 500 }

    UpdateProfileInput:
      type: object
      properties:
        displayName: { type: string, minLength: 1, maxLength: 60 }
        avatarUrl: { type: ["string", "null"] }
        institution: { type: ["string", "null"], maxLength: 120 }
        studyProgram: { type: ["string", "null"], maxLength: 120 }
        description: { type: ["string", "null"], maxLength: 500 }

    ListDirectoryResponse:
      type: object
      required: [profiles]
      properties:
        profiles:
          type: array
          items: { $ref: "#/components/schemas/Profile" }

    HasProfileResponse:
      type: object
      required: [hasProfile]
      properties:
        hasProfile: { type: boolean }
```

- [ ] **Step 2: Add paths**

```yaml
  /profiles/me:
    get:
      operationId: getMyProfileStatus
      tags: [social]
      summary: Whether the signed-in user has completed onboarding, and their own profile if so
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                oneOf:
                  - $ref: "#/components/schemas/HasProfileResponse"
                  - $ref: "#/components/schemas/Profile"
        "401":
          description: Unauthorized
    post:
      operationId: createMyProfile
      tags: [social]
      summary: Complete the mandatory onboarding profile
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/CreateProfileInput" }
      responses:
        "201":
          description: Created
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Profile" }
        "409":
          description: Username taken, or a profile already exists
    patch:
      operationId: updateMyProfile
      tags: [social]
      summary: Edit the signed-in user's own profile
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/UpdateProfileInput" }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Profile" }

  /profiles/{userId}:
    get:
      operationId: getProfileById
      tags: [social]
      summary: View another user's profile (block-aware)
      parameters:
        - name: userId
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Profile" }
        "404":
          description: Not found

  /social/directory:
    get:
      operationId: listDirectory
      tags: [social]
      summary: Search all profiles
      parameters:
        - name: query
          in: query
          required: false
          schema: { type: string }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ListDirectoryResponse" }

  /blocks/{userId}:
    post:
      operationId: blockUserRoute
      tags: [social]
      summary: Block another user (symmetric)
      parameters:
        - name: userId
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        "204":
          description: Blocked
    delete:
      operationId: unblockUserRoute
      tags: [social]
      summary: Remove a block you placed
      parameters:
        - name: userId
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        "204":
          description: Unblocked
```

Add a `social` tag to the top-level `tags:` list (`description: Profiles, directory, blocking, conversations`), same pattern as the `billing`/`notifications`/`changelog` tags added in the credits sub-project.

- [ ] **Step 3: Run codegen, typecheck, commit**

```bash
pnpm --filter @workspace/api-spec run codegen
pnpm -w run typecheck
```

Expected: codegen succeeds; typecheck passes everywhere except no new code references these types yet (nothing should fail — this round adds schemas but no route file imports them until Task 4).

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react
git commit -m "API-spec: schemas voor profielen, directory en blokkeren"
```

**If codegen produces a duplicate-export error** (this happened once already in this project, between a component schema and an orval-generated param/type of the same name — see `lib/api-zod/src/index.ts`'s existing explicit re-export list): add the colliding name to that list, matching the existing pattern exactly, before re-running codegen.

---

### Task 4: Profile and directory routes

**Files:**
- Create: `artifacts/api-server/src/routes/profiles.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`

**Interfaces:**
- Consumes: everything from `lib/profiles.ts` (Task 2), `lib/blocks.ts`'s `isBlocked` (Task 5 — see note below on ordering).
- Produces: `GET/POST/PATCH /profiles/me`, `GET /profiles/:userId`, `GET /social/directory`.

Note on ordering: this task's `GET /profiles/:userId` needs `isBlocked()`. Either write a minimal inline `isBlocked` helper here and have Task 5 replace it with an import from the new `lib/blocks.ts` (small, expected churn — call this out in Task 5's steps), or do Task 5 before this task. This plan does the former since profiles are the more foundational piece other tasks build on first.

- [ ] **Step 1: Write `routes/profiles.ts`**

```ts
import { Router, type IRouter } from "express";
import {
  CreateProfileInput,
  GetProfileByIdParams,
  ListDirectoryQueryParams,
  UpdateProfileInput,
} from "@workspace/api-zod";
import { getAuthenticatedUser } from "../lib/supabase";
import {
  createProfile,
  getProfile,
  hasProfile,
  isUsernameTaken,
  loadVakkenFor,
  searchProfiles,
  updateProfile,
  type Profile,
} from "../lib/profiles";

const router: IRouter = Router();

// Minimal inline check — replaced by lib/blocks.ts's isBlocked in Task 5.
async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  const { restService } = await import("../lib/supabase");
  const rows = await restService<Record<string, unknown>[]>(
    `blocks?or=(and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a}))&select=blocker_id`,
  );
  return rows.length > 0;
}

async function toProfileResponse(profile: Profile) {
  const vakken = await loadVakkenFor(profile.userId);
  return { ...profile, vakken, isBlocked: false };
}

router.get("/profiles/me", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const profile = await getProfile(user.id);
    if (!profile) { res.json({ hasProfile: false }); return; }
    res.json(await toProfileResponse(profile));
  } catch (error) {
    req.log.warn({ error }, "Could not load own profile");
    res.status(500).json({ error: "Profiel kon niet worden geladen." });
  }
});

router.post("/profiles/me", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const input = CreateProfileInput.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Ongeldig profiel." }); return; }
  try {
    if (await hasProfile(user.id)) { res.status(409).json({ error: "Je hebt al een profiel." }); return; }
    if (await isUsernameTaken(input.data.username)) {
      res.status(409).json({ error: "Deze gebruikersnaam is al in gebruik." });
      return;
    }
    const profile = await createProfile(user.id, input.data);
    res.status(201).json(await toProfileResponse(profile));
  } catch (error) {
    req.log.warn({ error }, "Could not create profile");
    res.status(500).json({ error: "Profiel kon niet worden aangemaakt." });
  }
});

router.patch("/profiles/me", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const input = UpdateProfileInput.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Ongeldige wijziging." }); return; }
  try {
    const profile = await updateProfile(user.id, input.data);
    res.json(await toProfileResponse(profile));
  } catch (error) {
    req.log.warn({ error }, "Could not update profile");
    res.status(500).json({ error: "Profiel kon niet worden aangepast." });
  }
});

router.get("/profiles/:userId", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = GetProfileByIdParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldig profiel." }); return; }
  try {
    if (await isBlockedBetween(user.id, params.data.userId)) {
      res.json({
        userId: params.data.userId, username: "", displayName: "", avatarUrl: null,
        institution: null, studyProgram: null, description: null, vakken: [], isBlocked: true,
      });
      return;
    }
    const profile = await getProfile(params.data.userId);
    if (!profile) { res.status(404).json({ error: "Profiel niet gevonden." }); return; }
    res.json(await toProfileResponse(profile));
  } catch (error) {
    req.log.warn({ error }, "Could not load profile");
    res.status(500).json({ error: "Profiel kon niet worden geladen." });
  }
});

router.get("/social/directory", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const query = ListDirectoryQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Ongeldige zoekopdracht." }); return; }
  try {
    const profiles = await searchProfiles(query.data.query ?? "", 50);
    res.json({ profiles: await Promise.all(profiles.map(toProfileResponse)) });
  } catch (error) {
    req.log.warn({ error }, "Could not search directory");
    res.status(500).json({ error: "Zoeken is mislukt." });
  }
});

export default router;
```

- [ ] **Step 2: Register in `index.ts`, typecheck**

```bash
pnpm --filter @workspace/api-server run typecheck
```

- [ ] **Step 3: Verify with a scratch script**

Create two disposable test users with profiles; confirm `GET /profiles/:userId`-equivalent logic returns the second user's real data to the first; insert a `blocks` row between them; confirm the same lookup now returns `isBlocked: true` with blanked fields in both directions. Clean up both users and their profiles/blocks rows.

Run: `npx tsx --env-file=artifacts/api-server/.env artifacts/api-server/scratch-verify-profile-routes.ts`

- [ ] **Step 4: Delete scratch script, commit**

```bash
rm artifacts/api-server/scratch-verify-profile-routes.ts
git add artifacts/api-server/src/routes/profiles.ts artifacts/api-server/src/routes/index.ts
git commit -m "Profiel- en directoryroutes, met blokkade-check"
```

---

### Task 5: Blocking module and routes

**Files:**
- Create: `artifacts/api-server/src/lib/blocks.ts`
- Create: `artifacts/api-server/src/routes/blocks.ts`
- Modify: `artifacts/api-server/src/routes/profiles.ts` (swap the inline `isBlockedBetween` for the real import)
- Modify: `artifacts/api-server/src/routes/index.ts`

**Interfaces:**
- Produces: `isBlocked(a: string, b: string): Promise<boolean>`, `blockUser(blockerId, blockedId): Promise<void>`, `unblockUser(blockerId, blockedId): Promise<void>`.

- [ ] **Step 1: Write `lib/blocks.ts`**

```ts
import { restService } from "./supabase";

export async function isBlocked(a: string, b: string): Promise<boolean> {
  const rows = await restService<Record<string, unknown>[]>(
    `blocks?or=(and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a}))&select=blocker_id`,
  );
  return rows.length > 0;
}

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  await restService("blocks?on_conflict=blocker_id,blocked_id", {
    method: "POST",
    headers: { prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify({ blocker_id: blockerId, blocked_id: blockedId }),
  });
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  await restService(`blocks?blocker_id=eq.${blockerId}&blocked_id=eq.${blockedId}`, { method: "DELETE" });
}
```

- [ ] **Step 2: Replace the inline helper in `routes/profiles.ts`**

Delete the `isBlockedBetween` function and its dynamic `import("../lib/supabase")`; replace both call sites with `isBlocked` imported from `../lib/blocks`.

- [ ] **Step 3: Write `routes/blocks.ts`**

```ts
import { Router, type IRouter } from "express";
import { BlockUserRouteParams, UnblockUserRouteParams } from "@workspace/api-zod";
import { getAuthenticatedUser } from "../lib/supabase";
import { blockUser, unblockUser } from "../lib/blocks";

const router: IRouter = Router();

router.post("/blocks/:userId", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = BlockUserRouteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    await blockUser(user.id, params.data.userId);
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not block user");
    res.status(500).json({ error: "Blokkeren is mislukt." });
  }
});

router.delete("/blocks/:userId", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = UnblockUserRouteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    await unblockUser(user.id, params.data.userId);
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not unblock user");
    res.status(500).json({ error: "Deblokkeren is mislukt." });
  }
});

export default router;
```

- [ ] **Step 4: Register, typecheck**

```bash
pnpm --filter @workspace/api-server run typecheck
```

- [ ] **Step 5: Verify with a scratch script**

Two disposable test users; block one from the other; confirm `isBlocked` is true in both directions; unblock; confirm it's false again. Clean up.

- [ ] **Step 6: Delete scratch script, commit**

```bash
rm artifacts/api-server/scratch-verify-blocks.ts
git add artifacts/api-server/src/lib/blocks.ts artifacts/api-server/src/routes/blocks.ts artifacts/api-server/src/routes/profiles.ts artifacts/api-server/src/routes/index.ts
git commit -m "Blokkademodule: symmetrisch blokkeren/deblokkeren"
```

---

### Task 6: Conversations module (DM find-or-create, groups, membership, ownership)

**Files:**
- Create: `artifacts/api-server/src/lib/conversations.ts`

**Interfaces:**
- Consumes: `isBlocked` from `../lib/blocks`.
- Produces (used by Tasks 8, 9, 12):
  - `type Conversation = { id, kind: 'dm'|'group', title: string|null, description: string|null, photoUrl: string|null, ownerId: string|null, status: 'active'|'closed'|'deleted', createdAt }`
  - `type Member = { userId, joinedAt, lastReadAt: string|null, muted }`
  - `findOrCreateDm(userA, userB): Promise<Conversation>` — throws `BlockedError` if either has blocked the other.
  - `createGroup(ownerId, title, memberIds): Promise<Conversation>`
  - `getConversation(id): Promise<Conversation | null>`
  - `listMembers(conversationId): Promise<Member[]>`
  - `isMember(conversationId, userId): Promise<boolean>`
  - `listConversationsFor(userId): Promise<(Conversation & { lastMessageAt: string | null; unread: boolean })[]>`
  - `addMember(conversationId, userId)`, `removeMember(conversationId, userId)`
  - `updateGroupMeta(conversationId, patch: { title?, description?, photoUrl? })`
  - `transferOwnership(conversationId, newOwnerId)`
  - `setMuted(conversationId, userId, muted: boolean)`
  - `markRead(conversationId, userId)`
  - `class BlockedError extends Error {}`

- [ ] **Step 1: Write `lib/conversations.ts`**

```ts
import { restService } from "./supabase";
import { isBlocked } from "./blocks";

type Row = Record<string, unknown>;

export class BlockedError extends Error {
  constructor() { super("Deze gebruiker heeft je geblokkeerd, of jij hen."); }
}

export type Conversation = {
  id: string;
  kind: "dm" | "group";
  title: string | null;
  description: string | null;
  photoUrl: string | null;
  ownerId: string | null;
  status: "active" | "closed" | "deleted";
  createdAt: string;
};

export type Member = { userId: string; joinedAt: string; lastReadAt: string | null; muted: boolean };

function toConversation(row: Row): Conversation {
  return {
    id: row.id as string,
    kind: row.kind as "dm" | "group",
    title: (row.title as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    photoUrl: (row.photo_url as string | null) ?? null,
    ownerId: (row.owner_id as string | null) ?? null,
    status: row.status as "active" | "closed" | "deleted",
    createdAt: row.created_at as string,
  };
}

function toMember(row: Row): Member {
  return {
    userId: row.user_id as string,
    joinedAt: row.joined_at as string,
    lastReadAt: (row.last_read_at as string | null) ?? null,
    muted: Boolean(row.muted),
  };
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const rows = await restService<Row[]>(`conversations?id=eq.${id}&select=*`);
  return rows[0] ? toConversation(rows[0]) : null;
}

export async function listMembers(conversationId: string): Promise<Member[]> {
  const rows = await restService<Row[]>(`conversation_members?conversation_id=eq.${conversationId}&select=*`);
  return rows.map(toMember);
}

export async function isMember(conversationId: string, userId: string): Promise<boolean> {
  const rows = await restService<Row[]>(
    `conversation_members?conversation_id=eq.${conversationId}&user_id=eq.${userId}&select=user_id`,
  );
  return rows.length > 0;
}

export async function findOrCreateDm(userA: string, userB: string): Promise<Conversation> {
  if (await isBlocked(userA, userB)) throw new BlockedError();

  // Find an existing DM containing exactly these two members: conversations
  // whose member set for kind='dm' includes both, intersected client-side
  // since PostgREST can't express "exact set of two" in one query cheaply
  // at this table size.
  const candidateIds = await restService<Row[]>(
    `conversation_members?user_id=eq.${userA}&select=conversation_id,conversations!inner(kind)&conversations.kind=eq.dm`,
  );
  for (const candidate of candidateIds) {
    const members = await listMembers(candidate.conversation_id as string);
    if (members.length === 2 && members.some((m) => m.userId === userB)) {
      return (await getConversation(candidate.conversation_id as string))!;
    }
  }

  const created = await restService<Row[]>("conversations", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({ kind: "dm" }),
  });
  const conversation = toConversation(created[0]!);
  await restService("conversation_members", {
    method: "POST",
    body: JSON.stringify([
      { conversation_id: conversation.id, user_id: userA },
      { conversation_id: conversation.id, user_id: userB },
    ]),
  });
  return conversation;
}

export async function createGroup(ownerId: string, title: string, memberIds: string[]): Promise<Conversation> {
  const created = await restService<Row[]>("conversations", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({ kind: "group", title, owner_id: ownerId }),
  });
  const conversation = toConversation(created[0]!);
  const allMembers = Array.from(new Set([ownerId, ...memberIds]));
  await restService("conversation_members", {
    method: "POST",
    body: JSON.stringify(allMembers.map((userId) => ({ conversation_id: conversation.id, user_id: userId }))),
  });
  return conversation;
}

export async function listConversationsFor(
  userId: string,
): Promise<(Conversation & { lastMessageAt: string | null; unread: boolean })[]> {
  const memberships = await restService<Row[]>(
    `conversation_members?user_id=eq.${userId}&select=conversation_id,last_read_at`,
  );
  const results = await Promise.all(
    memberships.map(async (membership) => {
      const conversation = await getConversation(membership.conversation_id as string);
      if (!conversation || conversation.status === "deleted") return null;
      const latest = await restService<Row[]>(
        `messages?conversation_id=eq.${conversation.id}&select=created_at&order=created_at.desc&limit=1`,
      );
      const lastMessageAt = (latest[0]?.created_at as string | undefined) ?? null;
      const lastReadAt = membership.last_read_at as string | null;
      return {
        ...conversation,
        lastMessageAt,
        unread: lastMessageAt !== null && (!lastReadAt || lastReadAt < lastMessageAt),
      };
    }),
  );
  return results.filter((row): row is NonNullable<typeof row> => row !== null);
}

export async function addMember(conversationId: string, userId: string): Promise<void> {
  await restService("conversation_members?on_conflict=conversation_id,user_id", {
    method: "POST",
    headers: { prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify({ conversation_id: conversationId, user_id: userId }),
  });
}

export async function removeMember(conversationId: string, userId: string): Promise<void> {
  await restService(`conversation_members?conversation_id=eq.${conversationId}&user_id=eq.${userId}`, {
    method: "DELETE",
  });
}

export async function updateGroupMeta(
  conversationId: string,
  patch: { title?: string; description?: string | null; photoUrl?: string | null },
): Promise<Conversation> {
  const body: Row = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.photoUrl !== undefined) body.photo_url = patch.photoUrl;
  const rows = await restService<Row[]>(`conversations?id=eq.${conversationId}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  return toConversation(rows[0]!);
}

export async function transferOwnership(conversationId: string, newOwnerId: string): Promise<void> {
  await restService(`conversations?id=eq.${conversationId}`, {
    method: "PATCH",
    body: JSON.stringify({ owner_id: newOwnerId }),
  });
}

export async function setMuted(conversationId: string, userId: string, muted: boolean): Promise<void> {
  await restService(`conversation_members?conversation_id=eq.${conversationId}&user_id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ muted }),
  });
}

export async function markRead(conversationId: string, userId: string): Promise<void> {
  await restService(`conversation_members?conversation_id=eq.${conversationId}&user_id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ last_read_at: new Date().toISOString() }),
  });
}
```

- [ ] **Step 2: Verify with a scratch script**

Two disposable test users: `findOrCreateDm(a, b)` then call it again with the arguments swapped — confirm the same conversation `id` comes back both times (find-not-recreate). Block one from the other, confirm the third call throws `BlockedError`. Separately, `createGroup` with three disposable users, confirm `listMembers` returns all three, `addMember`/`removeMember` a fourth, `updateGroupMeta`, `transferOwnership`, `setMuted`, `markRead`, and `listConversationsFor` each behave as expected. Clean up all rows and users.

Run: `npx tsx --env-file=artifacts/api-server/.env artifacts/api-server/scratch-verify-conversations.ts`

- [ ] **Step 3: Delete scratch script, typecheck, commit**

```bash
rm artifacts/api-server/scratch-verify-conversations.ts
pnpm --filter @workspace/api-server run typecheck
git add artifacts/api-server/src/lib/conversations.ts
git commit -m "Gespreksmodule: DM find-or-create, groepen, lidmaatschap, eigenaarschap"
```

---

### Task 7: Messages module — send (with `#ref`/`/ai`/`@mention` parsing), list, soft-delete

**Files:**
- Create: `artifacts/api-server/src/lib/messages.ts`

**Interfaces:**
- Consumes: `isMember` from `../lib/conversations`; `broadcast` from `../lib/supabase`; `restService`.
- Produces (used by Tasks 8, 10, 11, 12):
  - `type MessageRef = { subjectId: string; chapterId?: string; label: string }`
  - `type Message = { id, conversationId, senderId: string | null, kind: 'user'|'ai', body, photoUrl: string|null, references: MessageRef[], createdAt, deletedAt: string | null }`
  - `listMessages(conversationId, limit): Promise<Message[]>`
  - `insertMessage(conversationId, senderId: string | null, kind: 'user'|'ai', body, opts?: { photoUrl?: string; references?: MessageRef[] }): Promise<Message>` — inserts and broadcasts; does **not** interpret `/ai` or `@mention` itself (that's the route's job, since it needs to call other modules — see Task 10/11).
  - `extractMentionedUsernames(body: string): string[]` — regex `@[a-z0-9_]{3,24}` extraction, used by Task 11.
  - `softDeleteMessage(messageId): Promise<void>` — sitebeheerder-only, sets `deleted_at` and broadcasts a `message-deleted` event.

- [ ] **Step 1: Write `lib/messages.ts`**

```ts
import { restService, broadcast } from "./supabase";

type Row = Record<string, unknown>;

export type MessageRef = { subjectId: string; chapterId?: string; label: string };

export type Message = {
  id: string;
  conversationId: string;
  senderId: string | null;
  kind: "user" | "ai";
  body: string;
  photoUrl: string | null;
  references: MessageRef[];
  createdAt: string;
  deletedAt: string | null;
};

function toMessage(row: Row): Message {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    senderId: (row.sender_id as string | null) ?? null,
    kind: row.kind as "user" | "ai",
    body: row.deleted_at ? "Dit bericht is verwijderd door een beheerder." : (row.body as string),
    photoUrl: row.deleted_at ? null : ((row.photo_url as string | null) ?? null),
    references: row.deleted_at ? [] : ((row.references as MessageRef[] | null) ?? []),
    createdAt: row.created_at as string,
    deletedAt: (row.deleted_at as string | null) ?? null,
  };
}

export async function listMessages(conversationId: string, limit = 50): Promise<Message[]> {
  const rows = await restService<Row[]>(
    `messages?conversation_id=eq.${conversationId}&select=*&order=created_at.desc&limit=${limit}`,
  );
  return rows.map(toMessage).reverse();
}

/**
 * Inserts a message and broadcasts it to `conversation:<id>` immediately.
 * `authToken` is the sender's own bearer token, reused for the broadcast
 * call the same way every other broadcast() call site in this codebase
 * does — an AI-authored message (senderId null) has no user token, so
 * those call sites pass the token of whichever request triggered them
 * (the human's `/ai` message), which is always available since an AI
 * reply is always a response to a human request in the same handler.
 */
export async function insertMessage(
  authToken: string,
  conversationId: string,
  senderId: string | null,
  kind: "user" | "ai",
  body: string,
  opts: { photoUrl?: string; references?: MessageRef[] } = {},
): Promise<Message> {
  const rows = await restService<Row[]>("messages", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      conversation_id: conversationId,
      sender_id: senderId,
      kind,
      body,
      photo_url: opts.photoUrl ?? null,
      references: opts.references ?? [],
    }),
  });
  const message = toMessage(rows[0]!);
  await broadcast(authToken, `conversation:${conversationId}`, "new-message", { messageId: message.id });
  return message;
}

export function extractMentionedUsernames(body: string): string[] {
  const matches = body.match(/@([a-z0-9_]{3,24})/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.slice(1))));
}

export async function softDeleteMessage(authToken: string, conversationId: string, messageId: string): Promise<void> {
  await restService(`messages?id=eq.${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  });
  await broadcast(authToken, `conversation:${conversationId}`, "message-deleted", { messageId });
}
```

- [ ] **Step 2: Verify with a scratch script**

Create a disposable DM (reusing Task 6's `findOrCreateDm` with two fresh test users). `insertMessage` a plain user message, confirm `listMessages` returns it in order. `insertMessage` a second one with `references: [{subjectId: '<a real published subject id>', label: 'Test vak'}]`, confirm it round-trips. `softDeleteMessage` the first one, confirm `listMessages` now shows the redacted body/photoUrl/references for that message id while the second message is untouched. Clean up the conversation, its messages, and the two test users.

Run: `npx tsx --env-file=artifacts/api-server/.env artifacts/api-server/scratch-verify-messages.ts`

- [ ] **Step 3: Delete scratch script, typecheck, commit**

```bash
rm artifacts/api-server/scratch-verify-messages.ts
pnpm --filter @workspace/api-server run typecheck
git add artifacts/api-server/src/lib/messages.ts
git commit -m "Berichtenmodule: versturen+broadcast, referenties, zacht verwijderen"
```

---

### Task 8: `openapi.yaml` round 2 — conversations and messages, then the routes

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Create: `artifacts/api-server/src/routes/conversations.ts`
- Create: `artifacts/api-server/src/routes/messages.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`

**Interfaces:**
- Consumes: everything from `lib/conversations.ts` (Task 6) and `lib/messages.ts` (Task 7).
- Produces: `GET /conversations`, `POST /conversations/dm/:userId`, `POST /conversations/group`, `GET /conversations/:id`, `PATCH /conversations/:id` (group meta), `POST/DELETE /conversations/:id/members/:userId`, `POST /conversations/:id/transfer-ownership`, `POST /conversations/:id/mute`, `POST /conversations/:id/read`, `GET/POST /conversations/:id/messages`.

- [ ] **Step 1: Add schemas to `openapi.yaml`**

```yaml
    MessageReference:
      type: object
      required: [subjectId, label]
      properties:
        subjectId: { type: string }
        chapterId: { type: string }
        label: { type: string }

    Message:
      type: object
      required: [id, conversationId, senderId, kind, body, photoUrl, references, createdAt, deletedAt]
      properties:
        id: { type: string, format: uuid }
        conversationId: { type: string, format: uuid }
        senderId: { type: ["string", "null"], format: uuid }
        kind: { type: string, enum: [user, ai] }
        body: { type: string }
        photoUrl: { type: ["string", "null"] }
        references:
          type: array
          items: { $ref: "#/components/schemas/MessageReference" }
        createdAt: { type: string, format: date-time }
        deletedAt: { type: ["string", "null"], format: date-time }

    Conversation:
      type: object
      required: [id, kind, title, description, photoUrl, ownerId, status, createdAt, lastMessageAt, unread]
      properties:
        id: { type: string, format: uuid }
        kind: { type: string, enum: [dm, group] }
        title: { type: ["string", "null"] }
        description: { type: ["string", "null"] }
        photoUrl: { type: ["string", "null"] }
        ownerId: { type: ["string", "null"], format: uuid }
        status: { type: string, enum: [active, closed, deleted] }
        createdAt: { type: string, format: date-time }
        lastMessageAt: { type: ["string", "null"], format: date-time }
        unread: { type: boolean }

    ListConversationsResponse:
      type: object
      required: [conversations]
      properties:
        conversations:
          type: array
          items: { $ref: "#/components/schemas/Conversation" }

    CreateGroupInput:
      type: object
      required: [title, memberIds]
      properties:
        title: { type: string, minLength: 1, maxLength: 100 }
        memberIds:
          type: array
          items: { type: string, format: uuid }

    UpdateGroupInput:
      type: object
      properties:
        title: { type: string, minLength: 1, maxLength: 100 }
        description: { type: ["string", "null"], maxLength: 500 }
        photoUrl: { type: ["string", "null"] }

    TransferOwnershipInput:
      type: object
      required: [newOwnerId]
      properties:
        newOwnerId: { type: string, format: uuid }

    SetMutedInput:
      type: object
      required: [muted]
      properties:
        muted: { type: boolean }

    ListMessagesResponse:
      type: object
      required: [messages]
      properties:
        messages:
          type: array
          items: { $ref: "#/components/schemas/Message" }

    SendMessageInput:
      type: object
      required: [body]
      properties:
        body: { type: string, minLength: 1, maxLength: 4000 }
        photoUrl: { type: string }
        references:
          type: array
          items: { $ref: "#/components/schemas/MessageReference" }
```

- [ ] **Step 2: Add paths**

```yaml
  /conversations:
    get:
      operationId: listConversations
      tags: [social]
      summary: The signed-in user's DMs and group chats
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ListConversationsResponse" }

  /conversations/dm/{userId}:
    post:
      operationId: startDm
      tags: [social]
      summary: Find or create the DM with another user
      parameters:
        - name: userId
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Conversation" }
        "403":
          description: Blocked

  /conversations/group:
    post:
      operationId: createGroupRoute
      tags: [social]
      summary: Create a group chat
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/CreateGroupInput" }
      responses:
        "201":
          description: Created
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Conversation" }

  /conversations/{conversationId}:
    get:
      operationId: getConversationRoute
      tags: [social]
      summary: One conversation's metadata (member-only)
      parameters:
        - name: conversationId
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Conversation" }
        "403":
          description: Not a member
    patch:
      operationId: updateGroupRoute
      tags: [social]
      summary: Edit group metadata (groepseigenaar only)
      parameters:
        - name: conversationId
          in: path
          required: true
          schema: { type: string, format: uuid }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/UpdateGroupInput" }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Conversation" }
        "403":
          description: Not the groepseigenaar

  /conversations/{conversationId}/members/{userId}:
    post:
      operationId: addConversationMember
      tags: [social]
      summary: Add a member (groepseigenaar only)
      parameters:
        - name: conversationId
          in: path
          required: true
          schema: { type: string, format: uuid }
        - name: userId
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        "204":
          description: Added
    delete:
      operationId: removeConversationMember
      tags: [social]
      summary: Remove a member (groepseigenaar only)
      parameters:
        - name: conversationId
          in: path
          required: true
          schema: { type: string, format: uuid }
        - name: userId
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        "204":
          description: Removed

  /conversations/{conversationId}/transfer-ownership:
    post:
      operationId: transferOwnershipRoute
      tags: [social]
      summary: Transfer groepseigenaar to another member
      parameters:
        - name: conversationId
          in: path
          required: true
          schema: { type: string, format: uuid }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/TransferOwnershipInput" }
      responses:
        "204":
          description: Transferred

  /conversations/{conversationId}/mute:
    post:
      operationId: setConversationMuted
      tags: [social]
      summary: Mute/unmute a conversation for the signed-in user
      parameters:
        - name: conversationId
          in: path
          required: true
          schema: { type: string, format: uuid }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/SetMutedInput" }
      responses:
        "204":
          description: OK

  /conversations/{conversationId}/read:
    post:
      operationId: markConversationRead
      tags: [social]
      summary: Mark a conversation read up to now
      parameters:
        - name: conversationId
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        "204":
          description: OK

  /conversations/{conversationId}/messages:
    get:
      operationId: listConversationMessages
      tags: [social]
      summary: Message history for one conversation (member-only)
      parameters:
        - name: conversationId
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ListMessagesResponse" }
        "403":
          description: Not a member
    post:
      operationId: sendConversationMessage
      tags: [social]
      summary: Send a message (member-only); a body starting with "/ai " triggers an assistant reply
      parameters:
        - name: conversationId
          in: path
          required: true
          schema: { type: string, format: uuid }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/SendMessageInput" }
      responses:
        "201":
          description: Created
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Message" }
        "403":
          description: Not a member, or the conversation is closed/deleted
```

- [ ] **Step 3: Run codegen, typecheck**

```bash
pnpm --filter @workspace/api-spec run codegen
pnpm -w run typecheck
```

Watch for the same duplicate-export collision noted in Task 3; fix in `lib/api-zod/src/index.ts` the same way if it occurs.

- [ ] **Step 4: Write `routes/conversations.ts`**

```ts
import { Router, type IRouter, type Request } from "express";
import {
  AddConversationMemberParams,
  CreateGroupInputBody,
  GetConversationRouteParams,
  RemoveConversationMemberParams,
  SetConversationMutedBody,
  SetConversationMutedParams,
  StartDmParams,
  TransferOwnershipRouteBody,
  TransferOwnershipRouteParams,
  UpdateGroupRouteBody,
  UpdateGroupRouteParams,
} from "@workspace/api-zod";
import { getAuthenticatedUser } from "../lib/supabase";
import {
  addMember,
  BlockedError,
  createGroup,
  findOrCreateDm,
  getConversation,
  isMember,
  listConversationsFor,
  markRead,
  removeMember,
  setMuted,
  transferOwnership,
  updateGroupMeta,
} from "../lib/conversations";

const router: IRouter = Router();

async function requireUser(req: Request) {
  return getAuthenticatedUser(req.header("authorization"));
}

router.get("/conversations", async (req, res): Promise<void> => {
  const user = await requireUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    res.json({ conversations: await listConversationsFor(user.id) });
  } catch (error) {
    req.log.warn({ error }, "Could not list conversations");
    res.status(500).json({ error: "Gesprekken konden niet worden geladen." });
  }
});

router.post("/conversations/dm/:userId", async (req, res): Promise<void> => {
  const user = await requireUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = StartDmParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    res.json(await findOrCreateDm(user.id, params.data.userId));
  } catch (error) {
    if (error instanceof BlockedError) { res.status(403).json({ error: error.message }); return; }
    req.log.warn({ error }, "Could not start DM");
    res.status(500).json({ error: "Gesprek starten is mislukt." });
  }
});

router.post("/conversations/group", async (req, res): Promise<void> => {
  const user = await requireUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const input = CreateGroupInputBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Ongeldige groep." }); return; }
  try {
    res.status(201).json(await createGroup(user.id, input.data.title, input.data.memberIds));
  } catch (error) {
    req.log.warn({ error }, "Could not create group");
    res.status(500).json({ error: "Groep aanmaken is mislukt." });
  }
});

router.get("/conversations/:conversationId", async (req, res): Promise<void> => {
  const user = await requireUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = GetConversationRouteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldig gesprek." }); return; }
  try {
    if (!(await isMember(params.data.conversationId, user.id))) { res.status(403).json({ error: "Forbidden" }); return; }
    const conversation = await getConversation(params.data.conversationId);
    if (!conversation) { res.status(404).json({ error: "Niet gevonden." }); return; }
    res.json(conversation);
  } catch (error) {
    req.log.warn({ error }, "Could not load conversation");
    res.status(500).json({ error: "Gesprek kon niet worden geladen." });
  }
});

router.patch("/conversations/:conversationId", async (req, res): Promise<void> => {
  const user = await requireUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = UpdateGroupRouteParams.safeParse(req.params);
  const input = UpdateGroupRouteBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    const conversation = await getConversation(params.data.conversationId);
    if (!conversation || conversation.ownerId !== user.id) { res.status(403).json({ error: "Forbidden" }); return; }
    res.json(await updateGroupMeta(params.data.conversationId, input.data));
  } catch (error) {
    req.log.warn({ error }, "Could not update group");
    res.status(500).json({ error: "Groep aanpassen is mislukt." });
  }
});

router.post("/conversations/:conversationId/members/:userId", async (req, res): Promise<void> => {
  const user = await requireUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = AddConversationMemberParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    const conversation = await getConversation(params.data.conversationId);
    if (!conversation || conversation.ownerId !== user.id) { res.status(403).json({ error: "Forbidden" }); return; }
    await addMember(params.data.conversationId, params.data.userId);
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not add member");
    res.status(500).json({ error: "Lid toevoegen is mislukt." });
  }
});

router.delete("/conversations/:conversationId/members/:userId", async (req, res): Promise<void> => {
  const user = await requireUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = RemoveConversationMemberParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    const conversation = await getConversation(params.data.conversationId);
    if (!conversation || conversation.ownerId !== user.id) { res.status(403).json({ error: "Forbidden" }); return; }
    await removeMember(params.data.conversationId, params.data.userId);
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not remove member");
    res.status(500).json({ error: "Lid verwijderen is mislukt." });
  }
});

router.post("/conversations/:conversationId/transfer-ownership", async (req, res): Promise<void> => {
  const user = await requireUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = TransferOwnershipRouteParams.safeParse(req.params);
  const input = TransferOwnershipRouteBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    const conversation = await getConversation(params.data.conversationId);
    if (!conversation || conversation.ownerId !== user.id) { res.status(403).json({ error: "Forbidden" }); return; }
    if (!(await isMember(params.data.conversationId, input.data.newOwnerId))) {
      res.status(400).json({ error: "Deze gebruiker is geen lid van de groep." });
      return;
    }
    await transferOwnership(params.data.conversationId, input.data.newOwnerId);
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not transfer ownership");
    res.status(500).json({ error: "Eigenaarschap overdragen is mislukt." });
  }
});

router.post("/conversations/:conversationId/mute", async (req, res): Promise<void> => {
  const user = await requireUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = SetConversationMutedParams.safeParse(req.params);
  const input = SetConversationMutedBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    await setMuted(params.data.conversationId, user.id, input.data.muted);
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not set muted");
    res.status(500).json({ error: "Dempen is mislukt." });
  }
});

router.post("/conversations/:conversationId/read", async (req, res): Promise<void> => {
  const user = await requireUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = SetConversationMutedParams.safeParse(req.params); // same shape: { conversationId }
  if (!params.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    await markRead(params.data.conversationId, user.id);
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not mark read");
    res.status(500).json({ error: "Markeren als gelezen is mislukt." });
  }
});

export default router;
```

- [ ] **Step 5: Write `routes/messages.ts`**

```ts
import { Router, type IRouter } from "express";
import { ListConversationMessagesParams, SendConversationMessageBody, SendConversationMessageParams } from "@workspace/api-zod";
import { getAuthenticatedUser, restService } from "../lib/supabase";
import { getConversation, isMember } from "../lib/conversations";
import { extractMentionedUsernames, insertMessage, listMessages } from "../lib/messages";

const router: IRouter = Router();

router.get("/conversations/:conversationId/messages", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = ListConversationMessagesParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldig gesprek." }); return; }
  try {
    if (!(await isMember(params.data.conversationId, user.id))) { res.status(403).json({ error: "Forbidden" }); return; }
    res.json({ messages: await listMessages(params.data.conversationId) });
  } catch (error) {
    req.log.warn({ error }, "Could not list messages");
    res.status(500).json({ error: "Berichten konden niet worden geladen." });
  }
});

router.post("/conversations/:conversationId/messages", async (req, res): Promise<void> => {
  const token = req.header("authorization")!;
  const user = await getAuthenticatedUser(token);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = SendConversationMessageParams.safeParse(req.params);
  const input = SendConversationMessageBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Ongeldig bericht." }); return; }
  try {
    if (!(await isMember(params.data.conversationId, user.id))) { res.status(403).json({ error: "Forbidden" }); return; }
    const conversation = await getConversation(params.data.conversationId);
    if (!conversation || conversation.status !== "active") { res.status(403).json({ error: "Dit gesprek is gesloten." }); return; }

    const message = await insertMessage(token, params.data.conversationId, user.id, "user", input.data.body, {
      photoUrl: input.data.photoUrl,
      references: input.data.references,
    });

    // Task 10 (/ai) and Task 11 (@mentions) hook in here, after the human
    // message is stored, using `message`/`conversation`/`token` already in
    // scope — see those tasks for the exact code inserted at this point.

    res.status(201).json(message);
  } catch (error) {
    req.log.warn({ error }, "Could not send message");
    res.status(500).json({ error: "Bericht kon niet worden verstuurd." });
  }
});

export default router;
```

- [ ] **Step 6: Register both routers in `index.ts`, typecheck**

```bash
pnpm --filter @workspace/api-server run typecheck
```

- [ ] **Step 7: Verify with a scratch script**

Exercise the full lifecycle with 3 disposable users: start a DM, send a message, list it back; create a group with all 3, add/remove a 4th disposable user, update group meta, transfer ownership, mute, mark-read, list conversations and confirm `unread` flips correctly after a new message and after marking read. Clean up everything.

- [ ] **Step 8: Delete scratch script, commit**

```bash
rm artifacts/api-server/scratch-verify-conversation-routes.ts
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/src/routes/conversations.ts artifacts/api-server/src/routes/messages.ts artifacts/api-server/src/routes/index.ts
git commit -m "Gesprek- en berichtroutes: DM/groep CRUD, lidmaatschap, versturen/lijsten"
```

---

### Task 9: Photo upload (Supabase Storage) and quota enforcement

**Files:**
- Create: `artifacts/api-server/src/lib/social-storage.ts`
- Modify: `artifacts/api-server/src/routes/messages.ts` (add the upload endpoint)
- Modify: `lib/api-spec/openapi.yaml` (one more small addition — kept in this task since it's tightly coupled to this endpoint, rather than bundled into the round-2 batch)

**Interfaces:**
- Produces: `uploadConversationPhoto(conversationId, uploaderId, fileBuffer, mimeType): Promise<string>` (returns a signed URL), `checkPhotoQuota(conversationId, uploaderId): Promise<void>` (throws `QuotaExceededError`).
- Consumes: the `sharp` package for resizing — **check `artifacts/api-server/package.json` for an existing image-processing dependency before adding one**; if none exists, add `sharp` as a new dependency (`pnpm --filter @workspace/api-server add sharp`).

- [ ] **Step 1: Add the dependency if needed**

```bash
cd artifacts/api-server && grep -q '"sharp"' package.json || pnpm add sharp
```

- [ ] **Step 2: Write `lib/social-storage.ts`**

```ts
import sharp from "sharp";
import { restService } from "./supabase";

export class QuotaExceededError extends Error {
  constructor(scope: "user" | "group") {
    super(scope === "user" ? "Je opslaglimiet van 50MB is bereikt." : "De opslaglimiet van deze groep (200MB) is bereikt.");
  }
}

const USER_QUOTA_BYTES = 50 * 1024 * 1024;
const GROUP_QUOTA_BYTES = 200 * 1024 * 1024;

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function currentUsageBytes(conversationId: string, uploaderId: string, scope: "user" | "group"): Promise<number> {
  const filter = scope === "user"
    ? `messages?conversation_id=eq.${conversationId}&sender_id=eq.${uploaderId}&photo_url=not.is.null&select=photo_url`
    : `messages?conversation_id=eq.${conversationId}&photo_url=not.is.null&select=photo_url`;
  const rows = await restService<Record<string, unknown>[]>(filter);
  // Storage object size isn't stored on the message row; a cheap approximation
  // that avoids a second round-trip per photo is to cap by *count* at a
  // conservative average size instead of summing exact bytes — see the
  // "Explicitly deferred" note below.
  return rows.length * 300 * 1024; // assume ~300KB/photo post-compression
}

export async function checkPhotoQuota(conversationId: string, uploaderId: string): Promise<void> {
  if (!serviceKey || !url) throw new Error("Supabase service configuration is required.");
  const userUsage = await currentUsageBytes(conversationId, uploaderId, "user");
  if (userUsage >= USER_QUOTA_BYTES) throw new QuotaExceededError("user");
  const groupUsage = await currentUsageBytes(conversationId, uploaderId, "group");
  if (groupUsage >= GROUP_QUOTA_BYTES) throw new QuotaExceededError("group");
}

export async function uploadConversationPhoto(
  conversationId: string,
  fileBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  if (!serviceKey || !url) throw new Error("Supabase service configuration is required.");
  const resized = await sharp(fileBuffer).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  const path = `${conversationId}/${crypto.randomUUID()}.jpg`;

  const uploadResponse = await fetch(`${url}/storage/v1/object/social-photos/${path}`, {
    method: "POST",
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "image/jpeg" },
    body: resized,
  });
  if (!uploadResponse.ok) throw new Error(`Storage upload failed (${uploadResponse.status}).`);

  const signResponse = await fetch(`${url}/storage/v1/object/sign/social-photos/${path}`, {
    method: "POST",
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
    body: JSON.stringify({ expiresIn: 60 * 60 * 24 * 7 }), // 7 days; the client re-fetches the message list to refresh
  });
  if (!signResponse.ok) throw new Error(`Storage sign failed (${signResponse.status}).`);
  const { signedURL } = (await signResponse.json()) as { signedURL: string };
  return `${url}/storage/v1${signedURL}`;
}
```

**Note on the quota approximation:** summing exact photo byte sizes would require either storing a `size_bytes` column on `messages` (cleanest) or a `HEAD` request per photo (slow). Since this plan already touches the `messages` table in Task 1, if precision matters more than the estimate above, add a `photo_size_bytes int` column there in Task 1's migration and record the real `resized.length` when inserting the message in Step 4 below instead of estimating — call this out to whoever reviews Task 1 if precision turns out to matter in practice. Ship with the estimate first; it fails safe (undercounts slightly, never wildly over).

- [ ] **Step 3: Add the upload endpoint's schema to `openapi.yaml`**

```yaml
  /conversations/{conversationId}/photos:
    post:
      operationId: uploadConversationPhoto
      tags: [social]
      summary: Upload a photo for a subsequent message in this conversation (multipart/form-data, field "photo")
      parameters:
        - name: conversationId
          in: path
          required: true
          schema: { type: string, format: uuid }
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              type: object
              required: [photo]
              properties:
                photo: { type: string, format: binary }
      responses:
        "201":
          description: Uploaded
          content:
            application/json:
              schema:
                type: object
                required: [photoUrl]
                properties:
                  photoUrl: { type: string }
        "403":
          description: Not a member
        "413":
          description: Quota exceeded
```

Run `pnpm --filter @workspace/api-spec run codegen` and `pnpm -w run typecheck`.

- [ ] **Step 4: Add the route to `routes/messages.ts`**

This needs `multer` (or equivalent) for multipart parsing — check `package.json` first the same way as `sharp`; add if missing (`pnpm add multer @types/multer`).

```ts
import multer from "multer";
// ...
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

router.post("/conversations/:conversationId/photos", upload.single("photo"), async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = SendConversationMessageParams.safeParse(req.params); // same {conversationId} shape
  if (!params.success || !req.file) { res.status(400).json({ error: "Geen foto meegestuurd." }); return; }
  try {
    if (!(await isMember(params.data.conversationId, user.id))) { res.status(403).json({ error: "Forbidden" }); return; }
    await checkPhotoQuota(params.data.conversationId, user.id);
    const photoUrl = await uploadConversationPhoto(params.data.conversationId, req.file.buffer, req.file.mimetype);
    res.status(201).json({ photoUrl });
  } catch (error) {
    if (error instanceof QuotaExceededError) { res.status(413).json({ error: error.message }); return; }
    req.log.warn({ error }, "Could not upload photo");
    res.status(500).json({ error: "Uploaden is mislukt." });
  }
});
```

Add the two new imports (`checkPhotoQuota`, `uploadConversationPhoto`, `QuotaExceededError`) from `../lib/social-storage` to the top of the file.

- [ ] **Step 5: Verify with a scratch script**

Using a small in-memory JPEG buffer (e.g. a 10x10 solid-color image encoded with `sharp` itself inside the script), call `uploadConversationPhoto` directly against a disposable test conversation, confirm the returned URL is fetchable and returns image bytes, then delete the object via the Storage REST API (`DELETE /storage/v1/object/social-photos/<path>`) and the test conversation.

- [ ] **Step 6: Delete scratch script, typecheck, commit**

```bash
rm artifacts/api-server/scratch-verify-photo-upload.ts
pnpm --filter @workspace/api-server run typecheck
git add artifacts/api-server/package.json lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/src/lib/social-storage.ts artifacts/api-server/src/routes/messages.ts
git commit -m "Foto's: upload naar privé-bucket, compressie, quotum per gebruiker/groep"
```

---

### Task 10: `/ai` in chat

**Files:**
- Modify: `artifacts/api-server/src/routes/messages.ts` (fill in the hook point left in Task 8, Step 5)

**Interfaces:**
- Consumes: `claim_study_ai_request` RPC (existing, via `restService("rpc/claim_study_ai_request", ...)`, same call as `study-chat.ts`), `handleChatMessage` from `../lib/study-handler` (existing).

**Design decision this task locks in** (not fully specified by the spec, resolved here): the existing study assistant (`handleChatMessage`) is scoped to one subject and optionally one chapter — it needs a `subjectId` to ground its answer in that vak's content. A social conversation has no inherent subject. So: `/ai <question>` **requires** a `#vak` (or `#hoofdstuk`) reference in the *same* message (parsed from `input.data.references`, already stored via the composer's `#` picker built in Task 14). If none is present, the assistant replies with a plain message asking the user to add one, rather than calling `handleChatMessage` with no subject.

- [ ] **Step 1: Replace the hook-point comment in `routes/messages.ts`'s `POST /conversations/:conversationId/messages`**

```ts
    if (input.data.body.trim().toLowerCase().startsWith("/ai ")) {
      const question = input.data.body.trim().slice(4).trim();
      const subjectRef = (input.data.references ?? [])[0];
      if (!subjectRef) {
        await insertMessage(
          token,
          params.data.conversationId,
          null,
          "ai",
          "Vermeld eerst een vak met # zodat ik weet waarover je het hebt — bijvoorbeeld: /ai #Scheikunde wat is een redoxreactie?",
        );
      } else {
        const allowed = await restService<boolean>("rpc/claim_study_ai_request", {
          method: "POST",
          body: JSON.stringify({ p_user_id: user.id }),
        });
        if (!allowed) {
          await insertMessage(
            token,
            params.data.conversationId,
            null,
            "ai",
            "Je hebt net veel AI-verzoeken gedaan. Probeer het over een kwartier opnieuw.",
          );
        } else {
          const { handleChatMessage } = await import("../lib/study-handler");
          const reply = await handleChatMessage({
            userId: user.id,
            subjectId: subjectRef.subjectId,
            chapterId: subjectRef.chapterId ?? null,
            message: question,
          });
          await insertMessage(token, params.data.conversationId, null, "ai", reply.content);
        }
      }
    }
```

This runs after the human's message is already inserted and returned in `res.status(201).json(message)` above it — the AI reply arrives as a second message via its own broadcast, exactly like a normal follow-up message would, so the client doesn't need special-case handling for it beyond already knowing how to render `kind: 'ai'` messages (Task 14 covers that rendering).

- [ ] **Step 2: Verify with a scratch script**

Disposable test user + a real published subject's id. Send `/ai #<vaknaam> wat is <iets>?` with a matching reference — confirm two messages end up in the conversation (the human one, then an `ai` one with real content). Send `/ai zonder vak` with no reference — confirm the ai reply is the "vermeld eerst een vak" prompt, not a real answer. Clean up.

- [ ] **Step 3: Typecheck, commit**

```bash
pnpm --filter @workspace/api-server run typecheck
git add artifacts/api-server/src/routes/messages.ts
git commit -m "/ai in chat: hergebruikt studieassistent en bestaande AI-ratelimiter"
```

---

### Task 11: `@mention` notifications

**Files:**
- Modify: `artifacts/api-server/src/routes/messages.ts`

**Interfaces:**
- Consumes: `extractMentionedUsernames` from `../lib/messages` (Task 7); the `notifications` table shipped in the credits sub-project (`account_id`, `title`, `body`).

- [ ] **Step 1: Add mention handling, right after the `/ai` block from Task 10**

```ts
    const mentionedUsernames = extractMentionedUsernames(input.data.body);
    if (mentionedUsernames.length > 0) {
      const mentioned = await restService<Record<string, unknown>[]>(
        `profiles?username=in.(${mentionedUsernames.map((u) => encodeURIComponent(u)).join(",")})&select=user_id,username`,
      );
      const senderProfile = await restService<Record<string, unknown>[]>(
        `profiles?user_id=eq.${user.id}&select=display_name`,
      );
      const senderName = (senderProfile[0]?.display_name as string | undefined) ?? "Iemand";
      const conversationLabel = conversation.kind === "group" ? conversation.title ?? "een groepsapp" : "een gesprek";
      for (const row of mentioned) {
        const mentionedUserId = row.user_id as string;
        if (mentionedUserId === user.id) continue; // no self-notification
        if (!(await isMember(params.data.conversationId, mentionedUserId))) continue; // only notify actual members
        const muted = (await restService<Record<string, unknown>[]>(
          `conversation_members?conversation_id=eq.${params.data.conversationId}&user_id=eq.${mentionedUserId}&select=muted`,
        ))[0]?.muted;
        if (muted) continue;
        await restService("notifications", {
          method: "POST",
          body: JSON.stringify({
            account_id: mentionedUserId,
            title: `${senderName} vermeldde je`,
            body: `In ${conversationLabel}: "${input.data.body.slice(0, 120)}"`,
          }),
        });
      }
    }
```

- [ ] **Step 2: Verify with a scratch script**

Two disposable test users with profiles (usernames known). User A sends `@<B's username> kijk hier eens naar` in a DM they share. Confirm a `notifications` row with `account_id = B` was created. Send it again after muting the conversation for B — confirm no new notification row this time. Clean up.

- [ ] **Step 3: Typecheck, commit**

```bash
pnpm --filter @workspace/api-server run typecheck
git add artifacts/api-server/src/routes/messages.ts
git commit -m "@vermeldingen sturen een persoonlijke melding (respecteert dempen)"
```

---

### Task 12: Site-admin moderation — `openapi.yaml` round 3, then routes

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Create: `artifacts/api-server/src/routes/admin-social.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`

**Interfaces:**
- Consumes: `getConversation`, `listMembers` from `../lib/conversations`; `softDeleteMessage` from `../lib/messages`; `restService`.
- Produces: `GET /admin/groepsapps`, `POST /admin/groepsapps/:conversationId/close`, `POST /admin/groepsapps/:conversationId/delete`, `DELETE /admin/groepsapps/:conversationId/messages/:messageId`.

- [ ] **Step 1: Add schemas/paths to `openapi.yaml`**

```yaml
    AdminGroupSummary:
      type: object
      required: [id, title, ownerId, ownerEmail, memberCount, lastMessageAt, status, createdAt]
      properties:
        id: { type: string, format: uuid }
        title: { type: ["string", "null"] }
        ownerId: { type: ["string", "null"], format: uuid }
        ownerEmail: { type: ["string", "null"] }
        memberCount: { type: integer }
        lastMessageAt: { type: ["string", "null"], format: date-time }
        status: { type: string, enum: [active, closed, deleted] }
        createdAt: { type: string, format: date-time }

    ListAdminGroupsResponse:
      type: object
      required: [groups]
      properties:
        groups:
          type: array
          items: { $ref: "#/components/schemas/AdminGroupSummary" }
```

```yaml
  /admin/groepsapps:
    get:
      operationId: listAdminGroups
      tags: [admin]
      summary: All group chats, for abuse review (sitebeheerder only, hidden from regular users)
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ListAdminGroupsResponse" }
        "403":
          description: Forbidden

  /admin/groepsapps/{conversationId}/close:
    post:
      operationId: closeAdminGroup
      tags: [admin]
      summary: Close a group (read-only, reversible)
      parameters:
        - name: conversationId
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        "204":
          description: Closed
        "403":
          description: Forbidden

  /admin/groepsapps/{conversationId}/delete:
    post:
      operationId: deleteAdminGroup
      tags: [admin]
      summary: Permanently delete a group
      parameters:
        - name: conversationId
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        "204":
          description: Deleted
        "403":
          description: Forbidden

  /admin/groepsapps/{conversationId}/messages/{messageId}:
    delete:
      operationId: deleteAdminGroupMessage
      tags: [admin]
      summary: Soft-delete one message
      parameters:
        - name: conversationId
          in: path
          required: true
          schema: { type: string, format: uuid }
        - name: messageId
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        "204":
          description: Deleted
        "403":
          description: Forbidden
```

Run `pnpm --filter @workspace/api-spec run codegen` and `pnpm -w run typecheck`.

- [ ] **Step 2: Write `routes/admin-social.ts`**

```ts
import { Router, type IRouter, type Request } from "express";
import { CloseAdminGroupParams, DeleteAdminGroupMessageParams, DeleteAdminGroupParams } from "@workspace/api-zod";
import { getAuthenticatedUser, getServiceUserById, restService } from "../lib/supabase";
import { getConversation, listMembers } from "../lib/conversations";
import { softDeleteMessage } from "../lib/messages";

const router: IRouter = Router();

async function admin(req: Request) {
  const token = req.header("authorization");
  const user = await getAuthenticatedUser(token);
  return user?.isAdmin ? { user, token: token! } : null;
}

router.get("/admin/groepsapps", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const groups = await restService<Record<string, unknown>[]>(
      "conversations?kind=eq.group&select=*&order=created_at.desc",
    );
    const summaries = await Promise.all(
      groups.map(async (group) => {
        const conversationId = group.id as string;
        const [members, latest, owner] = await Promise.all([
          listMembers(conversationId),
          restService<Record<string, unknown>[]>(
            `messages?conversation_id=eq.${conversationId}&select=created_at&order=created_at.desc&limit=1`,
          ),
          group.owner_id ? getServiceUserById(group.owner_id as string) : Promise.resolve(null),
        ]);
        return {
          id: conversationId,
          title: (group.title as string | null) ?? null,
          ownerId: (group.owner_id as string | null) ?? null,
          ownerEmail: (owner as { email?: string } | null)?.email ?? null,
          memberCount: members.length,
          lastMessageAt: (latest[0]?.created_at as string | undefined) ?? null,
          status: group.status as "active" | "closed" | "deleted",
          createdAt: group.created_at as string,
        };
      }),
    );
    res.json({ groups: summaries });
  } catch (error) {
    req.log.warn({ error }, "Could not list admin groups");
    res.status(500).json({ error: "Groepen konden niet worden geladen." });
  }
});

router.post("/admin/groepsapps/:conversationId/close", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const params = CloseAdminGroupParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    await restService(`conversations?id=eq.${params.data.conversationId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "closed" }),
    });
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not close group");
    res.status(500).json({ error: "Sluiten is mislukt." });
  }
});

router.post("/admin/groepsapps/:conversationId/delete", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const params = DeleteAdminGroupParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    await restService(`conversations?id=eq.${params.data.conversationId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "deleted" }),
    });
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not delete group");
    res.status(500).json({ error: "Verwijderen is mislukt." });
  }
});

router.delete("/admin/groepsapps/:conversationId/messages/:messageId", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const params = DeleteAdminGroupMessageParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    const conversation = await getConversation(params.data.conversationId);
    if (!conversation) { res.status(404).json({ error: "Gesprek niet gevonden." }); return; }
    await softDeleteMessage(identity.token, params.data.conversationId, params.data.messageId);
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not delete message");
    res.status(500).json({ error: "Verwijderen is mislukt." });
  }
});

export default router;
```

- [ ] **Step 3: Register, typecheck**

```bash
pnpm --filter @workspace/api-server run typecheck
```

- [ ] **Step 4: Verify with a scratch script**

Create a disposable group with 2 test members and a message. Call the close/delete logic directly (or via HTTP against the running dev server as an admin), confirm `conversations.status` changes accordingly and that a closed group's `POST .../messages` (Task 8) now correctly returns 403 ("Dit gesprek is gesloten."). Soft-delete the message, confirm `listMessages` redacts it. Clean up.

- [ ] **Step 5: Delete scratch script, commit**

```bash
rm artifacts/api-server/scratch-verify-admin-social.ts
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/src/routes/admin-social.ts artifacts/api-server/src/routes/index.ts
git commit -m "Sitebeheerder-moderatie: groepen sluiten/verwijderen, berichten verwijderen"
```

---

### Task 13: Frontend — shared chat components (`MessageList`, `MessageComposer`, reference chip, realtime hook)

**Files:**
- Create: `artifacts/geslaagd-app/src/hooks/use-conversation-channel.ts`
- Create: `artifacts/geslaagd-app/src/components/chat/message-list.tsx`
- Create: `artifacts/geslaagd-app/src/components/chat/message-composer.tsx`
- Create: `artifacts/geslaagd-app/src/components/chat/reference-chip.tsx`

**Interfaces:**
- Consumes: `listConversationMessages`, `sendConversationMessage`, `uploadConversationPhoto` (generated clients from Tasks 8-9); `supabase` client from `@/lib/supabase` for the realtime channel.
- Produces: `useConversationChannel(conversationId): { messages: Message[]; sendTyping: () => void; typingUserIds: string[] }`; `<MessageList messages={...} currentUserId={...} />`; `<MessageComposer conversationId={...} onSent={...} />`; `<ReferenceChip reference={...} />`.

- [ ] **Step 1: Write `use-conversation-channel.ts`**

```ts
import { useEffect, useRef, useState } from 'react';
import { listConversationMessages, type Message } from '@workspace/api-client-react';
import { useAuth } from '@/auth/auth-context';
import { supabase } from '@/lib/supabase';

export function useConversationChannel(conversationId: string) {
  const { session } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const typingTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const reload = () => void listConversationMessages(conversationId).then((r) => setMessages(r.messages));
  useEffect(reload, [conversationId]);

  useEffect(() => {
    if (!session) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let disposed = false;
    void (async () => {
      await supabase.realtime.setAuth(session.access_token);
      if (disposed) return;
      channel = supabase
        .channel(`conversation:${conversationId}`, { config: { private: true } })
        .on('broadcast', { event: 'new-message' }, reload)
        .on('broadcast', { event: 'message-deleted' }, reload)
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          const userId = (payload as { userId?: string }).userId;
          if (!userId) return;
          setTypingUserIds((current) => (current.includes(userId) ? current : [...current, userId]));
          clearTimeout(typingTimeouts.current[userId]);
          typingTimeouts.current[userId] = setTimeout(() => {
            setTypingUserIds((current) => current.filter((id) => id !== userId));
          }, 3000);
        })
        .subscribe();
    })();
    return () => {
      disposed = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [conversationId, session]);

  const sendTyping = () => {
    if (!session) return;
    void supabase.realtime.setAuth(session.access_token).then(() => {
      const channel = supabase.channel(`conversation:${conversationId}`, { config: { private: true } });
      void channel.send({ type: 'broadcast', event: 'typing', payload: { userId: session.user.id } });
    });
  };

  return { messages, sendTyping, typingUserIds };
}
```

- [ ] **Step 2: Write `reference-chip.tsx`**

```tsx
import { useLocation } from 'wouter';
import { Hash } from 'lucide-react';
import type { MessageReference } from '@workspace/api-client-react';

export function ReferenceChip({ reference }: { reference: MessageReference }) {
  const [, setLocation] = useLocation();
  const href = reference.chapterId
    ? `/vakken/${reference.subjectId}/hoofdstuk/${reference.chapterId}`
    : `/vakken/${reference.subjectId}`;
  return (
    <button type="button" className="reference-chip" onClick={() => setLocation(href)}>
      <Hash size={12} aria-hidden="true" /> {reference.label}
    </button>
  );
}
```

- [ ] **Step 3: Write `message-list.tsx`** (message grouping: consecutive messages from the same sender within 5 minutes share one header)

```tsx
import { useEffect, useRef } from 'react';
import type { Message } from '@workspace/api-client-react';
import { ReferenceChip } from './reference-chip';

const GROUP_WINDOW_MS = 5 * 60 * 1000;

function fmtTime(value: string) {
  return new Date(value).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

export function MessageList({
  messages,
  currentUserId,
  senderLabel,
  typingLabel,
}: {
  messages: Message[];
  currentUserId: string;
  /** Resolves a sender id (or null for an AI message) to a display name. */
  senderLabel: (senderId: string | null) => string;
  typingLabel?: string | null;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, typingLabel]);

  return (
    <div className="message-list" ref={listRef}>
      {messages.map((message, index) => {
        const previous = messages[index - 1];
        const startsGroup =
          !previous ||
          previous.senderId !== message.senderId ||
          new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() > GROUP_WINDOW_MS;
        const isOwn = message.senderId === currentUserId;

        return (
          <div
            key={message.id}
            className={`message-row ${isOwn ? 'is-own' : ''} ${message.kind === 'ai' ? 'is-ai' : ''} ${startsGroup ? 'starts-group' : ''}`}
          >
            {startsGroup && (
              <div className="message-row-head">
                <strong>{senderLabel(message.senderId)}</strong>
                <span>{fmtTime(message.createdAt)}</span>
              </div>
            )}
            <div className="message-row-body">
              {message.deletedAt ? (
                <em>{message.body}</em>
              ) : (
                <>
                  <p>{message.body}</p>
                  {message.photoUrl && <img src={message.photoUrl} alt="" className="message-photo" />}
                  {message.references.length > 0 && (
                    <div className="message-references">
                      {message.references.map((ref, refIndex) => (
                        <ReferenceChip key={refIndex} reference={ref} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
      {typingLabel && <p className="message-typing">{typingLabel}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Write `message-composer.tsx`** (text + `#` reference picker + photo attach; the `/ai` recognition itself lives server-side, so the composer just sends whatever text was typed)

```tsx
import { useRef, useState, type FormEvent } from 'react';
import { sendConversationMessage, uploadConversationPhoto, type MessageReference } from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import { Paperclip, Send } from 'lucide-react';
import { SubjectReferencePicker } from './subject-reference-picker';

export function MessageComposer({
  conversationId,
  onSent,
  onTyping,
}: {
  conversationId: string;
  onSent: () => void;
  onTyping?: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [references, setReferences] = useState<MessageReference[]>([]);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const attachPhoto = async (file: File) => {
    setSending(true);
    try {
      const { photoUrl } = await uploadConversationPhoto(conversationId, { photo: file });
      await sendConversationMessage(conversationId, { body: draft.trim() || '📷', photoUrl, references });
      setDraft('');
      setReferences([]);
      onSent();
    } finally {
      setSending(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      await sendConversationMessage(conversationId, { body: draft.trim(), references });
      setDraft('');
      setReferences([]);
      onSent();
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="message-composer" onSubmit={(e) => void submit(e)}>
      <SubjectReferencePicker
        draft={draft}
        onPick={(ref) => setReferences((current) => [...current, ref])}
      />
      {references.length > 0 && (
        <div className="composer-references">
          {references.map((ref, index) => (
            <span key={index} className="composer-reference-tag">
              #{ref.label} <button type="button" onClick={() => setReferences((c) => c.filter((_, i) => i !== index))}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="composer-row">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => { const file = e.target.files?.[0]; if (file) void attachPhoto(file); }}
        />
        <Button type="button" variant="ghost" onClick={() => fileInputRef.current?.click()} aria-label="Foto bijvoegen">
          <Paperclip size={16} />
        </Button>
        <Input
          value={draft}
          onChange={(e) => { setDraft(e.target.value); onTyping?.(); }}
          placeholder="Typ een bericht, of /ai #vak je vraag"
          disabled={sending}
        />
        <Button type="submit" disabled={sending || !draft.trim()} aria-label="Versturen">
          <Send size={16} />
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 5: Write `subject-reference-picker.tsx`** (typing `#` opens a small searchable dropdown over `listSubjects`/`getSubjectDetail`'s chapters — reuses the existing subjects list endpoint, no new backend needed)

```tsx
import { useEffect, useState } from 'react';
import { listSubjects, type MessageReference, type SubjectSummary } from '@workspace/api-client-react';

export function SubjectReferencePicker({
  draft,
  onPick,
}: {
  draft: string;
  onPick: (reference: MessageReference) => void;
}) {
  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const hashIndex = draft.lastIndexOf('#');
  const query = hashIndex >= 0 ? draft.slice(hashIndex + 1) : null;

  useEffect(() => {
    if (query === null) return;
    void listSubjects().then(setSubjects);
  }, [query !== null]);

  if (query === null) return null;
  const matches = subjects.filter((s) => s.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);
  if (matches.length === 0) return null;

  return (
    <div className="reference-picker">
      {matches.map((subject) => (
        <button
          key={subject.id}
          type="button"
          onClick={() => onPick({ subjectId: subject.id, label: subject.name })}
        >
          #{subject.name}
        </button>
      ))}
    </div>
  );
}
```

(Chapter-level references are a straightforward extension of this same component — once a subject is picked, a second level could search that subject's chapters — but ship the subject-level picker first since it covers the primary use case; add chapter drill-down only if it turns out to matter in practice, per YAGNI.)

- [ ] **Step 6: Manual browser verification**

This task has no server route of its own to scratch-test — verify visually once Task 15 wires these components into a real page. Typecheck now regardless:

```bash
pnpm --filter geslaagd-app run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add artifacts/geslaagd-app/src/hooks/use-conversation-channel.ts artifacts/geslaagd-app/src/components/chat
git commit -m "Gedeelde chat-UI: MessageList/Composer, referentiepicker, realtime hook"
```

---

### Task 14: Frontend — mandatory onboarding gate

**Files:**
- Create: `artifacts/geslaagd-app/src/pages/onboarding-profile-page.tsx`
- Modify: `artifacts/geslaagd-app/src/auth/auth-context.tsx`
- Modify: `artifacts/geslaagd-app/src/App.tsx`

**Interfaces:**
- Consumes: `getMyProfileStatus`, `createMyProfile` (generated clients from Task 4).
- Produces: `AuthContextValue.needsProfile: boolean` (mirrors the existing `isAdmin` derivation pattern — computed from a fetched flag, not stored separately).

- [ ] **Step 1: `auth-context.tsx`** — fetch profile status once per session (alongside the existing session-registration effect), expose `needsProfile`

Add a `needsProfile: boolean | null` state (`null` = not yet checked), set via `getMyProfileStatus()` in the same effect block that already runs on `user`/`session` becoming available (the one registering the session — Task 14 of the credits plan already established this pattern for notifications; follow it identically here for profile status).

- [ ] **Step 2: `onboarding-profile-page.tsx`**

A form collecting username (validated against the same `^[a-z0-9_]{3,24}$` pattern client-side before submit, with a clear "gebruikersnaam is al in gebruik" error surfaced from the 409 response), display name, institution, study program, description, and an avatar choice (a small fixed set of default avatar images stored as static assets, or an upload using the same photo pipeline as Task 9's `uploadConversationPhoto` — reuse it by uploading to a conversation-less path, e.g. extend `uploadConversationPhoto`'s route to also accept a `POST /profiles/me/avatar` variant using the same underlying `uploadConversationPhoto`/`social-photos` bucket function with a `profile-avatars/` path prefix instead of a conversation id). On success, calls `createMyProfile` then redirects to `/mijn-leeromgeving`.

- [ ] **Step 3: Route guard in `App.tsx`**

Add `<Route path="/onboarding/profiel" component={OnboardingProfilePage} />`, and in the top-level `Router()` component, redirect to it whenever `needsProfile === true` and the current path isn't already `/onboarding/profiel`, `/auth`, or `/auth/herstel-wachtwoord` (mirroring the existing "redirect to `/mijn-leeromgeving` if already logged in on `/auth`" pattern already in `auth-page.tsx`).

- [ ] **Step 4: Manual browser verification**

Sign up a fresh test account (trial or key-based, either works), confirm it's redirected to the onboarding page before it can reach anything else, complete it, confirm it lands on the normal dashboard and isn't redirected back.

- [ ] **Step 5: Typecheck, commit**

```bash
pnpm --filter geslaagd-app run typecheck
git add artifacts/geslaagd-app/src/pages/onboarding-profile-page.tsx artifacts/geslaagd-app/src/auth/auth-context.tsx artifacts/geslaagd-app/src/App.tsx
git commit -m "Verplichte profiel-onboarding na aanmelden"
```

---

### Task 15: Frontend — directory, profile page, inbox, conversation page, group settings

**Files:**
- Create: `artifacts/geslaagd-app/src/pages/social-directory-page.tsx`
- Create: `artifacts/geslaagd-app/src/pages/profile-page.tsx`
- Create: `artifacts/geslaagd-app/src/pages/inbox-page.tsx`
- Create: `artifacts/geslaagd-app/src/pages/conversation-page.tsx`
- Modify: `artifacts/geslaagd-app/src/App.tsx`, `study-sidebar.tsx`

**Interfaces:**
- Consumes: `listDirectory`, `getProfileById`, `blockUserRoute`/`unblockUserRoute`, `listConversations`, `startDm`, `createGroupRoute`, `getConversationRoute`, `updateGroupRoute`, `addConversationMember`/`removeConversationMember`, `transferOwnershipRoute`, `setConversationMuted`, `markConversationRead`, `useConversationChannel`, `MessageList`, `MessageComposer` from Task 13.

- [ ] **Step 1: `social-directory-page.tsx`** — search input + profile cards (avatar, name, `@username`, study program), each linking to `/profielen/:userId`. Follows the existing `AdminAccountsPage`-style search-with-debounce pattern (350ms debounce on the query before calling `listDirectory`).

- [ ] **Step 2: `profile-page.tsx`** — fetches `getProfileById(userId)`; if `isBlocked`, renders only "Je kunt dit profiel niet bekijken." and nothing else; otherwise renders name/avatar/institution/study/description/vakken plus a "Stuur bericht" button that calls `startDm(userId)` and navigates to `/gesprekken/:conversationId`, and a "Blokkeren"/"Deblokkeren" toggle.

- [ ] **Step 3: `inbox-page.tsx`** — `listConversations()`, rendered as a list sorted by `lastMessageAt` desc, unread ones bolded with a dot (per the `unread` field already computed server-side in Task 6), each row navigating to `/gesprekken/:id`. A "Nieuwe groep" button opens a small dialog: title + member picker (reuses the directory search) → `createGroupRoute`.

- [ ] **Step 4: `conversation-page.tsx`** — the core chat screen. On mount: `getConversationRoute(id)` for metadata, `markConversationRead(id)` (so opening it clears the unread dot), then `useConversationChannel(id)` for live messages. Renders `<MessageList>` + `<MessageComposer onSent={...}>`. For `kind === 'group'`, a header shows the group title/photo and — only when `ownerId === currentUserId` — a settings affordance exposing: edit title/description/photo (`updateGroupRoute`), add/remove members (`addConversationMember`/`removeConversationMember`, member picker reusing the directory search), transfer ownership (`transferOwnershipRoute`, picking from current members), and a mute toggle (`setConversationMuted`) available to any member regardless of ownership.

- [ ] **Step 5: Routing and nav**

```tsx
<Route path="/social" component={SocialDirectoryPage} />
<Route path="/profielen/:userId">{(params) => <ProfilePage userId={params.userId} />}</Route>
<Route path="/gesprekken" component={InboxPage} />
<Route path="/gesprekken/:conversationId">{(params) => <ConversationPage conversationId={params.conversationId} />}</Route>
```

Add `{ href: '/social', label: 'Studenten', icon: Users2 }` and `{ href: '/gesprekken', label: 'Gesprekken', icon: MessageSquare }` to `STUDY_NAV` in `study-sidebar.tsx`, and extend `app-shell.tsx`'s `sectionFor()` path matcher to include `/social`, `/profielen`, and `/gesprekken` under `'study'`.

- [ ] **Step 6: Manual browser verification**

With two test accounts (two browser sessions, or one + a scratch-created second account you log into manually): search the directory, open a profile, start a DM, send a message, confirm it appears live in the other session without a reload. Create a group with both, verify group settings only show for the owner. Block the other account and confirm the profile view and message-send both correctly refuse.

- [ ] **Step 7: Typecheck, commit**

```bash
pnpm --filter geslaagd-app run typecheck
git add artifacts/geslaagd-app/src/pages/social-directory-page.tsx artifacts/geslaagd-app/src/pages/profile-page.tsx artifacts/geslaagd-app/src/pages/inbox-page.tsx artifacts/geslaagd-app/src/pages/conversation-page.tsx artifacts/geslaagd-app/src/App.tsx artifacts/geslaagd-app/src/components/shell/study-sidebar.tsx artifacts/geslaagd-app/src/components/shell/app-shell.tsx
git commit -m "Social-UI: directory, profielpagina, inbox, gespreksscherm, groepsinstellingen"
```

---

### Task 16: Retrofit the AI study-chat panel onto the shared chat UI

**Files:**
- Modify: `artifacts/geslaagd-app/src/components/study/chat-panel.tsx`

**Interfaces:**
- Consumes: `MessageList` (Task 13) — **not** `useConversationChannel`, since the study chat isn't a `conversations` row; it keeps its own `listChatMessages`/`sendChatMessage` data flow and simply renders through the shared list/grouping component instead of its bespoke markup.

- [ ] **Step 1: Adapt `ChatMessage` shape to `MessageList`'s expected shape at the render boundary**

`MessageList` expects `{id, senderId: string|null, kind, body, photoUrl, references, createdAt, deletedAt}` (the social `Message` type). The study chat's `ChatMessage` has `{id, role: 'student'|'assistant', content, citations, createdAt}` — map at render time rather than changing either backend type:

```tsx
const asSocialMessage = (message: ChatMessage) => ({
  id: message.id,
  senderId: message.role === 'student' ? 'me' : null,
  kind: (message.role === 'assistant' ? 'ai' : 'user') as 'user' | 'ai',
  body: message.content,
  photoUrl: null,
  references: [],
  createdAt: message.createdAt,
  deletedAt: null,
});
```

Replace the existing hand-rolled `.chat-panel-messages` / `.chat-message` markup block with:

```tsx
<MessageList
  messages={messages.map(asSocialMessage)}
  currentUserId="me"
  senderLabel={(senderId) => (senderId ? 'Jij' : 'Studieassistent')}
/>
```

The `CitedText` rendering for assistant messages (citation tags) is a per-content-type concern `MessageList` doesn't need to know about — pass a `renderBody` override prop instead of hardcoding `<p>{body}</p>` inside `MessageList`. **Before this task, go back and add that prop to `MessageList` in Task 13** (`renderBody?: (message: Message) => ReactNode`, defaulting to `<p>{message.body}</p>` when absent) so the citation-tag behavior isn't lost in the retrofit. Use it here as:

```tsx
renderBody={(m) => {
  const original = messages.find((msg) => msg.id === m.id)!;
  return original.role === 'assistant'
    ? <CitedText content={original.content} citations={original.citations ?? []} />
    : <p>{original.content}</p>;
}}
```

- [ ] **Step 2: Manual browser verification**

Open a chapter's study chat, ask a question, confirm the reply still renders citation tags correctly and the panel now visually matches the new grouped-message style (avatar/name header only on the first message of a run).

- [ ] **Step 3: Typecheck, commit**

```bash
pnpm --filter geslaagd-app run typecheck
git add artifacts/geslaagd-app/src/components/study/chat-panel.tsx artifacts/geslaagd-app/src/components/chat/message-list.tsx
git commit -m "AI-studiechat hergebruikt de gedeelde MessageList-component"
```

---

### Task 17: Retrofit the support-ticket thread onto realtime + the shared chat UI

**Files:**
- Modify: `artifacts/api-server/src/routes/support.ts` (broadcast on new message)
- Modify: `artifacts/geslaagd-app/src/pages/admin-support-page.tsx`
- Modify: `artifacts/geslaagd-app/src/pages/support-page.tsx` (the student-facing ticket view, if it also polls — check first)

**Interfaces:**
- Consumes: `broadcast` from `../lib/supabase` (backend); `MessageList` (Task 13, frontend).

- [ ] **Step 1: Backend — broadcast on new ticket messages**

In `artifacts/api-server/src/routes/support.ts`, after each successful `insertMessage(...)` call (both the student-facing `POST /support/tickets/:ticketId/messages` route and the ticket-creation route), add a broadcast:

```ts
await broadcast(req.header("authorization")!, `ticket:${ticket.id}`, "new-message", {});
```

Import `broadcast` from `../lib/supabase` at the top of the file alongside the existing `getAuthenticatedUser` import.

- [ ] **Step 2: Frontend — subscribe instead of polling, render via `MessageList`**

In `admin-support-page.tsx`, remove the `useLivePoll(() => load(true), { enabled: state === 'ready', intervalMs: 8_000 })` call and replace it with a realtime subscription to `ticket:${selectedId}` (same subscribe/unsubscribe pattern as `use-conversation-channel.ts`, inlined here or factored into a tiny shared `useBroadcastChannel(topic, event, onEvent)` hook if that dedup feels worth it — YAGNI-check this against how much code it actually saves before extracting it). Replace the hand-rolled `.support-message-list` markup with `<MessageList>`, mapping `SupportMessage` the same way Task 16 mapped `ChatMessage` (`sender: 'user'|'admin'` → `senderId`/`kind`, using `message.senderEmail` as the label instead of the generic "Student"/"Beheerder" fallback already in place).

- [ ] **Step 3: Check `support-page.tsx` for the same polling pattern**

```bash
grep -n "useLivePoll\|setInterval" artifacts/geslaagd-app/src/pages/support-page.tsx
```

If it polls too, apply the same realtime-subscription swap there.

- [ ] **Step 4: Manual browser verification**

Open a ticket as a student and as an admin in two sessions; send a reply from one, confirm it appears in the other within a second, no 8-second lag.

- [ ] **Step 5: Typecheck, commit**

```bash
pnpm -w run typecheck
git add artifacts/api-server/src/routes/support.ts artifacts/geslaagd-app/src/pages/admin-support-page.tsx artifacts/geslaagd-app/src/pages/support-page.tsx
git commit -m "Supportticket-thread: realtime i.p.v. pollen, gedeelde chat-UI"
```

---

### Task 18: Site-admin groepsapps moderation page

**Files:**
- Create: `artifacts/geslaagd-app/src/pages/admin-groepsapps-page.tsx`
- Modify: `artifacts/geslaagd-app/src/App.tsx`, `admin-sidebar.tsx`

**Interfaces:**
- Consumes: `listAdminGroups`, `closeAdminGroup`, `deleteAdminGroup` (Task 12 generated clients).

- [ ] **Step 1: `admin-groepsapps-page.tsx`** — follows the `AdminShell` + `account-list`/`account-row` visual pattern already used everywhere else in `/beheer`. Each row: title, groepseigenaar email, member count, last activity, status badge, with "Sluiten" / "Heropenen" (toggling based on current status) and "Verwijderen" (behind a confirm dialog, same `Dialog`/`DialogFooter` pattern as `admin-accounts-page.tsx`'s block/delete confirmation).

- [ ] **Step 2: Routing and nav**

`<Route path="/beheer/groepsapps" component={AdminGroepsappsPage} />`, and `{ href: '/beheer/groepsapps', label: 'Groepsapps', hint: 'Alle groepen, voor misbruikdetectie', icon: Users2 }` added to `ADMIN_NAV` — explicitly **not** linked from anywhere in the student-facing UI, matching the spec's "verborgen voor gewone gebruikers" (the route itself is still protected server-side by the `isAdmin` check in Task 12's routes regardless of whether the nav link is hidden — hiding the nav entry is a UX nicety, not the actual access control).

- [ ] **Step 3: Manual browser verification**

As an admin, view the page with the test group(s) created during earlier manual verification passes; close one, confirm regular members can no longer send in it (403, per Task 8's status check); delete another, confirm it disappears from both the moderation list and the owner's inbox.

- [ ] **Step 4: Typecheck, commit**

```bash
pnpm --filter geslaagd-app run typecheck
git add artifacts/geslaagd-app/src/pages/admin-groepsapps-page.tsx artifacts/geslaagd-app/src/App.tsx artifacts/geslaagd-app/src/components/shell/admin-sidebar.tsx
git commit -m "Beheer: verborgen groepsapp-moderatiepagina (sluiten/verwijderen)"
```

---

## Self-Review Notes

- **Spec coverage:** onboarding gate → Task 14; directory/blocking → Tasks 4-5, 15; DMs/groups/ownership → Tasks 6, 8, 15; `#vak`/`#hoofdstuk` references → Tasks 7-8, 13; photos+quota → Task 9; `/ai` → Task 10 (with its underlying design gap — no inherent subject scope for a social conversation — explicitly resolved rather than left ambiguous: require a `#vak` reference); `@mention` notifications → Task 11; sitebeheerder moderation (both close-as-readonly and delete, plus per-message delete) → Tasks 12, 18; shared Discord-like UI retrofitted onto both pre-existing chat surfaces → Tasks 13, 16, 17; message grouping/unread/typing/mute/mentions "ideas" section → folded into Tasks 6 (unread, mute), 7 (mentions extraction), 11 (mention notifications), 13 (grouping, typing).
- **Placeholder scan:** no TBDs; the one place this plan makes an explicit judgment call beyond the spec (the `/ai`-needs-a-`#vak`-reference resolution, and the photo-quota byte-count approximation) is called out by name as a decision, with its reasoning, not left as an open question.
- **Type consistency:** `MessageReference{subjectId, chapterId?, label}` and `Message{id, conversationId, senderId, kind, body, photoUrl, references, createdAt, deletedAt}` are defined once in Task 7/8 and reused verbatim by every later task (13 to 17) without renaming.
- **Ordering dependency called out explicitly:** Task 4 defines a throwaway inline `isBlockedBetween` before Task 5's real `lib/blocks.ts` exists, with Task 5 Step 2 stating exactly what to delete and replace — this is deliberate (profiles as the more foundational piece), not an oversight.
