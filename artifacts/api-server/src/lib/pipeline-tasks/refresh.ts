import { defaultCrawlConfig } from "../firecrawl";
import { restService } from "../supabase";
import { loadSubject, loadSubjectChapters } from "./context";
import { createTask } from "./task-store";

/**
 * Re-crawls an already-built subject and regenerates its material from the
 * enlarged source set. The existing content stays live throughout: chapters
 * keep their 'ready' status and each content row is only overwritten once its
 * new version is fully generated (saveStudyContent swaps in place), so a
 * student never sees a half-rebuilt subject.
 *
 * Resetting build_started_at reopens a fresh credit_budget allowance for this
 * refresh (the budget guard measures spend since that timestamp), so a refresh
 * can actually crawl even though the first build already spent the budget —
 * under the same per-refresh ceiling. This is an admin action precisely because
 * it authorises that new spend.
 */
export async function queueSubjectRefresh(subjectId: string): Promise<number> {
  const subject = await loadSubject(subjectId);
  const chapters = await loadSubjectChapters(subjectId);
  if (chapters.length === 0) return 0;

  // Reopen the budget window for this refresh run.
  await restService(`crawl_subjects?id=eq.${subjectId}`, {
    method: "PATCH",
    body: JSON.stringify({ build_started_at: new Date().toISOString() }),
  });

  // One gathering task per chapter. Queries are rebuilt from the chapter's own
  // title and topic tags — the original curriculum queries are long gone, and
  // these target the same material a refresh should deepen.
  for (const chapter of chapters) {
    const queries = [
      `${subject.name} ${chapter.title}`,
      ...chapter.topicTags.slice(0, 2).map((tag) => `${subject.name} ${tag}`),
    ];
    const config = {
      ...defaultCrawlConfig(queries),
      ...(subject.deepResearch ? { limitPerQuery: 16 } : {}),
    };
    await createTask({
      subjectId,
      chapterId: chapter.id,
      taskType: "source_gathering",
      status: "ready",
      config: config as unknown as Record<string, unknown>,
    });
  }

  // Re-runs once every gathering/review/regeneration task above is done, so the
  // subject's publish readiness reflects the refreshed material.
  await createTask({
    subjectId,
    taskType: "readiness_check",
    status: "waiting",
  });

  return chapters.length;
}
