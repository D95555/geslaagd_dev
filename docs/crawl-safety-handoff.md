# Crawl-systeem: veiligheid + crawl-brein — overdracht voor de volgende sessie

Dit document is voor de volgende Claude-sessie. Lees dit **volledig** voordat je
begint. Het bevat de letterlijke oorspronkelijke vraag van de gebruiker, de
beslissingen die al genomen zijn (niet opnieuw bediscussiëren — dit zijn
bindende keuzes van de gebruiker), wat er al gebouwd is (Fase 1, klaar en
gepusht), en een concreet stappenplan voor de rest.

---

## ▶ START HIER (lees eerst dit blok)

**In één zin:** de credit-blowout is gestopt (Fase 1, gebouwd + gepusht in
commit `7e36aea`). Jouw taak is het afmaken van het grotere plan — begin bij
**Fase 1.5** in sectie 4, en check bij mij in vóór Fase 2b.

**Doe in deze volgorde:**
1. Lees dit hele document (vooral sectie 2 = bindende keuzes, en sectie 3 =
   wat al af is).
2. Lees `CLAUDE.md` in de repo-root (gedragsregels van dit project).
3. Oriënteer je kort op de codebase met de bestandenkaart in sectie 6 — lees
   alleen wat je nodig hebt, wees zuinig met tokens.
4. Begin met **Fase 1.5** (sectie 4). Laat je aanpak kort zien vóór je aan
   Fase 2b (het crawl-brein) begint.

**Randvoorwaarden (altijd):**
- Branch: `claude/repo-replit-sync-vgwk3g`.
- `pnpm --filter api-server run typecheck` groen vóór elke commit.
- Supabase-migraties: toepassen via de Supabase MCP-tool
  (`mcp__Supabase__apply_migration`) ÉN als bestand wegschrijven in
  `supabase/migrations/` (repo en live-database gesynchroniseerd houden).
- Bouw in fasen, niet alles in één keer. Overleg bij elke grote stap.
- De nieuwe Firecrawl-key staat al in de Replit-secrets; je hoeft die niet te
  zetten en hij hoort **niet** in de repo.

## Waarom dit bestaat

De gebruiker kreeg torenhoge Firecrawl-rekeningen (crawls die 1312, 600+
credits verbruikten) en moest een nieuw Firecrawl-account aanmaken omdat het
oude account leeg was. Dit **mag nooit meer gebeuren** — expliciete, harde eis,
prioriteit boven al het andere werk aan dit systeem.

## 1. Oorspronkelijke vraag van de gebruiker (verbatim)

> "[nieuwe firecrawl api key — geredigeerd, staat in de Replit-secrets] is de
> nieuwe firecrawl api key, er werd
> enorm veel gebruikt credits bij sommige crawls dus moest ik een nieuw account
> aanmaken want alle credits waren gebruikt (is al aangepast bij de secrets in
> replit)? 1312, 600, enz. Dit kan niet meer gebeuren, kost enorm veel geld en
> is zonde. Ik wil dat je het crawlsysteem reviewt. Zorgt dat dit NIET meer
> gebeurt. Ook wil ik dat je nieuwe features in het crawl systeem bedenkt,
> bijvoorbeeld als de crawler een pagina vind met verschillende artikelen
> gelinkt, dat het die artikelen kan bekijken en mogelijk gebruiken als bron.
> Dat soort dingen. Het moet uiteindelijk leiden tot een efficientere crawl,
> maar vooral een gerichtere crawl die beter kan zoeken naar onderwerpen. Ook
> een feature die ik wil, die nogsteeds niet geimplementeerd is, is het leren
> van vorige crawls/searches. Elke crawl moet een review krijgen met wat
> goed/slecht was, en vooral wat volgende crawl beter zou kunnen. en dit moet
> uiteindelijk aan een soort .MD file (een globaal, een voor het specifieke
> vak) worden toegevoegd, zodat elke crawl daarna er van kan leren. Er moet
> daarvoor een crawlhandler zijn die dit allemaal organiseert en uiteindelijk
> bepaalt hoe elke crawl word uitgevoerd, deze staat gekoppeld of is hetzelfde
> als de bronbeoordelaar, want ik denk dat ze samen beter werken in sync en
> leiden tot betere resultaten. het 'MD' file moet ook per vak te zien zijn
> voor beheerders. Ook vind ik de twijfelbron pagina niet heel goed, waarom
> komen sommige bronnen niet door? Leer van de opmerkingen die ik geef als ik
> er eentje handmatig review bij twijfel, zodat bij volgende twijfelgevallen er
> misschien niet handmatig beoordeelt hoeft te worden. En zoals gewoonlijk moet
> dit allemaal zichtbaar kunnen zijn en gelogd zodat beheerders ELKE beslissing
> die een AI maakt kan terugvinden. In conclusie, ik wil dat er meer
> communicatie is tussen systemen van geslaagd.app zodat de AI's van elkaar
> leren en er geen fouten worden gemaakt, de bronnen beter worden en er meer
> efficientie is. zelf wil ik ook dat jij nog met idëeen komt, over zowel
> crawls, maar mag ook over andere systemen. mist er iets, of heb jij een goed
> idee, sugereer het. en vraag zoveel vragen als nodig zijn, ik ben alleen maar
> blijer als ik inzicht mag geven zodat jij een beter resultaat kan neerzetten"

