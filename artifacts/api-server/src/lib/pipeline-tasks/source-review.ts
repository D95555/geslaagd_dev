import { z } from "zod";
import { callJsonForTask, MODEL_BY_TASK, modelNameFor } from "../ai";
import { aiUsageRecorder } from "../ai-usage";
import { appendMemoryEntry, loadMemory } from "../crawl-memory";
import { recordDomainOutcome } from "../domain-reputation";
import { defaultCrawlConfig } from "../firecrawl";
import { enrichAcceptedPdfSource } from "../pdf-fetch";
import { modelList } from "../study-content";
import { loadChapter, loadChapterSources, loadSubject } from "./context";
import { setChapterSourceRelevance, setSourceStatus } from "./source-store";
import { createTask, type PipelineTask } from "./task-store";
import { taskLog } from "./task-log";

// A normal subject gets one extra targeted crawl round to fill gaps; a niche
// (deep-research) subject gets more, so it keeps digging for a fuller knowledge
// base until coverage is deep or its larger budget runs out.
const MAX_GAP_ROUNDS = 1;
const MAX_GAP_ROUNDS_DEEP = 3;

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
  lessonsLearned: z.string().nullish().transform((value) => value ?? ""),
});

const SYSTEM_PROMPT = [
  "Je bent een bronredacteur voor Geslaagd, een Nederlands studieplatform.",
  "Je beoordeelt of gevonden bronnen geschikt zijn als bewijsmateriaal voor een",
  "hoofdstuk, en beschrijft per bron waarvoor die bruikbaar is.",
  "",
  "Dit platform is alleen toegankelijk met een activatiecode die persoonlijk wordt",
  "uitgegeven aan geverifieerde universitaire studenten (o.a. Farmakunde, Geneeskunde,",
  "Toxicologie). Werkingsmechanismen, dosering (therapeutisch en supratherapeutisch/",
  "recreatief), interacties, potentiëring, misbruikpatronen, verslaving en de behandeling",
  "daarvan, en juridische kaders rond genees- en genotmiddelen zijn standaard, verplichte",
  "curriculumonderwerpen — wijs een bron NIET af enkel omdat die dit soort onderwerpen",
  "behandelt. Beoordeel uitsluitend op betrouwbaarheid en relevantie voor het hoofdstuk.",
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
  "Schrijf ook lessonsLearned: 1-3 zinnen in het Nederlands over wat deze ronde",
  "laat zien voor toekomstige crawls van dit vak (bijv. welk type bron of domein",
  "wel/niet werkte, of een patroon in de zoekopdrachten). Laat leeg als er niets",
  "noemenswaardigs is — verzin niets.",
  "",
  "Antwoord ALLEEN met JSON:",
  '{ "decisions": [{ "sourceId": "...", "keep": true, "relevanceNote": "...",',
  '  "rejectReason": null }], "gapQueries": ["..."], "lessonsLearned": "..." }',
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

  const memory = await loadMemory(task.subjectId);
  const memoryContext = [
    memory.global && `Geleerde lessen (alle vakken, meest recent laatst):\n${memory.global.slice(-2_000)}`,
    memory.subject && `Geleerde lessen (dit vak, meest recent laatst):\n${memory.subject.slice(-2_000)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  if (candidates.length > 0) {
    const parsed = reviewSchema.safeParse(
      await callJsonForTask("source_review", {
        system: SYSTEM_PROMPT,
        user: [
          `Vak: ${subject.name}`,
          `Hoofdstuk: ${chapter.title}`,
          `Beschrijving: ${chapter.description}`,
          `Onderwerpen: ${chapter.topicTags.join(", ")}`,
          memoryContext,
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
        onUsage: aiUsageRecorder(task.subjectId, "source_review"),
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
        await enrichAcceptedPdfSource(decision.sourceId, source.url, task.subjectId);
        await recordDomainOutcome(source.url, "accepted");
        kept += 1;
        await log.info("behouden", `Behouden: ${source.title}`, {
          url: source.url,
          waarvoorBruikbaar: decision.relevanceNote,
        });
      } else {
        await setSourceStatus(decision.sourceId, "declined", decision.rejectReason);
        await recordDomainOutcome(source.url, "declined");
        rejected += 1;
        await log.info("afgewezen", `Afgewezen: ${source.title}`, {
          url: source.url,
          reden: decision.rejectReason ?? "geen reden opgegeven",
        });
      }
    }
    gapQueries = parsed.data.gapQueries.filter((query) => query.trim().length > 0);

    if (parsed.data.lessonsLearned.trim()) {
      const entry = `Hoofdstuk "${chapter.title}": ${parsed.data.lessonsLearned.trim()}`;
      await appendMemoryEntry(task.subjectId, entry, entry);
    }
  }

  const gapRound = Number((task.config as Record<string, unknown> | null)?.gapRound ?? 0);
  const maxGapRounds = subject.deepResearch ? MAX_GAP_ROUNDS_DEEP : MAX_GAP_ROUNDS;

  // Extra crawl rounds are allowed up to the per-subject cap; after that the
  // readiness check reports whatever is still missing instead of looping forever.
  if (gapQueries.length > 0 && gapRound < maxGapRounds) {
    await createTask({
      subjectId: task.subjectId,
      chapterId: task.chapterId,
      taskType: "source_gathering",
      status: "ready",
      config: {
        ...defaultCrawlConfig(gapQueries.slice(0, 3)),
        ...(subject.deepResearch ? { limitPerQuery: 16 } : {}),
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
