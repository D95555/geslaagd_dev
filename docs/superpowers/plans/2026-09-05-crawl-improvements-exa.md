# Crawl-verbeteringen (Exa + efficiëntie) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De bron-discovery/scrape-laag uitbreiden met Exa (semantische discovery, content-hergebruik, find-similar), angle-diverse query-planning, een goedkope pre-filter, een cross-vak content-cache en bredere trusted-domain-mapping — onder één gezamenlijk Firecrawl+Exa kostenbudget.

**Architecture:** Alles zit in de discovery/scrape-laag; de crawl-brain (scoring, acceptatie, geheugen, PDF-fetch, taakstructuur) blijft ongemoeid. Twee nieuwe providers-/orchestratiemodules (`exa.ts`, `discovery.ts`) en een pre-filter (`prefilter.ts`) voeden dezelfde `scoreBatch`-pipeline; het tweefasen-kostenmodel (goedkope snippets → scoren → alleen winnaars content ophalen, cache eerst) blijft leidend.

**Tech Stack:** TypeScript (Node/Express api-server), PostgREST via `restService()`, Supabase (migraties via MCP `apply_migration` + `supabase/migrations/*.sql`), OpenAI FAST_MODEL voor scoring, Firecrawl v2 API, Exa API.

**Spec:** `docs/superpowers/specs/2026-09-05-crawl-improvements-exa-design.md`

## Global Constraints

- **Geen testframework in deze repo.** Verificatie via wegwerp-`scratch-*.ts` in `artifacts/api-server/`, gedraaid met `npx tsx --env-file=.env <file>.ts` vanuit `artifacts/api-server/`. Ruim elk scratch-bestand en elke testrij op vóór de commit. Typecheck met `pnpm --filter api-server run typecheck`.
- **Budget-discipline (verplicht in `exa.ts`):** elke Exa-netwerkcall wordt voorafgegaan door `budgetBlockReason(ctx)` en gevolgd door `recordUsage(ctx, operation, credits, "exa")`. Bij een budget-block: niet callen.
- **Fail-open voor resilience, fail-closed voor budget.** Exa-fouten en een ontbrekende `EXA_API_KEY` mogen de crawl niet stoppen (Firecrawl draait door). Een budget-checkfout blokkeert de spend.
- **Config-constanten (exacte waarden):** `MAX_QUERIES_PER_CHAPTER = 4`, `TRUSTED_DOMAIN_CAP = 5`, `FIND_SIMILAR_SEED_CAP = 3`, `FIND_SIMILAR_RESULTS = 5`, `EXA_SEARCH_CREDITS = 8`, `EXA_CONTENTS_CREDITS = 1`, `PREFILTER_DECLINE_THRESHOLD = 5`.
- **Exa HTTP:** base `https://api.exa.ai`, header `x-api-key: <EXA_API_KEY>`. Discovery gebruikt `contents.highlights` (goedkoop), nooit `contents.text` in discovery.
- **Crawl-brain niet wijzigen:** `scoring.ts`, `crawl-memory.ts`, `pdf-fetch.ts`, taakstructuur blijven ongemoeid.

---

### Task 1: Gezamenlijk budget — `provider`-kolom + `recordUsage`-parameter

**Files:**
- Create: `supabase/migrations/2026090503_crawl_usage_provider.sql`
- Modify: `artifacts/api-server/src/lib/firecrawl.ts` (`recordUsage`, ~139-154)
- Scratch: `artifacts/api-server/scratch-usage-provider.ts`

**Interfaces:**
- Produces: `recordUsage(ctx: BudgetContext, operation: string, credits: number, provider?: "firecrawl" | "exa"): Promise<void>` — default `provider = "firecrawl"`, schrijft de kolom `provider` mee. `remainingBudget` blijft ongewijzigd (sommeert al alle rijen, ongeacht provider).

- [ ] **Step 1: Migratie schrijven**

Maak `supabase/migrations/2026090503_crawl_usage_provider.sql`:

```sql
alter table public.firecrawl_usage
  add column provider text not null default 'firecrawl';
```

- [ ] **Step 2: Migratie toepassen via Supabase MCP**

Roep `apply_migration` aan (project_id `xpguhyuvooeizrjjrpkw`, name `crawl_usage_provider`) met exact dezelfde SQL als Step 1.

- [ ] **Step 3: `recordUsage` uitbreiden met provider**

In `artifacts/api-server/src/lib/firecrawl.ts`, vervang de functie `recordUsage`:

```ts
export async function recordUsage(
  ctx: BudgetContext,
  operation: string,
  credits: number,
  provider: "firecrawl" | "exa" = "firecrawl",
): Promise<void> {
  if (credits <= 0) return;
  try {
    await restService("firecrawl_usage", {
      method: "POST",
      body: JSON.stringify({
        subject_id: ctx.subjectId,
        crawl_id: ctx.crawlId ?? null,
        operation,
        credits,
        provider,
      }),
    });
  } catch (error) {
    logger.error({ error, ctx, operation, credits, provider }, "Failed to record crawl usage");
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter api-server run typecheck`
Expected: geen fouten.

- [ ] **Step 5: Scratch-verificatie tegen echte backend**

Maak `artifacts/api-server/scratch-usage-provider.ts`:

```ts
import { recordUsage } from "./src/lib/firecrawl";
import { restService } from "./src/lib/supabase";

async function main() {
  const subjectRows = await restService<{ id: string }[]>("crawl_subjects?select=id&limit=1");
  const subjectId = subjectRows[0]?.id;
  if (!subjectId) throw new Error("Geen crawl_subjects om mee te testen.");
  const ctx = { subjectId, crawlId: null };

  await recordUsage(ctx, "test-exa", 8, "exa");
  const rows = await restService<Record<string, unknown>[]>(
    `firecrawl_usage?subject_id=eq.${subjectId}&operation=eq.test-exa&select=id,provider,credits`,
  );
  console.log("rijen:", rows);
  if (rows[0]?.provider !== "exa") throw new Error("provider niet 'exa'");

  // opruimen
  await restService(`firecrawl_usage?id=eq.${rows[0]!.id}`, { method: "DELETE" });
  console.log("OK");
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Run: `cd artifacts/api-server && npx tsx --env-file=.env scratch-usage-provider.ts`
Expected: print `provider: 'exa'` en `OK`.

- [ ] **Step 6: Scratch opruimen + commit**

```bash
rm artifacts/api-server/scratch-usage-provider.ts
git add supabase/migrations/2026090503_crawl_usage_provider.sql artifacts/api-server/src/lib/firecrawl.ts
git commit -m "Crawl-budget: provider-kolom + recordUsage telt Firecrawl en Exa samen"
```

---

### Task 2: `exa.ts` — Exa-provider (search, contents, findSimilar)

**Files:**
- Create: `artifacts/api-server/src/lib/exa.ts`
- Scratch: `artifacts/api-server/scratch-exa.ts`

**Interfaces:**
- Consumes: `budgetBlockReason`, `recordUsage`, `getGlobalExcludedDomains`, `type BudgetContext`, `type CrawlConfig` (uit `firecrawl.ts`); `logger`.
- Produces:
  - `type ExaResult = { url: string; title?: string; snippet?: string; text?: string }`
  - `exaSearch(query: string, config: CrawlConfig, ctx: BudgetContext): Promise<{ results: ExaResult[]; costCredits: number }>`
  - `exaContents(url: string, ctx: BudgetContext): Promise<{ text: string | null; costCredits: number }>`
  - `exaFindSimilar(url: string, ctx: BudgetContext, numResults: number): Promise<{ results: ExaResult[]; costCredits: number }>`
  - `hasExaKey(): boolean`

- [ ] **Step 1: `exa.ts` schrijven**

Maak `artifacts/api-server/src/lib/exa.ts`:

```ts
import { budgetBlockReason, recordUsage, getGlobalExcludedDomains, type BudgetContext, type CrawlConfig } from "./firecrawl";
import { logger } from "./logger";