## 2. Bindende beslissingen van de gebruiker (niet opnieuw bevragen)

Deze vier antwoorden kwamen uit een expliciete vraag-ronde (`AskUserQuestion`)
en zijn **definitief**. De volgende sessie mag hier techniek/implementatie
binnen invullen, maar niet de keuze zelf heropenen.

1. **Credit-budget** — verbatim: *"300 voor kleinere vakken, 600 voor grote
   waar specifieke kennis voor nodig is. Dit moet een optie zijn bij vak
   aanvragen, en de AI moet beoordelen of het eens is met de keuze. Zo niet?
   geef een redenering waarom en laat de admin handmatig beslissen in
   beheer."*
   → Twee tiers (300 / 600), gekozen bij vak-aanvraag. Een AI-check beoordeelt
   of de gekozen tier past bij de daadwerkelijke scope van het vak; bij
   onenigheid: reden geven + terugvallen op het bestaande
   `needs_refinement`/`admin_note`-patroon (admin beslist handmatig in beheer).
   **Nog niet gebouwd — zie Fase 2a in sectie 4.**

2. **PDF-beleid** — gekozen: "Alleen snippet gebruiken (aanbevolen)" —
   PDF's niet volledig scrapen via Firecrawl, alleen scoren op de snippet.
   **Gebouwd in Fase 1** (zie sectie 3). Fase 1.5 (nog te bouwen) voegt gratis
   volledige PDF-tekst toe voor geaccepteerde bronnen, buiten Firecrawl om.

3. **Waar leert-geheugen leeft** — verbatim: *"Bij de vorige vraag - waarom
   kan onze AI grote PDFs niet bekijken en moet het via firecrawl. bij deze
   vraag de aanbevolen keuze."* — dat betekent: (a) de gebruiker vroeg om
   uitleg waarom PDF's per se via Firecrawl moesten (antwoord: dat hoefde
   nooit — Firecrawl was geen technische noodzaak, we kunnen een PDF gratis
   zelf ophalen met een normale HTTP GET en aan Claude geven als native
   document-input; er was simpelweg nooit een apart PDF-pad gebouwd), en (b)
   voor de daadwerkelijke vraag koos de gebruiker de aanbevolen optie: **"In
   de database, zichtbaar per vak in beheer"** — dus het globale + per-vak
   leer-geheugen wordt in de database opgeslagen, zichtbaar/bewerkbaar in het
   beheerpaneel (niet als losse `.md`-bestanden op schijf, ook al noemde de
   gebruiker het zo — de DB-vorm is functioneel hetzelfde idee).

