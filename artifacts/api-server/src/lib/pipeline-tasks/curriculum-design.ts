import { z } from "zod";
import { callJsonForTask, MODEL_BY_TASK, modelNameFor } from "../ai";
import { modelList, modelText } from "../study-content";
import { defaultCrawlConfig, firecrawlDiscover, type CrawlConfig } from "../firecrawl";
import { logger } from "../logger";
import { restService } from "../supabase";
import { loadSubject } from "./context";
import { linkSourceToChapter, linkSourceToSubject, upsertSource } from "./source-store";
import { createTask, type PipelineTask } from "./task-store";
import { taskLog } from "./task-log";

type Row = Record<string, unknown>;

const curriculumSchema = z.object({
  description: modelText(),
  difficultyLevel: modelText("VWO"),
  chapters: z
    .array(
      z.object({
        position: z.number().int(),
        title: modelText(),
        description: modelText(),
        topicTags: modelList(z.string()),
        isImportant: z.boolean().nullish().transform((value) => value ?? false),
        foundSources: modelList(
          z.object({
            url: z.string(),
            title: modelText(),
            relevanceNote: modelText(),
          }),
        ),
      }),
    )
    .min(1),
  crawlConfigs: modelList(
    z.object({
      chapterPosition: z.number().int(),
      queries: modelList(z.string()),
      categories: modelList(z.string()),
      includeDomains: modelList(z.string()),
      useResearchIndex: z.boolean().nullish().transform((value) => value ?? false),
    }),
  ),
});

const SYSTEM_PROMPT = [
  "Je bent een curriculumontwerper voor Geslaagd, een Nederlands studieplatform.",
  "Je ontwerpt complete hoofdstukindelingen voor vakken op VWO- en bachelorniveau.",
  "",
  "Opdracht:",
  "1. Onderzoek dit vak grondig. Gebruik de zoekresultaten hieronder.",
  "2. Maak een lijst van 10-16 hoofdstukken die samen het volledige vak dekken.",
  "   Elk hoofdstuk wordt één samenvatting die de student in plaats van een boek",
  "   leest. Past de theorie van een onderwerp niet in één behapbaar hoofdstuk,",
  "   SPLITS het dan in twee hoofdstukken. Liever meer, kleinere hoofdstukken dan",
  "   één hoofdstuk waarin theorie moet worden weggelaten.",
  "3. Voor elk hoofdstuk:",
  "   - Een duidelijke titel",
  "   - Een korte beschrijving (1-2 zinnen)",
  "   - 3-6 topicTags: de theorieonderdelen die het hoofdstuk MOET behandelen.",
  "     Deze lijst is bindend — de samenvatting krijgt één sectie per topicTag,",
  "     dus benoem hier alles wat de student van dit hoofdstuk moet kennen.",
  "   - Of het een 'belangrijk' hoofdstuk is (krijgt een tentamen)",
  "   - Eventuele bronnen die je in de zoekresultaten vond, met URL en een korte",
  "     notitie over hoe de bron relevant is voor dit hoofdstuk",
  "4. Schrijf een beschrijving van het vak (2-3 zinnen).",
  "5. Bepaal het moeilijkheidsniveau (bijv. 'VWO 5', 'VWO 6', 'Bachelor 1').",
  "6. Geef per hoofdstuk 2-3 gerichte zoekopdrachten in crawlConfigs.",
  "",
  "Voor vakken met een standaard lesboek (bijv. Getal & Ruimte, NOVA, Memo),",
  "volg de hoofdstukindeling van het boek. Voor minder gestandaardiseerde vakken,",
  "kies een logische volgorde. De hoofdstukken moeten samen het VOLLEDIGE",
  "examenprogramma dekken.",
  "",
  "Antwoord ALLEEN met JSON in deze vorm:",
  '{ "description": "...", "difficultyLevel": "VWO 6",',
  '  "chapters": [{ "position": 1, "title": "...", "description": "...",',
  '    "topicTags": ["..."], "isImportant": true,',
  '    "foundSources": [{ "url": "...", "title": "...", "relevanceNote": "..." }] }],',
  '  "crawlConfigs": [{ "chapterPosition": 1, "queries": ["..."], "categories": [],',
  '    "includeDomains": [], "useResearchIndex": false }] }',
].join("\n");

// Overview-only research: only chapter-planning context is needed here, not
// full page content, so this uses the free/cheap discover (snippet) call
// rather than a full scrape of every result.
async function researchSubject(name: string, yearLevel: string, subjectId: string): Promise<string> {
  const config = defaultCrawlConfig([
    `${name} ${yearLevel === "vwo" ? "VWO" : "bachelor"} examenprogramma hoofdstukken`,
    `${name} samenvatting lesstof`,
  ]);
  config.limitPerQuery = 8;

  try {
    const { results } = await firecrawlDiscover(config, { subjectId });
    if (results.length === 0) return "(geen zoekresultaten beschikbaar)";
    return results
      .map(
        (result, index) =>
          `[${index + 1}] ${result.title ?? result.url}\nURL: ${result.url}\n` +
          `${(result.description ?? "").slice(0, 1500)}`,
      )
      .join("\n\n");
  } catch (error) {
    logger.warn({ error, name }, "Curriculum research search failed; designing without sources");
    return "(zoeken mislukt — ontwerp op basis van je eigen kennis)";
  }
}