// Credit-equivalent van Exa-kosten, genormaliseerd op Firecrawls per-page-credit
// (~$0.00083 bij Standard). Zie de design-spec §5; alleen een budget-benadering.
const EXA_SEARCH_CREDITS = 8;   // ~$0.007 per search (<=10 resultaten)
const EXA_CONTENTS_CREDITS = 1; // ~$0.001 per pagina

const EXA_BASE = "https://api.exa.ai";

export type ExaResult = { url: string; title?: string; snippet?: string; text?: string };

type ExaApiResult = { url?: string; title?: string; highlights?: string[]; text?: string };

export function hasExaKey(): boolean {
  return Boolean(process.env.EXA_API_KEY);
}

function apiKey(): string {
  const key = process.env.EXA_API_KEY;
  if (!key) throw new Error("EXA_API_KEY is not configured.");
  return key;
}

async function exaFetch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${EXA_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey() },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Exa ${path} failed (${response.status}).`);
  return (await response.json()) as T;
}

function toResults(apiResults: ExaApiResult[] | undefined): ExaResult[] {
  return (apiResults ?? [])
    .filter((r): r is ExaApiResult & { url: string } => Boolean(r.url))
    .map((r) => ({
      url: r.url,
      title: r.title,
      snippet: r.highlights?.join(" ").slice(0, 800),
      text: r.text,
    }));
}

/** Semantische discovery: highlights als snippet (goedkoop), geen full text. */
export async function exaSearch(
  query: string,
  config: CrawlConfig,
  ctx: BudgetContext,
): Promise<{ results: ExaResult[]; costCredits: number }> {
  if (await budgetBlockReason(ctx)) return { results: [], costCredits: 0 };
  const globalExcluded = await getGlobalExcludedDomains();
  const excludeDomains = [...new Set([...config.excludeDomains, ...globalExcluded])];
  try {
    const body = {
      query,
      type: "auto",
      numResults: config.limitPerQuery,
      ...(config.useResearchIndex ? { category: "publication" } : {}),
      ...(config.includeDomains.length ? { includeDomains: config.includeDomains } : {}),
      ...(excludeDomains.length ? { excludeDomains } : {}),
      contents: { highlights: { numSentences: 3 } },
    };
    const data = await exaFetch<{ results?: ExaApiResult[] }>("/search", body);
    await recordUsage(ctx, "exa_search", EXA_SEARCH_CREDITS, "exa");
    return { results: toResults(data.results), costCredits: EXA_SEARCH_CREDITS };
  } catch (error) {
    logger.warn({ error, query }, "Exa search failed; continuing without Exa results");
    return { results: [], costCredits: 0 };
  }
}

/** Full text voor één winnaar-URL. Alleen aanroepen voor Exa-winnaars zonder cache-hit. */
export async function exaContents(
  url: string,
  ctx: BudgetContext,
): Promise<{ text: string | null; costCredits: number }> {
  if (await budgetBlockReason(ctx)) return { text: null, costCredits: 0 };
  try {
    const data = await exaFetch<{ results?: ExaApiResult[] }>("/contents", {
      urls: [url],
      text: { maxCharacters: 10000 },
    });
    await recordUsage(ctx, "exa_contents", EXA_CONTENTS_CREDITS, "exa");
    return { text: data.results?.[0]?.text ?? null, costCredits: EXA_CONTENTS_CREDITS };
  } catch (error) {
    logger.warn({ error, url }, "Exa contents failed; will fall back to Firecrawl scrape");
    return { text: null, costCredits: 0 };
  }
}

/** Vind vergelijkbare pagina's bij een geaccepteerd zaad; highlights als snippet. */
export async function exaFindSimilar(
  url: string,
  ctx: BudgetContext,
  numResults: number,
): Promise<{ results: ExaResult[]; costCredits: number }> {
  if (await budgetBlockReason(ctx)) return { results: [], costCredits: 0 };
  try {
    const data = await exaFetch<{ results?: ExaApiResult[] }>("/findSimilar", {
      url,
      numResults,
      excludeSourceDomain: true,
      contents: { highlights: { numSentences: 3 } },
    });
    await recordUsage(ctx, "exa_find_similar", EXA_SEARCH_CREDITS, "exa");
    return { results: toResults(data.results), costCredits: EXA_SEARCH_CREDITS };
  } catch (error) {
    logger.warn({ error, url }, "Exa findSimilar failed; skipping expansion");
    return { results: [], costCredits: 0 };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter api-server run typecheck`
Expected: geen fouten.

- [ ] **Step 3: Scratch-verificatie tegen echte Exa-API**

Maak `artifacts/api-server/scratch-exa.ts`:

```ts
import { exaSearch, exaContents, exaFindSimilar, hasExaKey } from "./src/lib/exa";
import { defaultCrawlConfig } from "./src/lib/firecrawl";
import { restService } from "./src/lib/supabase";

async function main() {
  if (!hasExaKey()) throw new Error("EXA_API_KEY ontbreekt in .env");
  const subjectId = (await restService<{ id: string }[]>("crawl_subjects?select=id&limit=1"))[0]?.id;
  if (!subjectId) throw new Error("Geen crawl_subjects om mee te testen.");
  const ctx = { subjectId, crawlId: null };
  const config = defaultCrawlConfig(["fotosynthese VWO uitleg"]);

  const search = await exaSearch("fotosynthese VWO uitleg", config, ctx);
  console.log("search:", search.results.length, "eerste:", search.results[0]?.url, "snippet?", Boolean(search.results[0]?.snippet), "text leeg?", !search.results[0]?.text);
  if (search.results.length === 0) throw new Error("Exa search gaf geen resultaten");

  const contents = await exaContents(search.results[0]!.url, ctx);
  console.log("contents text len:", contents.text?.length ?? 0);

  const similar = await exaFindSimilar(search.results[0]!.url, ctx, 5);
  console.log("findSimilar:", similar.results.length);

  // opruimen van de testusage-rijen
  await restService(`firecrawl_usage?subject_id=eq.${subjectId}&provider=eq.exa`, { method: "DELETE" });
  console.log("OK");
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Run: `cd artifacts/api-server && npx tsx --env-file=.env scratch-exa.ts`
Expected: search levert resultaten met een gevuld `snippet` en lege `text`; contents geeft tekst; findSimilar levert resultaten; print `OK`.

- [ ] **Step 4: Scratch opruimen + commit**

```bash
rm artifacts/api-server/scratch-exa.ts
git add artifacts/api-server/src/lib/exa.ts
git commit -m "Exa-provider: semantische search, contents en find-similar (budget-gated)"
```

---

### Task 3: `discovery.ts` — samengevoegde discovery (Firecrawl + Exa)

**Files:**
- Create: `artifacts/api-server/src/lib/crawl-brain/discovery.ts`
- Scratch: `artifacts/api-server/scratch-discovery.ts`

**Interfaces:**
- Consumes: `firecrawlDiscover`, `type CrawlConfig`, `type BudgetContext` (uit `../firecrawl`); `exaSearch` (uit `../exa`).
- Produces:
  - `type Candidate = { url: string; title?: string; description?: string; provider: "firecrawl" | "exa"; exaText?: string }`
  - `discoverCandidates(config: CrawlConfig, ctx: BudgetContext): Promise<{ candidates: Candidate[]; firecrawlCredits: number; exaCredits: number }>`

- [ ] **Step 1: `discovery.ts` schrijven**

Maak `artifacts/api-server/src/lib/crawl-brain/discovery.ts`:

```ts
import { firecrawlDiscover, type CrawlConfig, type BudgetContext } from "../firecrawl";
import { exaSearch } from "../exa";

