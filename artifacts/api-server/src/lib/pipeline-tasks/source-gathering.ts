import { firecrawlResearchSearch, firecrawlSearch, type CrawlConfig } from "../firecrawl";
import { logger } from "../logger";
import { determineAcceptance, scoreBatch } from "../source-pipeline";
import { restService } from "../supabase";
import { loadChapter, loadSubject } from "./context";
import { linkSourceToChapter, linkSourceToSubject, upsertSource } from "./source-store";
import { createTask, type PipelineTask } from "./task-store";

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
    const { results, creditsUsed } = await firecrawlSearch(config);

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

    const candidates = results.filter((result) => result.url && !knownUrls.has(result.url));

    let accepted = 0;
    let stored = 0;

    for (const group of batch(candidates, 5)) {
      const scored = await scoreBatch(
        { id: subject.id, name: subject.name, yearLevel: subject.yearLevel },
        group,
      );
      for (const source of scored) {
        const status = determineAcceptance(source.quality_score, source.confidence, accepted);
        if (status === "accepted") accepted += 1;

        const original = group.find((item) => item.url === source.url);
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
          contentPreview: original?.markdown?.slice(0, 500) ?? null,
          fullContent: original?.markdown ?? null,
        });
        if (!sourceId) continue;

        await linkSourceToSubject(sourceId, task.subjectId);
        await linkSourceToChapter(sourceId, task.chapterId);
        stored += 1;
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
