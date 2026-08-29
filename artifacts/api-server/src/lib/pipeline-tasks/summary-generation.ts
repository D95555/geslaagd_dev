import { callStrongJson, STRONG_MODEL } from "../ai";
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
  "Schrijf een VOLLEDIGE, grondige samenvatting van dit hoofdstuk. Dit is het",
  "PRIMAIRE studiemateriaal — studenten lezen dit in plaats van een boek.",
  "",
  "Eisen:",
  "- Schrijf in het Nederlands op VWO-niveau",
  "- Leg elk concept helder uit met voorbeelden",
  "- Gebruik [Bron X] citaties bij belangrijke claims, theorieën en uitleg",
  "- Citeer NIET universele feiten (2+2=4, water kookt bij 100°C)",
  "- Structureer met duidelijke kopjes (markdown)",
  "- Wees grondig — sla geen belangrijke onderwerpen over",
  "- Gebruik formules, diagrambeschrijvingen en voorbeelden waar nodig",
  "",
  "Antwoord ALLEEN met JSON:",
  '{ "title": "hoofdstuktitel", "body": "volledige markdown samenvatting",',
  '  "citations": [{ "index": 1, "sourceId": "…", "title": "…", "url": "…" }],',
  '  "wordCount": 1500 }',
  "",
  "Gebruik in citations exact de sourceId-waarden uit de bronnenlijst.",
].join("\n");

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
    await callStrongJson({
      system: SYSTEM_PROMPT,
      user: [
        `Vak: ${subject.name}`,
        `Hoofdstuk: ${chapter.title}`,
        `Beschrijving: ${chapter.description}`,
        `Onderwerpen: ${chapter.topicTags.join(", ")}`,
        "",
        "Bronnen die je mag gebruiken (citeer als [Bron 1], [Bron 2], etc.):",
        formatSourcesForPrompt(sources),
      ].join("\n"),
      maxTokens: 16_000,
    }),
  );
  if (!parsed.success) {
    throw new Error(`Summary generation returned unusable JSON: ${parsed.error.message}`);
  }

  const summary = {
    ...parsed.data,
    title: parsed.data.title || chapter.title,
    citations: normaliseCitations(parsed.data.citations, sources),
    wordCount: parsed.data.wordCount || parsed.data.body.split(/\s+/).length,
  };

  await saveStudyContent({
    subjectId: task.subjectId,
    chapterId: task.chapterId,
    contentType: "summary",
    content: summary,
    model: STRONG_MODEL,
  });
  await refreshChapterStatus(task.chapterId);

  return { chapter: chapter.title, wordCount: summary.wordCount, citations: summary.citations.length };
}