4. **Architectuur** — verbatim: *"Eén samengevoegd 'crawl-brein'"* — de
   gebruiker koos expliciet voor **één samengevoegde component** die zowel de
   crawlhandler (organiseert/beslist hoe elke crawl draait) als de
   bronbeoordelaar (huidige `source-review.ts`) is, in plaats van twee losse
   componenten die een gedeeld geheugen delen. Reden van de gebruiker: "ik
   denk dat ze samen beter werken in sync en leiden tot betere resultaten."
   Implementatiedetail dat wél nog een technische keuze is (geen heropening
   van de architectuurkeuze): de granulaire taak-queue stappen
   (`pipeline_tasks`) kunnen prima blijven bestaan voor logging/observability,
   zolang de *beslissingslogica* zelf in één module/component zit.

## 3. Wat al gebouwd is: Fase 1 (veiligheidslaag) — KLAAR EN GEPUSHT

Commit `7e36aea` op branch `claude/repo-replit-sync-vgwk3g`. Dit is **live in
de code**, niet alleen een plan.

**Database (migratie `2026083001_firecrawl_credit_guardrails.sql`, al toegepast
op Supabase én gecommit lokaal):**
- `crawl_subjects.credit_budget` (integer, default 300) — het budget-plafond.
- `crawl_subjects.build_started_at` (timestamptz) — markeert het begin van de
  telperiode; verbruik wordt alleen geteld ná dit tijdstip, zodat een nieuwe
  crawl-run niet blijft hangen aan oud verbruik.
- Nieuwe tabel `firecrawl_usage` (subject_id, crawl_id, operation, credits,
  created_at) — een ledger die elke credit-uitgave logt. RLS aan, alleen
  server-side (service-role) leesbaar, net als de andere pipeline-tabellen.

**Code (`artifacts/api-server/src/lib/firecrawl.ts`):**
- `BudgetContext = { subjectId, crawlId? }` — wordt overal doorgegeven waar
  credits kunnen worden uitgegeven.
- `budgetBlockReason(ctx)` — checkt het resterende budget vóór elke
  Firecrawl-aanroep. **Faalt DICHT**: als de ledger-check zelf een fout geeft
  (bv. Supabase tijdelijk onbereikbaar), wordt de uitgave geblokkeerd in
  plaats van toegestaan. Dit is bewust een andere keuze dan andere plekken in
  dit bestand (zoals `getGlobalExcludedDomains`, die bij een fout gewoon
  doorgaat) — hier weegt financiële veiligheid zwaarder dan pipeline-
  robuustheid. Dit is een ontwerpkeuze die aan de gebruiker gemeld is, niet
  stilzwijgend gedaan.
- `recordUsage(ctx, operation, credits)` — schrijft elke uitgave naar
  `firecrawl_usage` (exported, want ook gebruikt door `source-pipeline.ts`).
- `isPdfUrl(url)` — regex-check op `.pdf` in de URL.
- Alle drie de netwerkfuncties (`firecrawlSearch`, `firecrawlDiscover`,
  `firecrawlScrapeUrls`) checken nu het budget vóór elke aanroep en loggen
  erna. `firecrawlScrapeUrls` splitst PDF- vs. niet-PDF-URL's en scraped PDF's
  helemaal niet meer via Firecrawl (ze behouden hun snippet-tekst).

**Call-sites bijgewerkt:**
- `pipeline-tasks/source-gathering.ts` — geeft `{subjectId, crawlId}` door aan
  `firecrawlDiscover`/`firecrawlScrapeUrls`.
- `pipeline-tasks/curriculum-design.ts` — `researchSubject()` gebruikt nu
  `firecrawlDiscover` (snippet-only) in plaats van de dure `firecrawlSearch`
  die alle 20 resultaten scrapete alleen voor een hoofdstukken-overzicht.
