import { createHash } from "node:crypto";
import { z } from "zod";

/** Shapes stored in study_content.content, per content_type. */

export const citationSchema = z.object({
  index: z.number().int(),
  sourceId: z.string(),
  title: z.string(),
  url: z.string(),
});
export type Citation = z.infer<typeof citationSchema>;

export const summarySchema = z.object({
  title: z.string(),
  body: z.string(),
  citations: z.array(citationSchema).default([]),
  wordCount: z.number().int().nonnegative().default(0),
});
export type SummaryContent = z.infer<typeof summarySchema>;

export const keyNotesSchema = z.object({
  sections: z
    .array(
      z.object({
        heading: z.string(),
        items: z
          .array(
            z.object({
              label: z.string(),
              value: z.string(),
              topicTag: z.string().default(""),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});
export type KeyNotesContent = z.infer<typeof keyNotesSchema>;

export const questionSchema = z.object({
  index: z.number().int(),
  type: z.enum(["mc", "open"]),
  topicTag: z.string().default(""),
  pointValue: z.number().default(1),
  prompt: z.string(),
  options: z.array(z.object({ key: z.string(), text: z.string() })).optional(),
  correctKey: z.string().optional(),
  rubric: z
    .object({
      modelAnswer: z.string().default(""),
      acceptableAlternatives: z.array(z.string()).default([]),
      commonMistakes: z
        .array(
          z.object({
            mistake: z.string(),
            deduction: z.number().default(0),
            feedback: z.string().default(""),
          }),
        )
        .default([]),
      maxScore: z.number().default(1),
    })
    .optional(),
});
export type Question = z.infer<typeof questionSchema>;

export const questionBankSchema = z.object({
  questions: z.array(questionSchema).min(1),
  totalPoints: z.number().default(0),
  estimatedMinutes: z.number().int().default(0),
});
export type QuestionBank = z.infer<typeof questionBankSchema>;

export const examRubricSchema = z.object({
  examContentId: z.string().default(""),
  gradingInstructions: z.string().default(""),
  passingScore: z.number().default(5.5),
  totalPoints: z.number().default(0),
  pointToGradeMapping: z
    .object({
      maxPoints: z.number().default(0),
      formula: z.string().default("grade = (points / maxPoints) * 9 + 1"),
    })
    .default({ maxPoints: 0, formula: "grade = (points / maxPoints) * 9 + 1" }),
});
export type ExamRubric = z.infer<typeof examRubricSchema>;

export const questionnaireSchema = z.object({
  questions: z
    .array(
      z.object({
        index: z.number().int(),
        prompt: z.string(),
        type: z.literal("mc").default("mc"),
        options: z.array(z.object({ key: z.string(), text: z.string() })).default([]),
        chapterIds: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});
export type DiagnosticQuestionnaire = z.infer<typeof questionnaireSchema>;

/**
 * Re-indexes a generated bank from 0 and recomputes the point total, so the
 * stored bank stays consistent even when the model numbers questions loosely.
 */
export function normaliseBank(bank: QuestionBank): QuestionBank {
  const questions = bank.questions.map((question, index) => ({ ...question, index }));
  const totalPoints = questions.reduce((sum, question) => sum + maxScoreFor(question), 0);
  return {
    questions,
    totalPoints,
    estimatedMinutes: bank.estimatedMinutes || Math.max(5, Math.round(questions.length * 1.5)),
  };
}

/** Strips answers and rubrics so a question set can be sent to the student. */
export function toPublicQuestion(question: Question) {
  return {
    index: question.index,
    type: question.type,
    topicTag: question.topicTag,
    pointValue: question.pointValue,
    prompt: question.prompt,
    ...(question.options ? { options: question.options } : {}),
  };
}

/** Points a question can award — the rubric wins for open questions. */
export function maxScoreFor(question: Question): number {
  if (question.type === "open") {
    return Number(question.rubric?.maxScore ?? question.pointValue ?? 1);
  }
  return Number(question.pointValue ?? 1);
}

/**
 * Deterministic per-student order: every student gets the same questions in a
 * different sequence, and the same student sees that sequence again on a retake.
 */
export function shuffleForStudent<T>(items: T[], userId: string, chapterId: string): T[] {
  const seed = createHash("sha256").update(`${userId}:${chapterId}`).digest("hex");
  const shuffled = [...items];
  let seedNum = parseInt(seed.slice(0, 8), 16);

  for (let i = shuffled.length - 1; i > 0; i--) {
    seedNum = (seedNum * 1103515245 + 12345) & 0x7fffffff;
    const j = seedNum % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

/** Dutch 1.0–10.0 scale, one decimal, 5.5 passes. */
export function pointsToGrade(totalScore: number, maxScore: number): number {
  if (maxScore <= 0) return 1;
  const ratio = Math.max(0, Math.min(1, totalScore / maxScore));
  return Math.round((ratio * 9 + 1) * 10) / 10;
}
