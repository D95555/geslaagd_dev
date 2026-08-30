import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { callFastText, FAST_MODEL, openai } from "./ai";
import { z } from "zod";
import { logger } from "./logger";
import { restService } from "./supabase";
import { enqueuePendingSourceEvent } from "./source-event-outbox";
import { budgetBlockReason, isPdfUrl, recordUsage, type BudgetContext } from "./firecrawl";


const RAW_STORAGE_DIR = path.join(process.cwd(), "crawl-raw");

type Row = Record<string, unknown>;

export type CrawlSubject = {
  id: string;
  name: string;
  yearLevel: string;
  description?: string | null;
  emphasis?: string | null;
  preferredSourceTypes?: string | null;
};

export type CrawlResult = {
  crawlId: string;
  sourcesFound: number;
  sourcesAccepted: number;
  creditsUsed: number | null;
  efficiencyRatio: number | null;
};

type PastCrawlExample = {
  promptUsed: string;
  efficiencyRatio: number;
  sourcesAccepted: number;
  sourcesFound: number;
};

type FirecrawlResult = {
  url: string;
  title?: string;
  description?: string;
  markdown?: string;
};

const scoredSourceSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  type: z.enum(["article", "book", "pdf", "video", "website"]),
  language: z.string().length(2),
  quality_score: z.number().int().min(1).max(5),
  confidence: z.number().min(0).max(1),
  ai_summary: z.string(),
  decline_reason: z.string().nullable(),
});
const batchResponseSchema = z.array(scoredSourceSchema);
type ScoredSource = z.infer<typeof scoredSourceSchema>;

// ─── sourceCrawler ──────────────────────────────────────────────────────────

async function getPastCrawlExamples(): Promise<PastCrawlExample[]> {
  const rows = await restService<Row[]>(
    "crawls?select=prompt_used,efficiency_ratio,sources_accepted,sources_found" +
      "&efficiency_ratio=not.is.null&sources_found=gte.5&order=efficiency_ratio.desc&limit=5",
  );
  return rows
    .filter((row) => typeof row.prompt_used === "string")
    .map((row) => ({
      promptUsed: row.prompt_used as string,
      efficiencyRatio: Number(row.efficiency_ratio),
      sourcesAccepted: Number(row.sources_accepted ?? 0),
      sourcesFound: Number(row.sources_found ?? 0),
    }));
}

async function generateCrawlPrompt(
  subject: CrawlSubject,
  pastCrawls: PastCrawlExample[],
): Promise<string> {
  const systemPrompt = [
    "You are an expert at crafting efficient Firecrawl search queries for academic study material.",
    "Your goal is to generate a single, specific search query that finds high-quality educational",
    "sources for Dutch VWO and first-year bachelor students.",
    "",
    "A good query:",
    "- Is specific, not generic",
    "- Targets authoritative sources (textbooks, university sites, reputable educational platforms)",
    "- Uses Dutch and/or English terms as appropriate for the subject",
    "- Returns sources that are genuinely useful for studying, not just tangentially related",
    "",
    "You will be shown examples of past queries and their efficiency scores.",
    "Learn from what worked well (high efficiency) and avoid what worked poorly.",
    "",
    "Respond with ONLY the search query string. No explanation. No JSON. Just the query.",
  ].join("\n");

  const examplesText = pastCrawls.length
    ? pastCrawls
        .map(
          (crawl) =>
            `Query: "${crawl.promptUsed}" | Efficiency: ${crawl.efficiencyRatio} | Accepted: ${crawl.sourcesAccepted}/${crawl.sourcesFound}`,
        )
        .join("\n")
    : "(no past crawl examples available yet)";

  const userMessage = [
    `Subject: ${subject.name}`,
    `Year level: ${subject.yearLevel}`,
    subject.description ? `Description (student-provided): ${subject.description}` : null,
    subject.emphasis ? `Emphasis to prioritize: ${subject.emphasis}` : null,
    subject.preferredSourceTypes ? `Preferred source types: ${subject.preferredSourceTypes}` : null,
    "Target: 15-20 high-quality study sources",
    "",
    "Past crawl examples for similar subjects (ordered by efficiency, best first):",
    examplesText,
    "",
    "Generate the optimal Firecrawl search query for this subject.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  // Writing one search string does not need the expensive model.
  const query = await callFastText({
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    maxTokens: 300,
  });

  const trimmed = query.trim();
  if (!trimmed) throw new Error("The model returned an empty Firecrawl query.");
  return trimmed;
}

// ─── Firecrawl search ───────────────────────────────────────────────────────

// Snippet-only (no scrapeOptions): scoring runs on title/description first,
// and only PDF-free winners get a real scrape later — this single change is
// what stopped this path from unconditionally billing a full scrape for
// every one of the 20 results regardless of relevance.
async function runFirecrawlSearch(
  query: string,
  ctx: BudgetContext,
): Promise<{ data: FirecrawlResult[]; creditsUsed: number }> {
  const blockReason = await budgetBlockReason(ctx);
  if (blockReason) {
    logger.warn({ ctx, query }, `Firecrawl search blocked: ${blockReason}`);
    return { data: [], creditsUsed: 0 };
  }
  const response = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      limit: 20,
    }),
  });
  if (!response.ok) {
    throw new Error(`Firecrawl search failed (${response.status}).`);
  }
  const body = (await response.json()) as {
    data?: { web?: FirecrawlResult[] };
    creditsUsed?: number;
  };
  const creditsUsed = Number(body.creditsUsed ?? 0);
  await recordUsage(ctx, "search", creditsUsed);
  const results = (body.data?.web ?? []).filter((result) => !isPdfUrl(result.url));
  return { data: results, creditsUsed };
}

