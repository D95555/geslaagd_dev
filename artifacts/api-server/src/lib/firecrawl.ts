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
export async function firecrawlSearch(config: CrawlConfig): Promise<FirecrawlSearchResponse> {
  const globalExcluded = await getGlobalExcludedDomains();
  const excludeDomains = [...new Set([...config.excludeDomains, ...globalExcluded])];

  const byUrl = new Map<string, FirecrawlSearchResult>();
  let creditsUsed = 0;

  for (const query of config.queries) {
    try {
      const outcome = await searchOnce(query, config, excludeDomains);
      creditsUsed += outcome.creditsUsed;
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
