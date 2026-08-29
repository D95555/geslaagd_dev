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
  - `content` → volledige `study_content.content` jsonb + versie/model/status, **plus de genererende taak**: `study_content` heeft geen directe `task_id`-FK, dus die taak wordt opgezocht via `pipeline_tasks?subject_id=eq.<subject_id>&chapter_id=eq.<chapter_id of is.null>&task_type=eq.<mapping>`. Mapping van `content_type` → `task_type`:
    | content_type | task_type |
    |---|---|
    | summary | summary_generation |
    | key_notes | key_notes_generation |
    | exercise_bank | exercise_generation |
    | exam | exam_generation |
    | exam_rubric | exam_generation *(let op: gedeeld met `exam` — dezelfde taak produceert beide content-rijen)* |
    | diagnostic_questionnaire | questionnaire_generation |

    De taak zelf levert `result`/`summary` + (via `loadTaskLogs`) de fase-voor-fase redenering die tot deze content leidde — dat is de "waarom is dit zo gegenereerd"-vraag voor content-objecten, analoog aan de beslissingskaart voor vakken.
  - `source` → `sources`-rij + waar het aan gelinkt is (chapter_sources/source_subjects — een bron kan aan meerdere vakken/hoofdstukken hangen, toon ze allemaal);
  - `task` → hergebruik `loadTaskLogs(taskId)` + `result`/`summary` (zoals `admin-pipeline`);
  - logs via `pipeline_task_logs` gefilterd op het object (`chapter_id`/`subject_id`/`task_id`).
- `GET /admin/verkenner/lookup?q=` — lichte "spring naar object": accepteert een willekeurig object-id (of een bron-URL) en retourneert `{ type, id, subjectId }` zodat de frontend direct naar het juiste object binnen zijn vak kan springen, zonder dat je eerst het vak hoeft te kennen. Probeert `id=eq.<q>` op `crawl_subjects`, `chapters`, `study_content`, `sources` (of `url=eq.<q>` als `q` geen geldige UUID is), `crawls`, `pipeline_tasks` — eerste match wint. Geen volwaardige full-text search over alle objecttypes (te veel bouwwerk voor de huidige, kleine catalogus); wel genoeg om "elk object heeft een eigen, opzoekbaar id" waar te maken.
- `PATCH /admin/verkenner/subjects/:id` — titel (`name`) bewerken (alleen admin; gedeeld object). **Stille PATCH, geen aparte logregel** (matcht hoe andere eenvoudige veldwijzigingen — bijv. `admin_note` — nu ook werken; uit te breiden in fase 2 als het nodig blijkt).
- `PATCH /admin/verkenner/chapters/:id` — hoofdstuktitel (`title`) bewerken. Ook stille PATCH.

(Study_content-titels zitten binnen de `content`-jsonb; die bewerking is bewust uitgesteld naar fase 2, samen met regeneratie — beide raken dezelfde jsonb-schrijfpad en verdienen één samenhangende aanpak in plaats van een losse titel-PATCH die er straks weer bij moet passen.)

### OpenAPI + codegen
Voeg de paden en schemas toe aan `lib/api-spec/openapi.yaml` (tag `admin-verkenner`), dan `pnpm --filter @workspace/api-spec run codegen`. Daarna zijn de getypte client-fns beschikbaar in `@workspace/api-client-react`.

### Frontend — nieuwe pagina `artifacts/geslaagd-app/src/pages/admin-verkenner-page.tsx`
- Volg het laadpatroon van `admin-pipeline-page.tsx`: raw generated async-fns + `useState`/`useEffect` `load()` met `'loading'|'ready'|'forbidden'|'error'`, self-gate met `useAuth()` → `<AdminDenied/>` bij 403.
- Layout: links een zoekveld + subjectlijst; rechts het subjectdetail:
  - **zoekbalk**: subjectzoeken (naam/id) zoals eerder, plus een tweede, kleinere "spring naar object"-invoer die `lookup?q=` aanroept — plak een id of bron-URL en de Verkenner navigeert direct naar dat object binnen zijn vak;
  - **kop** met inline-bewerkbare titel (klik → invoer → `PATCH`), status/publish-badges, id (kopieerbaar);
  - **beslissingskaart**: reason/suggestions/model uit triage-`result` + `summary` + `admin_note`;
  - **curriculum**: hoofdstukken (uitklapbaar) → study_content-rijen + bronaantal; hoofdstuktitel inline bewerkbaar;
  - **objectpaneel**: klik op een content/source/taak → laad `objects/:type/:id`, toon detail + gelinkte logs (inclusief, voor content-objecten, de genererende taak — zie boven). Hergebruik de logregel-render uit `components/admin/task-detail.tsx` (`LogLine`, `taskTypeLabel`) — desnoods klein herbruikbaar maken.
- **Objecttype-taal**: één centrale `OBJECT_TYPE_META`-map (icoon uit `lucide-react` + label + accentkleur per type: vak, hoofdstuk, samenvatting, toets, opdracht, bron, crawl, taak) — consistent gebruikt in de subjectlijst, de curriculumboom en de objectpaneel-kop, zodat de Verkenner echt als één catalogus van verschillende soorten objecten aanvoelt in plaats van een subjectpagina met tabbladen. Elke rij/kaart krijgt zijn icoon + status-badge in dezelfde plek, ook voor visuele scanbaarheid bij een groeiende catalogus.
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
4. Open een content-object (bv. een samenvatting) → controleer dat het paneel de genererende taak toont (result/summary/logs), niet alleen de content-jsonb. Controleer specifiek een `exam`- en een `exam_rubric`-rij van hetzelfde hoofdstuk → beide moeten naar dezelfde `exam_generation`-taak wijzen.
5. Plak een bron-id of -URL in de "spring naar object"-invoer → landt op de juiste bron binnen het juiste vak.
6. Bewerk een vaktitel en een hoofdstuktitel inline → herlaad → wijziging persisteert (PATCH bevestigd via netwerk/DB).
7. Niet-admin token → 403 → `<AdminDenied/>`.

## Statusnoot
Het crawlkwaliteits-werk (D1 domeinblocklist + opleidingsfilter, D2 tweefasen-zoeken, leesbare worker-logs) is gecommit en gepusht naar `main` (`c311b88`). De niveau-hernoeming en het herstel van vak-aanvragen (`havo_vwo_bovenbouw`/`universitair`, Nadruk/Type bronnen gewenst) is ook gecommit en gepusht naar `main` (`100869c`) en live op `geslaagd.app`. Deze Verkenner-build staat daar los van.
