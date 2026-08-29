# Verkenner — admin object-explorer voor de pipeline-catalogus

## Context

De studiemodule genereert AI-content via een pipeline (`crawl_subjects` → chapters → study_content, met sources, crawls, pipeline_tasks + logs, subject_requests). Vandaag kan een beheerder losse stukken zien (crawl-detail, pipeline-taken, console-logs), maar er is geen enkele plek waar je één object opzoekt en alles ziet wat eraan hangt: waarom de AI het vak toeliet, welk curriculum eruit kwam, welke bronnen/taken/logs erbij horen. Doel: een **Verkenner** — een doorzoekbare beheerderscatalogus van alle objecten (elk met eigen id), met gelinkte beslissingen/logs en bewerkbare titels.

De triage-beslissing is al opgeslagen (`pipeline_tasks.result` jsonb + `pipeline_tasks.summary` + `crawl_subjects.admin_note`), en de objectgraf is volledig via bekende FK's te lopen. Er is geen nieuwe opslag nodig voor fase 1 — alleen lees-aggregatie + titel-PATCH.

**Verificatie van deze aanname (deze sessie):** elk bestand, elke functie en elke kolom die hieronder genoemd wordt, is gecontroleerd tegen de actuele codebase en het live Supabase-schema (project `xpguhyuvooeizrjjrpkw`). Alles klopt: `admin()` in `admin-pipeline.ts`, `toSubjectSummary` in `subjects.ts`, `loadTaskLogs`/`loadRecentLogs` in `task-log.ts`, `LogLine`/`taskTypeLabel` in `task-detail.tsx`, de `NAV`-array in `admin-shell.tsx`, en het schema (`pipeline_tasks.result`/`.summary` bestaan beide, `study_content.chapter_id` is nullable, `chapter_sources`, `source_subjects`, `pipeline_task_logs` bestaan zoals beschreven). `POST /admin/pipeline/tasks/:taskId/retry` PATCHt de bestaande taakrij in-place (géén nieuwe rij), dus `task_type=eq.triage` per subject levert betrouwbaar hoogstens één rij op.

## Aanpak — fase 1 (deze build): browse + titelbewerking + beslissings-/loginzicht

Subject-geworteld: je zoekt een vak op en ziet de hele graf eronder. Alle admin-gating volgt het bestaande patroon (self-gate in de pagina + server-403), niet in de router-switch.

### Backend — nieuw `artifacts/api-server/src/routes/admin-verkenner.ts`
Kopieer de lokale `admin(req)`-helper uit `routes/admin-pipeline.ts` (403 bij niet-admin). Data-toegang via `restService` (service-role). Registreer de router in `routes/index.ts`.

Endpoints:
- `GET /admin/verkenner/subjects?q=` — zoek in `crawl_subjects` op naam (`name=ilike.*q*`) OF, wanneer `q` een geldige UUID is, op exacte `id`. Retourneer samenvattingsrijen (id, name, year_level, status, publish_status, chapter_count, created_at). Hergebruik de vorm van `toSubjectSummary` uit `routes/subjects.ts`.
- `GET /admin/verkenner/subjects/:subjectId` — de objectgraf in één payload:
  - subjectrij (incl. `description`, `difficulty_level`, `status`, `publish_status`, `admin_note`, `requested_by`);
  - **beslissing**: de `pipeline_tasks`-rij met `task_type=eq.triage` → `result` (approved/reason/suggestions/model) + `summary`; plus `subject_requests` (status + admin_note);
  - **curriculum**: `chapters` (op `position`), per hoofdstuk een lichte lijst van `study_content` (id, content_type, version, status — géén volledige `content` jsonb hier) en het aantal gelinkte `chapter_sources`;
  - subject-niveau `study_content` (`chapter_id=is.null`, bv. diagnostic_questionnaire);
  - `crawls` (samenvatting) en `pipeline_tasks` (id, task_type, status, summary) — één platte lijst, gescopet op `subject_id` (dus zowel subject- als hoofdstuk-gebonden taken samen, zoals `admin-pipeline-page.tsx` dat nu ook al doet).
- `GET /admin/verkenner/objects/:type/:id` — detail van één object + zijn gelinkte taken/logs, voor het "waarom / wat hangt eraan"-paneel. `type ∈ {chapter, content, source, crawl, task}`. Eén plat responseschema met optionele velden per type (géén OpenAPI `oneOf`) — eenvoudiger voor orval-codegen, en de frontend weet toch al welk `type` ze heeft opgevraagd:
  - `content` → volledige `study_content.content` jsonb + versie/model/status;
  - `source` → `sources`-rij + waar het aan gelinkt is (chapter_sources/source_subjects);
  - `task` → hergebruik `loadTaskLogs(taskId)` + `result`/`summary` (zoals `admin-pipeline`);
  - logs via `pipeline_task_logs` gefilterd op het object (`chapter_id`/`subject_id`/`task_id`).
