import { Router, type IRouter, type Response } from "express";
import {
  GetChapterExamParams,
  GetChapterExercisesParams,
  GetChapterExercisesResponse,
  SubmitChapterExamBody,
  SubmitChapterExamParams,
  SubmitChapterExercisesBody,
  SubmitChapterExercisesParams,
  SubmitChapterExercisesResponse,
} from "@workspace/api-zod";
import { gradeSubmission, type SubmittedAnswer } from "../lib/grading";
import { recordAttempt } from "../lib/progress";
import {
  questionBankSchema,
  shuffleForStudent,
  toPublicQuestion,
  type QuestionBank,
} from "../lib/study-content";
import { getAuthenticatedUser, restService } from "../lib/supabase";

const router: IRouter = Router();

type Row = Record<string, unknown>;

async function authenticate(header?: string) {
  const user = await getAuthenticatedUser(header);
  return user && header ? { user, token: header } : null;
}

type LoadedBank = { contentId: string; bank: QuestionBank };

async function loadBank(
  chapterId: string,
  contentType: "exercise_bank" | "exam",
): Promise<LoadedBank | null> {
  const rows = await restService<Row[]>(
    `study_content?chapter_id=eq.${chapterId}&content_type=eq.${contentType}` +
      "&status=eq.ready&select=id,content",
  );
  const row = rows[0];
  if (!row) return null;
  const parsed = questionBankSchema.safeParse(row.content);
  if (!parsed.success) return null;
  return { contentId: row.id as string, bank: parsed.data };
}

/** Serves a question set with answers and rubrics stripped out. */
async function respondWithBank(
  res: Response,
  loaded: LoadedBank | null,
  userId: string,
  chapterId: string,
  missingMessage: string,
): Promise<void> {
  if (!loaded) {
    res.status(404).json({ error: missingMessage });
    return;
  }
  const questions = shuffleForStudent(loaded.bank.questions, userId, chapterId);
  res.json(
    GetChapterExercisesResponse.parse({
      questions: questions.map(toPublicQuestion),
      totalPoints: loaded.bank.totalPoints,
      estimatedMinutes: loaded.bank.estimatedMinutes,
    }),
  );
}

/**
 * Grades a submission, stores per-question results for weakness tracking and
 * applies the high-water-mark to the student's progress.
 */
async function handleSubmission(input: {
  userId: string;
  chapterId: string;
  kind: "exercise" | "exam";
  answers: SubmittedAnswer[];
}) {
  const loaded = await loadBank(
    input.chapterId,
    input.kind === "exercise" ? "exercise_bank" : "exam",
  );
  if (!loaded) return null;

  const outcome = await gradeSubmission(loaded.bank.questions, input.answers);

  const answerRows = outcome.perQuestion.map((result) => ({
    user_id: input.userId,
    chapter_id: input.chapterId,
    content_id: loaded.contentId,
    question_index: result.questionIndex,
    topic_tag: result.topicTag || "overig",
    is_correct: result.isCorrect,
    score: result.score,
    max_score: result.maxScore,
  }));
  if (answerRows.length > 0) {
    await restService<Row[]>("student_answers", {
      method: "POST",
      body: JSON.stringify(answerRows),
    });
  }

  await recordAttempt({
    userId: input.userId,
    chapterId: input.chapterId,
    kind: input.kind,
    grade: outcome.grade,
  });

  return {
    grade: outcome.grade,
    totalScore: outcome.totalScore,
    maxScore: outcome.maxScore,
    passed: outcome.passed,
    perQuestion: outcome.perQuestion.map((result) => ({
      questionIndex: result.questionIndex,
      isCorrect: result.isCorrect,
      score: result.score,
      maxScore: result.maxScore,
      feedback: result.feedback,
      correctAnswer: result.correctAnswer,
    })),
  };
}

router.get(
  "/subjects/:subjectId/chapters/:chapterId/exercises",
  async (req, res): Promise<void> => {
    const identity = await authenticate(req.header("authorization"));
    if (!identity) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const params = GetChapterExercisesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Ongeldig hoofdstuk." });
      return;
    }
    try {
      const loaded = await loadBank(params.data.chapterId, "exercise_bank");
      await respondWithBank(
        res,
        loaded,
        identity.user.id,
        params.data.chapterId,
        "Voor dit hoofdstuk zijn nog geen oefenvragen beschikbaar.",
      );
    } catch (error) {
      req.log.warn({ error }, "Could not load exercises");
      res.status(500).json({ error: "Oefenvragen konden niet worden geladen." });
    }
  },
);

router.get("/subjects/:subjectId/chapters/:chapterId/exam", async (req, res): Promise<void> => {
  const identity = await authenticate(req.header("authorization"));
  if (!identity) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = GetChapterExamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Ongeldig hoofdstuk." });
    return;
  }
  try {
    const loaded = await loadBank(params.data.chapterId, "exam");
    await respondWithBank(
      res,
      loaded,
      identity.user.id,
      params.data.chapterId,
      "Dit hoofdstuk heeft geen tentamen.",
    );
  } catch (error) {
    req.log.warn({ error }, "Could not load exam");
    res.status(500).json({ error: "Tentamen kon niet worden geladen." });
  }
});

router.post(
  "/subjects/:subjectId/chapters/:chapterId/exercises/submit",
  async (req, res): Promise<void> => {
    const identity = await authenticate(req.header("authorization"));
    if (!identity) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const params = SubmitChapterExercisesParams.safeParse(req.params);
    const input = SubmitChapterExercisesBody.safeParse(req.body);
    if (!params.success || !input.success) {
      res.status(400).json({ error: "Ongeldige inzending." });
      return;
    }
    try {
      const result = await handleSubmission({
        userId: identity.user.id,
        chapterId: params.data.chapterId,
        kind: "exercise",
        answers: input.data.answers,
      });
      if (!result) {
        res.status(404).json({ error: "Voor dit hoofdstuk zijn geen oefenvragen beschikbaar." });
        return;
      }
      res.json(SubmitChapterExercisesResponse.parse(result));
    } catch (error) {
      req.log.warn({ error }, "Could not grade exercise submission");
      res.status(500).json({ error: "Je antwoorden konden niet worden nagekeken." });
    }
  },
);

router.post(
  "/subjects/:subjectId/chapters/:chapterId/exam/submit",
  async (req, res): Promise<void> => {
    const identity = await authenticate(req.header("authorization"));
    if (!identity) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const params = SubmitChapterExamParams.safeParse(req.params);
    const input = SubmitChapterExamBody.safeParse(req.body);
    if (!params.success || !input.success) {
      res.status(400).json({ error: "Ongeldige inzending." });
      return;
    }
    try {
      const result = await handleSubmission({
        userId: identity.user.id,
        chapterId: params.data.chapterId,
        kind: "exam",
        answers: input.data.answers,
      });
      if (!result) {
        res.status(404).json({ error: "Dit hoofdstuk heeft geen tentamen." });
        return;
      }
      res.json(SubmitChapterExercisesResponse.parse(result));
    } catch (error) {
      req.log.warn({ error }, "Could not grade exam submission");
      res.status(500).json({ error: "Je tentamen kon niet worden nagekeken." });
    }
  },
);

export default router;
