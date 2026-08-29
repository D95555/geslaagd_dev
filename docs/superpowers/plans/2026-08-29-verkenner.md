# Verkenner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a searchable admin "Verkenner" (object-explorer) over the study pipeline's object graph — subjects, chapters, content, sources, crawls, tasks — with linked decisions/logs, inline title editing, and a quick object-id/URL lookup.

**Architecture:** Subject-rooted read aggregation. One new Express router (`admin-verkenner.ts`) that reads via `restService` (service-role REST calls to Supabase PostgREST, following every existing admin route's pattern) and assembles a graph payload per subject; one polymorphic object-detail endpoint keyed by `type`; two title-PATCH endpoints. One new React admin page that self-gates on a 403, built from small reusable subcomponents under `components/admin/verkenner/`.

**Tech Stack:** Express 5 + Zod (backend), React + TanStack (frontend), Supabase PostgREST via `restService`, OpenAPI + Orval codegen for the typed client.

**Spec:** `docs/superpowers/specs/2026-08-29-verkenner-design.md`

## Global Constraints

- All admin-gating is self-gate in the page (catch a 403, show `<AdminDenied/>`) + server-side `admin()` 403 check — never in the router switch. This is the existing pattern in every admin route/page in this repo; do not invent a different one.
- No new database tables or columns. Fase 1 is read-aggregation + two title PATCHes only.
- Title edits are silent PATCHes — no audit log entry (confirmed decision in the spec).
- `content_type` and `task_type` are typed as plain `string` in OpenAPI (not strict enums), matching the existing `AdminSubjectContentPreview`/`PipelineTask` schemas — do not introduce stricter typing than the rest of the codebase uses for these two fields.
- Every new backend file follows the `Row = Record<string, unknown>` + `restService<Row[]>(...)` + hand-written `toX(row)` mapper pattern used in every existing route file (`crawl.ts`, `sources.ts`, `subjects.ts`, `admin-pipeline.ts`). Do not introduce an ORM or query builder.
- Every new frontend file follows the existing admin page pattern: raw generated async functions (not React Query hooks — this codebase calls generated functions directly from `useEffect`), `useState`/`useEffect` `load()`, states `'loading' | 'ready' | 'forbidden' | 'error'`.

---

## File Structure

**Backend — new:**
- `artifacts/api-server/src/routes/admin-verkenner.ts` — all six Verkenner endpoints.

**Backend — modify:**
- `lib/api-spec/openapi.yaml` — new `admin-verkenner` tag, 5 paths, ~10 schemas.
- `artifacts/api-server/src/routes/index.ts` — register the new router.

**Frontend — new:**
- `artifacts/geslaagd-app/src/components/admin/verkenner/object-type-meta.tsx` — the shared icon/label/color map per object type.
- `artifacts/geslaagd-app/src/components/admin/verkenner/inline-editable-title.tsx` — shared click-to-edit title component (subject name + chapter title both use it).
- `artifacts/geslaagd-app/src/components/admin/verkenner/decision-card.tsx` — the triage-decision card.
- `artifacts/geslaagd-app/src/components/admin/verkenner/curriculum-tree.tsx` — chapters → content rows, expandable.
- `artifacts/geslaagd-app/src/components/admin/verkenner/object-panel.tsx` — the click-through detail panel (content/source/crawl/task), including logs via the existing `LogLine`.
- `artifacts/geslaagd-app/src/pages/admin-verkenner-page.tsx` — the page: search, subject list, lookup box, assembles the above.

**Frontend — modify:**
- `artifacts/geslaagd-app/src/App.tsx` — register `/beheer/verkenner`.
- `artifacts/geslaagd-app/src/components/admin/admin-shell.tsx` — one new `NAV` entry.

**Reused as-is, no changes needed:**
- `admin(req)` 403-helper pattern (copied, not imported — every route file has its own local copy, matching existing convention).
- `loadTaskLogs(taskId)` from `lib/pipeline-tasks/task-log.ts`.
- `loadSubjectChapters(subjectId)` from `lib/pipeline-tasks/context.ts`.
- `restService` from `lib/supabase.ts`.
- `LogLine` and `taskTypeLabel`, already exported from `components/admin/task-detail.tsx` — no refactor needed (verified: both are already `export`ed).
- `AdminShell`/`AdminDenied` from `components/admin/admin-shell.tsx`.
- The existing `CrawlSummary` and `PipelineLogEntry` OpenAPI schemas — reused by `$ref`, not redefined.

---

### Task 1: OpenAPI schemas and paths for the Verkenner

**Files:**
- Modify: `lib/api-spec/openapi.yaml`

**Interfaces:**
- Produces: the Zod types and generated client functions every later backend and frontend task imports: `VerkennerSubjectSummary`, `ListVerkennerSubjectsResponse`, `ListVerkennerSubjectsQueryParams`, `VerkennerDecision`, `VerkennerContentSummary`, `VerkennerChapterSummary`, `VerkennerTaskSummary`, `GetVerkennerSubjectParams`, `VerkennerSubjectDetailResponse`, `VerkennerObjectType`, `GetVerkennerObjectParams`, `VerkennerObjectDetailResponse`, `LookupVerkennerObjectQueryParams`, `VerkennerLookupResponse`, `UpdateVerkennerSubjectTitleParams`, `UpdateVerkennerSubjectTitleInput`, `UpdateVerkennerChapterTitleParams`, `UpdateVerkennerChapterTitleInput`.

- [ ] **Step 1: Add the new schemas**

Open `lib/api-spec/openapi.yaml`. Find the `CrawlSubject` schema (search for `    CrawlSubject:`) and insert the following new schemas directly after the last schema in the `# ─── Study Module ──────` section (end of file, after `SubjectDetail` and whatever follows it — append at the end of the `schemas:` map, before any top-level key that comes after `components:`). Paste this block:

```yaml
    VerkennerSubjectSummary:
      type: object
      required: [id, name, yearLevel, status, publishStatus, chapterCount, createdAt]
      properties:
        id: { type: string, format: uuid }
        name: { type: string }
        yearLevel: { type: string, enum: [havo_vwo_bovenbouw, universitair] }
        status: { type: string, enum: [pending, active, denied, needs_refinement] }
        publishStatus: { type: string, enum: [incomplete, ready, published] }
        chapterCount: { type: ["integer", "null"] }
        createdAt: { type: string }
    ListVerkennerSubjectsResponse:
      type: object
      required: [subjects]
      properties:
        subjects:
          type: array
          items: { $ref: "#/components/schemas/VerkennerSubjectSummary" }
    VerkennerDecision:
      type: object
      properties:
        taskId: { type: ["string", "null"], format: uuid }
        approved: { type: ["boolean", "null"] }
        reason: { type: ["string", "null"] }
        suggestions: { type: ["string", "null"] }
        model: { type: ["string", "null"] }
        summary: { type: ["string", "null"] }
        requestStatus: { type: ["string", "null"], enum: [pending, approved, denied, needs_refinement, null] }
        requestAdminNote: { type: ["string", "null"] }
    VerkennerContentSummary:
      type: object
      required: [id, contentType, version, status]
      properties:
        id: { type: string, format: uuid }
        contentType: { type: string }
        version: { type: integer }
        status: { type: string, enum: [generating, ready, failed] }
    VerkennerChapterSummary:
      type: object
      required: [chapter, content, sourceCount]
      properties:
        chapter: { $ref: "#/components/schemas/Chapter" }
        content:
          type: array
          items: { $ref: "#/components/schemas/VerkennerContentSummary" }
        sourceCount: { type: integer }
    VerkennerTaskSummary:
      type: object
      required: [id, taskType, status, summary]
      properties:
        id: { type: string, format: uuid }
        taskType: { type: string }
        status: { type: string, enum: [waiting, ready, running, done, failed] }
        summary: { type: ["string", "null"] }
    VerkennerSubjectDetail:
      type: object
      required: [id, name, yearLevel, status, publishStatus, description, difficultyLevel, adminNote, requestedBy]
      properties:
        id: { type: string, format: uuid }
        name: { type: string }
        yearLevel: { type: string, enum: [havo_vwo_bovenbouw, universitair] }
        status: { type: string, enum: [pending, active, denied, needs_refinement] }
        publishStatus: { type: string, enum: [incomplete, ready, published] }
        description: { type: ["string", "null"] }
        difficultyLevel: { type: ["string", "null"] }
        adminNote: { type: ["string", "null"] }
        requestedBy: { type: ["string", "null"] }
    VerkennerSubjectDetailResponse:
      type: object
      required: [subject, decision, chapters, subjectContent, crawls, tasks]
      properties:
        subject: { $ref: "#/components/schemas/VerkennerSubjectDetail" }
        decision: { $ref: "#/components/schemas/VerkennerDecision" }
        chapters:
          type: array
          items: { $ref: "#/components/schemas/VerkennerChapterSummary" }
        subjectContent:
          type: array
          items: { $ref: "#/components/schemas/VerkennerContentSummary" }
        crawls:
          type: array
          items: { $ref: "#/components/schemas/CrawlSummary" }
        tasks:
          type: array
          items: { $ref: "#/components/schemas/VerkennerTaskSummary" }
    VerkennerObjectDetailResponse:
      type: object
      required: [type, id, logs]
      properties:
        type: { type: string, enum: [chapter, content, source, crawl, task] }
        id: { type: string, format: uuid }
        logs:
          type: array
          items: { $ref: "#/components/schemas/PipelineLogEntry" }
        chapterTitle: { type: ["string", "null"] }
        chapterDescription: { type: ["string", "null"] }
        chapterIsImportant: { type: ["boolean", "null"] }
        chapterTopicTags:
          type: ["array", "null"]
          items: { type: string }
        chapterStatus: { type: ["string", "null"], enum: [pending, ready, null] }
        contentType: { type: ["string", "null"] }
        contentVersion: { type: ["integer", "null"] }
        contentStatus: { type: ["string", "null"], enum: [generating, ready, failed, null] }
        content:
          type: ["object", "null"]
          additionalProperties: true
        generatedByModel: { type: ["string", "null"] }
        generatingTask: { $ref: "#/components/schemas/VerkennerTaskDetail" }
        sourceUrl: { type: ["string", "null"] }
        sourceTitle: { type: ["string", "null"] }
        sourceType: { type: ["string", "null"] }
        sourceQualityScore: { type: ["integer", "null"] }
        sourceAiSummary: { type: ["string", "null"] }
        sourceStatus: { type: ["string", "null"], enum: [pending, accepted, declined, null] }
        linkedChapters:
          type: ["array", "null"]
          items: { $ref: "#/components/schemas/VerkennerLinkedRef" }
        linkedSubjects:
          type: ["array", "null"]
          items: { $ref: "#/components/schemas/VerkennerLinkedRef" }
        crawl: { $ref: "#/components/schemas/CrawlDetail" }
        task: { $ref: "#/components/schemas/VerkennerTaskDetail" }
    VerkennerLinkedRef:
      type: object
      required: [id, name]
      properties:
        id: { type: string, format: uuid }
        name: { type: string }
    VerkennerTaskDetail:
      type: object
      required: [id, taskType, status, summary, result]
      properties:
        id: { type: string, format: uuid }
        taskType: { type: string }
        status: { type: string, enum: [waiting, ready, running, done, failed] }
        summary: { type: ["string", "null"] }
        result:
          type: ["object", "null"]
          additionalProperties: true
        lastError: { type: ["string", "null"] }
    VerkennerLookupResponse:
      type: object
      required: [type, id, subjectId]
      properties:
        type: { type: string, enum: [subject, chapter, content, source, crawl, task] }
        id: { type: string, format: uuid }
        subjectId: { type: string, format: uuid }
    UpdateVerkennerSubjectTitleInput:
      type: object
      required: [name]
      properties:
        name: { type: string, minLength: 1, maxLength: 160 }
    UpdateVerkennerChapterTitleInput:
      type: object
      required: [title]
      properties:
        title: { type: string, minLength: 1, maxLength: 200 }
```

- [ ] **Step 2: Add the paths**

In the same file, find the `paths:` section (search for `  /admin/crawl/subjects:`) and add these five paths anywhere inside `paths:` (grouping them right after the `/admin/crawl/...` block keeps related admin paths together, but exact placement doesn't matter — YAML maps aren't ordered):

```yaml
  /admin/verkenner/subjects:
    get:
      operationId: listVerkennerSubjects
      tags: [admin-verkenner]
      summary: Search subjects for the Verkenner
      parameters:
        - name: q
          in: query
          required: false
          schema: { type: string }
      responses:
        "200":
          description: Matching subjects
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ListVerkennerSubjectsResponse"
        "403":
          description: Forbidden
  /admin/verkenner/subjects/{subjectId}:
    get:
      operationId: getVerkennerSubject
      tags: [admin-verkenner]
      summary: Full object graph for one subject
      parameters:
        - name: subjectId
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        "200":
          description: Subject graph
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/VerkennerSubjectDetailResponse"
        "403":
          description: Forbidden
        "404":
          description: Not found
    patch:
      operationId: updateVerkennerSubjectTitle
      tags: [admin-verkenner]
      summary: Rename a subject
      parameters:
        - name: subjectId
          in: path
          required: true
          schema: { type: string, format: uuid }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/UpdateVerkennerSubjectTitleInput"
      responses:
        "200":
          description: Updated
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/VerkennerSubjectSummary"
        "403":
          description: Forbidden
        "404":
          description: Not found
  /admin/verkenner/chapters/{chapterId}:
    patch:
      operationId: updateVerkennerChapterTitle
      tags: [admin-verkenner]
      summary: Rename a chapter
      parameters:
        - name: chapterId
          in: path
          required: true
          schema: { type: string, format: uuid }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/UpdateVerkennerChapterTitleInput"
      responses:
        "200":
          description: Updated
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Chapter"
        "403":
          description: Forbidden
        "404":
          description: Not found
  /admin/verkenner/objects/{type}/{id}:
    get:
      operationId: getVerkennerObject
      tags: [admin-verkenner]
      summary: Detail for one object plus its linked tasks and logs
      parameters:
        - name: type
          in: path
          required: true
          schema: { type: string, enum: [chapter, content, source, crawl, task] }
        - name: id
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        "200":
          description: Object detail
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/VerkennerObjectDetailResponse"
        "403":
          description: Forbidden
        "404":
          description: Not found
  /admin/verkenner/lookup:
    get:
      operationId: lookupVerkennerObject
      tags: [admin-verkenner]
      summary: Resolve any object id or source URL to its type and parent subject
      parameters:
        - name: q
          in: query
          required: true
          schema: { type: string }
      responses:
        "200":
          description: Resolved object
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/VerkennerLookupResponse"
        "403":
          description: Forbidden
        "404":
          description: No matching object
```

- [ ] **Step 3: Run codegen and typecheck the libs**

```bash
pnpm --filter @workspace/api-spec run codegen
```

Expected: succeeds, prints `🎉 api-client-react ... converted` and `🎉 zod ... converted`, then `tsc --build` runs with no errors.

- [ ] **Step 4: Verify the generated types exist**

```bash
grep -n "VerkennerSubjectDetailResponse\|VerkennerObjectDetailResponse\|updateVerkennerSubjectTitle" lib/api-zod/src/generated/api.ts lib/api-client-react/src/generated/api.ts | head -20
```

Expected: non-empty output — the new type names and the new client functions (`listVerkennerSubjects`, `getVerkennerSubject`, `getVerkennerObject`, `lookupVerkennerObject`, `updateVerkennerSubjectTitle`, `updateVerkennerChapterTitle`) all appear.

- [ ] **Step 5: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react
git commit -m "Add Verkenner OpenAPI schemas and paths"
```

---

### Task 2: Backend — router skeleton + subject search endpoint

**Files:**
- Create: `artifacts/api-server/src/routes/admin-verkenner.ts`

**Interfaces:**
- Consumes: `getAuthenticatedUser`, `restService` from `../lib/supabase` (existing, no signature change).
- Produces: `router` (default export, an `IRouter`) — the object every later task in this file adds endpoints to. `type Row = Record<string, unknown>` — the local row type every later step in this file uses.

- [ ] **Step 1: Create the file with the router skeleton, the `admin()` helper, and the search endpoint**

```typescript
import { Router, type IRouter, type Request } from "express";
import {
  GetVerkennerObjectParams,
  GetVerkennerSubjectParams,
  ListVerkennerSubjectsQueryParams,
  ListVerkennerSubjectsResponse,
  LookupVerkennerObjectQueryParams,
  UpdateVerkennerChapterTitleBody,
  UpdateVerkennerChapterTitleParams,
  UpdateVerkennerSubjectTitleBody,
  UpdateVerkennerSubjectTitleParams,
  VerkennerLookupResponse,
  VerkennerObjectDetailResponse,
  VerkennerSubjectDetailResponse,
} from "@workspace/api-zod";
import { getAuthenticatedUser, restService } from "../lib/supabase";
import { loadTaskLogs } from "../lib/pipeline-tasks/task-log";

const router: IRouter = Router();

type Row = Record<string, unknown>;

async function admin(req: Request) {
  const token = req.header("authorization");
  const user = await getAuthenticatedUser(token);
  return user?.isAdmin ? { user, token: token! } : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toSubjectSummary(row: Row) {
  return {
    id: row.id as string,
    name: row.name as string,
    yearLevel: row.year_level as "havo_vwo_bovenbouw" | "universitair",
    status: row.status as "pending" | "active" | "denied" | "needs_refinement",
    publishStatus: (row.publish_status as "incomplete" | "ready" | "published" | null) ?? "incomplete",
    chapterCount: (row.chapter_count as number | null) ?? null,
    createdAt: row.created_at as string,
  };
}

router.get("/admin/verkenner/subjects", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const query = ListVerkennerSubjectsQueryParams.safeParse(req.query);
  const q = query.success ? query.data.q?.trim() : undefined;
  try {
    let filter = "";
    if (q) {
      const escaped = q.replace(/[,()]/g, "");
      filter = UUID_RE.test(q)
        ? `&or=(name.ilike.*${encodeURIComponent(escaped)}*,id.eq.${q})`
        : `&name=ilike.*${encodeURIComponent(escaped)}*`;
    }
    const rows = await restService<Row[]>(
      `crawl_subjects?select=*&order=created_at.desc${filter}`,
    );
    res.json(ListVerkennerSubjectsResponse.parse({ subjects: rows.map(toSubjectSummary) }));
  } catch (error) {
    req.log.warn({ error }, "Could not search Verkenner subjects");
    res.status(500).json({ error: "Vakken konden niet worden geladen." });
  }
});

export default router;
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @workspace/api-server run typecheck
```

Expected: fails, because `ListVerkennerSubjectsQueryParams`, `UpdateVerkennerChapterTitleBody`, `UpdateVerkennerSubjectTitleBody`, `GetVerkennerObjectParams`, `GetVerkennerSubjectParams`, `LookupVerkennerObjectQueryParams`, `UpdateVerkennerChapterTitleParams`, `UpdateVerkennerSubjectTitleParams` don't exist as named exports yet — Orval only generates request-param/body zod schemas for operations that declare them with names matching those patterns, and Task 1 didn't explicitly name query/param schemas. Open `lib/api-zod/src/generated/api.ts` and search for `listVerkennerSubjects` to see what Orval actually generated for the query params (it auto-generates a `ListVerkennerSubjectsQueryParams` zod object from the inline `parameters:` list — confirm the exact name it picked, e.g. it may be `ListVerkennerSubjectsParams` instead). Fix every import in this file to match the real generated names before moving on — this file only compiles once the imports are exact.

- [ ] **Step 3: Fix imports to match generated names, re-typecheck until clean**

```bash
pnpm --filter @workspace/api-server run typecheck
```

Expected: PASS. (This step accounts for Orval's parameter-schema naming; the exact names are only knowable after Step 1's codegen actually ran, so this step is a deliberate fix-up pass, not a guess baked into Step 1.)

- [ ] **Step 4: Register the router (temporary, so the endpoint is reachable for a manual smoke test)**

Open `artifacts/api-server/src/routes/index.ts`. Add the import and registration:

```typescript
import adminVerkennerRouter from "./admin-verkenner";
```

Add `router.use(adminVerkennerRouter);` at the end, right after `router.use(adminPipelineRouter);`.

- [ ] **Step 5: Smoke test against the live schema**

Start the API server (`PORT=8080 pnpm --filter @workspace/api-server run dev`) with real Supabase credentials in `artifacts/api-server/.env`. Get a valid admin bearer token (log in as the admin account in the running frontend, or reuse a token from browser devtools). Then:

```bash
curl -s -H "authorization: Bearer <token>" "http://localhost:8080/admin/verkenner/subjects" | head -c 2000
```

Expected: JSON with a `subjects` array containing at least the "Geneesmiddelen: psychofarmaca, analgetica" subject. Then test the search filter:

```bash
curl -s -H "authorization: Bearer <token>" "http://localhost:8080/admin/verkenner/subjects?q=psycho" | head -c 2000
```

Expected: same subject, matched by name substring. Then test without a token:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8080/admin/verkenner/subjects"
```

Expected: `403`.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/routes/admin-verkenner.ts artifacts/api-server/src/routes/index.ts
git commit -m "Add Verkenner subject search endpoint"
```

---

### Task 3: Backend — subject detail endpoint (the object graph)

**Files:**
- Modify: `artifacts/api-server/src/routes/admin-verkenner.ts`

**Interfaces:**
- Consumes: `Row`, `admin()`, `router` from Task 2 (same file — this task appends to it).
- Produces: nothing new consumed by other backend tasks (Task 4/5 append their own independent endpoint to the same router).

- [ ] **Step 1: Add the mappers and the endpoint**

Insert this into `admin-verkenner.ts`, after the `toSubjectSummary` function and before the `/admin/verkenner/subjects` route:

```typescript
function toCrawlSummary(row: Row) {
  return {
    id: row.id as string,
    subjectId: row.subject_id as string,
    subjectName: "",
    status: row.status as "running" | "complete" | "failed",
    sourcesFound: (row.sources_found as number | null) ?? null,
    sourcesAccepted: (row.sources_accepted as number | null) ?? null,
    creditsUsed: (row.credits_used as number | null) ?? null,
    efficiencyRatio: (row.efficiency_ratio as number | null) ?? null,
    createdAt: row.created_at as string,
    completedAt: (row.completed_at as string | null) ?? null,
  };
}

function toTaskSummary(row: Row) {
  return {
    id: row.id as string,
    taskType: row.task_type as string,
    status: row.status as "waiting" | "ready" | "running" | "done" | "failed",
    summary: (row.summary as string | null) ?? null,
  };
}

function toContentSummary(row: Row) {
  return {
    id: row.id as string,
    contentType: row.content_type as string,
    version: Number(row.version ?? 1),
    status: row.status as "generating" | "ready" | "failed",
  };
}
```

Then add this endpoint after the search endpoint:

```typescript
router.get("/admin/verkenner/subjects/:subjectId", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = GetVerkennerSubjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Ongeldig vak." });
    return;
  }
  const { subjectId } = params.data;
  try {
    const subjects = await restService<Row[]>(`crawl_subjects?id=eq.${subjectId}&select=*`);
    const subjectRow = subjects[0];
    if (!subjectRow) {
      res.status(404).json({ error: "Vak niet gevonden." });
      return;
    }

    const [triageTasks, requests, chapters, contentRows, sourceCounts, crawls, tasks] = await Promise.all([
      restService<Row[]>(
        `pipeline_tasks?subject_id=eq.${subjectId}&task_type=eq.triage&select=id,result,summary&limit=1`,
      ),
      restService<Row[]>(
        `subject_requests?subject_id=eq.${subjectId}&select=status,admin_note&order=created_at.desc&limit=1`,
      ),
      restService<Row[]>(`chapters?subject_id=eq.${subjectId}&select=*&order=position.asc`),
      restService<Row[]>(
        `study_content?subject_id=eq.${subjectId}&select=id,chapter_id,content_type,version,status`,
      ),
      restService<Row[]>(
        `chapter_sources?chapter_id=in.(${
          (await restService<Row[]>(`chapters?subject_id=eq.${subjectId}&select=id`))
            .map((c) => c.id as string)
            .join(",") || "00000000-0000-0000-0000-000000000000"
        })&select=chapter_id`,
      ),
      restService<Row[]>(`crawls?subject_id=eq.${subjectId}&select=*&order=created_at.desc`),
      restService<Row[]>(
        `pipeline_tasks?subject_id=eq.${subjectId}&select=id,task_type,status,summary&order=created_at.asc`,
      ),
    ]);

    const triageTask = triageTasks[0];
    const triageResult = (triageTask?.result as Record<string, unknown> | null) ?? null;
    const request = requests[0];
    const decision =
      triageTask || request
        ? {
            taskId: (triageTask?.id as string | null) ?? null,
            approved: (triageResult?.approved as boolean | null) ?? null,
            reason: (triageResult?.reason as string | null) ?? null,
            suggestions: (triageResult?.suggestions as string | null) ?? null,
            model: (triageResult?.model as string | null) ?? null,
            summary: (triageTask?.summary as string | null) ?? null,
            requestStatus: (request?.status as string | null) ?? null,
            requestAdminNote: (request?.admin_note as string | null) ?? null,
          }
        : null;

    const sourceCountByChapter = new Map<string, number>();
    for (const row of sourceCounts) {
      const chapterId = row.chapter_id as string;
      sourceCountByChapter.set(chapterId, (sourceCountByChapter.get(chapterId) ?? 0) + 1);
    }

    const chapterSummaries = chapters.map((chapter) => ({
      chapter: {
        id: chapter.id as string,
        subjectId: chapter.subject_id as string,
        position: Number(chapter.position),
        title: chapter.title as string,
        description: (chapter.description as string | null) ?? "",
        isImportant: Boolean(chapter.is_important),
        topicTags: (chapter.topic_tags as string[] | null) ?? [],
        status: chapter.status as "pending" | "ready",
      },
      content: contentRows
        .filter((row) => row.chapter_id === chapter.id)
        .map(toContentSummary),
      sourceCount: sourceCountByChapter.get(chapter.id as string) ?? 0,
    }));

    const subjectContent = contentRows.filter((row) => row.chapter_id == null).map(toContentSummary);

    res.json(
      VerkennerSubjectDetailResponse.parse({
        subject: {
          id: subjectRow.id as string,
          name: subjectRow.name as string,
          yearLevel: subjectRow.year_level as "havo_vwo_bovenbouw" | "universitair",
          status: subjectRow.status as "pending" | "active" | "denied" | "needs_refinement",
          publishStatus: (subjectRow.publish_status as "incomplete" | "ready" | "published" | null) ?? "incomplete",
          description: (subjectRow.description as string | null) ?? null,
          difficultyLevel: (subjectRow.difficulty_level as string | null) ?? null,
          adminNote: (subjectRow.admin_note as string | null) ?? null,
          requestedBy: (subjectRow.requested_by as string | null) ?? null,
        },
        decision,
        chapters: chapterSummaries,
        subjectContent,
        crawls: crawls.map((row) => ({ ...toCrawlSummary(row), subjectName: subjectRow.name as string })),
        tasks: tasks.map(toTaskSummary),
      }),
    );
  } catch (error) {
    req.log.warn({ error }, "Could not load Verkenner subject detail");
    res.status(500).json({ error: "Vakdetail kon niet worden geladen." });
  }
});
```

Note the nested `chapter_sources` count query re-fetches chapter ids inline rather than reusing the `chapters` variable, because PostgREST needs the id list before the outer `Promise.all` resolves — this is intentionally sequential for that one sub-query; simplify later if it proves slow (the catalog is small today).

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @workspace/api-server run typecheck
```

