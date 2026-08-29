import {
  firecrawlDiscover,
  firecrawlResearchSearch,
  firecrawlScrapeUrls,
  type CrawlConfig,
  type FirecrawlSearchResult,
} from "../firecrawl";
import { logger } from "../logger";
import { determineAcceptance, scoreBatch } from "../source-pipeline";
import { restService } from "../supabase";
import { loadChapter, loadSubject } from "./context";
import { linkSourceToChapter, linkSourceToSubject, upsertSource } from "./source-store";
import { createTask, type PipelineTask } from "./task-store";
import { taskLog } from "./task-log";

type Row = Record<string, unknown>;

function batch<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

/**
 * Programme/admissions catalog pages (studiekeuze, opleiding, toelating, …) look
 * plausible to a keyword search but never contain study theory. They are already
 * scraped-and-billed by the time we see them, so this only spares the scorer and
 * keeps the review clean — the credit saving lives in the domain blocklist and
 * two-phase search, not here.
 */
function looksLikeProgrammePage(url: string, title: string): boolean {
  const haystack = `${url} ${title}`.toLowerCase();
  const markers = [
    "studiekeuze",
    "studiekiezer",
    "opleidingen",
    "/opleiding/",
    "toelatingseisen",
    "toelating",
    "inschrijven",
    "aanmelden",
    "open dag",
    "opendag",
    "studieprogramma",
    "onderwijsaanbod",
    "vakkenoverzicht",
    "programme-finder",
  ];
  return markers.some((marker) => haystack.includes(marker));
}

/**
 * Phase 3 — Firecrawl gathers candidate material for one chapter and the fast
 * model scores it with the existing source scorer. Everything found is mapped
 * to the chapter, then a source_review task curates it.
 */
