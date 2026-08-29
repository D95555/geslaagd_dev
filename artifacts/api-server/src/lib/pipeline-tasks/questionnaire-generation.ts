import { callStrongJson, STRONG_MODEL } from "../ai";
import { questionnaireSchema } from "../study-content";
import { loadSubject, loadSubjectChapters, saveStudyContent } from "./context";
import type { PipelineTask } from "./task-store";

const SYSTEM_PROMPT = [
  "Je maakt een korte startvragenlijst voor het studieplatform Geslaagd.",
  "De student vult die één keer in bij de start van een vak, zodat duidelijk",
  "wordt waar hij of zij staat. Dit is zelfinschatting — er is geen goed of fout.",
  "",
  "Eisen:",
  "- 6-10 vragen in het Nederlands",
  "- Elke vraag is meerkeuze met 3-5 opties (keys A, B, C, …)",
  "- Opties lopen van 'ken ik nog niet' tot 'beheers ik goed'",
  "- Koppel elke vraag aan de hoofdstukken waar die over gaat via chapterIds",
  "- Gebruik in chapterIds exact de opgegeven hoofdstuk-id's",
  "",
  "Antwoord ALLEEN met JSON:",
  '{ "questions": [{ "index": 0, "prompt": "…", "type": "mc",',
  '  "options": [{ "key": "A", "text": "…" }], "chapterIds": ["…"] }] }',
].join("\n");

/**
 * Subject-level content (no chapter), generated once per subject so students
 * get a self-assessment before they start.
 */
export async function runQuestionnaireGeneration(
  task: PipelineTask,
): Promise<Record<string, unknown>> {
  const subject = await loadSubject(task.subjectId);
  const chapters = await loadSubjectChapters(task.subjectId);
  if (chapters.length === 0) throw new Error("Subject has no chapters to build a questionnaire on.");

  const parsed = questionnaireSchema.safeParse(
    await callStrongJson({
      system: SYSTEM_PROMPT,
      user: [
        `Vak: ${subject.name}`,
        `Niveau: ${subject.yearLevel}`,
        "",
        "Hoofdstukken:",
        ...chapters.map(
          (chapter) =>
            `id: ${chapter.id} | ${chapter.position}. ${chapter.title} — ${chapter.description}`,
        ),
      ].join("\n"),
      maxTokens: 8_000,
    }),
  );
  if (!parsed.success) {
    throw new Error(`Questionnaire generation returned unusable JSON: ${parsed.error.message}`);
  }

  // Drop chapter references the model invented.
  const validIds = new Set(chapters.map((chapter) => chapter.id));
  const questions = parsed.data.questions.map((question, index) => ({
    ...question,
    index,
    chapterIds: question.chapterIds.filter((id) => validIds.has(id)),
  }));

  await saveStudyContent({
    subjectId: task.subjectId,
    chapterId: null,
    contentType: "diagnostic_questionnaire",
    content: { questions },
    model: STRONG_MODEL,
  });

  return { questions: questions.length };
}