- `source-pipeline.ts` — de **legacy admin-knop "Crawl starten"**
  (`admin-crawl-page.tsx` → `POST /admin/crawl/run` → `runCrawl()` →
  `runFirecrawlSearch()`) bleek nog steeds live en aanklikbaar in beheer. Dit
  was één van de twee hoofdoorzaken van de credit-blowout (samen met
  `curriculum-design.ts`'s oude research-call). Minimale, veilige patch
  toegepast: budgetcheck toegevoegd, `scrapeOptions` verwijderd (nu ook
  snippet-only net als de rest), en PDF-resultaten worden hier nu simpelweg
  weggefilterd in plaats van gescraped.

`pnpm --filter api-server run typecheck` is groen na deze wijzigingen.

**Wat Fase 1 dus garandeert:** geen enkel crawl-pad in de code kan nog
ongelimiteerd credits uitgeven — elk pad checkt eerst het budget van het vak
en stopt zodra dat op is, en PDF's kosten niets meer via Firecrawl.

**Wat Fase 1 NIET doet (bewust, hoort bij latere fases):**
- Geen tier-keuze (300/600) bij vak-aanvraag nog — elk vak heeft nu gewoon
  standaard 300 via de kolom-default. De 600-tier en de AI-akkoordcheck zijn
  nog niet gebouwd.
- Geen "crawl-brein" (samenvoeging crawlhandler + bronbeoordelaar).
- Geen lerend geheugen (globaal + per-vak, in de database, zichtbaar in
  beheer).
- Geen feedback-loop vanuit de twijfelbron-pagina (admin's decline/accept-
  redenen worden al opgeslagen in `decline_reason`, maar voeden nog niets
  automatisch terug in toekomstige scoring).
- Geen audit-log specifiek voor "elke AI-beslissing" — de bestaande
  `pipeline_task_logs`-infrastructuur (via `taskLog()`) bestaat al en is
  zichtbaar in de admin-console; die moet consistenter gebruikt worden voor
  nieuwe crawl-brein-beslissingen, niet vanaf nul gebouwd.
- Geen gratis PDF-volledige-tekst-pad (Fase 1.5).
- Geen "volg gelinkte artikelen op een pagina als extra bronnen"-feature.

## 4. Stappenplan voor de volgende sessie

Bouw in deze volgorde. Check na elke fase in met de gebruiker voordat je aan
de volgende begint (grote architecturale stap, niet in één keer doorrossen).

### Fase 1.5 — gratis PDF-volledige-tekst voor geaccepteerde bronnen
**Doel:** PDF's die de snippet-score doorstaan, niet verliezen — wél gratis
volledige tekst krijgen, buiten Firecrawl om.
1. In `artifacts/api-server/src/lib/ai.ts`: `callStrongJson`/`callFastJson`/
   `callFastText` nemen nu alleen platte string-berichten. Anthropic's
   Messages API ondersteunt native document-content-blocks (PDF als base64 of
   URL) — `@anthropic-ai/sdk` is al een dependency. Voeg een variant toe (of
   een optioneel `documents`-argument) die een PDF als document-block kan
   meesturen naar Claude.
2. Nieuwe kleine functie, bv. in `firecrawl.ts` of een nieuw bestandje
   `pdf-fetch.ts`: haal een geaccepteerde PDF-URL gewoon op met `fetch()` (geen
   Firecrawl, geen kosten), geef de bytes door aan de nieuwe Claude-
   document-functie voor samenvatting/inhoud-extractie.
3. Hook dit in waar bronnen geaccepteerd worden (`source-gathering.ts` na
   `determineAcceptance`, of in `source-review.ts` na de keep-beslissing) —
   alleen voor bronnen met `type === "pdf"` of een `.pdf`-URL die is
   geaccepteerd.
4. Testen: pak een echte PDF-bron-URL, verifieer dat de content ophaalt zonder
   Firecrawl te raken (check dat er geen nieuwe `firecrawl_usage`-rij bijkomt
   voor die operatie).

### Fase 2a — Credit-tier bij vak-aanvraag + AI-akkoordcheck
**Doel:** implementeer bindende beslissing #1 hierboven.
1. `routes/crawl.ts` (subject-request routes): voeg een tier-keuze toe aan het
   aanvraagformulier/-payload (300 of 600), sla op in `crawl_subjects.
   credit_budget` bij aanmaken/goedkeuren.
2. Nieuwe check (kleine pipeline-taak of directe call tijdens
   aanvraag/goedkeuring): geef de AI de vaknaam, niveau, beschrijving en de
   gekozen tier; laat hem beoordelen of dat past bij de geschatte scope. Bij
   twijfel/onenigheid: schrijf een `admin_note` met de redenering en zet
   status op `needs_refinement` (bestaand patroon, hergebruiken — zie hoe
   `subject_requests`/`crawl_subjects` dat nu al doen elders in `crawl.ts`).
3. Admin-UI (`admin-crawl-page.tsx` en de aanvraag-pagina aan studentkant):
   toon de tier-keuze en, indien van toepassing, de AI-redenering bij een
   `needs_refinement`-status.

### Fase 2b — Het crawl-brein (samengevoegde handler + bronbeoordelaar)
**Doel:** implementeer bindende beslissing #4. Dit is de grootste stap —
overleg de exacte module-indeling met de gebruiker voordat je begint met
schrijven, maar de architectuurkeuze zelf (één samengevoegd component) staat
al vast.
1. Ontwerp één module (bv. `lib/crawl-brain.ts`) die de beslissingslogica van
   zowel de huidige crawlhandler-achtige orkestratie (welke queries, welke
   config, wanneer stoppen) als `source-review.ts` (keep/reject, gap-queries)
   samenbrengt. De bestaande `pipeline_tasks`-taken (`source_gathering`,
   `source_review`, enz.) mogen blijven bestaan als losse queue-stappen voor
   logging/observability — ze roepen straks gewoon dezelfde crawl-brein-
   functies aan in plaats van gescheiden logica te hebben.
2. Geef het crawl-brein toegang tot het leer-geheugen (zie Fase 2c) zodat elke
   beslissing (welke query volgende keer, welke bron waarschijnlijk goed is)
   die context meeneemt.
3. Log elke beslissing van het crawl-brein expliciet via `taskLog()` (zie
   Fase 2d) zodat admins kunnen terugvinden waarom iets gebeurde.

### Fase 2c — Lerend geheugen (globaal + per vak, in de database)
**Doel:** implementeer bindende beslissing #3.
1. Nieuwe tabel(len), bv. `crawl_memory` (id, subject_id nullable — null =
   globaal, content text/markdown, updated_at) of twee kolommen/tabellen
   (globaal vs. per-vak) — kies wat het beste past bij hoe je het crawl-brein
   het wilt laten lezen/schrijven.
2. Na elke crawl (in `source-review.ts` of het nieuwe crawl-brein): genereer
   een korte review (wat ging goed/fout, wat kan de volgende crawl beter
   doen) via de AI, en voeg dat toe aan zowel de globale als de vak-specifieke
   memory-tekst (append of gestructureerd samenvatten — voorkom dat het
   bestand oneindig groeit; overweeg periodiek samenvatten/comprimeren).
3. Laad de relevante memory-tekst als context bij het opstellen van nieuwe
   zoekqueries (in curriculum-design en/of het crawl-brein).
4. Admin-UI: nieuwe sectie in beheer (per vak) die de memory-tekst toont, en
   idealiter bewerkbaar maakt (de gebruiker vroeg expliciet om zichtbaarheid
   per vak in beheer).

### Fase 2d — Twijfelbron-feedback-loop + volledige traceerbaarheid
**Doel:** implementeer de twee resterende asks: leren van handmatige
twijfelbron-reviews, en dat élke AI-beslissing terug te vinden is.
1. `routes/crawl.ts`'s `decline`-endpoint neemt al een `reason` in de body aan
   maar doet er verder niets mee — sla die reden (en de eventuele "accept"-
   toelichting) gestructureerd op, gekoppeld aan het vak, en voed die terug in
   het leer-geheugen (Fase 2c) of direct in de scoringsprompt van het
   crawl-brein, zodat vergelijkbare toekomstige gevallen minder vaak in de
   twijfelbron-wachtrij belanden.
2. Voor traceerbaarheid: bouw voort op de bestaande `pipeline_task_logs`
   (`task-log.ts`) — zorg dat élke AI-aanroep binnen het crawl-brein
   (scoring, accept/reject-redenering, query-generatie, memory-updates) een
   losse, leesbare logregel schrijft via `taskLog()`, zichtbaar in de
   bestaande admin-taaklog-viewer. Overweeg (eigen suggestie, nog niet
   besproken met gebruiker maar wel al eerder genoemd als idee) een aparte,
   doorzoekbare "AI-beslissingen"-tabel/overzicht in de Verkenner-admin-pagina
   die per beslissing input, output, model en kosten toont.

### Los, later te bespreken idee van de vorige sessie (nog niet uitgevoerd,
gebruiker gevraagd om zelf met ideeën te komen — dit zijn suggesties, geen
verplichtingen):
- Gratis link-volgen: als een geaccepteerde bron (die je toch al hebt
  gescraped) links bevat naar andere artikelen, gebruik die markdown-links
  gratis als extra kandidaat-URL's in plaats van opnieuw te zoeken.