Expected: PASS.

- [ ] **Step 3: Smoke test**

```bash
curl -s -H "authorization: Bearer <token>" "http://localhost:8080/admin/verkenner/subjects/ea973c52-774e-41d5-8888-a26e7eb2e66d" | python3 -m json.tool | head -60
```

(Use the psychofarmaca subject's real id, or fetch one from the search endpoint first.) Expected: a JSON object with `subject`, `decision` (non-null if this subject went through triage), `chapters` (array of `{chapter, content, sourceCount}`), `subjectContent`, `crawls`, `tasks`.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/routes/admin-verkenner.ts
git commit -m "Add Verkenner subject detail (object graph) endpoint"
```

---

### Task 4: Backend — object detail endpoint (chapter, source, crawl, task)

**Files:**
- Modify: `artifacts/api-server/src/routes/admin-verkenner.ts`

**Interfaces:**
- Consumes: `Row`, `admin()`, `router`, `toTaskSummary` (renamed usage) from Tasks 2–3.
- Produces: the `/admin/verkenner/objects/:type/:id` route, extended by Task 5 to add the `content` case.

- [ ] **Step 1: Add the endpoint with four of the five type branches**

```typescript
router.get("/admin/verkenner/objects/:type/:id", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = GetVerkennerObjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Ongeldig object." });
    return;
  }
  const { type, id } = params.data;
  try {
    if (type === "chapter") {
      const rows = await restService<Row[]>(`chapters?id=eq.${id}&select=*`);
      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: "Hoofdstuk niet gevonden." });
        return;
      }
      const logs = await restService<Row[]>(
        `pipeline_task_logs?chapter_id=eq.${id}&select=*&order=id.asc&limit=500`,
      );
      res.json(
        VerkennerObjectDetailResponse.parse({
          type,
          id,
          chapterTitle: row.title as string,
          chapterDescription: (row.description as string | null) ?? "",
          chapterIsImportant: Boolean(row.is_important),
          chapterTopicTags: (row.topic_tags as string[] | null) ?? [],
          chapterStatus: row.status as "pending" | "ready",
          logs: logs.map(toLogEntry),
        }),
      );
      return;
    }

    if (type === "source") {
      const rows = await restService<Row[]>(`sources?id=eq.${id}&select=*`);
      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: "Bron niet gevonden." });
        return;
      }
      const [chapterLinks, subjectLinks] = await Promise.all([
        restService<Row[]>(`chapter_sources?source_id=eq.${id}&select=chapters(id,title)`),
        restService<Row[]>(`source_subjects?source_id=eq.${id}&select=crawl_subjects(id,name)`),
      ]);
      res.json(
        VerkennerObjectDetailResponse.parse({
          type,
          id,
          sourceUrl: row.url as string,
          sourceTitle: (row.title as string | null) ?? null,
          sourceType: (row.type as string | null) ?? null,
          sourceQualityScore: (row.quality_score as number | null) ?? null,
          sourceAiSummary: (row.ai_summary as string | null) ?? null,
          sourceStatus: row.status as "pending" | "accepted" | "declined",
          linkedChapters: chapterLinks
            .map((link) => link.chapters as Row | null)
            .filter((chapter): chapter is Row => Boolean(chapter))
            .map((chapter) => ({ id: chapter.id as string, name: chapter.title as string })),
          linkedSubjects: subjectLinks
            .map((link) => link.crawl_subjects as Row | null)
            .filter((subject): subject is Row => Boolean(subject))
            .map((subject) => ({ id: subject.id as string, name: subject.name as string })),
          logs: [],
        }),
      );
      return;
    }

    if (type === "crawl") {
      const rows = await restService<Row[]>(`crawls?id=eq.${id}&select=*`);
      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: "Crawl niet gevonden." });
        return;
      }
      res.json(
        VerkennerObjectDetailResponse.parse({
          type,
          id,
          crawl: {
            ...toCrawlSummary(row),
            subjectName: "",
            promptUsed: (row.prompt_used as string | null) ?? null,
            errorDetail: (row.error_detail as string | null) ?? null,
            sources: [],
          },
          logs: [],
        }),
      );
      return;
    }

    if (type === "task") {
      const rows = await restService<Row[]>(`pipeline_tasks?id=eq.${id}&select=*`);
      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: "Taak niet gevonden." });
        return;
      }
      const logs = await loadTaskLogs(id);
      res.json(
        VerkennerObjectDetailResponse.parse({
          type,
          id,
          task: {
            id: row.id as string,
            taskType: row.task_type as string,
            status: row.status as "waiting" | "ready" | "running" | "done" | "failed",
            summary: (row.summary as string | null) ?? null,
            result: (row.result as Record<string, unknown> | null) ?? null,
            lastError: (row.last_error as string | null) ?? null,
          },
          logs: logs.map((entry) => ({
            id: entry.id,
            taskId: entry.taskId,
            chapterId: entry.chapterId,
            level: entry.level,
            phase: entry.phase,
            message: entry.message,
            data: entry.data,
            createdAt: entry.createdAt,
          })),
        }),
      );
      return;
    }

    // type === "content" is handled in Task 5.
    res.status(404).json({ error: "Onbekend objecttype." });
  } catch (error) {
    req.log.warn({ error, type: req.params.type }, "Could not load Verkenner object detail");
    res.status(500).json({ error: "Object kon niet worden geladen." });
  }
});
```

Add this small mapper next to the other mappers (needed by the `chapter` branch above):

```typescript
function toLogEntry(row: Row) {
  return {
    id: String(row.id),
    taskId: row.task_id as string,
    chapterId: (row.chapter_id as string | null) ?? null,
    level: row.level as "info" | "warn" | "error",
    phase: (row.phase as string | null) ?? "",
    message: row.message as string,
    data: (row.data as Record<string, unknown> | null) ?? null,
    createdAt: row.created_at as string,
  };
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @workspace/api-server run typecheck
```

Expected: PASS. (Task 5 adds the `content` branch to this same `if` chain next — the `res.status(404)` fallback above is temporary and gets replaced, not removed, in Task 5.)

- [ ] **Step 3: Smoke test the three working branches**

```bash
# a chapter id from the psychofarmaca subject — get one from the subject-detail response first
curl -s -H "authorization: Bearer <token>" "http://localhost:8080/admin/verkenner/objects/chapter/<chapterId>" | python3 -m json.tool | head -30
# a source id — get one from the pending-sources admin page or query it directly
curl -s -H "authorization: Bearer <token>" "http://localhost:8080/admin/verkenner/objects/source/<sourceId>" | python3 -m json.tool | head -30
# a crawl id from the subject-detail response's `crawls`
curl -s -H "authorization: Bearer <token>" "http://localhost:8080/admin/verkenner/objects/crawl/<crawlId>" | python3 -m json.tool | head -30
# a task id from the subject-detail response's `tasks`
curl -s -H "authorization: Bearer <token>" "http://localhost:8080/admin/verkenner/objects/task/<taskId>" | python3 -m json.tool | head -30
```

Expected: each returns 200 with the fields specific to its `type`, plus `logs` (non-empty for a task that has logged anything).

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/routes/admin-verkenner.ts
git commit -m "Add Verkenner object detail endpoint (chapter/source/crawl/task)"
```

---

### Task 5: Backend — object detail endpoint, `content` branch with generating-task linkage

**Files:**
- Modify: `artifacts/api-server/src/routes/admin-verkenner.ts`

**Interfaces:**
- Consumes: the `if (type === "chapter") ... if (type === "task") ...` chain from Task 4 (same file, same function) — this task inserts one more branch before the final fallback.

This is the highest-value branch: `study_content` has no `task_id` FK, so the generating task must be found via the `content_type → task_type` mapping documented in the spec, including the shared `exam`/`exam_rubric` case.

- [ ] **Step 1: Add the content_type → task_type mapping constant**

Add this near the top of the file, after `UUID_RE`:

```typescript
const CONTENT_TYPE_TO_TASK_TYPE: Record<string, string> = {
  summary: "summary_generation",
  key_notes: "key_notes_generation",
  exercise_bank: "exercise_generation",
  exam: "exam_generation",
  exam_rubric: "exam_generation",
  diagnostic_questionnaire: "questionnaire_generation",
};
```

- [ ] **Step 2: Insert the `content` branch**

In the `if (type === "task") { ... return; }` block from Task 4, insert this new branch immediately before it (order doesn't affect behavior, but keeps the file's branch order matching the OpenAPI enum order: chapter, content, source, crawl, task):

```typescript
    if (type === "content") {
      const rows = await restService<Row[]>(`study_content?id=eq.${id}&select=*`);
      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: "Inhoud niet gevonden." });
        return;
      }
      const contentType = row.content_type as string;
      const taskType = CONTENT_TYPE_TO_TASK_TYPE[contentType];
      let generatingTask: {
        id: string;
        taskType: string;
        status: "waiting" | "ready" | "running" | "done" | "failed";
        summary: string | null;
        result: Record<string, unknown> | null;
        lastError: string | null;
      } | null = null;
      let logs: ReturnType<typeof toLogEntry>[] = [];
      if (taskType) {
        const chapterFilter = row.chapter_id ? `chapter_id.eq.${row.chapter_id}` : "chapter_id.is.null";
        const taskRows = await restService<Row[]>(
          `pipeline_tasks?subject_id=eq.${row.subject_id}&${chapterFilter}&task_type=eq.${taskType}&select=*&limit=1`,
        );
        const taskRow = taskRows[0];
        if (taskRow) {
          generatingTask = {
            id: taskRow.id as string,
            taskType: taskRow.task_type as string,
            status: taskRow.status as "waiting" | "ready" | "running" | "done" | "failed",
            summary: (taskRow.summary as string | null) ?? null,
            result: (taskRow.result as Record<string, unknown> | null) ?? null,
            lastError: (taskRow.last_error as string | null) ?? null,
          };
          const rawLogs = await loadTaskLogs(taskRow.id as string);
          logs = rawLogs.map((entry) => ({
            id: entry.id,
            taskId: entry.taskId,
            chapterId: entry.chapterId,
            level: entry.level,
            phase: entry.phase,
            message: entry.message,
            data: entry.data,
            createdAt: entry.createdAt,
          }));
        }
      }
      res.json(
        VerkennerObjectDetailResponse.parse({
          type,
          id,
          contentType,
          contentVersion: Number(row.version ?? 1),
          contentStatus: row.status as "generating" | "ready" | "failed",
          content: (row.content as Record<string, unknown> | null) ?? {},
          generatedByModel: (row.generated_by_model as string | null) ?? null,
          generatingTask,
          logs,
        }),
      );
      return;
    }

```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @workspace/api-server run typecheck
```

Expected: PASS.

- [ ] **Step 4: Smoke test — including the exam/exam_rubric shared-task case**

```bash
# a study_content id with content_type 'summary' — get one from the subject-detail response's chapters[].content
curl -s -H "authorization: Bearer <token>" "http://localhost:8080/admin/verkenner/objects/content/<summaryContentId>" | python3 -m json.tool
```

Expected: `generatingTask` is non-null, with `taskType: "summary_generation"` and populated `result`/`summary`; `logs` is non-empty if that task ever logged anything.

If this subject has both an `exam` and an `exam_rubric` row for the same chapter (check via `chapters[].content` in the subject-detail response — if none exist yet, skip this specific check, it isn't blocking):

```bash
curl -s -H "authorization: Bearer <token>" "http://localhost:8080/admin/verkenner/objects/content/<examContentId>" | python3 -c "import sys,json; print(json.load(sys.stdin)['generatingTask']['id'])"
curl -s -H "authorization: Bearer <token>" "http://localhost:8080/admin/verkenner/objects/content/<examRubricContentId>" | python3 -c "import sys,json; print(json.load(sys.stdin)['generatingTask']['id'])"
```

Expected: both commands print the **same** task id.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/admin-verkenner.ts
git commit -m "Link content objects to their generating pipeline task"
```

---

### Task 6: Backend — lookup endpoint

**Files:**
- Modify: `artifacts/api-server/src/routes/admin-verkenner.ts`

**Interfaces:**
- Consumes: `Row`, `admin()`, `router`, `UUID_RE` from earlier tasks (same file).
- Produces: nothing consumed elsewhere in the backend — this is the last read endpoint.

- [ ] **Step 1: Add the endpoint**

```typescript
router.get("/admin/verkenner/lookup", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const query = LookupVerkennerObjectQueryParams.safeParse(req.query);
  if (!query.success || !query.data.q?.trim()) {
    res.status(400).json({ error: "q is verplicht." });
    return;
  }
  const q = query.data.q.trim();
  try {
    if (UUID_RE.test(q)) {
      const subject = await restService<Row[]>(`crawl_subjects?id=eq.${q}&select=id`);
      if (subject[0]) {
        res.json(VerkennerLookupResponse.parse({ type: "subject", id: q, subjectId: q }));
        return;
      }
      const chapter = await restService<Row[]>(`chapters?id=eq.${q}&select=id,subject_id`);
      if (chapter[0]) {
        res.json(
          VerkennerLookupResponse.parse({ type: "chapter", id: q, subjectId: chapter[0].subject_id as string }),
        );
        return;
      }
      const content = await restService<Row[]>(`study_content?id=eq.${q}&select=id,subject_id`);
      if (content[0]) {
        res.json(
          VerkennerLookupResponse.parse({ type: "content", id: q, subjectId: content[0].subject_id as string }),
        );
        return;
      }
      const crawl = await restService<Row[]>(`crawls?id=eq.${q}&select=id,subject_id`);
      if (crawl[0]) {
        res.json(VerkennerLookupResponse.parse({ type: "crawl", id: q, subjectId: crawl[0].subject_id as string }));
        return;
      }
      const task = await restService<Row[]>(`pipeline_tasks?id=eq.${q}&select=id,subject_id`);
      if (task[0]) {
        res.json(VerkennerLookupResponse.parse({ type: "task", id: q, subjectId: task[0].subject_id as string }));
        return;
      }
      const source = await restService<Row[]>(`sources?id=eq.${q}&select=id`);
      if (source[0]) {
        const link = await restService<Row[]>(`source_subjects?source_id=eq.${q}&select=subject_id&limit=1`);
        if (link[0]) {
          res.json(
            VerkennerLookupResponse.parse({ type: "source", id: q, subjectId: link[0].subject_id as string }),
          );
          return;
        }
      }
    } else {
      const source = await restService<Row[]>(`sources?url=eq.${encodeURIComponent(q)}&select=id`);
      if (source[0]) {
        const link = await restService<Row[]>(
          `source_subjects?source_id=eq.${source[0].id}&select=subject_id&limit=1`,
        );
        if (link[0]) {
          res.json(
            VerkennerLookupResponse.parse({
              type: "source",
              id: source[0].id as string,
              subjectId: link[0].subject_id as string,
            }),
          );
          return;
        }
      }
    }
    res.status(404).json({ error: "Niets gevonden voor deze zoekterm." });
  } catch (error) {
    req.log.warn({ error }, "Could not resolve Verkenner lookup");
    res.status(500).json({ error: "Zoeken is mislukt." });
  }
});
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @workspace/api-server run typecheck
```

Expected: PASS.

- [ ] **Step 3: Smoke test**

```bash
curl -s -H "authorization: Bearer <token>" "http://localhost:8080/admin/verkenner/lookup?q=ea973c52-774e-41d5-8888-a26e7eb2e66d"
```

Expected: `{"type":"subject","id":"ea973c52-...","subjectId":"ea973c52-..."}`. Then try a source URL you know is in the catalog (copy one from a subject's pending/accepted sources), and a nonsense string (expect 404).

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/routes/admin-verkenner.ts
git commit -m "Add Verkenner object lookup by id or source URL"
```

---

### Task 7: Backend — title PATCH endpoints

**Files:**
- Modify: `artifacts/api-server/src/routes/admin-verkenner.ts`

**Interfaces:**
- Consumes: `Row`, `admin()`, `router`, `toSubjectSummary` from earlier tasks.
- Produces: the two write endpoints the frontend's inline-editable title component (Task 8) calls.

- [ ] **Step 1: Add both PATCH endpoints**

```typescript
router.patch("/admin/verkenner/subjects/:id", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = UpdateVerkennerSubjectTitleParams.safeParse(req.params);
  const input = UpdateVerkennerSubjectTitleBody.safeParse(req.body);
  if (!params.success || !input.success) {
    res.status(400).json({ error: "Geldige titel is verplicht." });
    return;
  }
  try {
    const rows = await restService<Row[]>(`crawl_subjects?id=eq.${params.data.id}`, {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({ name: input.data.name, updated_at: new Date().toISOString() }),
    });
    if (!rows[0]) {
      res.status(404).json({ error: "Vak niet gevonden." });
      return;
    }
    res.json(toSubjectSummary(rows[0]));
  } catch (error) {
    req.log.warn({ error }, "Could not rename Verkenner subject");
    res.status(500).json({ error: "Titel kon niet worden opgeslagen." });
  }
});

router.patch("/admin/verkenner/chapters/:id", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = UpdateVerkennerChapterTitleParams.safeParse(req.params);
  const input = UpdateVerkennerChapterTitleBody.safeParse(req.body);
  if (!params.success || !input.success) {
    res.status(400).json({ error: "Geldige titel is verplicht." });
    return;
  }
  try {
    const rows = await restService<Row[]>(`chapters?id=eq.${params.data.id}`, {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({ title: input.data.title, updated_at: new Date().toISOString() }),
    });
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "Hoofdstuk niet gevonden." });
      return;
    }
    res.json({
      id: row.id as string,
      subjectId: row.subject_id as string,
      position: Number(row.position),
      title: row.title as string,
      description: (row.description as string | null) ?? "",
      isImportant: Boolean(row.is_important),
      topicTags: (row.topic_tags as string[] | null) ?? [],
      status: row.status as "pending" | "ready",
    });
  } catch (error) {
    req.log.warn({ error }, "Could not rename Verkenner chapter");
    res.status(500).json({ error: "Titel kon niet worden opgeslagen." });
  }
});
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @workspace/api-server run typecheck
```

Expected: PASS.

- [ ] **Step 3: Smoke test, then verify persistence with a read-back**

```bash
curl -s -X PATCH -H "authorization: Bearer <token>" -H "content-type: application/json" \
  -d '{"name":"Geneesmiddelen: psychofarmaca, analgetica (test-edit)"}' \
  "http://localhost:8080/admin/verkenner/subjects/ea973c52-774e-41d5-8888-a26e7eb2e66d"
