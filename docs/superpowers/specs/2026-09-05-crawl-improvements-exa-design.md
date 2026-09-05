# Crawl-verbeteringen (Exa + efficiëntie) — Design Spec

**Datum:** 2026-09-05
**Status:** Goedgekeurd (ontwerp)
**Scope:** Uitbreiding van de bestaande bron-discovery/scrape-laag met (1) een tweede
discovery-provider (Exa, semantisch), (2) slimmere query-planning, (3) een goedkope
pre-filter, (4) een cross-vak content-cache, (5) bredere trusted-domain-mapping, en
(6) vroeger afkappen van kansloze kandidaten — onder één gezamenlijk kostenbudget.

---

## 1. Doel

De crawl **zoekgerichter, kwalitatief beter en efficiënter** maken zonder de
crawl-brain (scoring, acceptatie, geheugen, PDF-fetch, taakstructuur) te herschrijven.
We voeden dezelfde scoring-pipeline méér en betere kandidaten, tegen lagere kosten.

**Build-vs-buy is beslist:** we bouwen géén eigen crawler. Op onze schaal (300–600
credits per vak) wint zelf-hosten economisch niet op, en het zou een heel nieuw
subsysteem (anti-bot, proxies, JS-rendering, DOM-onderhoud) toevoegen. We blijven op
Firecrawl voor extractie en voegen Exa toe voor semantische discovery.

## 2. Context — huidige architectuur

De crawl gebruikt vandaag **Firecrawl** met een eigen "crawl-brain" eromheen. Relevante
bestanden:

- `artifacts/api-server/src/lib/firecrawl.ts` — `firecrawlDiscover` (snippets, geen
  scrape), `firecrawlScrapeUrls` (markdown + links, alleen winnaars), `firecrawlMap`
  (1 credit/domein), `firecrawlResearchSearch`, plus het credit-budget (`firecrawl_usage`,
  `budgetBlockReason`, `recordUsage`, fail-closed).
- `artifacts/api-server/src/lib/crawl-brain/scoring.ts` — `scoreBatch` (OpenAI FAST_MODEL),
  `determineAcceptance`.
- `artifacts/api-server/src/lib/crawl-brain/links.ts` — `filterCandidateLinks` (gratis
  link-following uit al-betaalde scrapes).
- `artifacts/api-server/src/lib/pipeline-tasks/source-gathering.ts` — de orchestrator:
  fase A (discover snippets) → A2 (trusted-domain map) → scoren op snippet → fase B
  (scrape winnaars) → fase C (gratis link-following) → research-papers → opslaan.
- `artifacts/api-server/src/lib/pipeline-tasks/source-store.ts` — `upsertSource`
  (**globaal gededupliceerd op `url`**, `on_conflict=url`), `linkSourceToSubject`,
  `linkSourceToChapter`.
- `artifacts/api-server/src/lib/domain-reputation.ts` — `recordDomainOutcome`,
  `getTrustedDomains` (cap 2, ≥3 accepts, ≤⅓ declines), `getDomainReputation`.
- `artifacts/api-server/src/lib/pipeline-tasks/curriculum-design.ts` — genereert per
  hoofdstuk `crawlConfigs[].queries` (2-3 stuks) en bindende `topicTags` (3-6 subthema's
  die het hoofdstuk MOET dekken).

Het tweefasen-model (goedkope snippets → scoren → alleen winnaars scrapen) is het
kostenanker. **Elke nieuwe provider en fase in deze spec respecteert datzelfde model:
discovery levert alleen goedkope snippets/highlights; echte content wordt alleen voor
winnaars opgehaald; de cache wordt vóór elke betaalde fetch geraadpleegd.**

## 3. Architectuurprincipes

1. **Crawl-brain blijft ongemoeid.** Scoring-prompt, acceptatie-heuristiek, geheugen,
   PDF-fetch en taakstructuur veranderen niet. Kandidaten zien er voor `scoreBatch`
   identiek uit, ongeacht de provider.
2. **Tweefasen-kostenmodel blijft leidend.** Discovery = snippets/highlights (goedkoop).
   Content = alleen winnaars. Cache eerst.
3. **Additief en isoleerbaar.** Exa draait náást Firecrawl; als Exa faalt of geen key
   heeft, draait de crawl gewoon door op Firecrawl alleen (fail-open voor resilience,
   net als `getGlobalExcludedDomains`). Budgetchecks blijven fail-closed.
4. **Eén kostenbudget.** Firecrawl- én Exa-kosten lopen door dezelfde per-vak
   budgetgrens.

