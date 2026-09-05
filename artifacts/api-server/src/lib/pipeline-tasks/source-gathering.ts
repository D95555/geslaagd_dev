import {
  firecrawlMap,
  firecrawlResearchSearch,
  firecrawlScrapeUrls,
  type CrawlConfig,
} from "../firecrawl";
import { determineAcceptance, filterCandidateLinks, scoreBatch } from "../crawl-brain";
import { discoverCandidates, type Candidate } from "../crawl-brain/discovery";
import { prefilterCandidates } from "../crawl-brain/prefilter";
import { getTrustedDomains, recordDomainOutcome } from "../domain-reputation";
import { logger } from "../logger";
import { enrichAcceptedPdfSource } from "../pdf-fetch";
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
  const budgetCtx = { subjectId: task.subjectId, crawlId };

  try {
    // Phase A — samengevoegde discovery (Firecrawl + Exa), snippets/highlights only.
    const {
      candidates: discovered,
      firecrawlCredits: discoverCredits,
      exaCredits,
    } = await discoverCandidates(config, budgetCtx);
    let mapCreditsUsed = 0;

    // Phase A2 — trusted-domain fast-track: a Firecrawl map call is a flat 1
    // credit no matter how many URLs it returns, far cheaper than search for a
    // domain that has already proven itself across earlier crawls.
    const trustedDomains = await getTrustedDomains();
    for (const domain of trustedDomains) {
      const { results: mapResults, creditsUsed: mapCredits } = await firecrawlMap(
        domain,
        config.queries[0]!,
        budgetCtx,
      );
      mapCreditsUsed += mapCredits;
      for (const mapResult of mapResults) {
        if (!mapResult.url || discovered.some((existing) => existing.url === mapResult.url)) continue;
        discovered.push({
          url: mapResult.url,
          title: mapResult.title,
          description: mapResult.description,
          provider: "firecrawl",
        });
      }
    }
    if (trustedDomains.length > 0) {
      await log.info(
        "vertrouwde-domeinen",
        `${trustedDomains.length} vertrouwde domeinen gecheckt via map (${mapCreditsUsed} credits).`,
        { domeinen: trustedDomains },
      );
    }

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

    const beforeFilter = discovered.length;
    const candidates = await prefilterCandidates(discovered, knownUrls);
    const skippedByFilter = beforeFilter - candidates.length;

    await log.info(
      "gevonden",
      `${beforeFilter} resultaten, waarvan ${candidates.length} nieuw en bruikbaar voor dit hoofdstuk.`,
      {
        weggefilterd: skippedByFilter,
        zoekcredits: discoverCredits,
        exacredits: exaCredits,
        papers: papers.length,
      },
    );

    // Phase A scoring — judge every candidate on its SERP snippet. Nothing has
    // been scraped yet, so scoreBatch falls back to the description.
    type Scored = {
      status: "accepted" | "pending" | "declined";
      source: Awaited<ReturnType<typeof scoreBatch>>[number];
      snippet: Candidate | undefined;
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
    const { markdownByUrl, linksByUrl, creditsUsed: scrapeCredits } = await firecrawlScrapeUrls(
      winnerUrls,
      budgetCtx,
    );
    let creditsUsed = discoverCredits + exaCredits + mapCreditsUsed + scrapeCredits;

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

      if (status === "accepted" || status === "declined") {
        await recordDomainOutcome(source.url, status);
      }

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

      if (status === "accepted") {
        await enrichAcceptedPdfSource(sourceId, source.url, task.subjectId);
      }
    }

    // Phase C — free link-following: accepted pages often link to other good
    // material, and Firecrawl already returned those links as part of the
    // Phase B scrape (the `links` format costs nothing extra), so harvesting
    // a few is free discovery instead of a fresh paid search. There is no
    // cheap snippet to pre-filter on here, so — unlike phase A/B — candidates
    // are scraped and scored in one step; the cap stays tight (5) since every
    // one of them costs a real scrape credit.
    const seenUrls = new Set([...knownUrls, ...scoredList.map((entry) => entry.source.url)]);
    const linkCandidateUrls: string[] = [];
    outer: for (const { status, source } of scoredList) {
      if (status !== "accepted") continue;
      const links = linksByUrl.get(source.url);
      if (!links) continue;
      for (const url of filterCandidateLinks(links, source.url, seenUrls, 5)) {
        linkCandidateUrls.push(url);
        seenUrls.add(url);
        if (linkCandidateUrls.length >= 5) break outer;
      }
    }

    if (linkCandidateUrls.length > 0) {
      const { markdownByUrl: linkMarkdownByUrl, creditsUsed: linkScrapeCredits } =
        await firecrawlScrapeUrls(linkCandidateUrls, budgetCtx);
      creditsUsed += linkScrapeCredits;

      const linkCandidates = linkCandidateUrls
        .filter((url) => linkMarkdownByUrl.has(url))
        .map((url) => ({ url, markdown: linkMarkdownByUrl.get(url) }));

      await log.info(
        "links-gevonden",
        `${linkCandidateUrls.length} gratis kandidaat-links gevonden via geaccepteerde bronnen, ` +
          `${linkCandidates.length} succesvol opgehaald.`,
        { urls: linkCandidateUrls },
      );

      if (linkCandidates.length > 0) {
        const linkScored = await scoreBatch(
          { id: subject.id, name: subject.name, yearLevel: subject.yearLevel },
          linkCandidates,
        );
        for (const source of linkScored) {
          const status = determineAcceptance(source.quality_score, source.confidence, accepted);
          if (status === "accepted") accepted += 1;
          const markdown = linkMarkdownByUrl.get(source.url) ?? null;
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

          if (status === "accepted" || status === "declined") {
            await recordDomainOutcome(source.url, status);
          }

          await log.info(
            "link-beoordeeld",
            `${status === "accepted" ? "Geaccepteerd" : status === "pending" ? "Twijfel" : "Afgewezen"} (via link): ${source.title}`,
            { url: source.url, kwaliteit: source.quality_score, zekerheid: source.confidence },
          );

          await linkSourceToSubject(sourceId, task.subjectId);
          await linkSourceToChapter(sourceId, task.chapterId);
          stored += 1;

          if (status === "accepted") {
            await enrichAcceptedPdfSource(sourceId, source.url, task.subjectId);
          }
        }
      }
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
          sources_found: candidates.length + papers.length + linkCandidateUrls.length,
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
        `nieuwe bronnen op${linkCandidateUrls.length ? `, plus ${linkCandidateUrls.length} gratis via links uit geaccepteerde bronnen` : ""}. ` +
        `Daarvan zijn er ${accepted} direct geaccepteerd en ${stored - accepted} als twijfelgeval of ` +
        `afwijzing opgeslagen. Dit kostte ${creditsUsed} Firecrawl-credits. De bronbeoordeling bepaalt nu ` +
        `welke bronnen het hoofdstuk in gaan.`,
    );

    return {
      chapter: chapter.title,
      found: candidates.length,
      linkCandidates: linkCandidateUrls.length,
      stored,
      accepted,
      creditsUsed,
    };
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
