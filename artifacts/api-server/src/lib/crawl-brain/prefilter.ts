import { getGlobalExcludedDomains } from "../firecrawl";
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
