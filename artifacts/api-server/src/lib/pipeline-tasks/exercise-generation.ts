import { callJsonForTask, MODEL_BY_TASK, modelNameFor } from "../ai";
import { normaliseBank, questionBankSchema } from "../study-content";
import {
  loadChapter,
  loadChapterSummaryText,
  loadSubject,
  refreshChapterStatus,
  saveStudyContent,
} from "./context";
import type { PipelineTask } from "./task-store";

/** Shared wording for both the exercise bank and the exam. */
export function questionBankRules(count: string, points: string): string[] {
  return [
    `Maak ${count} vragen.`,
    "",
    "Je krijgt de volledige samenvatting van het hoofdstuk. Dat is exact wat de",
    "student heeft gelezen. Toets ALLEEN wat daarin staat — geen stof van buiten.",
    "",
    "Eisen:",
    "- Mix van meerkeuze (mc) en open vragen, ongeveer 60% mc en 40% open",
    "- Verdeel de vragen over ALLE onderwerpen van het hoofdstuk, niet alleen",
    "  de makkelijkste — elk onderwerp komt minstens één keer aan bod",
    "- Elke vraag heeft een topicTag uit de opgegeven onderwerpen",
    "- Elke vraag heeft een pointValue",
    "- MC-vragen: 4 opties met keys A/B/C/D en precies 1 correcte correctKey",
    "- Foute MC-opties moeten plausibel zijn, geen onzin-antwoorden",
    "- Open vragen: een rubric met modelAnswer, acceptableAlternatives,",
    "  commonMistakes (mistake, deduction, feedback) en maxScore",
    "- Varieer in moeilijkheidsgraad (makkelijk → moeilijk)",
    "- Stel de vragen in het Nederlands",
    `- Totaal: ${points} punten`,
    "",
    "Antwoord ALLEEN met JSON:",
    '{ "questions": [{ "index": 0, "type": "mc", "topicTag": "…", "pointValue": 2,',
    '  "prompt": "…", "options": [{ "key": "A", "text": "…" }], "correctKey": "B" },',
    '  { "index": 1, "type": "open", "topicTag": "…", "pointValue": 5, "prompt": "…",',
    '    "rubric": { "modelAnswer": "…", "acceptableAlternatives": ["…"],',
    '      "commonMistakes": [{ "mistake": "…", "deduction": 1, "feedback": "…" }],',
    '      "maxScore": 5 } }],',
    '  "totalPoints": 50, "estimatedMinutes": 30 }',
  ];
}

const SYSTEM_PROMPT = [
  "Je bent een toetsontwikkelaar voor het studieplatform Geslaagd.",
  "",
  ...questionBankRules("een oefenset van 15-20", "40-60"),
].join("\n");

/** Derived from the chapter summary so questions test what was actually taught. */
export async function runExerciseGeneration(
  task: PipelineTask,
): Promise<Record<string, unknown>> {
  if (!task.chapterId) throw new Error("exercise_generation requires a chapter.");

  const subject = await loadSubject(task.subjectId);
  const chapter = await loadChapter(task.chapterId);
  const summary = await loadChapterSummaryText(task.chapterId);
  if (!summary) {
    throw new Error("Exercises need the chapter summary, which is not ready yet.");
  }

  const parsed = questionBankSchema.safeParse(
    await callJsonForTask("exercise_generation", {
      system: SYSTEM_PROMPT,
      user: [
        `Vak: ${subject.name}`,
        `Hoofdstuk: ${chapter.title}`,
        `Onderwerpen: ${chapter.topicTags.join(", ")}`,
        "",
        "Samenvatting die de student heeft gelezen:",
        summary,
      ].join("\n"),
      maxTokens: 16_000,
    }),
  );
  if (!parsed.success) {
    throw new Error(`Exercise generation returned unusable JSON: ${parsed.error.message}`);
  }

  const bank = normaliseBank(parsed.data);
  await saveStudyContent({
    subjectId: task.subjectId,
    chapterId: task.chapterId,
    contentType: "exercise_bank",
    content: bank,
    model: modelNameFor(MODEL_BY_TASK.exercise_generation),
  });
  await refreshChapterStatus(task.chapterId);

  return { chapter: chapter.title, questions: bank.questions.length, totalPoints: bank.totalPoints };
}
