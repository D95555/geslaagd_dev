import { z } from "zod";
import { callJsonForTask, MODEL_BY_TASK, modelNameFor } from "../ai";
import { logger } from "../logger";
import { summarySchema, type Citation } from "../study-content";
import {
  formatSourcesForPrompt,
  loadChapter,
  loadChapterSources,
  loadSubject,
  refreshChapterStatus,
  saveStudyContent,
  type SourceContext,
} from "./context";
import type { PipelineTask } from "./task-store";

const SYSTEM_PROMPT = [
  "Je bent een ervaren docent die samenvattingen schrijft voor het studieplatform",
  "Geslaagd. Je schrijft voor VWO- en eerstejaars bachelorstudenten.",
  "",
  "Dit is het PRIMAIRE studiemateriaal — studenten lezen dit in plaats van een",
  "boek. Alles wat ze moeten kennen staat hier, of ze leren het nooit.",
  "",
  "STRUCTUUR — dit is bindend:",
  "- Schrijf één markdown-sectie (## kopje) per opgegeven onderwerp",
  "- Gebruik het onderwerp exact als kopje, zodat dekking controleerbaar is",
  "- Behandel de onderwerpen in de opgegeven volgorde",
  "",
  "VOLLEDIGHEID:",
  "- Elk onderwerp krijgt de volledige theorie: definities, formules, regels,",
  "  uitzonderingen en de samenhang met de andere onderwerpen",
  "- Geef bij elk concept minstens één concreet uitgewerkt voorbeeld",
  "- Laat liever niets weg dan dat je het kort houdt",
  "",
  "GEEN VULLING — even belangrijk:",
  "- Geen inleiding, geen 'in dit hoofdstuk leren we', geen afsluitende samenvatting",
  "- Geen herhaling van wat je al hebt uitgelegd",
  "- Geen aanmoedigingen of studietips",
  "- Elke zin voegt informatie toe die de student moet kennen",
  "",
  "CITATIES:",
  "- Gebruik [Bron X] bij belangrijke claims, theorieën en uitleg",
  "- Citeer NIET universele feiten (2+2=4, water kookt bij 100°C)",
  "- Gebruik in citations exact de sourceId-waarden uit de bronnenlijst",
  "- Heb je geen bron voor iets dat er wél hoort te staan? Schrijf het dan toch,",
  "  zonder citatie. Volledigheid gaat voor.",
  "",
  "Antwoord ALLEEN met JSON:",
  '{ "title": "hoofdstuktitel", "body": "volledige markdown samenvatting",',
  '  "citations": [{ "index": 1, "sourceId": "…", "title": "…", "url": "…" }],',
  '  "wordCount": 1500 }',
].join("\n");

const GAP_SYSTEM_PROMPT = [
  "Je vult een ontbrekend onderdeel aan in een bestaande samenvatting voor het",
  "studieplatform Geslaagd.",
  "",
  "Schrijf ALLEEN de ontbrekende sectie(s), in hetzelfde markdown-formaat:",
  "een ## kopje met exact de onderwerpnaam, gevolgd door de volledige theorie",
  "met definities, formules en een concreet voorbeeld.",
  "",
  "Geen inleiding, geen herhaling van wat er al staat, geen vulling.",
  "",
  'Antwoord ALLEEN met JSON: { "body": "## Onderwerp\\n\\n…" }',
].join("\n");

/**
 * The chapter's topic tags are the contract for what the theory must cover, so
 * coverage is verified in code rather than hoped for. Anything the model
 * skipped comes back as a concrete list instead of a silent gap.
 */
export function findMissingTopics(body: string, topicTags: string[]): string[] {
  const haystack = body.toLowerCase();
  return topicTags.filter((tag) => {
    const needle = tag.trim().toLowerCase();
    return needle.length > 0 && !haystack.includes(needle);
  });
}

/**
 * Citations come back from the model as free text, so each one is re-anchored
 * to a real source: by id when it matches, otherwise by its [Bron N] position.
 */
export function normaliseCitations(
  citations: Citation[],
  sources: SourceContext[],
): Citation[] {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const resolved: Citation[] = [];

  for (const citation of citations) {
    const match = byId.get(citation.sourceId) ?? sources[citation.index - 1];
    if (!match) continue;
    resolved.push({
      index: citation.index,
      sourceId: match.id,
      title: match.title,
      url: match.url,
    });
  }
  return resolved;
}

export async function runSummaryGeneration(
  task: PipelineTask,
): Promise<Record<string, unknown>> {
  if (!task.chapterId) throw new Error("summary_generation requires a chapter.");

  const subject = await loadSubject(task.subjectId);
  const chapter = await loadChapter(task.chapterId);
  const sources = await loadChapterSources(task.chapterId);

  const parsed = summarySchema.safeParse(
    await callJsonForTask("summary_generation", {
      system: SYSTEM_PROMPT,
      user: [
        `Vak: ${subject.name}`,
        `Hoofdstuk: ${chapter.title}`,
        `Beschrijving: ${chapter.description}`,
        "",
        "Onderwerpen die je MOET behandelen, in deze volgorde:",
        ...chapter.topicTags.map((tag) => `- ${tag}`),
        "",
        "Bronnen die je mag gebruiken (citeer als [Bron 1], [Bron 2], etc.):",
        formatSourcesForPrompt(sources),
      ].join("\n"),
      // A generous ceiling costs nothing when unused, but a tight one silently
      // truncates theory — and missing theory is the one thing we cannot ship.
      maxTokens: 20_000,
    }),
  );
  if (!parsed.success) {
    throw new Error(`Summary generation returned unusable JSON: ${parsed.error.message}`);
  }

  let body = parsed.data.body;
  const missing = findMissingTopics(body, chapter.topicTags);

  // One targeted top-up for whatever was skipped, rather than regenerating the
  // whole summary or shipping it with a hole in the theory.
  if (missing.length > 0) {
    try {
      const gap = z
        .object({ body: z.string() })
        .safeParse(
          await callJsonForTask("summary_generation", {
            system: GAP_SYSTEM_PROMPT,
            user: [
              `Vak: ${subject.name}`,
              `Hoofdstuk: ${chapter.title}`,
              "",
              "Ontbrekende onderwerpen:",
              ...missing.map((tag) => `- ${tag}`),
              "",
              "Wat er al staat (niet herhalen):",
              body.slice(0, 6_000),
            ].join("\n"),
            maxTokens: 8_000,
          }),
        );
      if (gap.success && gap.data.body.trim()) {
        body = `${body}\n\n${gap.data.body.trim()}`;
      }
    } catch (error) {
      logger.warn({ error, chapter: chapter.title, missing }, "Could not fill summary gaps");
    }
  }

  const stillMissing = findMissingTopics(body, chapter.topicTags);
  if (stillMissing.length > 0) {
    logger.warn(
      { chapter: chapter.title, stillMissing },
      "Summary does not cover every topic tag",
    );
  }

  const summary = {
    ...parsed.data,
    body,
    title: parsed.data.title || chapter.title,
    citations: normaliseCitations(parsed.data.citations, sources),
    wordCount: body.split(/\s+/).length,
  };

  await saveStudyContent({
    subjectId: task.subjectId,
    chapterId: task.chapterId,
    contentType: "summary",
    content: summary,
    model: modelNameFor(MODEL_BY_TASK.summary_generation),
  });
  await refreshChapterStatus(task.chapterId);

  return { chapter: chapter.title, wordCount: summary.wordCount, citations: summary.citations.length };
}
