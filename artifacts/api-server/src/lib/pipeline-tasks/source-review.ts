import { z } from "zod";
import { callJsonForTask, MODEL_BY_TASK, modelNameFor } from "../ai";
import { defaultCrawlConfig } from "../firecrawl";
import { modelList } from "../study-content";
import { loadChapter, loadChapterSources, loadSubject } from "./context";
import { setChapterSourceRelevance, setSourceStatus } from "./source-store";
import { createTask, type PipelineTask } from "./task-store";
import { taskLog } from "./task-log";

const MAX_GAP_ROUNDS = 1;

const reviewSchema = z.object({
  decisions: z
    .array(
      z.object({
        sourceId: z.string(),
        keep: z.boolean(),
        // The model leaves these null for the branch that does not apply —
        // a rejected source has no relevance note, a kept one no reason.
        relevanceNote: z.string().nullish().transform((note) => note ?? ""),
        rejectReason: z.string().nullish().transform((reason) => reason ?? null),
      }),
    )
    .default([]),
  gapQueries: modelList(z.string()),
});

const SYSTEM_PROMPT = [
  "Je bent een bronredacteur voor Geslaagd, een Nederlands studieplatform.",
  "Je beoordeelt of gevonden bronnen geschikt zijn als bewijsmateriaal voor een",
  "hoofdstuk, en beschrijft per bron waarvoor die bruikbaar is.",
  "",
  "Voor elke bron:",
  "- keep: true als de bron betrouwbaar en relevant is voor dit hoofdstuk",
  "- relevanceNote: 1 zin over welk onderdeel van het hoofdstuk deze bron dekt",
  "- rejectReason: bij keep=false een korte reden in het Nederlands, anders null",
  "",
  "Geef daarnaast gapQueries: zoekopdrachten voor onderwerpen uit dit hoofdstuk",
  "die door geen enkele goedgekeurde bron worden gedekt. Laat de lijst leeg als",
  "de dekking voldoende is.",
  "",
  "Antwoord ALLEEN met JSON:",
  '{ "decisions": [{ "sourceId": "...", "keep": true, "relevanceNote": "...",',
  '  "rejectReason": null }], "gapQueries": ["..."] }',
].join("\n");

/**
 * Phase 4 — curates what the scorer let through, then either orders one more
 * targeted crawl to fill gaps or opens content generation for the chapter.
 */
export async function runSourceReview(task: PipelineTask): Promise<Record<string, unknown>> {
  if (!task.chapterId) throw new Error("source_review requires a chapter.");

  const subject = await loadSubject(task.subjectId);
  const chapter = await loadChapter(task.chapterId);
  const candidates = await loadChapterSources(task.chapterId, {
    onlyAccepted: false,
    charLimit: 2_000,
  });

  const log = taskLog(task);
  let kept = 0;
  let rejected = 0;
  let gapQueries: string[] = [];

  await log.info("start", `${candidates.length} bronnen te beoordelen voor "${chapter.title}".`, {
    onderwerpen: chapter.topicTags,
  });

  if (candidates.length > 0) {
    const parsed = reviewSchema.safeParse(
      await callJsonForTask("source_review", {
        system: SYSTEM_PROMPT,
        user: [
          `Vak: ${subject.name}`,
          `Hoofdstuk: ${chapter.title}`,
          `Beschrijving: ${chapter.description}`,
          `Onderwerpen: ${chapter.topicTags.join(", ")}`,
          "",
          "Bronnen:",
          ...candidates.map((source) =>
            [
              `sourceId: ${source.id}`,
              `Titel: ${source.title}`,
              `URL: ${source.url}`,
              `Inhoud: ${source.content.slice(0, 1200) || "(geen inhoud)"}`,
            ].join("\n"),
          ),
        ].join("\n\n"),
        maxTokens: 8_000,
      }),
    );
    if (!parsed.success) {
      throw new Error(`Source review returned unusable JSON: ${parsed.error.message}`);
    }

    const byId = new Map(candidates.map((source) => [source.id, source]));
    for (const decision of parsed.data.decisions) {
      const source = byId.get(decision.sourceId);
      if (!source) continue;
      if (decision.keep) {
        await setSourceStatus(decision.sourceId, "accepted");
        await setChapterSourceRelevance(
          task.chapterId,
          decision.sourceId,
          decision.relevanceNote,
        );
        kept += 1;
        await log.info("behouden", `Behouden: ${source.title}`, {
          url: source.url,
          waarvoorBruikbaar: decision.relevanceNote,
        });
      } else {
        await setSourceStatus(decision.sourceId, "declined", decision.rejectReason);
        rejected += 1;
        await log.info("afgewezen", `Afgewezen: ${source.title}`, {
          url: source.url,
          reden: decision.rejectReason ?? "geen reden opgegeven",
        });
      }
    }
    gapQueries = parsed.data.gapQueries.filter((query) => query.trim().length > 0);
  }

  const gapRound = Number((task.config as Record<string, unknown> | null)?.gapRound ?? 0);

  // One extra crawl round is allowed; after that the readiness check reports
  // whatever is still missing instead of looping forever.
  if (gapQueries.length > 0 && gapRound < MAX_GAP_ROUNDS) {
    await createTask({
      subjectId: task.subjectId,
      chapterId: task.chapterId,
      taskType: "source_gathering",
      status: "ready",
      config: {
        ...defaultCrawlConfig(gapQueries.slice(0, 3)),
        gapRound: gapRound + 1,
      } as unknown as Record<string, unknown>,
    });
    await log.conclude(
      `Van ${candidates.length} bronnen voor "${chapter.title}" zijn er ${kept} behouden en ` +
        `${rejected} afgewezen. De dekking is nog niet compleet, dus er volgt één extra ` +
        `zoekronde voor: ${gapQueries.slice(0, 3).join("; ")}.`,
    );
    return { chapter: chapter.title, kept, gapQueries: gapQueries.length, model: modelNameFor(MODEL_BY_TASK.source_review) };
  }

  // The summary is written from the sources; everything else is derived from
  // the summary, so those tasks wait on it. They are queued as 'ready' with a
  // dependency — the worker skips them until the summary is done.
  const summary = await createTask({
    subjectId: task.subjectId,
    chapterId: task.chapterId,
    taskType: "summary_generation",
    status: "ready",
  });

  const derived = ["key_notes_generation", "exercise_generation"] as const;
  for (const taskType of derived) {
    await createTask({
      subjectId: task.subjectId,
      chapterId: task.chapterId,
      taskType,
      status: "ready",
      dependsOn: [summary.id],
    });
  }
  if (chapter.isImportant) {
    await createTask({
      subjectId: task.subjectId,
      chapterId: task.chapterId,
      taskType: "exam_generation",
      status: "ready",
      dependsOn: [summary.id],
    });
  }

  await log.conclude(
    `Van ${candidates.length} bronnen voor "${chapter.title}" zijn er ${kept} behouden en ` +
      `${rejected} afgewezen. De dekking is voldoende, dus de samenvatting kan geschreven worden. ` +
      `Daarna volgen kernpunten, oefenvragen${chapter.isImportant ? " en een tentamen" : ""}.`,
  );

  return { chapter: chapter.title, kept, gapQueries: 0, model: modelNameFor(MODEL_BY_TASK.source_review) };
}