## 4. Componenten

### 4.1 `exa.ts` (nieuw) — Exa-provider

Spiegelt de vorm van `firecrawl.ts`. Leest `EXA_API_KEY`. Alle netwerk-calls zijn
budget-gated (`budgetBlockReason` vóór, `recordUsage` ná) net als Firecrawl.

Endpoints (Exa API, `https://api.exa.ai`):

```ts
export type ExaResult = {
  url: string;
  title?: string;
  snippet?: string;   // uit highlights (goedkoop, "10x token-efficient")
  text?: string;      // alleen gevuld door exaContents, niet door discovery
};

// Discovery: type 'auto', highlights als snippet, GEEN full text (kosten op rejects vermijden).
// numResults = config.limitPerQuery. Categorie 'publication' als config.useResearchIndex.
export async function exaSearch(
  query: string, config: CrawlConfig, ctx: BudgetContext,
): Promise<{ results: ExaResult[]; costCredits: number }>;

// Full text voor één winnaar-URL (POST /contents, text:true). Alleen voor Exa-winnaars zonder cache-hit.
export async function exaContents(
  url: string, ctx: BudgetContext,
): Promise<{ text: string | null; costCredits: number }>;

// Vind vergelijkbare pagina's bij een geaccepteerd zaad (POST /findSimilar). Highlights als snippet.
export async function exaFindSimilar(
  url: string, ctx: BudgetContext, numResults: number,
): Promise<{ results: ExaResult[]; costCredits: number }>;
```

Kostnormalisatie (zie §5): elke call retourneert `costCredits` (Exa-dollars →
credit-equivalent), zodat de bestaande budget-boekhouding ongewijzigd blijft werken.

**Kostenbegrenzing voor Exa:** Exa's waarde is semantische *breedte*, niet uitputtende
dekking. Daarom draait Exa in fase A **alleen de primaire query per hoofdstuk**
(`config.queries[0]`), niet alle queries. Zo is de Exa-uitgave per gather voorspelbaar
(~1 search + evt. find-similar), terwijl Firecrawl de volledige keyword-dekking blijft
leveren.

### 4.2 `discovery.ts` (nieuw) — samengevoegde discovery

Draait Firecrawl-discover én Exa-search en voegt de kandidaten samen, gededupliceerd op
URL. Vervangt de directe `firecrawlDiscover`-aanroep in `source-gathering` fase A.

```ts
export type Candidate = {
  url: string;
  title?: string;
  description?: string;   // snippet/highlight — voedt scoreBatch net als vandaag
  provider: "firecrawl" | "exa";
  exaText?: string;       // ongebruikt in discovery; gereserveerd voor content-hergebruik
};

export async function discoverCandidates(
  config: CrawlConfig, ctx: BudgetContext,
): Promise<{ candidates: Candidate[]; firecrawlCredits: number; exaCredits: number }>;
```

Merge-regels:
- Dedup op exacte URL; bij dubbele URL wint de bestaande (eerste) kandidaat, provider
  blijft die van de eerste hit.
- Firecrawl-fout of Exa-fout is niet-fataal: de andere provider levert alsnog kandidaten
  (per-provider try/catch, gelogd).
- `Candidate.description` mapt 1-op-1 op wat `scoreBatch` vandaag als snippet leest, dus
  scoring blijft onveranderd.

### 4.3 `prefilter.ts` (nieuw) — goedkope gate vóór de scorer (#3 + #6)

Verwijdert kandidaten **voordat** de scoring-LLM draait, zodat kansloze kandidaten geen
scoring-call kosten en de review schoon blijft.

```ts
export async function prefilterCandidates(
  candidates: Candidate[], knownUrls: Set<string>,
): Promise<Candidate[]>;
```

Regels (een kandidaat valt af bij één match):
- Al bekend (`knownUrls`).
- Domein in `excluded_domains` (hergebruik `getGlobalExcludedDomains`).
- Opleidings-/admissiepagina (hergebruik de bestaande `looksLikeProgrammePage`-heuristiek;
  verplaatsen naar `prefilter.ts` zodat één plek verantwoordelijk is).
- Asset/login/account-paden (hergebruik `SKIP_PATTERNS` uit `links.ts`).
- Slechte domeinreputatie: `getDomainReputation` met `declinedCount ≥ 5` én
  `acceptedCount === 0` → afvallen (hard kansloos; drempel bewust conservatief).