async function storeRawResponse(crawlId: string, data: unknown): Promise<void> {
  await mkdir(RAW_STORAGE_DIR, { recursive: true });
  const filePath = path.join(RAW_STORAGE_DIR, `${crawlId}.json`);
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

// ─── sourceHandler — OpenAI batch scoring ──────────────────────────────────

function batch<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

export async function scoreBatch(
  subject: CrawlSubject,
  results: FirecrawlResult[],
): Promise<ScoredSource[]> {
  const systemPrompt = [
    "You are a source quality evaluator for Dutch high school (VWO) and first-year bachelor study material.",
    "",
    "For each source provided, evaluate and return a JSON array with one object per source containing:",
    "- url: the source URL (copy exactly)",
    "- title: cleaned title",
    "- type: one of 'article' | 'book' | 'pdf' | 'video' | 'website'",
    "- language: ISO 639-1 code ('nl' or 'en' for most cases)",
    "- quality_score: integer 1-5 where:",
    "    5 = Authoritative: official textbook, university publication, peer-reviewed, national educational platform (e.g. Khan Academy, Kennisnet, university.nl)",
    "    4 = Reliable: reputable educational site, well-sourced explainer, recognized publisher",
    "    3 = Useful: decent blog, educational YouTube, reasonably accurate but not authoritative",
    "    2 = Marginal: personal blog, unverified, partially relevant, outdated",
    "    1 = Poor: spam, irrelevant, broken, misleading",
    "- confidence: float 0.0-1.0 (your certainty in the quality_score)",
    "- ai_summary: 2-3 sentence summary of what this source covers and why it is or isn't useful for studying this subject. Written in Dutch.",
    "- decline_reason: null if score >= 3, otherwise a brief Dutch explanation of why this source is unsuitable",
    "",
    "Return ONLY a valid JSON array. No markdown. No explanation.",
  ].join("\n");

  const userMessage = [
    `Subject being studied: ${subject.name} (${subject.yearLevel})`,
    "",
    "Sources to evaluate:",
    ...results.map(
      (source, index) =>
        `\n[${index + 1}]\nURL: ${source.url}\nTitle: ${source.title ?? ""}\nContent preview: ${
          source.markdown?.slice(0, 800) ?? source.description ?? "(no content available)"
        }`,
    ),
  ].join("\n");

  const completion = await openai.chat.completions.create({
    model: FAST_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `${userMessage}\n\nRespond with a JSON object of the form {"sources": [...]}.`,
      },
    ],
  });

  const raw = JSON.parse(completion.choices[0]?.message.content ?? "{}") as unknown;
  const sourcesRaw = (raw as { sources?: unknown }).sources ?? raw;
  const parsed = batchResponseSchema.safeParse(sourcesRaw);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, "sourceHandler batch scoring returned invalid JSON");
    return results.map((source) => ({
      url: source.url,
      title: source.title ?? source.url,
      type: "website",
      language: "nl",
      quality_score: 1,
      confidence: 0,
      ai_summary: "",
      decline_reason: "Scoring failed — awaiting manual review",
    }));
  }
  return parsed.data;
}

