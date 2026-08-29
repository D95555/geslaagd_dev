import { callJsonForTask, MODEL_BY_TASK, modelNameFor } from "../ai";
import { keyNotesSchema } from "../study-content";
import {
  loadChapter,
  loadChapterSummaryText,
  loadSubject,
  refreshChapterStatus,
  saveStudyContent,
} from "./context";
import type { PipelineTask } from "./task-store";
import { taskLog } from "./task-log";

const SYSTEM_PROMPT = [
  "Je maakt het overzichtsblad voor een hoofdstuk op het studieplatform Geslaagd.",
  "Dit is het snelle naslagwerk: formules, jaartallen, definities en kernbegrippen.",
  "",
  "Je krijgt de volledige samenvatting van het hoofdstuk. Haal daar de feiten uit",
  "die een student uit het hoofd moet kennen. Verzin niets wat er niet in staat.",
  "",
  "Eisen:",
  "- Schrijf in het Nederlands",
  "- Groepeer per thema met een duidelijk kopje (bijv. 'Belangrijke formules')",
  "- Elk item heeft een label, een korte waarde en een topicTag",
  "- Gebruik voor topicTag een van de opgegeven onderwerpen van dit hoofdstuk",
  "- Houd waarden kort en memoriseerbaar — geen lange uitleg",
  "- Sla geen formule, definitie of kerngetal over dat in de samenvatting staat",
  "",
  "Antwoord ALLEEN met JSON:",
  '{ "sections": [{ "heading": "…", "items": [{ "label": "…", "value": "…",',
  '  "topicTag": "…" }] }] }',
].join("\n");

/** Derived from the chapter summary, not the raw sources — see loadChapterSummaryText. */
export async function runKeyNotesGeneration(
  task: PipelineTask,
): Promise<Record<string, unknown>> {
  if (!task.chapterId) throw new Error("key_notes_generation requires a chapter.");

  const subject = await loadSubject(task.subjectId);
  const chapter = await loadChapter(task.chapterId);
  const summary = await loadChapterSummaryText(task.chapterId);
  if (!summary) {
    throw new Error("Key notes need the chapter summary, which is not ready yet.");
  }

  const parsed = keyNotesSchema.safeParse(
    await callJsonForTask("key_notes_generation", {
      system: SYSTEM_PROMPT,
      user: [
        `Vak: ${subject.name}`,
        `Hoofdstuk: ${chapter.title}`,
        `Onderwerpen: ${chapter.topicTags.join(", ")}`,
        "",
        "Samenvatting van het hoofdstuk:",
        summary,
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
    model: modelNameFor(MODEL_BY_TASK.key_notes_generation),
  });
  await refreshChapterStatus(task.chapterId);

  const items = parsed.data.sections.reduce((sum, section) => sum + section.items.length, 0);
  await taskLog(task).conclude(
    `Overzichtsblad voor "${chapter.title}": ${items} kernpunten verdeeld over ` +
      `${parsed.data.sections.length} secties, overgenomen uit de samenvatting.`,
  );

  return { chapter: chapter.title, sections: parsed.data.sections.length, items };
}
