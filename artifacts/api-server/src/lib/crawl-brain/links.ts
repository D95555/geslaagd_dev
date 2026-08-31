// Structurally never a useful study-source candidate: navigation chrome,
// account pages, or a link straight to an asset file.
const SKIP_PATTERNS = [/\/(login|signup|account|cart|share)\b/i, /\.(png|jpe?g|gif|svg|css|js|pdf)$/i];

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Filters a page's outbound links (Firecrawl's `links` scrape format, part of
 * a scrape already paid for) down to plausible new-source candidates:
 * cross-domain, not already known, not an asset/account/login link. Capped
 * so the scrape+score round this feeds stays cheap.
 */
export function filterCandidateLinks(
  links: string[],
  baseUrl: string,
  knownUrls: Set<string>,
  limit = 5,
): string[] {
  const baseHost = safeHostname(baseUrl);
  const candidates: string[] = [];

  for (const url of links) {
    if (!url || knownUrls.has(url) || candidates.includes(url)) continue;
    const host = safeHostname(url);
    if (!host || host === baseHost) continue;
    if (SKIP_PATTERNS.some((pattern) => pattern.test(url))) continue;
    candidates.push(url);
    if (candidates.length >= limit) break;
  }

  return candidates;
}