- Zelf-lerende domein-reputatie: houd per domein een score bij op basis van
  eerdere accept/decline-uitkomsten, en voed slecht-scorende domeinen
  automatisch in `excludeDomains`.
- Gebruik vragen die studenten in de chat stellen als signaal voor
  dekkingsgaten in een vak, en zet die om in nieuwe gap-queries voor het
  crawl-brein.

## 5. Werkwijze-afspraken uit deze sessie (blijven gelden)

- Werk op branch `claude/repo-replit-sync-vgwk3g`, commit met duidelijke
  Nederlandse of Engelse boodschap (dit project mengt beide, geen harde eis),
  `pnpm --filter api-server run typecheck` vóór elke commit.
  Supabase-migraties: altijd via `mcp__Supabase__apply_migration` toepassen
  ÉN als los bestand wegschrijven naar `supabase/migrations/` zodat repo en
  live database gesynchroniseerd blijven.
- Grote architecturale stappen (zoals heel Fase 2b) niet in één keer
  doorbouwen zonder tussentijds contact — de gebruiker heeft al een paar keer
  gevraagd om eerst iets te laten zien/beslissen voordat er verder gebouwd
  wordt.
- Er loopt daarnaast nog een ander, gepauzeerd traject (redesign van de
  studenten-omgeving/homepage, zie `docs/redesign-handoff.md`) — dat is apart
  van dit crawl-werk en hoeft niet opgepakt te worden tenzij de gebruiker daar
  expliciet om vraagt.

