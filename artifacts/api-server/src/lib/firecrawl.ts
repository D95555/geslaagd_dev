import { logger } from "./logger";
import { restService } from "./supabase";

type Row = Record<string, unknown>;

export type CrawlConfig = {
  queries: string[];
  limitPerQuery: number;
  location: string | null;
  categories: string[];
  includeDomains: string[];
  excludeDomains: string[];
  tbs: string | null;
  useResearchIndex: boolean;
  researchQuery: string | null;
  scrapeOptions: { formats: string[] };
};

export type FirecrawlSearchResult = {
  url: string;
  title?: string;
  description?: string;
  markdown?: string;
};

export type FirecrawlSearchResponse = {
  results: FirecrawlSearchResult[];
  creditsUsed: number;
};

export type ResearchPaperResult = {
  primaryId: string;
  title: string;
  url: string;
  abstract?: string;
};

export type PaperPassage = {
  text: string;
  score?: number;
};

export function defaultCrawlConfig(queries: string[]): CrawlConfig {
  return {
    queries,
    limitPerQuery: 10,
    location: "Netherlands",
    categories: [],
    includeDomains: [],
    excludeDomains: [],
    tbs: null,
    useResearchIndex: false,
    researchQuery: null,
    scrapeOptions: { formats: ["markdown"] },
  };
}

/** Normalises a partial config coming from the curriculum designer or an admin form. */
export function toCrawlConfig(input: Partial<CrawlConfig> & { queries: string[] }): CrawlConfig {
  return { ...defaultCrawlConfig(input.queries), ...input };
}

function apiKey(): string {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY is not configured.");
  return key;
}

// ─── Excluded domains (cached) ──────────────────────────────────────────────

const EXCLUDED_CACHE_MS = 5 * 60_000;
let excludedCache: { domains: string[]; fetchedAt: number } | null = null;

export async function getGlobalExcludedDomains(): Promise<string[]> {
  if (excludedCache && Date.now() - excludedCache.fetchedAt < EXCLUDED_CACHE_MS) {
    return excludedCache.domains;
  }
  try {
    const rows = await restService<Row[]>("excluded_domains?select=domain");
    const domains = rows
      .map((row) => row.domain)
      .filter((domain): domain is string => typeof domain === "string");
    excludedCache = { domains, fetchedAt: Date.now() };
    return domains;
  } catch (error) {
    logger.warn({ error }, "Could not load excluded domains; continuing without them");
    return excludedCache?.domains ?? [];
  }
}

// ─── Credit budget guardrails ───────────────────────────────────────────────
//
// Every network call in this file must be gated by budgetBlockReason() first
// and followed by recordUsage(). A subject carries a credit_budget (300, or
// 600 for a large-scope subject); firecrawl_usage logs every credit spent
// since build_started_at, and the running total is checked before each call.
// On a ledger-check error we fail CLOSED — block the spend rather than allow
// it — because an uncapped miss here is exactly the failure this exists to
// prevent. This is a deliberate departure from this file's other "fail open
// and continue" patterns (e.g. getGlobalExcludedDomains): those protect
// pipeline resilience, this protects the user's money.

export type BudgetContext = { subjectId: string; crawlId?: string | null };