export type Candidate = {
  url: string;
  title?: string;
  description?: string;
  provider: "firecrawl" | "exa";
  exaText?: string;
};

/**
 * Draait Firecrawl-discover (alle queries) én Exa-search (alleen de primaire query,
 * om Exa-kosten voorspelbaar te houden — zie spec §4.1) en voegt de kandidaten samen,
 * gededupliceerd op URL. Bij een dubbele URL wint de eerste hit (Firecrawl gaat voor,
 * omdat het als eerste wordt toegevoegd). Elke provider faalt onafhankelijk.
 */
export async function discoverCandidates(
  config: CrawlConfig,
  ctx: BudgetContext,
): Promise<{ candidates: Candidate[]; firecrawlCredits: number; exaCredits: number }> {
  const byUrl = new Map<string, Candidate>();

  const { results: fcResults, creditsUsed: firecrawlCredits } = await firecrawlDiscover(config, ctx);
  for (const r of fcResults) {
    if (!r.url || byUrl.has(r.url)) continue;
    byUrl.set(r.url, { url: r.url, title: r.title, description: r.description, provider: "firecrawl" });
  }

  let exaCredits = 0;
  const primaryQuery = config.queries[0];
  if (primaryQuery) {
    const { results: exaResults, costCredits } = await exaSearch(primaryQuery, config, ctx);
    exaCredits = costCredits;
    for (const r of exaResults) {
      if (!r.url || byUrl.has(r.url)) continue;
      byUrl.set(r.url, {
        url: r.url,
        title: r.title,
        description: r.snippet,
        provider: "exa",
        exaText: r.text,
      });
    }
  }

  return { candidates: [...byUrl.values()], firecrawlCredits, exaCredits };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter api-server run typecheck`
Expected: geen fouten.

- [ ] **Step 3: Scratch-verificatie (echte providers)**

Maak `artifacts/api-server/scratch-discovery.ts`:

```ts
import { discoverCandidates } from "./src/lib/crawl-brain/discovery";
import { defaultCrawlConfig } from "./src/lib/firecrawl";
import { restService } from "./src/lib/supabase";

async function main() {
  const subjectId = (await restService<{ id: string }[]>("crawl_subjects?select=id&limit=1"))[0]?.id;
  if (!subjectId) throw new Error("Geen crawl_subjects om mee te testen.");
  const ctx = { subjectId, crawlId: null };
  const config = defaultCrawlConfig(["fotosynthese VWO uitleg", "fotosynthese lichtreactie samenvatting"]);

  const { candidates, firecrawlCredits, exaCredits } = await discoverCandidates(config, ctx);
  const urls = candidates.map((c) => c.url);
  console.log("kandidaten:", candidates.length, "fc:", firecrawlCredits, "exa:", exaCredits);
  console.log("providers:", { fc: candidates.filter((c) => c.provider === "firecrawl").length, exa: candidates.filter((c) => c.provider === "exa").length });
  if (new Set(urls).size !== urls.length) throw new Error("Dubbele URL's — dedup werkt niet");

  await restService(`firecrawl_usage?subject_id=eq.${subjectId}&provider=eq.exa`, { method: "DELETE" });
  console.log("OK");
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Run: `cd artifacts/api-server && npx tsx --env-file=.env scratch-discovery.ts`
Expected: kandidaten van beide providers, geen dubbele URL's, print `OK`.

- [ ] **Step 4: Scratch opruimen + commit**

```bash
rm artifacts/api-server/scratch-discovery.ts
git add artifacts/api-server/src/lib/crawl-brain/discovery.ts
git commit -m "Discovery: Firecrawl + Exa samengevoegd, gededupliceerd op URL"
```

---

### Task 4: `prefilter.ts` — goedkope gate vóór de scorer

**Files:**
- Create: `artifacts/api-server/src/lib/crawl-brain/prefilter.ts`
- Modify: `artifacts/api-server/src/lib/pipeline-tasks/source-gathering.ts` (verwijder `looksLikeProgrammePage`, ~36-55)
- Scratch: `artifacts/api-server/scratch-prefilter.ts`

**Interfaces:**
- Consumes: `type Candidate` (uit `./discovery`), `getGlobalExcludedDomains` (uit `../firecrawl`), `getDomainReputation` (uit `../domain-reputation`).
- Produces:
  - `looksLikeProgrammePage(url: string, title: string): boolean` (verplaatst hierheen)
  - `prefilterCandidates(candidates: Candidate[], knownUrls: Set<string>): Promise<Candidate[]>`
  - `PREFILTER_DECLINE_THRESHOLD = 5`

- [ ] **Step 1: `prefilter.ts` schrijven**

Maak `artifacts/api-server/src/lib/crawl-brain/prefilter.ts`. `looksLikeProgrammePage` wordt hierheen verplaatst vanuit `source-gathering.ts` (identieke body):

```ts
import { getGlobalExcludedDomains, type BudgetContext } from "../firecrawl";
import { getDomainReputation } from "../domain-reputation";
import type { Candidate } from "./discovery";

export const PREFILTER_DECLINE_THRESHOLD = 5;

// Structureel nooit een bruikbare studiebron: navigatie-chrome, account-/login-pagina's,
// of een directe asset-link. (Gelijk aan SKIP_PATTERNS in links.ts, hier hergebruikt voor
// kandidaat-URL's vóór scoring.)
const SKIP_PATTERNS = [/\/(login|signup|account|cart|share)\b/i, /\.(png|jpe?g|gif|svg|css|js)$/i];

/**
 * Opleidings-/admissiepagina's (studiekeuze, opleiding, toelating, …) ogen plausibel voor
 * een keyword-search maar bevatten nooit studietheorie. Verplaatst uit source-gathering.ts
 * zodat kandidaat-filtering één verantwoordelijke plek heeft.
 */
export function looksLikeProgrammePage(url: string, title: string): boolean {
  const haystack = `${url} ${title}`.toLowerCase();
  const markers = [
    "studiekeuze", "studiekiezer", "opleidingen", "/opleiding/", "toelatingseisen",
    "toelating", "inschrijven", "aanmelden", "open dag", "opendag", "studieprogramma",
    "onderwijsaanbod", "vakkenoverzicht", "programme-finder",
  ];
  return markers.some((marker) => haystack.includes(marker));
}

function hostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Verwijdert kansloze kandidaten vóór de scoring-LLM: al bekend, geblokkeerd domein,
 * opleidingspagina, asset/login-pad, of een domein met een slechte reputatie
 * (>= PREFILTER_DECLINE_THRESHOLD afwijzingen en nul acceptaties).
 */
export async function prefilterCandidates(
  candidates: Candidate[],
  knownUrls: Set<string>,
): Promise<Candidate[]> {
  const excludedDomains = new Set(await getGlobalExcludedDomains());
  const kept: Candidate[] = [];

  for (const candidate of candidates) {
    if (knownUrls.has(candidate.url)) continue;
    const host = hostname(candidate.url);
    if (host && excludedDomains.has(host)) continue;
    if (looksLikeProgrammePage(candidate.url, candidate.title ?? "")) continue;
    if (SKIP_PATTERNS.some((pattern) => pattern.test(candidate.url))) continue;

    const reputation = await getDomainReputation(candidate.url);
    if (reputation && reputation.acceptedCount === 0 && reputation.declinedCount >= PREFILTER_DECLINE_THRESHOLD) {
      continue;
    }
    kept.push(candidate);
  }
  return kept;
}

export type { BudgetContext };
```

- [ ] **Step 2: `looksLikeProgrammePage` uit `source-gathering.ts` verwijderen**

Verwijder in `artifacts/api-server/src/lib/pipeline-tasks/source-gathering.ts` de volledige `looksLikeProgrammePage`-functie (de JSDoc + functie, ~29-55). De import ervan komt in Task 8; laat de bestaande aanroep op ~143-145 voorlopig staan — die wordt in Task 8 vervangen. Om de tussenliggende commits compileerbaar te houden, voeg bovenaan de imports toe:

```ts
import { looksLikeProgrammePage } from "../crawl-brain/prefilter";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter api-server run typecheck`
Expected: geen fouten (de bestaande aanroep gebruikt nu de geïmporteerde functie).

- [ ] **Step 4: Scratch-verificatie (synthetische input, deterministisch)**

Maak `artifacts/api-server/scratch-prefilter.ts`:

```ts
import { prefilterCandidates } from "./src/lib/crawl-brain/prefilter";
import type { Candidate } from "./src/lib/crawl-brain/discovery";

async function main() {
  const candidates: Candidate[] = [
    { url: "https://voorbeeld.nl/fotosynthese-uitleg", title: "Fotosynthese uitleg", provider: "firecrawl" },
    { url: "https://universiteit.nl/opleidingen/biologie", title: "Opleidingen Biologie", provider: "firecrawl" },
    { url: "https://site.nl/login", title: "Inloggen", provider: "exa" },
    { url: "https://bekend.nl/al-gezien", title: "Al gezien", provider: "firecrawl" },
  ];
  const known = new Set(["https://bekend.nl/al-gezien"]);
  const kept = await prefilterCandidates(candidates, known);
  const urls = kept.map((c) => c.url);
  console.log("behouden:", urls);
  if (urls.length !== 1 || !urls[0]!.includes("fotosynthese-uitleg")) {
    throw new Error("Pre-filter liet niet exact de goede bron over");
  }
  console.log("OK");
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Run: `cd artifacts/api-server && npx tsx --env-file=.env scratch-prefilter.ts`
Expected: alleen de fotosynthese-uitleg-URL blijft over; print `OK`.

- [ ] **Step 5: Scratch opruimen + commit**

```bash
rm artifacts/api-server/scratch-prefilter.ts
git add artifacts/api-server/src/lib/crawl-brain/prefilter.ts artifacts/api-server/src/lib/pipeline-tasks/source-gathering.ts
git commit -m "Pre-filter: kansloze kandidaten weg vóór de scorer (domein, opleidingspagina, reputatie)"
```

---

### Task 5: Cross-vak content-cache — `getStoredContentByUrl`

**Files:**
- Modify: `artifacts/api-server/src/lib/pipeline-tasks/source-store.ts` (nieuwe export)
- Scratch: `artifacts/api-server/scratch-cache.ts`

**Interfaces:**
- Produces: `getStoredContentByUrl(urls: string[]): Promise<Map<string, string>>` — mapt elke URL met niet-lege `sources.full_content` op die content; URL's zonder opgeslagen content ontbreken in de map.

- [ ] **Step 1: Helper toevoegen aan `source-store.ts`**

Voeg onderaan `artifacts/api-server/src/lib/pipeline-tasks/source-store.ts` toe:

```ts
/**
 * Cross-vak content-cache: geeft voor de gevraagde URL's de al opgeslagen niet-lege
 * `sources.full_content` terug. `sources` is globaal op URL gededupliceerd, dus content
 * die voor een ander vak is opgehaald hoeft niet opnieuw (betaald) te worden gescraped.
 */
export async function getStoredContentByUrl(urls: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (urls.length === 0) return result;
  const inList = urls.map((url) => `"${encodeURIComponent(url)}"`).join(",");
  const rows = await restService<Row[]>(
    `sources?url=in.(${inList})&full_content=not.is.null&select=url,full_content`,
  );
  for (const row of rows) {
    const url = row.url as string;
    const content = row.full_content as string | null;
    if (url && content && content.length > 0) result.set(url, content);
  }
  return result;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter api-server run typecheck`
Expected: geen fouten.

- [ ] **Step 3: Scratch-verificatie tegen echte backend**

Maak `artifacts/api-server/scratch-cache.ts`:

```ts
import { getStoredContentByUrl } from "./src/lib/pipeline-tasks/source-store";
import { restService } from "./src/lib/supabase";

async function main() {
  const url = `https://scratch-cache-test.example/${Date.now()}`;
  const inserted = await restService<{ id: string }[]>("sources", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({ url, title: "cache test", full_content: "opgeslagen markdown" }),
  });
  const id = inserted[0]?.id;

  const map = await getStoredContentByUrl([url, "https://onbekend.example/x"]);
  console.log("hit:", map.get(url), "onbekend aanwezig?", map.has("https://onbekend.example/x"));
  if (map.get(url) !== "opgeslagen markdown" || map.has("https://onbekend.example/x")) {
    throw new Error("Cache-lookup klopt niet");
  }

  await restService(`sources?id=eq.${id}`, { method: "DELETE" });
  console.log("OK");
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Run: `cd artifacts/api-server && npx tsx --env-file=.env scratch-cache.ts`
Expected: hit geeft "opgeslagen markdown", onbekende URL ontbreekt; print `OK`.

- [ ] **Step 4: Scratch opruimen + commit**

```bash
rm artifacts/api-server/scratch-cache.ts
git add artifacts/api-server/src/lib/pipeline-tasks/source-store.ts
git commit -m "Content-cache: getStoredContentByUrl voor cross-vak hergebruik"
```

---

### Task 6: Bredere trusted-domain-mapping

**Files:**
- Modify: `artifacts/api-server/src/lib/domain-reputation.ts` (`getTrustedDomains`, ~60-74)
- Scratch: `artifacts/api-server/scratch-trusted.ts`

**Interfaces:**
- Produces: `TRUSTED_DOMAIN_CAP = 5`; `getTrustedDomains(limit?: number): Promise<string[]>` met default `TRUSTED_DOMAIN_CAP`.

- [ ] **Step 1: Cap verhogen en als constante exporteren**

In `artifacts/api-server/src/lib/domain-reputation.ts`, boven `getTrustedDomains`, voeg toe:

```ts
export const TRUSTED_DOMAIN_CAP = 5;
```

Wijzig de functiesignatuur `export async function getTrustedDomains(limit = 2)` naar:

```ts
export async function getTrustedDomains(limit = TRUSTED_DOMAIN_CAP): Promise<string[]> {
```

Laat de rest van de functie (query, filter op ≥3 accepts en ≤⅓ declines, `.slice(0, limit)`) ongewijzigd.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter api-server run typecheck`
Expected: geen fouten.

- [ ] **Step 3: Scratch-verificatie tegen echte backend**

Maak `artifacts/api-server/scratch-trusted.ts`:

```ts
import { getTrustedDomains, TRUSTED_DOMAIN_CAP } from "./src/lib/domain-reputation";

async function main() {
  const domains = await getTrustedDomains();
  console.log("cap:", TRUSTED_DOMAIN_CAP, "gevonden:", domains.length, domains);
  if (TRUSTED_DOMAIN_CAP !== 5) throw new Error("cap moet 5 zijn");
  if (domains.length > TRUSTED_DOMAIN_CAP) throw new Error("meer domeinen dan de cap");
  console.log("OK");
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Run: `cd artifacts/api-server && npx tsx --env-file=.env scratch-trusted.ts`
Expected: hoogstens 5 domeinen; print `OK`.

- [ ] **Step 4: Scratch opruimen + commit**

```bash
rm artifacts/api-server/scratch-trusted.ts
git add artifacts/api-server/src/lib/domain-reputation.ts
git commit -m "Trusted-domain mapping: cap 2 -> 5"
```

---

### Task 7: Angle-diverse query-planning + harde cap

**Files:**
- Modify: `artifacts/api-server/src/lib/pipeline-tasks/curriculum-design.ts` (prompt-instructie ~70-74; query-normalisatie ~231-232)
- Scratch: `artifacts/api-server/scratch-querycap.ts`

**Interfaces:**
- Produces: `MAX_QUERIES_PER_CHAPTER = 4`; een pure helper `capQueries(queries: string[]): string[]` die op ≤4 afkapt.

- [ ] **Step 1: Constante + cap-helper toevoegen**

Voeg in `artifacts/api-server/src/lib/pipeline-tasks/curriculum-design.ts` bij de andere top-level consts toe:

```ts
export const MAX_QUERIES_PER_CHAPTER = 4;

/** Kapt het aantal queries per hoofdstuk af zodat de zoekkosten begrensd blijven. */
export function capQueries(queries: string[]): string[] {
  return queries.slice(0, MAX_QUERIES_PER_CHAPTER);
}
```

- [ ] **Step 2: Prompt-instructie voor hoeken uitbreiden**

Vervang in de `SYSTEM_PROMPT` van `curriculum-design.ts` de regel over zoekopdrachten (nu punt 6, ~70-74) door:

```ts
  "6. Geef per hoofdstuk maximaal 4 gerichte zoekopdrachten in crawlConfigs die samen",
  "   de topicTags dekken langs drie invalshoeken: (a) uitleg/theorie, (b) voorbeeld of",
  "   oefening, (c) samenvatting/examen. Formuleer ze concreet met de vaktermen uit de",
  "   topicTags, niet generiek.",
  "   Zet categories op [\"research\"] voor hoofdstukken die overwegend",
  "   wetenschappelijke/academische bronnen nodig hebben (bijv. universitaire",
  "   vakken) — dit beperkt de zoekopdracht tot academische domeinen, zonder",
  "   extra kosten. Laat categories leeg voor algemenere hoofdstukken.",
```

- [ ] **Step 3: Cap toepassen op de LLM-output**

Zoek in `curriculum-design.ts` waar `designed.queries` in de crawlConfig-normalisatie wordt gebruikt (~231-232) en wikkel het in `capQueries(...)`. Concreet, vervang:

```ts
        designed?.queries?.length
          ? designed.queries
```

door:

```ts
        designed?.queries?.length
          ? capQueries(designed.queries)
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter api-server run typecheck`
Expected: geen fouten.

- [ ] **Step 5: Scratch-verificatie (pure functie, deterministisch)**

Maak `artifacts/api-server/scratch-querycap.ts`:

```ts
import { capQueries, MAX_QUERIES_PER_CHAPTER } from "./src/lib/pipeline-tasks/curriculum-design";

function main() {
  const many = ["a", "b", "c", "d", "e", "f"];
  const capped = capQueries(many);
  console.log("cap:", MAX_QUERIES_PER_CHAPTER, "resultaat:", capped);
  if (capped.length !== 4) throw new Error("cap werkt niet");
  if (capQueries(["x"]).length !== 1) throw new Error("korte lijst mag niet groeien");
  console.log("OK");
}
main();
```

Run: `cd artifacts/api-server && npx tsx --env-file=.env scratch-querycap.ts`
Expected: 6 → 4, 1 → 1; print `OK`.

- [ ] **Step 6: Scratch opruimen + commit**

```bash
rm artifacts/api-server/scratch-querycap.ts
git add artifacts/api-server/src/lib/pipeline-tasks/curriculum-design.ts
git commit -m "Query-planning: topicTag-hoeken + harde cap van 4 queries per hoofdstuk"
```

---

### Task 8: `source-gathering` — discovery + pre-filter inpluggen

**Files:**
- Modify: `artifacts/api-server/src/lib/pipeline-tasks/source-gathering.ts` (fase A, imports, scoring-lus)
- Scratch: `artifacts/api-server/scratch-gather-discovery.ts`

**Interfaces:**
- Consumes: `discoverCandidates`, `type Candidate` (uit `../crawl-brain/discovery`); `prefilterCandidates` (uit `../crawl-brain/prefilter`).
- Produces: fase A levert een `Candidate[]` (samengevoegd + gefilterd) dat de bestaande scoring-lus voedt. Downstream fase B/C blijft in deze task ongewijzigd (behalve dat `candidates` nu `Candidate[]` is).

- [ ] **Step 1: Imports bijwerken**

In `artifacts/api-server/src/lib/pipeline-tasks/source-gathering.ts`, vervang de import van `firecrawlDiscover` uit `../firecrawl` niet (die wordt niet meer direct gebruikt in fase A, maar `firecrawlMap`, `firecrawlScrapeUrls`, `firecrawlResearchSearch` blijven nodig — verwijder alleen `firecrawlDiscover` uit die import als het er los in staat). Voeg toe:

```ts
import { discoverCandidates, type Candidate } from "../crawl-brain/discovery";
import { prefilterCandidates, looksLikeProgrammePage } from "../crawl-brain/prefilter";
```

(De import van `looksLikeProgrammePage` uit Task 4 blijft; laat de losse `firecrawlDiscover`-import vervallen omdat fase A nu `discoverCandidates` gebruikt.)

- [ ] **Step 2: Fase A vervangen door samengevoegde discovery + pre-filter**

Vervang in `runSourceGathering` het blok dat begint bij `// Phase A — discover snippets only` en de `firecrawlDiscover`-aanroep (~94-95) door:

```ts
    // Phase A — samengevoegde discovery (Firecrawl + Exa), snippets/highlights only.
    const {
      candidates: discovered,
      firecrawlCredits: discoverCredits,
      exaCredits,
    } = await discoverCandidates(config, budgetCtx);
    let mapCreditsUsed = 0;
```

Laat de trusted-domain map-lus (fase A2) staan, maar push de map-resultaten nu als `Candidate` in `discovered` in plaats van in `results`:

```ts
      for (const mapResult of mapResults) {
        if (!mapResult.url || discovered.some((existing) => existing.url === mapResult.url)) continue;
        discovered.push({
          url: mapResult.url,
          title: mapResult.title,
          description: mapResult.description,
          provider: "firecrawl",
        });
      }
```

- [ ] **Step 3: `knownUrls`, pre-filter en programme-skip toepassen**

Direct ná het opbouwen van `knownUrls` (de bestaande `chapter_sources`-lus, ~132-140), vervang de bestaande `fresh`/`candidates`/`skippedProgramme`-berekening (~142-146) door een pre-filter-aanroep. De pre-filter dekt nu 'al bekend' én de opleidingspagina-skip, dus:

```ts
    const beforeFilter = discovered.length;
    const candidates = await prefilterCandidates(discovered, knownUrls);
    const skippedByFilter = beforeFilter - candidates.length;
```

Werk de daaropvolgende `log.info("gevonden", ...)` bij zodat die de nieuwe variabelen gebruikt (`beforeFilter`, `candidates.length`, `skippedByFilter`, `discoverCredits`, `exaCredits`, `papers.length`). Vervang de bestaande `alBekend`/`opleidingspaginaOvergeslagen`-velden door:

```ts
      {
        weggefilterd: skippedByFilter,
        zoekcredits: discoverCredits,
        exacredits: exaCredits,
        papers: papers.length,
      },
```

De losse `looksLikeProgrammePage`-import blijft alleen nodig als er nog een directe aanroep is; is die er niet meer, verwijder de import weer. (De functie leeft nu in `prefilter.ts` en wordt daar aangeroepen.)

- [ ] **Step 4: `creditsUsed` en het `scoreBatch`-invoertype**

De scoring-lus roept `scoreBatch(subject, group)` aan met `group: Candidate[]`. `scoreBatch` verwacht `FirecrawlResult[]` (`{ url; title?; description?; markdown? }`). `Candidate` is structureel compatibel (heeft `url`, `title?`, `description?`), dus dit typecheckt. Werk alleen de `creditsUsed`-initialisatie bij zodat Exa-discovery-credits meetellen — zoek `let creditsUsed = discoverCredits + mapCreditsUsed + scrapeCredits;` en vervang door:

```ts
    let creditsUsed = discoverCredits + exaCredits + mapCreditsUsed + scrapeCredits;
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter api-server run typecheck`
Expected: geen fouten. (Als TS klaagt dat `Candidate` geen `markdown` heeft waar `scoreBatch` dat leest: dat veld is optioneel in `FirecrawlResult`, dus een `Candidate` zonder `markdown` is toegestaan.)

- [ ] **Step 6: Scratch-verificatie — droogloop fase A op een testhoofdstuk**

Maak `artifacts/api-server/scratch-gather-discovery.ts` dat alleen de discovery+pre-filter-stap nadoet (niet de hele task):

```ts
import { discoverCandidates } from "./src/lib/crawl-brain/discovery";
import { prefilterCandidates } from "./src/lib/crawl-brain/prefilter";
import { defaultCrawlConfig } from "./src/lib/firecrawl";
import { restService } from "./src/lib/supabase";

async function main() {
  const subjectId = (await restService<{ id: string }[]>("crawl_subjects?select=id&limit=1"))[0]?.id;
  if (!subjectId) throw new Error("Geen crawl_subjects.");
  const ctx = { subjectId, crawlId: null };
  const config = defaultCrawlConfig(["fotosynthese VWO uitleg"]);

  const { candidates, firecrawlCredits, exaCredits } = await discoverCandidates(config, ctx);
  const filtered = await prefilterCandidates(candidates, new Set());
  console.log("ontdekt:", candidates.length, "na filter:", filtered.length, "fc:", firecrawlCredits, "exa:", exaCredits);
  if (filtered.length === 0) throw new Error("Geen kandidaten na filter — check providers");

  await restService(`firecrawl_usage?subject_id=eq.${subjectId}&provider=eq.exa`, { method: "DELETE" });
  console.log("OK");
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Run: `cd artifacts/api-server && npx tsx --env-file=.env scratch-gather-discovery.ts`
Expected: kandidaten ontdekt en gefilterd, credits van beide providers; print `OK`.

- [ ] **Step 7: Scratch opruimen + commit**

```bash
rm artifacts/api-server/scratch-gather-discovery.ts
git add artifacts/api-server/src/lib/pipeline-tasks/source-gathering.ts
git commit -m "Source-gathering: samengevoegde discovery + pre-filter in fase A"
```

---

### Task 9: `source-gathering` fase B — cache-gate + content-hergebruik

**Files:**
- Modify: `artifacts/api-server/src/lib/pipeline-tasks/source-gathering.ts` (fase B, ~185-200)
- Scratch: `artifacts/api-server/scratch-gather-cache.ts`

**Interfaces:**
- Consumes: `getStoredContentByUrl` (uit `./source-store`), `exaContents` (uit `../exa`), `type Candidate`.
- Produces: een `markdownByUrl: Map<string,string>` die content combineert uit (1) cache, (2) Exa, (3) Firecrawl-scrape — met `linksByUrl` alleen uit Firecrawl-scrapes.

- [ ] **Step 1: Imports**

Voeg toe aan `source-gathering.ts`:

```ts
import { getStoredContentByUrl } from "./source-store";
import { exaContents } from "../exa";
```

(`upsertSource`, `linkSourceToSubject`, `linkSourceToChapter` worden al geïmporteerd uit `./source-store`; voeg `getStoredContentByUrl` toe aan die bestaande import in plaats van een dubbele regel.)

- [ ] **Step 2: Winnaar-content ophalen met cache → Exa → Firecrawl**

Vervang het fase B-blok (`// Phase B — scrape only the winners` t/m de `firecrawlScrapeUrls`-aanroep en `creditsUsed`-optelling, ~185-194) door een gelaagde ophaal. `scoredList` bevat per winnaar de bijbehorende `Candidate` als `snippet`; we hebben de provider en eventuele `exaText` nodig, dus lees die uit `snippet`:

```ts
    // Phase B — content voor winnaars: cache eerst (gratis), dan Exa-tekst, dan Firecrawl-scrape.
    const winners = scoredList.filter((entry) => entry.status !== "declined");
    const winnerUrls = winners.map((entry) => entry.source.url);

    const cached = await getStoredContentByUrl(winnerUrls);
    const markdownByUrl = new Map<string, string>(cached);
    const linksByUrl = new Map<string, string[]>();
    let scrapeCredits = 0;

    // URL's die niet uit de cache komen: probeer Exa-tekst (voor Exa-kandidaten), anders Firecrawl.
    const needFirecrawl: string[] = [];
    for (const entry of winners) {
      const url = entry.source.url;
      if (markdownByUrl.has(url)) continue;
      const candidate = entry.snippet as Candidate | undefined;
      if (candidate?.provider === "exa") {
        const { text, costCredits } = await exaContents(url, budgetCtx);
        scrapeCredits += costCredits;
        if (text) { markdownByUrl.set(url, text); continue; }
      }
      needFirecrawl.push(url);
    }

    const {
      markdownByUrl: fcMarkdown,
      linksByUrl: fcLinks,
      creditsUsed: fcScrapeCredits,
    } = await firecrawlScrapeUrls(needFirecrawl, budgetCtx);
    scrapeCredits += fcScrapeCredits;
    for (const [url, md] of fcMarkdown) markdownByUrl.set(url, md);
    for (const [url, links] of fcLinks) linksByUrl.set(url, links);

    let creditsUsed = discoverCredits + exaCredits + mapCreditsUsed + scrapeCredits;
```

Let op: `scoredList`'s `snippet`-veld is nu een `Candidate` (uit Task 8's samengevoegde discovery), niet meer een `FirecrawlSearchResult`. Werk de `Scored`-type-definitie in fase A daarop bij: verander `snippet: FirecrawlSearchResult | undefined;` naar `snippet: Candidate | undefined;`. De bestaande `preview`-regel (`snippet?.description`) blijft werken want `Candidate` heeft `description`.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter api-server run typecheck`
Expected: geen fouten. Verwijder een eventueel nu-ongebruikte `FirecrawlSearchResult`-import.

- [ ] **Step 4: Scratch-verificatie — cache slaat scrape over**

Maak `artifacts/api-server/scratch-gather-cache.ts` dat bewijst dat een winnaar-URL met opgeslagen content niet opnieuw wordt opgehaald:

```ts
import { getStoredContentByUrl } from "./src/lib/pipeline-tasks/source-store";
import { restService } from "./src/lib/supabase";

async function main() {
  const url = `https://scratch-gather-cache.example/${Date.now()}`;
  const inserted = await restService<{ id: string }[]>("sources", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({ url, title: "cache test", full_content: "hergebruikte markdown" }),
  });
  const id = inserted[0]?.id;

  // Simuleer de fase B cache-gate: winnaars = [url]; cache moet 'm dekken → needFirecrawl leeg.
  const cached = await getStoredContentByUrl([url]);
  const needFirecrawl = [url].filter((u) => !cached.has(u));
  console.log("cache hit:", cached.get(url), "nog scrapen:", needFirecrawl);
  if (needFirecrawl.length !== 0) throw new Error("Cache-gate slaat de scrape niet over");

  await restService(`sources?id=eq.${id}`, { method: "DELETE" });
  console.log("OK");
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Run: `cd artifacts/api-server && npx tsx --env-file=.env scratch-gather-cache.ts`
Expected: cache-hit gevuld, `needFirecrawl` leeg; print `OK`.

- [ ] **Step 5: Scratch opruimen + commit**

```bash
rm artifacts/api-server/scratch-gather-cache.ts
git add artifacts/api-server/src/lib/pipeline-tasks/source-gathering.ts
git commit -m "Source-gathering fase B: cache-gate + Exa/Firecrawl content-hergebruik"
```

---

### Task 10: `source-gathering` — find-similar-expansie na acceptatie

**Files:**
- Modify: `artifacts/api-server/src/lib/pipeline-tasks/source-gathering.ts` (na fase C link-following)
- Scratch: `artifacts/api-server/scratch-findsimilar.ts`

**Interfaces:**
- Consumes: `exaFindSimilar` (uit `../exa`), `prefilterCandidates`, `scoreBatch`, `determineAcceptance`, `upsertSource`, `getStoredContentByUrl`, `exaContents`, `firecrawlScrapeUrls`.
- Produces: extra bronnen uit `exaFindSimilar` op geaccepteerde zaden, door dezelfde pre-filter → score → content-ophaal → opslag-lus. Constanten `FIND_SIMILAR_SEED_CAP = 3`, `FIND_SIMILAR_RESULTS = 5`.

- [ ] **Step 1: Constanten + import**

Voeg boven `runSourceGathering` in `source-gathering.ts` toe:

```ts
const FIND_SIMILAR_SEED_CAP = 3;
const FIND_SIMILAR_RESULTS = 5;
```

Voeg `exaFindSimilar` toe aan de bestaande import uit `../exa`.

- [ ] **Step 2: Find-similar-blok toevoegen ná fase C**

Voeg, direct ná de fase C link-following-blok en vóór de research-papers-lus (`for (const paper of papers)`), een expansie toe. Neem tot `FIND_SIMILAR_SEED_CAP` geaccepteerde bronnen als zaad, verzamel vergelijkbare kandidaten, en verwerk ze door de pre-filter → score → content-ophaal → opslag. `seenUrls` is al opgebouwd in fase C; hergebruik die.

```ts
    // Find-similar — betaalde tegenhanger van het gratis link-following: geaccepteerde
    // bronnen als zaad, Exa vindt semantisch vergelijkbare pagina's.
    const acceptedSeeds = scoredList
      .filter((entry) => entry.status === "accepted")
      .slice(0, FIND_SIMILAR_SEED_CAP)
      .map((entry) => entry.source.url);

    const similarCandidates: Candidate[] = [];
    for (const seed of acceptedSeeds) {
      const { results, costCredits } = await exaFindSimilar(seed, budgetCtx, FIND_SIMILAR_RESULTS);
      creditsUsed += costCredits;
      for (const r of results) {
        if (!r.url || seenUrls.has(r.url)) continue;
        seenUrls.add(r.url);
        similarCandidates.push({ url: r.url, title: r.title, description: r.snippet, provider: "exa", exaText: r.text });
      }
    }

    const similarFiltered = await prefilterCandidates(similarCandidates, seenUrls);
    if (similarFiltered.length > 0) {
      // Content ophalen: cache → Exa-tekst → Firecrawl (zelfde volgorde als fase B).
      const similarCached = await getStoredContentByUrl(similarFiltered.map((c) => c.url));
      const similarContent = new Map<string, string>(similarCached);
      const similarNeedFirecrawl: string[] = [];
      for (const candidate of similarFiltered) {
        if (similarContent.has(candidate.url)) continue;
        if (candidate.exaText) { similarContent.set(candidate.url, candidate.exaText); continue; }
        const { text, costCredits } = await exaContents(candidate.url, budgetCtx);
        creditsUsed += costCredits;
        if (text) { similarContent.set(candidate.url, text); continue; }
        similarNeedFirecrawl.push(candidate.url);
      }
      const { markdownByUrl: simFcMd, creditsUsed: simFcCredits } = await firecrawlScrapeUrls(similarNeedFirecrawl, budgetCtx);
      creditsUsed += simFcCredits;
      for (const [url, md] of simFcMd) similarContent.set(url, md);

      const withContent = similarFiltered
        .filter((c) => similarContent.has(c.url))
        .map((c) => ({ url: c.url, title: c.title, description: c.description, markdown: similarContent.get(c.url) }));

      const similarScored = await scoreBatch(
        { id: subject.id, name: subject.name, yearLevel: subject.yearLevel },
        withContent,
      );
      for (const source of similarScored) {
        const status = determineAcceptance(source.quality_score, source.confidence, accepted);
        if (status === "accepted") accepted += 1;
        const markdown = similarContent.get(source.url) ?? null;
        const sourceId = await upsertSource({
          url: source.url,
          title: source.title,
          type: source.type,
          language: source.language,
          qualityScore: source.quality_score,
          confidenceScore: source.confidence,
          aiSummary: source.ai_summary,
          status,
          declineReason: status === "declined" ? source.decline_reason : null,
          contentPreview: markdown?.slice(0, 500) ?? null,
          fullContent: markdown,
          firstCrawlId: crawlId,
        });
        if (!sourceId) continue;
        if (status === "accepted" || status === "declined") await recordDomainOutcome(source.url, status);
        await linkSourceToSubject(sourceId, task.subjectId);
        await linkSourceToChapter(sourceId, task.chapterId);
        stored += 1;
        if (status === "accepted") await enrichAcceptedPdfSource(sourceId, source.url, task.subjectId);
      }

      await log.info(
        "vergelijkbare-bronnen",
        `${acceptedSeeds.length} geaccepteerde zaden leverden ${similarFiltered.length} vergelijkbare kandidaten, ${withContent.length} met content.`,
        { zaden: acceptedSeeds },
      );
    }
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter api-server run typecheck`
Expected: geen fouten.

- [ ] **Step 4: Scratch-verificatie — find-similar levert kandidaten uit een zaad**

Maak `artifacts/api-server/scratch-findsimilar.ts`:

```ts
import { exaFindSimilar } from "./src/lib/exa";
import { restService } from "./src/lib/supabase";

async function main() {
  const subjectId = (await restService<{ id: string }[]>("crawl_subjects?select=id&limit=1"))[0]?.id;
  if (!subjectId) throw new Error("Geen crawl_subjects.");
  const ctx = { subjectId, crawlId: null };
  const { results } = await exaFindSimilar("https://nl.wikipedia.org/wiki/Fotosynthese", ctx, 5);
  console.log("vergelijkbare:", results.length, results.slice(0, 3).map((r) => r.url));
  if (results.length === 0) throw new Error("Find-similar gaf niets terug");
  await restService(`firecrawl_usage?subject_id=eq.${subjectId}&provider=eq.exa`, { method: "DELETE" });
  console.log("OK");
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Run: `cd artifacts/api-server && npx tsx --env-file=.env scratch-findsimilar.ts`
Expected: vergelijkbare URL's; print `OK`.

- [ ] **Step 5: Scratch opruimen + commit**

```bash
rm artifacts/api-server/scratch-findsimilar.ts
git add artifacts/api-server/src/lib/pipeline-tasks/source-gathering.ts
git commit -m "Source-gathering: find-similar-expansie op geaccepteerde bronnen (Exa)"
```

---

### Task 11: `crawl-brain/index.ts` — exports + eindverificatie end-to-end

**Files:**
- Modify: `artifacts/api-server/src/lib/crawl-brain/index.ts`
- Scratch: `artifacts/api-server/scratch-e2e-gather.ts`

**Interfaces:**
- Produces: `discovery` en `prefilter` herexporteerd via de crawl-brain-index, consistent met de bestaande `scoring`/`links`-exports.

- [ ] **Step 1: Index-exports toevoegen**

Vervang `artifacts/api-server/src/lib/crawl-brain/index.ts` door:

```ts
export { determineAcceptance, scoreBatch, type CrawlSubject, type FirecrawlResult, type ScoredSource } from "./scoring";
export { filterCandidateLinks } from "./links";
export { discoverCandidates, type Candidate } from "./discovery";
export { prefilterCandidates, looksLikeProgrammePage, PREFILTER_DECLINE_THRESHOLD } from "./prefilter";
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter api-server run typecheck`
Expected: geen fouten.

- [ ] **Step 3: End-to-end droogloop van `runSourceGathering`**

Maak `artifacts/api-server/scratch-e2e-gather.ts` dat één echte source_gathering-taak op een testvak/-hoofdstuk draait en de uitkomst controleert. Gebruik een bestaand vak+hoofdstuk (read-only qua config); de taak schrijft `sources`/`crawls`-rijen — verwijder die van deze ene crawl na afloop.

```ts
import { runSourceGathering } from "./src/lib/pipeline-tasks/source-gathering";
import { restService } from "./src/lib/supabase";

async function main() {
  const subject = (await restService<{ id: string }[]>("crawl_subjects?select=id&limit=1"))[0];
  const chapter = (await restService<{ id: string }[]>(`crawl_chapters?subject_id=eq.${subject!.id}&select=id&limit=1`))[0];
  if (!subject || !chapter) throw new Error("Geen vak/hoofdstuk om mee te testen.");

  const task = {
    id: "scratch-e2e",
    subjectId: subject.id,
    chapterId: chapter.id,
    config: { queries: ["fotosynthese VWO uitleg"], limitPerQuery: 5, includeDomains: [], excludeDomains: [], useResearchIndex: false, location: "Netherlands", categories: [], tbs: null, researchQuery: null, scrapeOptions: { formats: ["markdown"] } },
  } as unknown as Parameters<typeof runSourceGathering>[0];

  const result = await runSourceGathering(task);
  console.log("resultaat:", result);
  if (typeof result.creditsUsed !== "number") throw new Error("Geen creditsUsed in resultaat");

  // Verifieer dat er zowel Firecrawl- als Exa-usage is geregistreerd voor dit vak.
  const usage = await restService<{ provider: string }[]>(`firecrawl_usage?subject_id=eq.${subject.id}&select=provider&order=created_at.desc&limit=20`);
  console.log("providers gezien:", [...new Set(usage.map((u) => u.provider))]);
  console.log("OK — controleer hierboven dat 'exa' en 'firecrawl' beide voorkomen.");
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Run: `cd artifacts/api-server && npx tsx --env-file=.env scratch-e2e-gather.ts`
Expected: een resultaat met `creditsUsed`, en in de usage-lijst komen zowel `firecrawl` als `exa` voor. Controleer de task-log-output op fouten.

- [ ] **Step 4: Scratch opruimen + commit**

```bash
rm artifacts/api-server/scratch-e2e-gather.ts
git add artifacts/api-server/src/lib/crawl-brain/index.ts
git commit -m "Crawl-brain index: discovery + prefilter geëxporteerd; end-to-end geverifieerd"
```

---

## Self-Review

**1. Spec-dekking:**
- §4.1 Exa-provider → Task 2. §4.2 discovery-merge → Task 3. §4.3 pre-filter → Task 4. §4.4 content-cache → Task 5. §4.5 content-hergebruik → Task 9. §4.6 find-similar → Task 10. §4.7 query-hoeken → Task 7. §4.8 trusted-domain-cap → Task 6. §5 gezamenlijk budget → Task 1 (kolom + recordUsage) + Task 2 (Exa logt met provider='exa'). §7 migratie → Task 1. §8 EXA_API_KEY → Task 2 (`hasExaKey`, fail-open in Task 3). §10 bestandsoverzicht → Tasks 1-11. §11 buiten scope → niets gepland dat crawl-brain-scoring raakt. Alle secties gedekt.

**2. Placeholder-scan:** Geen TBD/TODO; alle code-stappen bevatten echte code; migratie-datumprefix `2026090503` is concreet.

**3. Type-consistentie:** `Candidate` (Task 3) wordt consistent gebruikt in Tasks 4, 8, 9, 10. `recordUsage(..., provider)` (Task 1) wordt zo aangeroepen in Task 2. `getStoredContentByUrl` (Task 5) in Tasks 9, 10. `exaContents`/`exaFindSimilar`/`exaSearch` (Task 2) in Tasks 3, 9, 10. `TRUSTED_DOMAIN_CAP` (Task 6), `MAX_QUERIES_PER_CHAPTER`/`capQueries` (Task 7), `FIND_SIMILAR_*` (Task 10) allemaal gedefinieerd vóór gebruik. `scoreBatch` blijft `FirecrawlResult[]` verwachten; `Candidate` is structureel compatibel (Task 8/9 noten dit expliciet).

**Bekende integratie-let-op:** Tasks 8-10 raken alle drie `source-gathering.ts` in opeenvolgende commits; elke task typecheckt op zichzelf. De executor moet de regelnummers als indicatief lezen (het bestand schuift), en zich richten op de genoemde ankers (`// Phase A`, `// Phase B`, fase C-blok).