## 6. Bestandenkaart (waar staat wat) — zodat je niet hoeft te zoeken

Alle paden relatief aan de repo-root. Backend = `artifacts/api-server/src/`.

**Firecrawl + budget (Fase 1, al klaar):**
- `lib/firecrawl.ts` — alle Firecrawl-aanroepen + de nieuwe budget-guardrails
  (`BudgetContext`, `budgetBlockReason`, `recordUsage`, `isPdfUrl`,
  `firecrawlSearch`, `firecrawlDiscover`, `firecrawlScrapeUrls`,
  `firecrawlResearchSearch`, `firecrawlReadPaperPassages`). Dit is de
  centrale plek waar élke credit langsloopt.
- `lib/supabase.ts` — `restService<T>(path, init)` is de service-role
  PostgREST-helper die je overal gebruikt om de DB te lezen/schrijven.

**Crawl-pipeline (taak-queue):**
- `lib/pipeline-worker.ts` — dispatcht `pipeline_tasks` op `taskType`.
- `lib/pipeline-tasks/curriculum-design.ts` — `runCurriculumDesign()`: plant
  hoofdstukken, fan-out van één `source_gathering`-taak per hoofdstuk.
- `lib/pipeline-tasks/source-gathering.ts` — `runSourceGathering()`: het
  goede twee-fasen-pad (discover → score → scrape-alleen-winnaars).
- `lib/pipeline-tasks/source-review.ts` — `runSourceReview()`: de huidige
  **bronbeoordelaar** (keep/reject + gap-queries). Dit is de component die in
  Fase 2b samensmelt met de crawlhandler tot het crawl-brein.