export async function runSourceGathering(
  task: PipelineTask,
): Promise<Record<string, unknown>> {
  if (!task.chapterId) throw new Error("source_gathering requires a chapter.");
  const config = task.config as unknown as CrawlConfig | null;
  if (!config?.queries?.length) throw new Error("source_gathering requires queries in config.");

  const subject = await loadSubject(task.subjectId);
  const chapter = await loadChapter(task.chapterId);
  const log = taskLog(task);

  await log.info("zoeken", `Zoeken naar bronnen voor "${chapter.title}".`, {
    zoekopdrachten: config.queries,
    perZoekopdracht: config.limitPerQuery,
    alleenDomeinen: config.includeDomains,
    uitgesloten: config.excludeDomains,
    wetenschappelijk: config.useResearchIndex,
  });

  const crawlRows = await restService<Row[]>("crawls", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      subject_id: task.subjectId,
      status: "running",
      prompt_used: config.queries.join(" | "),
    }),
  });
  const crawlId = (crawlRows[0]?.id as string) ?? null;

  try {
    // Phase A — discover snippets only (no scrape), so declined pages cost nothing.
    const { results, creditsUsed: discoverCredits } = await firecrawlDiscover(config);

    // Academic subjects can additionally pull from the research index.
    const papers = config.useResearchIndex
      ? await firecrawlResearchSearch(config.researchQuery ?? config.queries[0]!, 5).catch(
          (error) => {
            logger.warn({ error }, "Research index lookup failed; continuing with web results");
            return [];
          },
        )
      : [];

    const knownUrls = new Set<string>();
    const existing = await restService<Row[]>(
      `chapter_sources?chapter_id=eq.${task.chapterId}&select=sources(url)`,
    );
    for (const row of existing) {
      const embedded = row.sources as Row | Row[] | null | undefined;
      const source = Array.isArray(embedded) ? embedded[0] : embedded;
      if (source?.url) knownUrls.add(source.url as string);
    }

    const fresh = results.filter((result) => result.url && !knownUrls.has(result.url));
    const candidates = fresh.filter(
      (result) => !looksLikeProgrammePage(result.url, result.title ?? ""),
    );
    const skippedProgramme = fresh.length - candidates.length;

    await log.info(
      "gevonden",
      `${results.length} resultaten, waarvan ${candidates.length} nieuw en bruikbaar voor dit hoofdstuk.`,
      {
        alBekend: results.length - fresh.length,
        opleidingspaginaOvergeslagen: skippedProgramme,
        zoekcredits: discoverCredits,
        papers: papers.length,
      },
    );

    // Phase A scoring — judge every candidate on its SERP snippet. Nothing has
    // been scraped yet, so scoreBatch falls back to the description.
    type Scored = {
      status: "accepted" | "pending" | "declined";
      source: Awaited<ReturnType<typeof scoreBatch>>[number];
      snippet: FirecrawlSearchResult | undefined;
    };
    const scoredList: Scored[] = [];
    let accepted = 0;

    for (const group of batch(candidates, 5)) {
      const scored = await scoreBatch(
        { id: subject.id, name: subject.name, yearLevel: subject.yearLevel },
        group,
      );
      for (const source of scored) {
        const status = determineAcceptance(source.quality_score, source.confidence, accepted);
        if (status === "accepted") accepted += 1;
        scoredList.push({
          status,
          source,
          snippet: group.find((item) => item.url === source.url),
        });
      }
    }

    // Phase B — scrape only the winners (accepted or pending). Declined pages
    // keep their snippet text and never cost a scrape credit.
    const winnerUrls = scoredList
      .filter((entry) => entry.status !== "declined")
      .map((entry) => entry.source.url);
    const { markdownByUrl, creditsUsed: scrapeCredits } = await firecrawlScrapeUrls(winnerUrls);
    const creditsUsed = discoverCredits + scrapeCredits;

    await log.info(
      "gescraped",
      `${winnerUrls.length} kansrijke bronnen opgehaald; ${candidates.length - winnerUrls.length} afgewezen zonder scrape.`,
      { scrapecredits: scrapeCredits, gelukt: markdownByUrl.size },
    );

    let stored = 0;

    for (const { status, source, snippet } of scoredList) {
      const markdown = markdownByUrl.get(source.url) ?? null;
      const preview = markdown?.slice(0, 500) ?? snippet?.description ?? null;
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
        contentPreview: preview,
        fullContent: markdown,
        firstCrawlId: crawlId,
      });
      if (!sourceId) continue;

      await log.info(
        "beoordeeld",
        `${status === "accepted" ? "Geaccepteerd" : status === "pending" ? "Twijfel" : "Afgewezen"}: ${source.title}`,
        {
          url: source.url,
          kwaliteit: source.quality_score,
          zekerheid: source.confidence,
          ...(source.decline_reason ? { reden: source.decline_reason } : {}),
        },
      );

      await linkSourceToSubject(sourceId, task.subjectId);
      await linkSourceToChapter(sourceId, task.chapterId);
      stored += 1;
    }

    for (const paper of papers) {
      if (!paper.url || knownUrls.has(paper.url)) continue;
      const sourceId = await upsertSource({
        url: paper.url,
        title: paper.title || paper.url,
        type: "paper",
        language: "en",
        aiSummary: paper.abstract?.slice(0, 1000) ?? "",
        status: "pending",
        contentPreview: paper.abstract?.slice(0, 500) ?? null,
        fullContent: paper.abstract ?? null,
        firstCrawlId: crawlId,
      });
      if (!sourceId) continue;
      await linkSourceToSubject(sourceId, task.subjectId);
      await linkSourceToChapter(sourceId, task.chapterId);
      stored += 1;
    }

    if (crawlId) {
      await restService<Row[]>(`crawls?id=eq.${crawlId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "complete",
          credits_used: creditsUsed,
          sources_found: candidates.length + papers.length,
          sources_accepted: accepted,
          completed_at: new Date().toISOString(),
        }),
      });
    }

    await createTask({
      subjectId: task.subjectId,
      chapterId: task.chapterId,
      taskType: "source_review",
      status: "ready",
      config: { gapRound: Number((task.config as Row | null)?.gapRound ?? 0) },
    });

    await log.conclude(
      `Voor "${chapter.title}" leverden ${config.queries.length} zoekopdrachten ${candidates.length} ` +
        `nieuwe bronnen op. Daarvan zijn er ${accepted} direct geaccepteerd en ` +
        `${stored - accepted} als twijfelgeval of afwijzing opgeslagen. Dit kostte ${creditsUsed} ` +
        `Firecrawl-credits. De bronbeoordeling bepaalt nu welke bronnen het hoofdstuk in gaan.`,
    );

    return { chapter: chapter.title, found: candidates.length, stored, accepted, creditsUsed };
  } catch (error) {
    if (crawlId) {
      await restService<Row[]>(`crawls?id=eq.${crawlId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "failed",
          error_detail: error instanceof Error ? error.message : String(error),
        }),
      }).catch(() => undefined);
    }
    throw error;
  }
}