const PDF_URL_RE = /\.pdf(?:[?#]|$)/i;
export function isPdfUrl(url: string): boolean {
  return PDF_URL_RE.test(url);
}

async function remainingBudget(subjectId: string): Promise<number> {
  const subjectRows = await restService<Row[]>(
    `crawl_subjects?id=eq.${subjectId}&select=credit_budget,build_started_at`,
  );
  const subject = subjectRows[0];
  const budget = Number(subject?.credit_budget ?? 300);
  const since = subject?.build_started_at as string | null | undefined;
  const usageRows = await restService<Row[]>(
    `firecrawl_usage?subject_id=eq.${subjectId}&select=credits` +
      (since ? `&created_at=gte.${encodeURIComponent(since)}` : ""),
  );
  const spent = usageRows.reduce((sum, row) => sum + Number(row.credits ?? 0), 0);
  return budget - spent;
}

/** Returns a Dutch block reason if this subject may not spend any more credits, or null if it may. */
export async function budgetBlockReason(ctx: BudgetContext): Promise<string | null> {
  try {
    const remaining = await remainingBudget(ctx.subjectId);
    if (remaining <= 0) {
      return "Creditbudget voor dit vak is op; crawl gestopt om verdere kosten te voorkomen.";
    }
    return null;
  } catch (error) {
    logger.error({ error, ctx }, "Firecrawl budget check failed; blocking spend (fail-closed)");
    return "Budgetcontrole kon niet worden uitgevoerd; crawl geblokkeerd uit voorzorg.";
  }
}

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

// ─── Search ─────────────────────────────────────────────────────────────────

async function searchOnce(
  query: string,
  config: CrawlConfig,
  excludeDomains: string[],
): Promise<{ results: FirecrawlSearchResult[]; creditsUsed: number }> {
  const response = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      query,
      limit: config.limitPerQuery,
      safe: true,
      ...(config.location ? { location: config.location } : {}),
      ...(config.categories.length ? { categories: config.categories } : {}),
      ...(config.includeDomains.length ? { includeDomains: config.includeDomains } : {}),
      ...(excludeDomains.length ? { excludeDomains } : {}),
      ...(config.tbs ? { tbs: config.tbs } : {}),
      scrapeOptions: config.scrapeOptions,
    }),
  });
  if (!response.ok) {
    throw new Error(`Firecrawl search failed (${response.status}).`);
  }
  const body = (await response.json()) as {
    data?: { web?: FirecrawlSearchResult[] };
    creditsUsed?: number;
  };
  return {
    results: body.data?.web ?? [],
    creditsUsed: Number(body.creditsUsed ?? 0),
  };
}

/**
 * Runs every query in the config, merges the results and drops duplicate URLs.
 * A single failing query does not abort the whole crawl — the remaining
 * queries still contribute their results.
 */
export async function firecrawlSearch(
  config: CrawlConfig,
  ctx: BudgetContext,
): Promise<FirecrawlSearchResponse> {
  const globalExcluded = await getGlobalExcludedDomains();
  const excludeDomains = [...new Set([...config.excludeDomains, ...globalExcluded])];

  const byUrl = new Map<string, FirecrawlSearchResult>();
  let creditsUsed = 0;

  for (const query of config.queries) {
    const blockReason = await budgetBlockReason(ctx);
    if (blockReason) {
      logger.warn({ ctx, query }, `Firecrawl search stopped: ${blockReason}`);
      break;
    }
    try {
      const outcome = await searchOnce(query, config, excludeDomains);
      creditsUsed += outcome.creditsUsed;
      await recordUsage(ctx, "search", outcome.creditsUsed);
      for (const result of outcome.results) {
        if (!result.url || byUrl.has(result.url)) continue;
        byUrl.set(result.url, result);
      }
    } catch (error) {
      logger.warn({ error, query }, "Firecrawl query failed; continuing with remaining queries");
    }
  }

  return { results: [...byUrl.values()], creditsUsed };
}

// ─── Two-phase discovery ────────────────────────────────────────────────────
//
// A plain search (no scrapeOptions) returns SERP snippets — url, title and a
// short description — and bills only the search, not a scrape per result. We
// score on the snippet first and scrape only the winners, so the pages we
// reject never cost a scrape credit. This is the same endpoint as searchOnce,
// deliberately kept separate so the old single-phase firecrawlSearch (used by
// the legacy admin crawl-run flow) is untouched.

