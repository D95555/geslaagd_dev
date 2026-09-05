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
