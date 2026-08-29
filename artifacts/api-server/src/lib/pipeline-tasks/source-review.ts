import { z } from "zod";
import { callJsonForTask, MODEL_BY_TASK, modelNameFor } from "../ai";
import { defaultCrawlConfig } from "../firecrawl";
import { modelList } from "../study-content";
import { loadChapter, loadChapterSources, loadSubject } from "./context";
import { setChapterSourceRelevance, setSourceStatus } from "./source-store";
import { createTask, type PipelineTask } from "./task-store";

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

  let kept = 0;
  let gapQueries: string[] = [];

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

    const known = new Set(candidates.map((source) => source.id));
    for (const decision of parsed.data.decisions) {
      if (!known.has(decision.sourceId)) continue;
      if (decision.keep) {
        await setSourceStatus(decision.sourceId, "accepted");
        await setChapterSourceRelevance(
          task.chapterId,
          decision.sourceId,
          decision.relevanceNote,
        );
        kept += 1;
      } else {
        await setSourceStatus(decision.sourceId, "declined", decision.rejectReason);
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

  return { chapter: chapter.title, kept, gapQueries: 0, model: modelNameFor(MODEL_BY_TASK.source_review) };
}