curl -s -H "authorization: Bearer <token>" "http://localhost:8080/admin/verkenner/subjects/ea973c52-774e-41d5-8888-a26e7eb2e66d" | python3 -c "import sys,json; print(json.load(sys.stdin)['subject']['name'])"
```

Expected: the read-back shows the edited name. Then immediately revert it back to the original name with the same PATCH pattern — don't leave test data in production.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/routes/admin-verkenner.ts
git commit -m "Add Verkenner subject and chapter title PATCH endpoints"
```

---

### Task 8: Frontend — shared components (object-type map + inline-editable title)

**Files:**
- Create: `artifacts/geslaagd-app/src/components/admin/verkenner/object-type-meta.tsx`
- Create: `artifacts/geslaagd-app/src/components/admin/verkenner/inline-editable-title.tsx`

**Interfaces:**
- Produces: `OBJECT_TYPE_META: Record<VerkennerObjectType, { icon: LucideIcon; label: string; accent: string }>` and `type VerkennerObjectType = 'subject' | 'chapter' | 'content' | 'source' | 'crawl' | 'task'` — imported by Tasks 9–11. `InlineEditableTitle({ value, onSave, className? }: { value: string; onSave: (next: string) => Promise<void>; className?: string })` — imported by Tasks 9–10.

- [ ] **Step 1: Write `object-type-meta.tsx`**

