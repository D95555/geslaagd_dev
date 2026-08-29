import { z } from "zod";
import { callStrongJson, STRONG_MODEL } from "../ai";
import { defaultCrawlConfig, firecrawlSearch, type CrawlConfig } from "../firecrawl";
import { logger } from "../logger";
import { restService } from "../supabase";
import { loadSubject } from "./context";
import { linkSourceToChapter, linkSourceToSubject, upsertSource } from "./source-store";
import { createTask, type PipelineTask } from "./task-store";

type Row = Record<string, unknown>;

const curriculumSchema = z.object({
  description: z.string(),
  difficultyLevel: z.string(),
  chapters: z
    .array(
      z.object({
        position: z.number().int(),
        title: z.string(),
        description: z.string().default(""),
        topicTags: z.array(z.string()).default([]),
        isImportant: z.boolean().default(false),
        foundSources: z
          .array(
            z.object({
              url: z.string(),
              title: z.string().default(""),
              relevanceNote: z.string().default(""),
            }),
          )
          .default([]),
      }),
    )
    .min(1),
  crawlConfigs: z
    .array(
      z.object({
        chapterPosition: z.number().int(),
        queries: z.array(z.string()).default([]),
        categories: z.array(z.string()).default([]),
        includeDomains: z.array(z.string()).default([]),
        useResearchIndex: z.boolean().default(false),
      }),
    )
    .default([]),
});

const SYSTEM_PROMPT = [
  "Je bent een curriculumontwerper voor Geslaagd, een Nederlands studieplatform.",
  "Je ontwerpt complete hoofdstukindelingen voor vakken op VWO- en bachelorniveau.",
  "",
  "Opdracht:",
  "1. Onderzoek dit vak grondig. Gebruik de zoekresultaten hieronder.",
  "2. Maak een lijst van 10-12 hoofdstukken die samen het volledige vak dekken.",
  "3. Voor elk hoofdstuk:",
  "   - Een duidelijke titel",
  "   - Een korte beschrijving (1-2 zinnen)",
  "   - 3-6 topicTags (voor het bijhouden van sterke/zwakke punten)",
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

async function researchSubject(name: string, yearLevel: string): Promise<string> {
  const config = defaultCrawlConfig([
    `${name} ${yearLevel === "vwo" ? "VWO" : "bachelor"} examenprogramma hoofdstukken`,
    `${name} samenvatting lesstof`,
  ]);
  config.limitPerQuery = 8;

  try {
    const { results } = await firecrawlSearch(config);
    if (results.length === 0) return "(geen zoekresultaten beschikbaar)";
    return results
      .map(
        (result, index) =>
          `[${index + 1}] ${result.title ?? result.url}\nURL: ${result.url}\n` +
          `${(result.markdown ?? result.description ?? "").slice(0, 1500)}`,
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
  const research = await researchSubject(subject.name, subject.yearLevel);

  const parsed = curriculumSchema.safeParse(
    await callStrongJson({
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

  return {
    chapters: created.length,
    difficultyLevel: design.difficultyLevel,
    model: STRONG_MODEL,
  };
}