// ─── Acceptance logic ───────────────────────────────────────────────────────

export function determineAcceptance(
  score: number,
  confidence: number,
  totalAcceptedSoFar: number,
): "accepted" | "declined" | "pending" {
  if (score === 1) return "declined";
  if (confidence < 0.65) return "pending";
  if (totalAcceptedSoFar < 8 && score >= 3) return "accepted";
  if (score >= 4) return "accepted";
  return "declined";
}

// ─── Orchestration ──────────────────────────────────────────────────────────

async function linkSourceToSubject(sourceId: string, subjectId: string): Promise<void> {
  await restService<Row[]>("source_subjects?on_conflict=source_id,subject_id", {
    method: "POST",
    headers: { prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({ source_id: sourceId, subject_id: subjectId }),
  });
}

export type RescoreResult = {
  id: string;
  qualityScore: number;
  confidenceScore: number;
  status: "accepted" | "declined" | "pending";
  aiSummary: string;
  declineReason: string | null;
};

/**
 * Re-run the sourceHandler scorer for a single already-stored source. Used when
 * the original batch scoring failed (score 1 / confidence 0) or a "barely
 * missed" source deserves a second look. Uses the stored content_preview as the
 * model input and normal (non-scarcity) acceptance thresholds.
 */
export async function rescoreSource(sourceId: string): Promise<RescoreResult> {
  const rows = await restService<Row[]>(
    `sources?id=eq.${sourceId}&select=id,url,title,content_preview,ai_summary,source_subjects(crawl_subjects(id,name,year_level))`,
  );
  const row = rows[0];
  if (!row) throw new Error("Source not found.");

  const links = (row.source_subjects as Row[] | null) ?? [];
  const embedded = links[0]?.crawl_subjects as Row | Row[] | null | undefined;
  const subjectRow = Array.isArray(embedded) ? embedded[0] : embedded;
  if (!subjectRow) throw new Error("Source is not linked to a subject.");
  const subject: CrawlSubject = {
    id: subjectRow.id as string,
    name: subjectRow.name as string,
    yearLevel: subjectRow.year_level as string,
  };

  const candidate: FirecrawlResult = {
    url: row.url as string,
    title: (row.title as string | null) ?? undefined,
    markdown: (row.content_preview as string | null) ?? undefined,
    description: (row.ai_summary as string | null) ?? undefined,
  };

  const [scored] = await scoreBatch(subject, [candidate]);
  if (!scored) throw new Error("Rescoring returned no result.");

  // Normal thresholds only — pass a high accepted count so scarcity mode is off.
  const status = determineAcceptance(scored.quality_score, scored.confidence, 8);

  const updated = await restService<Row[]>(`sources?id=eq.${sourceId}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      title: scored.title,
      type: scored.type,
      language: scored.language,
      quality_score: scored.quality_score,
      confidence_score: scored.confidence,
      ai_summary: scored.ai_summary,
      status,
      decline_reason: status === "declined" ? scored.decline_reason : null,
      updated_at: new Date().toISOString(),
    }),
  });
  const result = updated[0];
  if (!result) throw new Error("Could not update source after rescoring.");

  return {
    id: result.id as string,
    qualityScore: Number(result.quality_score ?? scored.quality_score),
    confidenceScore: Number(result.confidence_score ?? scored.confidence),
    status,
    aiSummary: (result.ai_summary as string | null) ?? scored.ai_summary,
    declineReason: (result.decline_reason as string | null) ?? null,
  };
}

export async function runCrawl(input: {
  subject: CrawlSubject;
  triggeredBy: string;
  retryOfCrawlId?: string | null;
}): Promise<CrawlResult> {
  const { subject, triggeredBy, retryOfCrawlId } = input;

  const created = await restService<Row[]>("crawls", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      subject_id: subject.id,
      status: "running",
      triggered_by: triggeredBy,
      retry_of_crawl_id: retryOfCrawlId ?? null,
    }),
  });
  const crawlId = created[0]?.id as string;
  if (!crawlId) throw new Error("Could not create crawl record.");

  try {
    const pastCrawls = await getPastCrawlExamples();
    const prompt = await generateCrawlPrompt(subject, pastCrawls);
    await restService<Row[]>(`crawls?id=eq.${crawlId}`, {
      method: "PATCH",
      body: JSON.stringify({ prompt_used: prompt }),
    });

    const { data: firecrawlResults, creditsUsed } = await runFirecrawlSearch(prompt, {
      subjectId: subject.id,
      crawlId,
    });

    await storeRawResponse(crawlId, { data: firecrawlResults, creditsUsed });
    await restService<Row[]>(`crawls?id=eq.${crawlId}`, {
      method: "PATCH",
      body: JSON.stringify({
        credits_used: creditsUsed,
        sources_found: firecrawlResults.length,
        raw_stored: true,
      }),
    });

    // Deduplication: check each URL against existing sources.
    const existingLookups = await Promise.all(
      firecrawlResults.map((result) =>
        restService<Row[]>(`sources?url=eq.${encodeURIComponent(result.url)}&select=id`).then(
          (rows) => ({ url: result.url, existingId: (rows[0]?.id as string) ?? null }),
        ),
      ),
    );
    const existingIdByUrl = new Map(
      existingLookups.filter((entry) => entry.existingId).map((entry) => [entry.url, entry.existingId as string]),
    );

    await Promise.all(
      [...existingIdByUrl.entries()].map(([, sourceId]) => linkSourceToSubject(sourceId, subject.id)),
    );

    const newResults = firecrawlResults.filter((result) => !existingIdByUrl.has(result.url));

    let acceptedCount = 0;
    for (const group of batch(newResults, 5)) {
      const scored = await scoreBatch(subject, group);
      for (const source of scored) {
        const status = determineAcceptance(source.quality_score, source.confidence, acceptedCount);
        if (status === "accepted") acceptedCount += 1;

        let sourceId: string | null = null;
        const inserted = await restService<Row[]>("sources?on_conflict=url", {
          method: "POST",
          headers: { prefer: "resolution=ignore-duplicates,return=representation" },
          body: JSON.stringify({
            url: source.url,
            title: source.title,
            content_preview:
              group.find((result) => result.url === source.url)?.markdown?.slice(0, 500) ?? null,
            type: source.type,
            language: source.language,
            quality_score: source.quality_score,
            confidence_score: source.confidence,
            ai_summary: source.ai_summary,
            status,
            decline_reason: source.decline_reason,
            first_crawl_id: crawlId,
          }),
        });
        sourceId = (inserted[0]?.id as string) ?? null;
        if (!sourceId) {
          const existing = await restService<Row[]>(`sources?url=eq.${encodeURIComponent(source.url)}&select=id`);
          sourceId = (existing[0]?.id as string) ?? null;
        }
        if (!sourceId) continue;

        await linkSourceToSubject(sourceId, subject.id);

        if (status === "pending") {
          await enqueuePendingSourceEvent({
            dedupeKey: `source-pending-${sourceId}-${crawlId}`,
            sourceId,
            sourceUrl: source.url,
            sourceTitle: source.title,
            subjectName: subject.name,
            crawlId,
          }).catch((error) => logger.warn({ error, sourceId }, "Could not enqueue pending source event"));
        }
      }
    }

    const acceptedRows = await restService<Row[]>(
      `sources?first_crawl_id=eq.${crawlId}&status=eq.accepted&select=quality_score`,
    );
    let efficiencyRatio: number | null = null;
    if (creditsUsed > 0 && acceptedRows.length > 0) {
      const avgQuality =
        acceptedRows.reduce((sum, row) => sum + Number(row.quality_score ?? 0), 0) / acceptedRows.length;
      efficiencyRatio = (acceptedRows.length * avgQuality) / creditsUsed;
    }

    await restService<Row[]>(`crawls?id=eq.${crawlId}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "complete",
        sources_accepted: acceptedRows.length,
        efficiency_ratio: efficiencyRatio,
        completed_at: new Date().toISOString(),
      }),
    });

    return {
      crawlId,
      sourcesFound: firecrawlResults.length,
      sourcesAccepted: acceptedRows.length,
      creditsUsed,
      efficiencyRatio,
    };
  } catch (error) {
    await restService<Row[]>(`crawls?id=eq.${crawlId}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "failed",
        error_detail: error instanceof Error ? error.message : String(error),
      }),
    }).catch(() => undefined);
    throw error;
  }
}