```typescript
import {
  BookOpen,
  Compass,
  FileText,
  Layers,
  Link2,
  ListChecks,
  type LucideIcon,
} from 'lucide-react';

export type VerkennerObjectType = 'subject' | 'chapter' | 'content' | 'source' | 'crawl' | 'task';

type ObjectTypeMeta = {
  icon: LucideIcon;
  label: string;
  accent: string;
};

export const OBJECT_TYPE_META: Record<VerkennerObjectType, ObjectTypeMeta> = {
  subject: { icon: BookOpen, label: 'Vak', accent: 'verkenner-accent-subject' },
  chapter: { icon: Layers, label: 'Hoofdstuk', accent: 'verkenner-accent-chapter' },
  content: { icon: FileText, label: 'Inhoud', accent: 'verkenner-accent-content' },
  source: { icon: Link2, label: 'Bron', accent: 'verkenner-accent-source' },
  crawl: { icon: Compass, label: 'Crawl', accent: 'verkenner-accent-crawl' },
  task: { icon: ListChecks, label: 'Taak', accent: 'verkenner-accent-task' },
};

export const CONTENT_TYPE_LABEL: Record<string, string> = {
  summary: 'Samenvatting',
  key_notes: 'Kernpunten',
  exercise_bank: 'Opdrachten',
  exam: 'Toets',
  exam_rubric: 'Beoordelingsmodel',
  diagnostic_questionnaire: 'Diagnostische vragenlijst',
};
```