async function discoverOnce(
  query: string,
  config: CrawlConfig,
  excludeDomains: string[],
): Promise<{ results: FirecrawlSearchResult[]; creditsUsed: number }> {
  const response = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      query,
      limit: config.limitPerQuery,
      safe: true,
      ...(config.location ? { location: config.location } : {}),
      ...(config.categories.length ? { categories: config.categories } : {}),
      ...(config.includeDomains.length ? { includeDomains: config.includeDomains } : {}),
      ...(excludeDomains.length ? { excludeDomains } : {}),
      ...(config.tbs ? { tbs: config.tbs } : {}),
      // No scrapeOptions: snippets only, so nothing is scraped or billed here.
    }),
  });
  if (!response.ok) {
    throw new Error(`Firecrawl discover failed (${response.status}).`);
  }
  const body = (await response.json()) as {
    data?: { web?: FirecrawlSearchResult[] };
    creditsUsed?: number;
  };
  return {
    results: body.data?.web ?? [],
    creditsUsed: Number(body.creditsUsed ?? 0),
  };
}

/** Phase A: gather candidate snippets across every query, deduped by URL. */
export async function firecrawlDiscover(
  config: CrawlConfig,
  ctx: BudgetContext,
): Promise<FirecrawlSearchResponse> {
  const globalExcluded = await getGlobalExcludedDomains();
  const excludeDomains = [...new Set([...config.excludeDomains, ...globalExcluded])];

  const byUrl = new Map<string, FirecrawlSearchResult>();
  let creditsUsed = 0;

  for (const query of config.queries) {
    const blockReason = await budgetBlockReason(ctx);
    if (blockReason) {
      logger.warn({ ctx, query }, `Firecrawl discover stopped: ${blockReason}`);
      break;
    }
    try {
      const outcome = await discoverOnce(query, config, excludeDomains);
      creditsUsed += outcome.creditsUsed;
      await recordUsage(ctx, "discover", outcome.creditsUsed);
      for (const result of outcome.results) {
        if (!result.url || byUrl.has(result.url)) continue;
        byUrl.set(result.url, result);
      }
    } catch (error) {
      logger.warn({ error, query }, "Firecrawl discover query failed; continuing");
    }
  }

  return { results: [...byUrl.values()], creditsUsed };
}

export type MapResult = { url: string; title?: string; description?: string };

/**
 * Maps a single (trusted) domain for URLs matching a topic. Firecrawl bills
 * this at a flat 1 credit regardless of how many URLs come back — far
 * cheaper than a search when a domain already has a strong track record
 * (see domain-reputation.ts), since there is no per-result cost to avoid.
 */
export async function firecrawlMap(
  domain: string,
  search: string,
  ctx: BudgetContext,
): Promise<{ results: MapResult[]; creditsUsed: number }> {
  const blockReason = await budgetBlockReason(ctx);
  if (blockReason) {
    logger.warn({ ctx, domain }, `Firecrawl map skipped: ${blockReason}`);
    return { results: [], creditsUsed: 0 };
  }
  try {
    const response = await fetch("https://api.firecrawl.dev/v2/map", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey()}`,
      },
      body: JSON.stringify({ url: `https://${domain}`, search, limit: 15 }),
    });
    if (!response.ok) {
      logger.warn({ domain, status: response.status }, "Firecrawl map failed; skipping");
      return { results: [], creditsUsed: 0 };
    }
    const body = (await response.json()) as { links?: MapResult[]; creditsUsed?: number };
    const spent = Number(body.creditsUsed ?? 1);
    await recordUsage(ctx, "map", spent);
    return { results: body.links ?? [], creditsUsed: spent };
  } catch (error) {
    logger.warn({ error, domain }, "Firecrawl map errored; skipping");
    return { results: [], creditsUsed: 0 };
  }
}

