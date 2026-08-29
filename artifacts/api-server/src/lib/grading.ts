import { z } from "zod";
import { callFastJson } from "./ai";
import { logger } from "./logger";
import { maxScoreFor, pointsToGrade, type Question } from "./study-content";

export type SubmittedAnswer = { questionIndex: number; answer: string };

export type QuestionResult = {
  questionIndex: number;
  isCorrect: boolean;
  score: number;
  maxScore: number;
  feedback: string;
  correctAnswer: string | null;
  topicTag: string;
};

export type GradeOutcome = {
  grade: number;
  totalScore: number;
  maxScore: number;
  passed: boolean;
  perQuestion: QuestionResult[];
};

const PASSING_GRADE = 5.5;

const aiGradeSchema = z.object({
  grades: z
    .array(
      z.object({
        questionIndex: z.number().int(),
        score: z.number(),
        maxScore: z.number().optional(),
        feedback: z.string().default(""),
        correctAnswer: z.string().nullable().default(null),
      }),
    )
    .default([]),
});

const SYSTEM_PROMPT = [
  "Je bent een docent die antwoorden beoordeelt op het studieplatform Geslaagd.",
  "Gebruik het beoordelingsformulier om eerlijk en consistent te beoordelen.",
  "",
  "Beoordeel ALLEEN de open vragen (meerkeuze is al automatisch nagekeken).",
  "",
  "Voor elke open vraag, geef:",
  "- score: toegekende punten (0 tot maxScore), deelpunten zijn toegestaan",
  "- feedback: korte uitleg in het Nederlands over wat goed was en wat beter kan",
  "- correctAnswer: het juiste antwoord als de student het (deels) fout had, anders null",
  "",
  "Antwoord ALLEEN met JSON:",
  '{ "grades": [{ "questionIndex": 0, "score": 3, "maxScore": 5,',
  '  "feedback": "…", "correctAnswer": "…" }] }',
].join("\n");

function gradeMultipleChoice(question: Question, answer: string | undefined): QuestionResult {
  const max = maxScoreFor(question);
  const given = (answer ?? "").trim().toUpperCase();
  const correct = (question.correctKey ?? "").trim().toUpperCase();
  const isCorrect = given !== "" && given === correct;
  const correctText =
    question.options?.find((option) => option.key.toUpperCase() === correct)?.text ?? correct;

  return {
    questionIndex: question.index,
    isCorrect,
    score: isCorrect ? max : 0,
    maxScore: max,
    feedback: isCorrect
      ? "Goed beantwoord."
      : `Niet correct. Het juiste antwoord is ${correct}: ${correctText}`,
    correctAnswer: isCorrect ? null : correctText,
    topicTag: question.topicTag,
  };
}

/**
 * Multiple choice is compared directly — no model call. Open questions go to
 * the fast model with their rubric; if that call fails the answers are held at
 * zero with an explanatory note rather than silently passing.
 */
export async function gradeSubmission(
  questions: Question[],
  answers: SubmittedAnswer[],
): Promise<GradeOutcome> {
  const answerByIndex = new Map(answers.map((answer) => [answer.questionIndex, answer.answer]));
  const results: QuestionResult[] = [];
  const openQuestions: Question[] = [];

  for (const question of questions) {
    if (question.type === "mc") {
      results.push(gradeMultipleChoice(question, answerByIndex.get(question.index)));
    } else {
      openQuestions.push(question);
    }
  }

  if (openQuestions.length > 0) {
    const rubricPayload = openQuestions.map((question) => ({
      questionIndex: question.index,
      prompt: question.prompt,
      maxScore: maxScoreFor(question),
      rubric: question.rubric ?? null,
    }));
    const answerPayload = openQuestions.map((question) => ({
      questionIndex: question.index,
      answer: answerByIndex.get(question.index) ?? "",
    }));

    let graded = new Map<number, z.infer<typeof aiGradeSchema>["grades"][number]>();
    try {
      const parsed = aiGradeSchema.safeParse(
        await callFastJson({
          system: SYSTEM_PROMPT,
          user: [
            "Beoordelingsformulier:",
            JSON.stringify(rubricPayload, null, 2),
            "",
            "Antwoorden van de student:",
            JSON.stringify(answerPayload, null, 2),
          ].join("\n"),
        }),
      );
      if (parsed.success) {
        graded = new Map(parsed.data.grades.map((grade) => [grade.questionIndex, grade]));
      } else {
        logger.warn({ issues: parsed.error.issues }, "Open-question grading returned invalid JSON");
      }
    } catch (error) {
      logger.warn({ error }, "Open-question grading failed");
    }

    for (const question of openQuestions) {
      const max = maxScoreFor(question);
      const grade = graded.get(question.index);
      const given = (answerByIndex.get(question.index) ?? "").trim();

      if (!grade) {
        results.push({
          questionIndex: question.index,
          isCorrect: false,
          score: 0,
          maxScore: max,
          feedback: given
            ? "Dit antwoord kon niet automatisch worden nagekeken. Probeer het later opnieuw."
            : "Geen antwoord gegeven.",
          correctAnswer: question.rubric?.modelAnswer ?? null,
          topicTag: question.topicTag,
        });
        continue;
      }

      const score = Math.max(0, Math.min(max, Number(grade.score)));
      results.push({
        questionIndex: question.index,
        // Anything from 80% of the available points counts as mastered for
        // weakness tracking, so near-perfect answers are not flagged as gaps.
        isCorrect: score >= max * 0.8,
        score,
        maxScore: max,
        feedback: grade.feedback,
        correctAnswer: grade.correctAnswer ?? (score < max ? (question.rubric?.modelAnswer ?? null) : null),
        topicTag: question.topicTag,
      });
    }
  }

  results.sort((a, b) => a.questionIndex - b.questionIndex);

  const totalScore = results.reduce((sum, result) => sum + result.score, 0);
  const maxScore = results.reduce((sum, result) => sum + result.maxScore, 0);
  const grade = pointsToGrade(totalScore, maxScore);

  return {
    grade,
    totalScore: Math.round(totalScore * 10) / 10,
    maxScore: Math.round(maxScore * 10) / 10,
    passed: grade >= PASSING_GRADE,
    perQuestion: results,
  };
}
