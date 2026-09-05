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