/**
 * Phase B: scrape only the URLs that survived scoring. Failures are per-URL and
 * non-fatal — a page that will not scrape simply keeps whatever snippet text it
 * already had. Returns a url→markdown map plus the credits the scrapes cost.
 *
 * PDF URLs are skipped here entirely (Firecrawl bills per PDF page, which is
 * the single largest cost driver behind the credit blow-ups this guardrail
 * exists to prevent) — they keep whatever snippet they already had. Accepted
 * PDFs get real full text afterwards via the free, self-fetched path in
 * `pdf-fetch.ts` (plain `fetch()` + Claude's document input, no Firecrawl).
 *
 * Each scrape is budget-gated individually since Promise.all fires them
 * concurrently; a subject that runs out of budget mid-batch simply stops
 * getting scraped, the rest keep their snippet text.
 */
export async function firecrawlScrapeUrls(
  urls: string[],
  ctx: BudgetContext,
): Promise<{ markdownByUrl: Map<string, string>; linksByUrl: Map<string, string[]>; creditsUsed: number }> {
  const markdownByUrl = new Map<string, string>();
  const linksByUrl = new Map<string, string[]>();
  let creditsUsed = 0;

  const pdfUrls = urls.filter(isPdfUrl);
  const scrapableUrls = urls.filter((url) => !isPdfUrl(url));
  if (pdfUrls.length) {
    logger.info({ ctx, count: pdfUrls.length }, "Skipping Firecrawl scrape for PDF URLs (snippet-only)");
  }

  await Promise.all(
    scrapableUrls.map(async (url) => {
      const blockReason = await budgetBlockReason(ctx);
      if (blockReason) {
        logger.warn({ ctx, url }, `Firecrawl scrape skipped: ${blockReason}`);
        return;
      }
      try {
        const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey()}`,
          },
          // `links` and `onlyMainContent` cost nothing extra (only json/question/
          // highlights/PII/audio/video/ZDR add credits) -- `links` gives the crawl
          // brain real page links for free link-following instead of regex-
          // parsing markdown, and `onlyMainContent` strips nav/footer noise before
          // it reaches the scorer.
          body: JSON.stringify({ url, formats: ["markdown", "links"], onlyMainContent: true }),
        });
        if (!response.ok) {
          logger.warn({ url, status: response.status }, "Firecrawl scrape failed; skipping");
          return;
        }
        const body = (await response.json()) as {
          data?: { markdown?: string; links?: string[] };
          creditsUsed?: number;
        };
        const spent = Number(body.creditsUsed ?? 0);
        creditsUsed += spent;
        await recordUsage(ctx, "scrape", spent);
        const markdown = body.data?.markdown;
        if (markdown) markdownByUrl.set(url, markdown);
        if (body.data?.links?.length) linksByUrl.set(url, body.data.links);
      } catch (error) {
        logger.warn({ error, url }, "Firecrawl scrape errored; skipping");
      }
    }),
  );

  return { markdownByUrl, linksByUrl, creditsUsed };
}

// ─── Research index ─────────────────────────────────────────────────────────

export async function firecrawlResearchSearch(
  query: string,
  k = 10,
): Promise<ResearchPaperResult[]> {
  const url = `https://api.firecrawl.dev/v2/search/research/papers?query=${encodeURIComponent(query)}&k=${k}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!response.ok) {
    throw new Error(`Firecrawl research search failed (${response.status}).`);
  }
  const body = (await response.json()) as { data?: { papers?: ResearchPaperResult[] } };
  return body.data?.papers ?? [];
}

export async function firecrawlReadPaperPassages(
  paperId: string,
  query: string,
  k = 4,
): Promise<PaperPassage[]> {
  const url =
    `https://api.firecrawl.dev/v2/search/research/papers/${encodeURIComponent(paperId)}` +
    `?query=${encodeURIComponent(query)}&k=${k}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!response.ok) {
    throw new Error(`Firecrawl paper lookup failed (${response.status}).`);
  }
  const body = (await response.json()) as { data?: { passages?: PaperPassage[] } };
  return body.data?.passages ?? [];
}