**Taal wordt bewust niet op snippet gefilterd** — te onbetrouwbaar; dat blijft aan de
scorer.

### 4.4 Content-cache (#4)

Nieuwe helper in `source-store.ts`:

```ts
export async function getStoredContentByUrl(urls: string[]): Promise<Map<string, string>>;
```

Haalt bestaande niet-lege `sources.full_content` op voor de gegeven URL's. In
`source-gathering` fase B: vóór élke betaalde content-fetch (Firecrawl-scrape óf
`exaContents`) eerst deze map raadplegen; bij een hit wordt de opgeslagen markdown
hergebruikt en gebeurt er geen paid fetch. Score wordt nog steeds per vak herberekend
(goedkope OpenAI-call). Dit maakt cross-vak hergebruik gratis, omdat `sources` al globaal
op URL is gededupliceerd.

### 4.5 Winnaar-content-ophaling (content-hergebruik, §4.1/§4.4 samengevoegd)

Voor elke winnaar (status ≠ declined) in fase B, in volgorde:
1. **Cache** (`getStoredContentByUrl`) → hit? gebruik opgeslagen markdown, klaar.
2. Anders, kandidaat van **Exa** → `exaContents(url)` → gebruik tekst.
3. Anders (Firecrawl of Exa zonder tekst) → `firecrawlScrapeUrls([url])`.

PDF-URL's blijven de bestaande gratis zelf-fetch-route volgen (`enrichAcceptedPdfSource`),
ongewijzigd.

### 4.6 Find-similar (#1, kwaliteitshefboom)

Na fase B, voor elke **geaccepteerde** bron als zaad: `exaFindSimilar(url, ctx, N)`. De
resultaten worden als extra `Candidate`s door `prefilter` → `scoreBatch` →
content-ophaling (§4.5) gehaald, precies als gewone kandidaten. Begrensd door
`FIND_SIMILAR_SEED_CAP` geaccepteerde zaden per gather en `FIND_SIMILAR_RESULTS` per zaad,
en budget-gated. Dit is de betaalde tegenhanger van het bestaande gratis link-following.

### 4.7 Query-planning met hoeken (#2)

In `curriculum-design.ts`: de query-generatie-instructie wordt uitgebreid zodat de queries
per hoofdstuk de bindende `topicTags` dekken langs een kleine hoek-taxonomie —
**uitleg**, **voorbeeld/oefening**, **samenvatting/examen** — in plaats van 2-3 generieke
queries. Harde cap **`MAX_QUERIES_PER_CHAPTER = 4`** in de normalisatie van `crawlConfigs`
(afkappen ná de LLM-respons), zodat de zoekkosten begrensd blijven. Geen nieuwe
datastructuur; `config.queries` blijft een `string[]`.

### 4.8 Bredere trusted-domain-mapping (#5)

`getTrustedDomains(limit)`-default 2 → **`TRUSTED_DOMAIN_CAP = 5`**, zelfde kwaliteitsbar
(≥3 accepts, ≤⅓ declines). `source-gathering` fase A2 blijft verder identiek (map =
1 credit/domein).

## 5. Gezamenlijk kostenbudget

`firecrawl_usage` krijgt een kolom **`provider text not null default 'firecrawl'`**.
Exa-calls worden in dezelfde tabel gelogd met `provider = 'exa'` en hun
credit-equivalent in `credits`. `budgetBlockReason`/`remainingBudget` sommeren over álle
rijen (beide providers) tegen dezelfde per-vak `credit_budget` — geen wijziging in de
guardrail-logica zelf, alleen bredere som.

**Normalisatie (configureerbare constanten, richtwaarde bij Firecrawl Standard
≈ $0.00083/credit):**

| Exa-call | Exa-prijs | Credit-equivalent (constante) |
|---|---|---|
| `exaSearch` (≤10 res, `auto`) | ~$0.007 | `EXA_SEARCH_CREDITS = 8` |
| `exaContents` (per pagina) | ~$0.001 | `EXA_CONTENTS_CREDITS = 1` |
| `exaFindSimilar` | ~$0.007 | `EXA_SEARCH_CREDITS = 8` |

De constanten staan bovenin `exa.ts` met een comment dat verwijst naar deze tabel, zodat
ze bij prijswijzigingen op één plek bij te stellen zijn. Ze zijn een *budget*-benadering,
geen facturatie.

## 6. Configuratieconstanten (één plek per module)

