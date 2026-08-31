import { logger } from "./logger";
import { restService } from "./supabase";

type Row = Record<string, unknown>;

export type DomainReputation = { acceptedCount: number; declinedCount: number };

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Tallies a domain's accept/decline track record so future scoring (phase
 * 2b, the crawl brain) can weigh a domain's history. Read-then-write, not
 * atomic -- acceptable for a low-frequency counter, not worth an RPC
 * function for this.
 */
export async function recordDomainOutcome(
  url: string,
  outcome: "accepted" | "declined",
): Promise<void> {
  const domain = extractDomain(url);
  if (!domain) return;
  const column = outcome === "accepted" ? "accepted_count" : "declined_count";

  try {
    const existing = await restService<Row[]>(
      `domain_reputation?domain=eq.${encodeURIComponent(domain)}&select=${column}`,
    );
    if (existing.length === 0) {
      await restService<Row[]>("domain_reputation?on_conflict=domain", {
        method: "POST",
        headers: { prefer: "resolution=ignore-duplicates" },
        body: JSON.stringify({ domain, [column]: 1 }),
      });
    } else {
      const current = Number(existing[0]?.[column] ?? 0);
      await restService<Row[]>(`domain_reputation?domain=eq.${encodeURIComponent(domain)}`, {
        method: "PATCH",
        body: JSON.stringify({ [column]: current + 1, updated_at: new Date().toISOString() }),
      });
    }
  } catch (error) {
    logger.warn({ error, url, outcome }, "Could not record domain reputation");
  }
}

/**
 * Domains worth a dedicated Firecrawl map call (flat 1 credit regardless of
 * result count) instead of relying on search to rediscover them each time.
 * Unlike scoring's domain-reputation weighting (which the AI applies with
 * its own judgment, no fixed threshold), *spending* a map call on a domain
 * is a resource-allocation decision, so it does use a minimum bar: at least
 * 3 prior accepts, and no more than a third as many declines.
 */
export async function getTrustedDomains(limit = 2): Promise<string[]> {
  try {
    const rows = await restService<Row[]>(
      "domain_reputation?accepted_count=gte.3&select=domain,accepted_count,declined_count" +
        "&order=accepted_count.desc&limit=10",
    );
    return rows
      .filter((row) => Number(row.declined_count ?? 0) <= Number(row.accepted_count ?? 0) / 3)
      .slice(0, limit)
      .map((row) => row.domain as string);
  } catch (error) {
    logger.warn({ error }, "Could not load trusted domains");
    return [];
  }
}

export async function getDomainReputation(url: string): Promise<DomainReputation | null> {
  const domain = extractDomain(url);
  if (!domain) return null;
  const rows = await restService<Row[]>(
    `domain_reputation?domain=eq.${encodeURIComponent(domain)}&select=accepted_count,declined_count`,
  );
  const row = rows[0];
  if (!row) return null;
  return {
    acceptedCount: Number(row.accepted_count ?? 0),
    declinedCount: Number(row.declined_count ?? 0),
  };
}