- [ ] **Step 2: Write `inline-editable-title.tsx`**

```typescript
import { useState } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';

export function InlineEditableTitle({
  value,
  onSave,
  className,
}: {
  value: string;
  onSave: (next: string) => Promise<void>;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setDraft(value);
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch {
      setError('Kon niet worden opgeslagen.');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button type="button" className={className ? `${className} verkenner-editable-title` : 'verkenner-editable-title'} onClick={start}>
        <span>{value}</span>
        <Pencil size={14} aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className="verkenner-editable-title-form">
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={saving}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save();
          if (e.key === 'Escape') cancel();
        }}
      />
      <Button size="sm" onClick={() => void save()} disabled={saving}>
        {saving ? <Loader2 className="spin" size={14} /> : <Check size={14} />}
      </Button>
      <Button size="sm" variant="ghost" onClick={cancel} disabled={saving}>
        <X size={14} />
      </Button>
      {error && <span className="admin-notice is-error">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @workspace/geslaagd-app run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add artifacts/geslaagd-app/src/components/admin/verkenner/object-type-meta.tsx artifacts/geslaagd-app/src/components/admin/verkenner/inline-editable-title.tsx
git commit -m "Add Verkenner shared components: object-type meta, inline title edit"
```

---

### Task 9: Frontend — decision card + curriculum tree components