- `lib/pipeline-tasks/task-log.ts` — `taskLog()`/`logTask()` schrijven naar
  `pipeline_task_logs` (al zichtbaar in de admin-console). Fundament voor de
  traceerbaarheids-ask (Fase 2d).
- `lib/pipeline-tasks/source-store.ts` — `upsertSource()`,
  `linkSourceToSubject/Chapter()`, `setSourceStatus()`.
- `lib/pipeline-tasks/context.ts` — `loadSubject/Chapter/...`,
  `saveStudyContent()`. Let op de bewuste cost-caps hier (max 5 bronnen,
  3000 tekens) — goed precedent voor kostenbewust ontwerp.

**Legacy admin-crawl-pad (ook al gebudget-gate in Fase 1):**
- `lib/source-pipeline.ts` — `runCrawl()` / `runFirecrawlSearch()` +
  `scoreBatch()` / `determineAcceptance()` / `rescoreSource()`.
- `routes/crawl.ts` — admin REST-routes: subject-CRUD/approve/deny/refine,
  `POST /admin/crawl/run`, crawl-historie, de **twijfelbron**-lijst
  (`GET /admin/crawl/pending`), en `accept/decline/rescore`. Het
  `decline`-endpoint neemt al een `reason` aan — dat is de haak voor Fase 2d.

**AI-laag:**
- `lib/ai.ts` — `STRONG_MODEL`/`FAST_MODEL` + `callStrongJson`/`callFastJson`/
  `callFastText`. Nog géén PDF/document-input — dat moet je in Fase 1.5
  toevoegen (`@anthropic-ai/sdk` is al een dependency).

**Frontend (admin-UI, waar nieuwe zichtbaarheid moet komen):**
- `artifacts/geslaagd-app/src/pages/admin-crawl-page.tsx` — de "Crawl
  starten"-knop, crawl-historie, en de plek voor tier-keuze (2a) en de
  per-vak memory-view (2c).

**DB / migraties:**
- `supabase/migrations/` — chronologische SQL-bestanden. De veiligheids-
  migratie is `2026083001_firecrawl_credit_guardrails.sql`. Nieuwe tabellen
  (crawl-memory in 2c) komen hier als nieuw genummerd bestand bij.

## 7. Kant-en-klare startprompt voor de nieuwe sessie

Plak dit als eerste bericht in de nieuwe Claude-sessie (samen met dit document
in de repo):

```
Je gaat verder werken aan het crawl-systeem van geslaagd.app. Een vorige sessie
heeft de urgente veiligheidsfix (Fase 1) al gebouwd en gepusht, plus een
volledig overdrachtsdocument achtergelaten.

EERSTE STAP — verplicht voordat je iets anders doet:
Lees `docs/crawl-safety-handoff.md` volledig en grondig. Begin bij het blok
"▶ START HIER" bovenaan. Daarin staan mijn oorspronkelijke vraag (verbatim),
vier bindende beslissingen (die NIET opnieuw bediscussieerd mogen worden),
precies wat Fase 1 al heeft opgeleverd (commit 7e36aea), een bestandenkaart,
en een concreet stappenplan voor Fase 1.5 t/m 2d. Lees ook `CLAUDE.md` in de
repo-root.

Werk op branch `claude/repo-replit-sync-vgwk3g`. Migraties via de Supabase
MCP-tool toepassen ÉN als bestand in `supabase/migrations/` wegschrijven. Draai
`pnpm --filter api-server run typecheck` vóór elke commit.

Begin met Fase 1.5 (gratis PDF-volledige-tekst voor geaccepteerde bronnen,
buiten Firecrawl om). Laat me eerst kort je aanpak zien vóór je aan Fase 2b
(het samengevoegde crawl-brein) begint — dat is de grootste architecturale
stap en die wil ik meebeslissen.

Bouw in fasen, niet alles in één keer. Check tussentijds bij mij in bij elke
grote stap. Stel gerust zoveel vragen als nodig — ik geef liever input zodat
het resultaat beter wordt. En als je zelf een beter idee hebt (over crawls of
andere systemen), zeg het. Wees zuinig met tokens: lees gericht, niet meer
bestanden dan nodig.
```