| Constante | Waarde | Plek |
|---|---|---|
| `MAX_QUERIES_PER_CHAPTER` | 4 | `curriculum-design.ts` |
| `TRUSTED_DOMAIN_CAP` | 5 | `domain-reputation.ts` |
| `FIND_SIMILAR_SEED_CAP` | 3 | `source-gathering.ts` |
| `FIND_SIMILAR_RESULTS` | 5 | `source-gathering.ts` |
| `EXA_SEARCH_CREDITS` | 8 | `exa.ts` |
| `EXA_CONTENTS_CREDITS` | 1 | `exa.ts` |
| `PREFILTER_DECLINE_THRESHOLD` | 5 | `prefilter.ts` |

## 7. Datamodel-wijzigingen

Eén migratie (`supabase/migrations/YYYYMMDDNN_crawl_usage_provider.sql`, plus via Supabase
MCP `apply_migration`):

```sql
alter table public.firecrawl_usage
  add column provider text not null default 'firecrawl';
```

Geen nieuwe tabellen. `sources`, `domain_reputation`, `crawl_memory` blijven ongewijzigd.

## 8. Omgevingsvariabelen

- `EXA_API_KEY` — nieuw, in `artifacts/api-server/.env` (gitignored). Ontbreekt de key,
  dan slaat `discovery.ts` de Exa-tak stil over (fail-open) en draait de crawl op
  Firecrawl alleen.

## 9. Verificatie

Geen testframework in deze repo; verificatie via wegwerp-`scratch-*.ts`-scripts, gedraaid
met `npx tsx --env-file=artifacts/api-server/.env <file>.ts` tegen de echte backend + echte
Exa-key, met opruimen van testrijen erna:

1. `exaSearch` levert relevante NL-studieresultaten voor een voorbeeldquery (bijv.
   "fotosynthese VWO uitleg"); highlights zijn gevuld, `text` niet.
2. `discoverCandidates` voegt Firecrawl + Exa samen en dedupliceert overlappende URL's.
3. `prefilterCandidates` verwijdert een bekende opleidingspagina en een geblokkeerd domein,
   behoudt een echte bron.
4. `getStoredContentByUrl` geeft opgeslagen markdown terug voor een bestaande source-URL en
   niets voor een onbekende → fase B slaat de scrape over bij een hit.
5. `exaFindSimilar` levert kandidaten uit een geaccepteerd zaad.
6. Budget: na een Exa-call staat er een `firecrawl_usage`-rij met `provider='exa'`, en
   `budgetBlockReason` telt die mee.

Daarnaast een end-to-end droogloop van `runSourceGathering` op één hoofdstuk van een
testvak, met controle in de task-log dat beide providers bijdragen en de credits kloppen.

## 10. Bestandsoverzicht

**Nieuw:**
- `artifacts/api-server/src/lib/exa.ts`
- `artifacts/api-server/src/lib/crawl-brain/discovery.ts`
- `artifacts/api-server/src/lib/crawl-brain/prefilter.ts`
- `supabase/migrations/YYYYMMDDNN_crawl_usage_provider.sql`

**Gewijzigd:**
- `artifacts/api-server/src/lib/pipeline-tasks/source-gathering.ts` — discovery via
  `discoverCandidates`, pre-filter, cache-gate in fase B, content-hergebruik, find-similar.
- `artifacts/api-server/src/lib/pipeline-tasks/source-store.ts` — `getStoredContentByUrl`.
- `artifacts/api-server/src/lib/domain-reputation.ts` — `TRUSTED_DOMAIN_CAP`.
- `artifacts/api-server/src/lib/pipeline-tasks/curriculum-design.ts` — hoek-queries +
  `MAX_QUERIES_PER_CHAPTER`.
- `artifacts/api-server/src/lib/crawl-brain/index.ts` — exporteert `discovery` + `prefilter`.
- `artifacts/api-server/src/lib/firecrawl.ts` — `recordUsage` accepteert een `provider`
  (default `'firecrawl'`); `remainingBudget` blijft ongewijzigd (telt al alle rijen).

**Verplaatst:**
- `looksLikeProgrammePage` van `source-gathering.ts` → `prefilter.ts` (één
  verantwoordelijke plek voor kandidaat-filtering).

## 11. Buiten scope

- Scoring-model/prompt, acceptatie-heuristiek, crawl-geheugen, PDF-fetch, taakstructuur.
- Vervangen van Firecrawl of zelf-hosten van een crawler (bewust afgewezen, §1).
- Provider-kostenmonitoring-UI (kan later; de data landt al in `firecrawl_usage`).
- Strikte taalfiltering in de pre-filter.