**Files:**
- Create: `artifacts/geslaagd-app/src/components/admin/verkenner/decision-card.tsx`
- Create: `artifacts/geslaagd-app/src/components/admin/verkenner/curriculum-tree.tsx`

**Interfaces:**
- Consumes: `VerkennerDecision`, `VerkennerChapterSummary` types from `@workspace/api-client-react` (generated in Task 1). `OBJECT_TYPE_META`, `CONTENT_TYPE_LABEL` from Task 8. `InlineEditableTitle` from Task 8.
- Produces: `DecisionCard({ decision }: { decision: VerkennerDecision | null })`. `CurriculumTree({ chapters, onSelectContent, onRenameChapter }: { chapters: VerkennerChapterSummary[]; onSelectContent: (contentId: string) => void; onRenameChapter: (chapterId: string, title: string) => Promise<void> })` — both imported by Task 10 (the page).

- [ ] **Step 1: Write `decision-card.tsx`**

```typescript
import type { VerkennerDecision } from '@workspace/api-client-react';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
import { CircleCheck, CircleX } from 'lucide-react';

export function DecisionCard({ decision }: { decision: VerkennerDecision | null }) {
  if (!decision) {
    return (
      <div className="verkenner-card">
        <h3>Beslissing</h3>
        <p className="study-hint">Dit vak is direct door een beheerder aangemaakt, zonder aanvraagbeoordeling.</p>
      </div>
    );
  }

  return (
    <div className="verkenner-card">
      <h3>Beslissing</h3>
      <div className="verkenner-decision-head">
        {decision.approved === true && (
          <Badge variant="secondary">
            <CircleCheck size={13} /> Goedgekeurd
          </Badge>
        )}
        {decision.approved === false && (
          <Badge variant="destructive">
            <CircleX size={13} /> Afgewezen
          </Badge>
        )}
        {decision.model && <span className="study-hint">via {decision.model}</span>}
      </div>
      {decision.reason && <p>{decision.reason}</p>}
      {decision.suggestions && (
        <p className="study-hint">
          <strong>Suggesties:</strong> {decision.suggestions}
        </p>
      )}
      {decision.requestStatus && (
        <p className="study-hint">
          Aanvraagstatus: {decision.requestStatus}
          {decision.requestAdminNote ? ` — ${decision.requestAdminNote}` : ''}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write `curriculum-tree.tsx`**

```typescript
import { useState } from 'react';
import type { VerkennerChapterSummary } from '@workspace/api-client-react';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
import { ChevronDown, ChevronRight, FileText, Link2 } from 'lucide-react';
import { CONTENT_TYPE_LABEL } from './object-type-meta';
import { InlineEditableTitle } from './inline-editable-title';

