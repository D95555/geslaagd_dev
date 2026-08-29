import { callStrongJson, STRONG_MODEL } from "../ai";
import { normaliseBank, questionBankSchema } from "../study-content";
import {
  formatSourcesForPrompt,
  loadChapter,
  loadChapterSources,
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
    "Eisen:",
    "- Mix van meerkeuze (mc) en open vragen, ongeveer 60% mc en 40% open",
    "- Elke vraag heeft een topicTag uit de opgegeven onderwerpen",
    "- Elke vraag heeft een pointValue",
    "- MC-vragen: 4 opties met keys A/B/C/D en precies 1 correcte correctKey",
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

export async function runExerciseGeneration(
  task: PipelineTask,
): Promise<Record<string, unknown>> {
  if (!task.chapterId) throw new Error("exercise_generation requires a chapter.");

  const subject = await loadSubject(task.subjectId);
  const chapter = await loadChapter(task.chapterId);
  const sources = await loadChapterSources(task.chapterId, { charLimit: 8_000 });

  const parsed = questionBankSchema.safeParse(
    await callStrongJson({
      system: SYSTEM_PROMPT,
      user: [
        `Vak: ${subject.name}`,
        `Hoofdstuk: ${chapter.title}`,
        `Onderwerpen: ${chapter.topicTags.join(", ")}`,
        "",
        "Bronnen:",
        formatSourcesForPrompt(sources),
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
    model: STRONG_MODEL,
  });
  await refreshChapterStatus(task.chapterId);

  return { chapter: chapter.title, questions: bank.questions.length, totalPoints: bank.totalPoints };
}
