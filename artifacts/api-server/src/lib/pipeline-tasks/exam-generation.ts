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
import { questionBankRules } from "./exercise-generation";
import type { PipelineTask } from "./task-store";

const SYSTEM_PROMPT = [
  "Je bent een toetsontwikkelaar voor het studieplatform Geslaagd.",
  "Je maakt een volwaardig hoofdstuktentamen dat het hele hoofdstuk toetst.",
  "",
  ...questionBankRules("een tentamen van 25-40", "80-120"),
].join("\n");

/**
 * Exams are only generated for chapters marked important. The matching rubric
 * is stored alongside so grading and the pass mark stay with the exam.
 */
export async function runExamGeneration(task: PipelineTask): Promise<Record<string, unknown>> {
  if (!task.chapterId) throw new Error("exam_generation requires a chapter.");

  const subject = await loadSubject(task.subjectId);
  const chapter = await loadChapter(task.chapterId);
  const sources = await loadChapterSources(task.chapterId, { charLimit: 8_000 });

  const parsed = questionBankSchema.safeParse(
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
      maxTokens: 24_000,
    }),
  );
  if (!parsed.success) {
    throw new Error(`Exam generation returned unusable JSON: ${parsed.error.message}`);
  }

  const bank = normaliseBank(parsed.data);
  const examId = await saveStudyContent({
    subjectId: task.subjectId,
    chapterId: task.chapterId,
    contentType: "exam",
    content: bank,
    model: STRONG_MODEL,
  });

  await saveStudyContent({
    subjectId: task.subjectId,
    chapterId: task.chapterId,
    contentType: "exam_rubric",
    content: {
      examContentId: examId,
      gradingInstructions:
        "Beoordeel open vragen met het antwoordmodel van de vraag. Ken deelpunten toe " +
        "voor correcte tussenstappen en trek punten af volgens commonMistakes.",
      passingScore: 5.5,
      totalPoints: bank.totalPoints,
      pointToGradeMapping: {
        maxPoints: bank.totalPoints,
        formula: "grade = (points / maxPoints) * 9 + 1",
      },
    },
    model: STRONG_MODEL,
  });

  await refreshChapterStatus(task.chapterId);

  return { chapter: chapter.title, questions: bank.questions.length, totalPoints: bank.totalPoints };
}