- `PATCH /admin/verkenner/subjects/:id` — titel (`name`) bewerken (alleen admin; gedeeld object). **Stille PATCH, geen aparte logregel** (matcht hoe andere eenvoudige veldwijzigingen — bijv. `admin_note` — nu ook werken; uit te breiden in fase 2 als het nodig blijkt).
- `PATCH /admin/verkenner/chapters/:id` — hoofdstuktitel (`title`) bewerken. Ook stille PATCH.

(Study_content-titels zitten binnen de `content`-jsonb; die bewerking is complexer en valt in fase 2 samen met regeneratie.)

### OpenAPI + codegen
Voeg de paden en schemas toe aan `lib/api-spec/openapi.yaml` (tag `admin-verkenner`), dan `pnpm --filter @workspace/api-spec run codegen`. Daarna zijn de getypte client-fns beschikbaar in `@workspace/api-client-react`.

### Frontend — nieuwe pagina `artifacts/geslaagd-app/src/pages/admin-verkenner-page.tsx`
- Volg het laadpatroon van `admin-pipeline-page.tsx`: raw generated async-fns + `useState`/`useEffect` `load()` met `'loading'|'ready'|'forbidden'|'error'`, self-gate met `useAuth()` → `<AdminDenied/>` bij 403.
- Layout: links een zoekveld + subjectlijst; rechts het subjectdetail:
  - **kop** met inline-bewerkbare titel (klik → invoer → `PATCH`), status/publish-badges, id (kopieerbaar);
  - **beslissingskaart**: reason/suggestions/model uit triage-`result` + `summary` + `admin_note`;
  - **curriculum**: hoofdstukken (uitklapbaar) → study_content-rijen + bronaantal; hoofdstuktitel inline bewerkbaar;
  - **objectpaneel**: klik op een content/source/taak → laad `objects/:type/:id`, toon detail + gelinkte logs. Hergebruik de logregel-render uit `components/admin/task-detail.tsx` (`LogLine`, `taskTypeLabel`) — desnoods klein herbruikbaar maken.
- Registreer de route `/beheer/verkenner` in `App.tsx` (`<Switch>`) en voeg één `NAV`-entry toe in `components/admin/admin-shell.tsx`.

### Kritieke bestanden
- Nieuw: `routes/admin-verkenner.ts`, `pages/admin-verkenner-page.tsx`.
- Wijzigen: `lib/api-spec/openapi.yaml`, `routes/index.ts`, `App.tsx`, `components/admin/admin-shell.tsx` (NAV), evt. klein refactoren van `components/admin/task-detail.tsx` om `LogLine` te exporteren.
- Hergebruiken: `admin(req)` + retry/detail-patronen uit `routes/admin-pipeline.ts`; `loadTaskLogs`/`loadRecentLogs` uit `lib/pipeline-tasks/task-log.ts`; `restService` uit `lib/supabase.ts`.

## Fase 2 (apart, na akkoord fase 1) — AI-regeneratie mét aanpasprompt
De grote ingreep: per content-object "regenereer met aanpassing". De `retry`-endpoint accepteert al een willekeurige `config`, dus de plumbing bestaat. Nodig: (a) een `adjustmentPrompt`-veld in de taak-`config`; (b) elke generatie-handler (`summary-generation.ts`, `key-notes-generation.ts`, `exercise-generation.ts`, `exam-generation.ts`) leest dat veld en voegt het toe aan het `user`-bericht; (c) een UI-formulier per object (prompt invoeren → `retryPipelineTask` met `config.adjustmentPrompt`). Dit raakt meerdere handlers en verdient een eigen plan-/testronde.

## Verificatie (fase 1)
1. `pnpm --filter @workspace/api-spec run codegen` slaagt; `pnpm --filter @workspace/api-server run typecheck` en `pnpm --filter @workspace/geslaagd-app run typecheck` groen.
2. Start beide dev-servers; log in als admin; open `/beheer/verkenner`.
3. Zoek een bestaand vak → open het → controleer: beslissingskaart toont de triage-reden (op een aangevraagd vak), curriculum toont hoofdstukken, objectpaneel toont content-jsonb + logs.
4. Bewerk een vaktitel en een hoofdstuktitel inline → herlaad → wijziging persisteert (PATCH bevestigd via netwerk/DB).
5. Niet-admin token → 403 → `<AdminDenied/>`.

## Statusnoot
Het crawlkwaliteits-werk (D1 domeinblocklist + opleidingsfilter, D2 tweefasen-zoeken, leesbare worker-logs) is gecommit en gepusht naar `main` (`c311b88`). De niveau-hernoeming en het herstel van vak-aanvragen (`havo_vwo_bovenbouw`/`universitair`, Nadruk/Type bronnen gewenst) is ook gecommit en gepusht naar `main` (`100869c`) en live op `geslaagd.app`. Deze Verkenner-build staat daar los van.