export function CurriculumTree({
  chapters,
  onSelectContent,
  onRenameChapter,
}: {
  chapters: VerkennerChapterSummary[];
  onSelectContent: (contentId: string) => void;
  onRenameChapter: (chapterId: string, title: string) => Promise<void>;
}) {
  const [openChapterId, setOpenChapterId] = useState<string | null>(chapters[0]?.chapter.id ?? null);

  if (chapters.length === 0) {
    return (
      <div className="verkenner-card">
        <h3>Curriculum</h3>
        <p className="study-hint">Nog geen hoofdstukken.</p>
      </div>
    );
  }

  return (
    <div className="verkenner-card">
      <h3>Curriculum</h3>
      <ul className="verkenner-chapter-list">
        {chapters.map(({ chapter, content, sourceCount }) => {
          const open = openChapterId === chapter.id;
          return (
            <li key={chapter.id} className="verkenner-chapter-row">
              <div className="verkenner-chapter-head">
                <button
                  type="button"
                  className="verkenner-chapter-toggle"
                  onClick={() => setOpenChapterId(open ? null : chapter.id)}
                  aria-expanded={open}
                >
                  {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  <span className="verkenner-chapter-position">{chapter.position}.</span>
                </button>
                <InlineEditableTitle
                  value={chapter.title}
                  onSave={(next) => onRenameChapter(chapter.id, next)}
                />
                <Badge variant="secondary">{chapter.status === 'ready' ? 'gereed' : 'in behandeling'}</Badge>
                <span className="verkenner-chapter-source-count">
                  <Link2 size={12} /> {sourceCount}
                </span>
              </div>
              {open && (
                <ul className="verkenner-content-list">
                  {content.length === 0 && <li className="study-hint">Nog geen inhoud gegenereerd.</li>}
                  {content.map((item) => (
                    <li key={item.id}>
                      <button type="button" onClick={() => onSelectContent(item.id)}>
                        <FileText size={13} aria-hidden="true" />
                        {CONTENT_TYPE_LABEL[item.contentType] ?? item.contentType}
                        <Badge variant="secondary">v{item.version}</Badge>
                        <Badge variant={item.status === 'ready' ? 'secondary' : 'destructive'}>{item.status}</Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @workspace/geslaagd-app run typecheck
```

Expected: PASS. (This will fail until Task 1's codegen has actually run and produced `VerkennerDecision`/`VerkennerChapterSummary` — if Task 1 was completed earlier in this same plan execution, they already exist.)

- [ ] **Step 4: Commit**

```bash
git add artifacts/geslaagd-app/src/components/admin/verkenner/decision-card.tsx artifacts/geslaagd-app/src/components/admin/verkenner/curriculum-tree.tsx
git commit -m "Add Verkenner decision card and curriculum tree components"
```

---

### Task 10: Frontend — object detail panel

**Files:**
- Create: `artifacts/geslaagd-app/src/components/admin/verkenner/object-panel.tsx`

**Interfaces:**
- Consumes: `VerkennerObjectDetailResponse`, `VerkennerObjectType` (from Task 8's local type — matches the OpenAPI enum), `getVerkennerObject` (generated client function) from `@workspace/api-client-react`. `LogLine`, `taskTypeLabel` from `@/components/admin/task-detail` (already exported, no changes needed). `CONTENT_TYPE_LABEL` from Task 8.
- Produces: `ObjectPanel({ type, id, onClose }: { type: Exclude<VerkennerObjectType, 'subject'>; id: string; onClose: () => void })` — imported by Task 11 (the page).

- [ ] **Step 1: Write `object-panel.tsx`**

```typescript
import { useEffect, useState } from 'react';
import {
  getVerkennerObject,
  type VerkennerObjectDetailResponse,
} from '@workspace/api-client-react';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Loader2, X } from 'lucide-react';
import { LogLine, taskTypeLabel } from '@/components/admin/task-detail';
import { CONTENT_TYPE_LABEL, OBJECT_TYPE_META, type VerkennerObjectType } from './object-type-meta';

export function ObjectPanel({
  type,
  id,
  onClose,
}: {
  type: Exclude<VerkennerObjectType, 'subject'>;
  id: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<VerkennerObjectDetailResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setDetail(null);
    getVerkennerObject(type, id)
      .then((result) => {
        if (!cancelled) {
          setDetail(result);
          setState('ready');
        }
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [type, id]);

  const meta = OBJECT_TYPE_META[type];
  const Icon = meta.icon;

  return (
    <aside className="verkenner-object-panel" aria-label="Objectdetail">
      <header className="verkenner-object-panel-head">
        <span className={meta.accent}>
          <Icon size={16} aria-hidden="true" />
          {meta.label}
        </span>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Sluiten">
          <X size={16} />
        </Button>
      </header>

      {state === 'loading' && (
        <p className="study-loading">
          <Loader2 className="spin" size={16} aria-hidden="true" /> Laden…
        </p>
      )}
      {state === 'error' && <p className="admin-notice is-error">Object kon niet worden geladen.</p>}

      {state === 'ready' && detail && (
        <div className="verkenner-object-panel-body">
          {type === 'content' && (
            <>
              <p>
                <strong>{CONTENT_TYPE_LABEL[detail.contentType ?? ''] ?? detail.contentType}</strong>{' '}
                <Badge variant="secondary">v{detail.contentVersion}</Badge>{' '}
                <Badge variant={detail.contentStatus === 'ready' ? 'secondary' : 'destructive'}>
                  {detail.contentStatus}
                </Badge>
              </p>
              {detail.generatedByModel && <p className="study-hint">Model: {detail.generatedByModel}</p>}
              <pre className="verkenner-content-json">{JSON.stringify(detail.content, null, 2)}</pre>
              {detail.generatingTask && (
                <div className="verkenner-card">
                  <h4>Genererende taak</h4>
                  <p>{taskTypeLabel[detail.generatingTask.taskType] ?? detail.generatingTask.taskType}</p>
                  {detail.generatingTask.summary && <p>{detail.generatingTask.summary}</p>}
                </div>
              )}
            </>
          )}

          {type === 'source' && (
            <>
              <p>
                <a href={detail.sourceUrl ?? '#'} target="_blank" rel="noreferrer">
                  {detail.sourceTitle ?? detail.sourceUrl}
                </a>
              </p>
              <p className="study-hint">{detail.sourceType} · kwaliteit {detail.sourceQualityScore ?? '—'}</p>
              {detail.sourceAiSummary && <p>{detail.sourceAiSummary}</p>}
              {(detail.linkedSubjects?.length ?? 0) > 0 && (
                <p className="study-hint">
                  Gekoppelde vakken: {detail.linkedSubjects?.map((s) => s.name).join(', ')}
                </p>
              )}
              {(detail.linkedChapters?.length ?? 0) > 0 && (
                <p className="study-hint">
                  Gekoppelde hoofdstukken: {detail.linkedChapters?.map((c) => c.name).join(', ')}
                </p>
              )}
            </>
          )}

          {type === 'crawl' && detail.crawl && (
            <>
              <p>
                <Badge variant={detail.crawl.status === 'complete' ? 'secondary' : 'destructive'}>
                  {detail.crawl.status}
                </Badge>
              </p>
              <p className="study-hint">
                {detail.crawl.sourcesAccepted}/{detail.crawl.sourcesFound} bronnen · {detail.crawl.creditsUsed} credits
              </p>
              {detail.crawl.promptUsed && <p>Zoekopdracht: {detail.crawl.promptUsed}</p>}
              {detail.crawl.errorDetail && <p className="admin-notice is-error">{detail.crawl.errorDetail}</p>}
            </>
          )}

          {type === 'task' && detail.task && (
            <>
              <p>
                {taskTypeLabel[detail.task.taskType] ?? detail.task.taskType}{' '}
                <Badge variant={detail.task.status === 'done' ? 'secondary' : 'destructive'}>
                  {detail.task.status}
                </Badge>
              </p>
              {detail.task.summary && <p>{detail.task.summary}</p>}
              {detail.task.lastError && <p className="admin-notice is-error">{detail.task.lastError}</p>}
            </>
          )}

          {type === 'chapter' && (
            <>
              <p>{detail.chapterDescription}</p>
              <p className="study-hint">
                {detail.chapterIsImportant ? 'Belangrijk hoofdstuk' : 'Regulier hoofdstuk'} · {detail.chapterStatus}
              </p>
            </>
          )}

          {detail.logs.length > 0 && (
            <div className="verkenner-card">
              <h4>Logs</h4>
              <ul className="task-log-list">
                {detail.logs.map((entry) => (
                  <LogLine key={entry.id} entry={entry} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
```

- [ ] **Step 2: Verify `LogLine`'s expected prop type matches what's passed**

```bash
grep -n "export function LogLine" -A 5 artifacts/geslaagd-app/src/components/admin/task-detail.tsx
```

Confirm the `entry` prop's type (`PipelineLogEntry` per the earlier grep in this session). `VerkennerObjectDetailResponse['logs']` items are typed from the reused `PipelineLogEntry` OpenAPI schema (Task 1 `$ref`'d it directly), so this should typecheck without adapting the shape — if it doesn't, adjust the mapping (not `LogLine` itself; don't modify a shared component for one caller).

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @workspace/geslaagd-app run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add artifacts/geslaagd-app/src/components/admin/verkenner/object-panel.tsx
git commit -m "Add Verkenner object detail panel"
```

---

### Task 11: Frontend — the page, route registration, NAV entry, styling

**Files:**
- Create: `artifacts/geslaagd-app/src/pages/admin-verkenner-page.tsx`
- Modify: `artifacts/geslaagd-app/src/App.tsx`
- Modify: `artifacts/geslaagd-app/src/components/admin/admin-shell.tsx`
- Modify: `artifacts/geslaagd-app/src/index.css`

**Interfaces:**
- Consumes: everything from Tasks 8–10 (`OBJECT_TYPE_META`, `InlineEditableTitle`, `DecisionCard`, `CurriculumTree`, `ObjectPanel`), plus generated functions `listVerkennerSubjects`, `getVerkennerSubject`, `lookupVerkennerObject`, `updateVerkennerSubjectTitle`, `updateVerkennerChapterTitle` from `@workspace/api-client-react`, plus `AdminShell`/`AdminDenied` from `@/components/admin/admin-shell`, `useAuth` from `@/auth/auth-context`.

- [ ] **Step 1: Write `admin-verkenner-page.tsx`**

```typescript
import { useEffect, useState } from 'react';
import {
  getVerkennerSubject,
  listVerkennerSubjects,
  lookupVerkennerObject,
  updateVerkennerChapterTitle,
  updateVerkennerSubjectTitle,
  type VerkennerSubjectDetailResponse,
  type VerkennerSubjectSummary,
} from '@workspace/api-client-react';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import { Loader2, Search } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { AdminDenied, AdminShell } from '@/components/admin/admin-shell';
import { InlineEditableTitle } from '@/components/admin/verkenner/inline-editable-title';
import { OBJECT_TYPE_META, type VerkennerObjectType } from '@/components/admin/verkenner/object-type-meta';
import { DecisionCard } from '@/components/admin/verkenner/decision-card';
import { CurriculumTree } from '@/components/admin/verkenner/curriculum-tree';
import { ObjectPanel } from '@/components/admin/verkenner/object-panel';

export default function AdminVerkennerPage() {
  const { user, isLoading } = useAuth();

  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [subjects, setSubjects] = useState<VerkennerSubjectSummary[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VerkennerSubjectDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [lookupTerm, setLookupTerm] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);

  const [panelObject, setPanelObject] = useState<{ type: Exclude<VerkennerObjectType, 'subject'>; id: string } | null>(
    null,
  );

  const loadSubjects = async (q?: string) => {
    try {
      const result = await listVerkennerSubjects(q ? { q } : undefined);
      setSubjects(result.subjects);
      setState('ready');
      if (!selectedSubjectId && result.subjects[0]) {
        setSelectedSubjectId(result.subjects[0].id);
      }
    } catch (error) {
      setState((error as { status?: number }).status === 403 ? 'forbidden' : 'error');
    }
  };

  useEffect(() => {
    if (!isLoading && user) void loadSubjects();
    else if (!isLoading) setState('forbidden');
  }, [isLoading, user?.id]);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (state === 'ready') void loadSubjects(searchTerm || undefined);
    }, 250);
    return () => clearTimeout(handle);
  }, [searchTerm]);

  const loadDetail = async (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    setPanelObject(null);
    setDetailLoading(true);
    try {
      setDetail(await getVerkennerSubject(subjectId));
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSubjectId) void loadDetail(selectedSubjectId);
  }, [selectedSubjectId]);

  const renameSubject = async (name: string) => {
    if (!selectedSubjectId) return;
    await updateVerkennerSubjectTitle(selectedSubjectId, { name });
    await loadDetail(selectedSubjectId);
    await loadSubjects(searchTerm || undefined);
  };

  const renameChapter = async (chapterId: string, title: string) => {
    await updateVerkennerChapterTitle(chapterId, { title });
    if (selectedSubjectId) await loadDetail(selectedSubjectId);
  };

  const runLookup = async () => {
    const q = lookupTerm.trim();
    if (!q) return;
    setLookupBusy(true);
    setLookupError(null);
    try {
      const result = await lookupVerkennerObject({ q });
      setSelectedSubjectId(result.subjectId);
      if (result.type !== 'subject') {
        setPanelObject({ type: result.type, id: result.id });
      }
      setLookupTerm('');
    } catch {
      setLookupError('Niets gevonden voor deze zoekterm.');
    } finally {
      setLookupBusy(false);
    }
  };

  if (state === 'forbidden') return <AdminDenied />;

  return (
    <AdminShell title="Verkenner" intro="Zoek een vak op en zie alles wat eraan hangt.">
      {state === 'loading' && (
        <p className="study-loading">
          <Loader2 className="spin" size={18} aria-hidden="true" /> Laden…
        </p>
      )}
      {state === 'error' && <p className="admin-notice is-error">De Verkenner kon niet worden geladen.</p>}

      {(state === 'ready') && (
        <div className="verkenner-layout">
          <aside className="verkenner-sidebar">
            <div className="verkenner-search">
              <Search size={15} aria-hidden="true" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Zoek op naam of id"
              />
            </div>
            <ul className="verkenner-subject-list">
              {subjects.map((subject) => {
                const Icon = OBJECT_TYPE_META.subject.icon;
                return (
                  <li key={subject.id}>
                    <button
                      type="button"
                      className={subject.id === selectedSubjectId ? 'verkenner-subject-item active' : 'verkenner-subject-item'}
                      onClick={() => setSelectedSubjectId(subject.id)}
                    >
                      <Icon size={14} aria-hidden="true" />
                      <span>{subject.name}</span>
                      <Badge variant="secondary">{subject.status}</Badge>
                    </button>
                  </li>
                );
              })}
              {subjects.length === 0 && <li className="study-hint">Geen vakken gevonden.</li>}
            </ul>

            <div className="verkenner-lookup">
              <label htmlFor="verkenner-lookup-input">Spring naar object</label>
              <div className="verkenner-lookup-row">
                <Input
                  id="verkenner-lookup-input"
                  value={lookupTerm}
                  onChange={(e) => setLookupTerm(e.target.value)}
                  placeholder="Plak een id of bron-URL"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void runLookup();
                  }}
                />
                <Button size="sm" onClick={() => void runLookup()} disabled={lookupBusy}>
                  {lookupBusy ? <Loader2 className="spin" size={14} /> : 'Ga'}
                </Button>
              </div>
              {lookupError && <span className="admin-notice is-error">{lookupError}</span>}
            </div>
          </aside>

          <section className="verkenner-detail">
            {detailLoading && (
              <p className="study-loading">
                <Loader2 className="spin" size={18} aria-hidden="true" /> Vak laden…
              </p>
            )}
            {!detailLoading && detail && (
              <>
                <header className="verkenner-detail-head">
                  <InlineEditableTitle value={detail.subject.name} onSave={renameSubject} className="verkenner-detail-title" />
                  <div className="verkenner-detail-badges">
                    <Badge variant="secondary">{detail.subject.status}</Badge>
                    <Badge variant="secondary">{detail.subject.publishStatus}</Badge>
                    <Badge variant="secondary">
                      {detail.subject.yearLevel === 'havo_vwo_bovenbouw' ? 'HAVO/VWO Bovenbouw' : 'Universitair'}
                    </Badge>
                    <code className="verkenner-id">{detail.subject.id}</code>
                  </div>
                  {detail.subject.description && <p>{detail.subject.description}</p>}
                </header>

                <DecisionCard decision={detail.decision} />
                <CurriculumTree
                  chapters={detail.chapters}
                  onSelectContent={(contentId) => setPanelObject({ type: 'content', id: contentId })}
                  onRenameChapter={renameChapter}
                />

                {detail.crawls.length > 0 && (
                  <div className="verkenner-card">
                    <h3>Crawls</h3>
                    <ul className="verkenner-flat-list">
                      {detail.crawls.map((crawl) => (
                        <li key={crawl.id}>
                          <button type="button" onClick={() => setPanelObject({ type: 'crawl', id: crawl.id })}>
                            {crawl.status} · {crawl.sourcesAccepted}/{crawl.sourcesFound} bronnen
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {detail.tasks.length > 0 && (
                  <div className="verkenner-card">
                    <h3>Taken</h3>
                    <ul className="verkenner-flat-list">
                      {detail.tasks.map((task) => (
                        <li key={task.id}>
                          <button type="button" onClick={() => setPanelObject({ type: 'task', id: task.id })}>
                            {task.taskType} <Badge variant={task.status === 'done' ? 'secondary' : 'destructive'}>{task.status}</Badge>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </section>

          {panelObject && (
            <ObjectPanel type={panelObject.type} id={panelObject.id} onClose={() => setPanelObject(null)} />
          )}
        </div>
      )}
    </AdminShell>
  );
}
```

- [ ] **Step 2: Register the route in `App.tsx`**

Open `artifacts/geslaagd-app/src/App.tsx`. Add the import next to the other `Admin*Page` imports:

```typescript
import AdminVerkennerPage from '@/pages/admin-verkenner-page';
```

Add the route inside the `<Switch>`, next to the other `/beheer/...` routes (order matters only in that more specific paths must come before less specific ones — `/beheer/verkenner` is already more specific than the bare `/beheer` route, so placement among the other `/beheer/...` entries is fine):

```typescript
<Route path="/beheer/verkenner" component={AdminVerkennerPage} />
```

- [ ] **Step 3: Add the NAV entry in `admin-shell.tsx`**

Open `artifacts/geslaagd-app/src/components/admin/admin-shell.tsx`. Add `Compass` is already imported (used by the existing "Vakken & crawls" entry) — import a distinct icon for Verkenner instead, e.g. `Sparkles`, to the existing `lucide-react` import list:

```typescript
  Sparkles,
```

Add one entry to the `NAV` array (placement: right after "Overzicht", since the Verkenner is meant to be a primary landing point, not buried):

```typescript
  { href: '/beheer/verkenner', label: 'Verkenner', hint: 'Elk object opzoeken, met beslissingen en logs', icon: Sparkles },
```

- [ ] **Step 4: Add the Verkenner CSS**

Open `artifacts/geslaagd-app/src/index.css`. Add this block after the `.request-subject-form` rules added earlier this session (search for `.request-subject-form > div`):

```css
.verkenner-layout { display: grid; grid-template-columns: 300px 1fr; gap: 20px; align-items: start; }
.verkenner-layout:has(.verkenner-object-panel) { grid-template-columns: 300px 1fr 360px; }
.verkenner-sidebar { display: grid; gap: 16px; position: sticky; top: 20px; }
.verkenner-search { display: flex; align-items: center; gap: 8px; padding: 0 10px; border: 1px solid hsl(var(--border)); border-radius: var(--radius); }
.verkenner-search input { border: 0; }
.verkenner-subject-list { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; max-height: 50vh; overflow-y: auto; }
.verkenner-subject-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px; border: 1px solid transparent; border-radius: var(--radius); background: transparent; text-align: left; font-size: .85rem; cursor: pointer; }
.verkenner-subject-item span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.verkenner-subject-item:hover { background: hsl(var(--secondary)); }
.verkenner-subject-item.active { border-color: hsl(var(--primary)); background: hsl(var(--secondary)); }
.verkenner-lookup { display: grid; gap: 6px; padding-top: 10px; border-top: 1px solid hsl(var(--border)); }
.verkenner-lookup label { font-size: .78rem; font-weight: 700; color: hsl(var(--foreground)); }
.verkenner-lookup-row { display: flex; gap: 6px; }
.verkenner-detail { display: grid; gap: 16px; }
.verkenner-detail-head { display: grid; gap: 8px; }
.verkenner-detail-badges { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.verkenner-id { color: hsl(var(--muted-foreground)); font-size: .72rem; }
.verkenner-editable-title { display: inline-flex; align-items: center; gap: 6px; padding: 2px 6px; border: 1px solid transparent; border-radius: var(--radius); background: transparent; font: inherit; font-weight: 700; cursor: pointer; }
.verkenner-editable-title:hover { border-color: hsl(var(--border)); }
.verkenner-editable-title-form { display: flex; align-items: center; gap: 6px; }
.verkenner-detail-title { font-size: 1.4rem; }
.verkenner-card { display: grid; gap: 8px; padding: 16px; border: 1px solid hsl(var(--border)); border-radius: var(--radius); background: hsl(var(--card)); }
.verkenner-card h3, .verkenner-card h4 { margin: 0; font-size: .95rem; }
.verkenner-decision-head { display: flex; align-items: center; gap: 8px; }
.verkenner-chapter-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.verkenner-chapter-row { border: 1px solid hsl(var(--border)); border-radius: var(--radius); padding: 8px 10px; }
.verkenner-chapter-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.verkenner-chapter-toggle { display: inline-flex; align-items: center; gap: 4px; border: 0; background: transparent; cursor: pointer; }
.verkenner-chapter-position { color: hsl(var(--muted-foreground)); font-size: .8rem; }
.verkenner-chapter-source-count { display: inline-flex; align-items: center; gap: 3px; margin-left: auto; color: hsl(var(--muted-foreground)); font-size: .78rem; }
.verkenner-content-list { display: grid; gap: 4px; margin: 8px 0 0 24px; padding: 0; list-style: none; }
.verkenner-content-list button { display: flex; align-items: center; gap: 6px; border: 0; background: transparent; padding: 4px 0; font-size: .84rem; cursor: pointer; }
.verkenner-flat-list { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.verkenner-flat-list button { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: transparent; padding: 6px 4px; text-align: left; font-size: .84rem; cursor: pointer; }
.verkenner-flat-list button:hover { background: hsl(var(--secondary)); border-radius: var(--radius); }
.verkenner-object-panel { display: grid; gap: 12px; align-content: start; padding: 16px; border: 1px solid hsl(var(--border)); border-radius: var(--radius); background: hsl(var(--card)); position: sticky; top: 20px; max-height: 85vh; overflow-y: auto; }
.verkenner-object-panel-head { display: flex; align-items: center; justify-content: space-between; }
.verkenner-object-panel-head span { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; font-size: .85rem; }
.verkenner-content-json { max-height: 260px; overflow: auto; padding: 10px; border-radius: var(--radius); background: hsl(var(--muted)); font-size: .74rem; }
.verkenner-accent-subject, .verkenner-accent-chapter, .verkenner-accent-content, .verkenner-accent-source, .verkenner-accent-crawl, .verkenner-accent-task { color: hsl(var(--primary)); }
```

- [ ] **Step 5: Typecheck the whole workspace**

```bash
pnpm run typecheck
```

Expected: PASS across every package.

- [ ] **Step 6: Manual click-through**

Start both dev servers with real Supabase credentials (`PORT=8080 pnpm --filter @workspace/api-server run dev`, `PORT=21090 BASE_PATH=/ pnpm --filter @workspace/geslaagd-app run dev`). Log in as the admin account, open `http://localhost:21090/beheer/verkenner`:

1. The subject list loads with at least the psychofarmaca subject.
2. Click it — the decision card, curriculum tree, crawls, and tasks all render.
3. Type in the search box — the list narrows.
4. Click a content item in the curriculum tree — the object panel opens on the right with the content jsonb, the generating task's summary, and logs.
5. Click a task in the "Taken" list — the panel switches to the task's own detail + logs.
6. Click the subject title — it becomes an input; type a change, press Enter, confirm the badge/list update; then revert it back to the original name the same way (don't leave a renamed subject in production).
7. Click a chapter title in the curriculum tree — same inline-edit flow; revert after confirming it persists.
8. Paste a known object id into "Spring naar object" and confirm it selects the right subject and opens the right panel.
9. Log out (or open in a private window with no session) and confirm `/beheer/verkenner` shows the "Geen toegang" screen.

- [ ] **Step 7: Commit**

```bash
git add artifacts/geslaagd-app/src/pages/admin-verkenner-page.tsx artifacts/geslaagd-app/src/App.tsx artifacts/geslaagd-app/src/components/admin/admin-shell.tsx artifacts/geslaagd-app/src/index.css
git commit -m "Add Verkenner admin page, route, nav entry, and styling"
```

---

## Self-Review Notes

- **Spec coverage:** every fase-1 backend endpoint (search, subject detail, object detail incl. content-task linkage, lookup, both PATCHes), every frontend surface (search, subject list, decision card, curriculum tree, object panel, inline titles, lookup box, object-type icon system, nav entry) has a task. Fase 2 (AI regeneration) is explicitly out of scope for this plan, matching the spec.
- **Placeholder scan:** no TBD/TODO markers; every code step is complete, runnable code, not a description of code.
- **Type consistency:** `VerkennerObjectType` is defined once (Task 8) and reused by name in Tasks 10–11; `toSubjectSummary`, `toCrawlSummary`, `toTaskSummary`, `toContentSummary`, `toLogEntry` are each defined once (Tasks 2–4) and reused, never redefined; the `content_type → task_type` map is defined once (Task 5) and used only there.
- **Known fragility flagged inline, not hidden:** Task 2 Step 2–3 explicitly call out that Orval's auto-generated query/param schema names can't be known with certainty until codegen has actually run, and instructs fixing imports against the real output rather than guessing — this is honest about the one place this plan can't fully pin down a name in advance.
