import { callStrongJson, STRONG_MODEL } from "../ai";
import { keyNotesSchema } from "../study-content";
import {
  formatSourcesForPrompt,
  loadChapter,
  loadChapterSources,
  loadSubject,
  refreshChapterStatus,
  saveStudyContent,
} from "./context";
import type { PipelineTask } from "./task-store";

const SYSTEM_PROMPT = [
  "Je maakt het overzichtsblad voor een hoofdstuk op het studieplatform Geslaagd.",
  "Dit is het snelle naslagwerk: formules, jaartallen, definities en kernbegrippen.",
  "",
  "Eisen:",
  "- Schrijf in het Nederlands",
  "- Groepeer per thema met een duidelijk kopje (bijv. 'Belangrijke formules')",
  "- Elk item heeft een label, een korte waarde en een topicTag",
  "- Gebruik voor topicTag een van de opgegeven onderwerpen van dit hoofdstuk",
  "- Houd waarden kort en memoriseerbaar — geen lange uitleg",
  "",
  "Antwoord ALLEEN met JSON:",
  '{ "sections": [{ "heading": "…", "items": [{ "label": "…", "value": "…",',
  '  "topicTag": "…" }] }] }',
].join("\n");

export async function runKeyNotesGeneration(
  task: PipelineTask,
): Promise<Record<string, unknown>> {
  if (!task.chapterId) throw new Error("key_notes_generation requires a chapter.");

  const subject = await loadSubject(task.subjectId);
  const chapter = await loadChapter(task.chapterId);
  const sources = await loadChapterSources(task.chapterId, { charLimit: 6_000 });

  const parsed = keyNotesSchema.safeParse(
    await callStrongJson({
      system: SYSTEM_PROMPT,
      user: [
        `Vak: ${subject.name}`,
        `Hoofdstuk: ${chapter.title}`,
        `Beschrijving: ${chapter.description}`,
        `Onderwerpen: ${chapter.topicTags.join(", ")}`,
        "",
        "Bronnen:",
        formatSourcesForPrompt(sources),
      ].join("\n"),
      maxTokens: 8_000,
    }),
  );
  if (!parsed.success) {
    throw new Error(`Key notes generation returned unusable JSON: ${parsed.error.message}`);
  }

  await saveStudyContent({
    subjectId: task.subjectId,
    chapterId: task.chapterId,
    contentType: "key_notes",
    content: parsed.data,
    model: STRONG_MODEL,
  });
  await refreshChapterStatus(task.chapterId);

  const items = parsed.data.sections.reduce((sum, section) => sum + section.items.length, 0);
  return { chapter: chapter.title, sections: parsed.data.sections.length, items };
}