/**
 * Phase 2 — the strong model turns a bare subject into a full chapter plan,
 * then fans out one source_gathering task per chapter plus the subject-level
 * questionnaire and the readiness check that closes the pipeline.
 */
export async function runCurriculumDesign(
  task: PipelineTask,
): Promise<Record<string, unknown>> {
  const subject = await loadSubject(task.subjectId);
  const log = taskLog(task);

  await log.info("onderzoek", `Vooronderzoek naar "${subject.name}" via Firecrawl.`);
  const research = await researchSubject(subject.name, subject.yearLevel, task.subjectId);

  const parsed = curriculumSchema.safeParse(
    await callJsonForTask("curriculum_design", {
      system: SYSTEM_PROMPT,
      user: [
        `Vak: ${subject.name}`,
        `Niveau: ${subject.yearLevel}`,
        "",
        "Zoekresultaten:",
        research,
      ].join("\n"),
      maxTokens: 16_000,
    }),
  );
  if (!parsed.success) {
    throw new Error(`Curriculum design returned unusable JSON: ${parsed.error.message}`);
  }
  const design = parsed.data;

  await log.info(
    "ontwerp",
    `${design.chapters.length} hoofdstukken ontworpen op niveau ${design.difficultyLevel}.`,
    {
      hoofdstukken: design.chapters.map((chapter) => ({
        positie: chapter.position,
        titel: chapter.title,
        onderwerpen: chapter.topicTags,
        tentamen: chapter.isImportant,
      })),
    },
  );

  await restService<Row[]>(`crawl_subjects?id=eq.${task.subjectId}`, {
    method: "PATCH",
    body: JSON.stringify({
      description: design.description,
      difficulty_level: design.difficultyLevel,
      chapter_count: design.chapters.length,
      updated_at: new Date().toISOString(),
    }),
  });

  // Re-running the designer replaces the previous plan rather than colliding
  // with the (subject_id, position) unique constraint.
  await restService<Row[]>(`chapters?subject_id=eq.${task.subjectId}`, { method: "DELETE" });

  const configByPosition = new Map(
    design.crawlConfigs.map((config) => [config.chapterPosition, config]),
  );

  const created: Array<{ id: string; position: number; title: string }> = [];

  for (const chapter of design.chapters) {
    const rows = await restService<Row[]>("chapters", {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        subject_id: task.subjectId,
        position: chapter.position,
        title: chapter.title,
        description: chapter.description,
        is_important: chapter.isImportant,
        topic_tags: chapter.topicTags,
        status: "pending",
      }),
    });
    const chapterId = rows[0]?.id as string | undefined;
    if (!chapterId) throw new Error(`Could not create chapter "${chapter.title}".`);
    created.push({ id: chapterId, position: chapter.position, title: chapter.title });

    for (const found of chapter.foundSources) {
      if (!/^https?:\/\//i.test(found.url)) continue;
      const sourceId = await upsertSource({
        url: found.url,
        title: found.title || found.url,
        aiSummary: found.relevanceNote,
        status: "pending",
      });
      if (!sourceId) continue;
      await linkSourceToSubject(sourceId, task.subjectId);
      await linkSourceToChapter(sourceId, chapterId, found.relevanceNote);
    }
  }

  // One gathering task per chapter — they are independent and run in parallel.
  for (const chapter of created) {
    const designed = configByPosition.get(chapter.position);
    const config: CrawlConfig = {
      ...defaultCrawlConfig(
        designed?.queries?.length
          ? designed.queries
          : [`${subject.name} ${chapter.title} uitleg`],
      ),
      categories: designed?.categories ?? [],
      includeDomains: designed?.includeDomains ?? [],
      useResearchIndex: designed?.useResearchIndex ?? false,
      researchQuery: designed?.useResearchIndex ? `${subject.name} ${chapter.title}` : null,
    };
    await createTask({
      subjectId: task.subjectId,
      chapterId: chapter.id,
      taskType: "source_gathering",
      status: "ready",
      config: config as unknown as Record<string, unknown>,
    });
  }

  await createTask({
    subjectId: task.subjectId,
    taskType: "questionnaire_generation",
    status: "ready",
  });

  // Released by the worker once every other task for this subject is done.
  await createTask({
    subjectId: task.subjectId,
    taskType: "readiness_check",
    status: "waiting",
  });

  const withExam = design.chapters.filter((chapter) => chapter.isImportant).length;
  await log.conclude(
    `"${subject.name}" is opgedeeld in ${created.length} hoofdstukken op niveau ` +
      `${design.difficultyLevel}, waarvan ${withExam} met een tentamen. Er staan nu ` +
      `${created.length} zoektaken klaar om per hoofdstuk bronnen te verzamelen, plus een ` +
      `startvragenlijst. De gereedheidscontrole wacht tot al dat werk klaar is.`,
  );

  return {
    chapters: created.length,
    difficultyLevel: design.difficultyLevel,
    model: modelNameFor(MODEL_BY_TASK.curriculum_design),
  };
}
