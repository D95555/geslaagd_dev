import { Router, type IRouter } from "express";
import {
  GetSubjectProgressParams,
  GetSubjectProgressResponse,
  GetSubjectQuestionnaireParams,
  GetSubjectQuestionnaireResponse,
  GetSubjectStudyPlanParams,
  GetSubjectStudyPlanResponse,
  GetSubjectWeaknessesParams,
  GetSubjectWeaknessesResponse,
  ScheduleSubjectExamBody,
  ScheduleSubjectExamParams,
  ScheduleSubjectExamResponse,
  SubmitSubjectQuestionnaireBody,
  SubmitSubjectQuestionnaireParams,
} from "@workspace/api-zod";
import { loadSubjectChapters } from "../lib/pipeline-tasks/context";
import { computeChapterProgress, computeSubjectProgress, loadProgressForChapters } from "../lib/progress";
import { computeReviewPlan } from "../lib/spaced-repetition";
import { questionnaireSchema } from "../lib/study-content";
import { getAuthenticatedUser, restService } from "../lib/supabase";
import { getWeakTopics } from "../lib/weakness";

const router: IRouter = Router();

type Row = Record<string, unknown>;

async function authenticate(header?: string) {
  const user = await getAuthenticatedUser(header);
  return user && header ? { user, token: header } : null;
}

router.get("/subjects/:subjectId/progress", async (req, res): Promise<void> => {
  const identity = await authenticate(req.header("authorization"));
  if (!identity) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = GetSubjectProgressParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Ongeldig vak." });
    return;
  }
  try {
    const chapters = await loadSubjectChapters(params.data.subjectId);
    const progress = await loadProgressForChapters(
      identity.user.id,
      chapters.map((chapter) => chapter.id),
    );

    const chapterProgress = chapters.map((chapter) => {
      const row = progress.get(chapter.id);
      return {
        chapterId: chapter.id,
        progress: computeChapterProgress({
          summaryRead: row?.summaryRead ?? false,
          exerciseBestScore: row?.exerciseBestScore ?? null,
          examBestScore: row?.examBestScore ?? null,
          hasExam: chapter.isImportant,
        }),
        summaryRead: row?.summaryRead ?? false,
        exerciseBestScore: row?.exerciseBestScore ?? null,
        examBestScore: row?.examBestScore ?? null,
        exerciseAttempts: row?.exerciseAttempts ?? 0,
        examAttempts: row?.examAttempts ?? 0,
      };
    });

    const weakTopics = await getWeakTopics(identity.user.id, params.data.subjectId);

    res.json(
      GetSubjectProgressResponse.parse({
        subjectProgress: computeSubjectProgress(chapterProgress),
        chapterProgress,
        weakTopics: weakTopics.map((topic) => ({
          topicTag: topic.topicTag,
          totalAttempted: topic.totalAttempted,
          totalCorrect: topic.totalCorrect,
          successRate: topic.successRate,
        })),
      }),
    );
  } catch (error) {
    req.log.warn({ error }, "Could not load subject progress");
    res.status(500).json({ error: "Voortgang kon niet worden geladen." });
  }
});

router.get("/subjects/:subjectId/weaknesses", async (req, res): Promise<void> => {
  const identity = await authenticate(req.header("authorization"));
  if (!identity) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = GetSubjectWeaknessesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Ongeldig vak." });
    return;
  }
  try {
    const weakTopics = await getWeakTopics(identity.user.id, params.data.subjectId);
    res.json(
      GetSubjectWeaknessesResponse.parse(
        weakTopics.map((topic) => ({
          topicTag: topic.topicTag,
          totalAttempted: topic.totalAttempted,
          totalCorrect: topic.totalCorrect,
          successRate: topic.successRate,
        })),
      ),
    );
  } catch (error) {
    req.log.warn({ error }, "Could not load weaknesses");
    res.status(500).json({ error: "Zwakke punten konden niet worden geladen." });
  }
});

router.post("/subjects/:subjectId/exams/schedule", async (req, res): Promise<void> => {
  const identity = await authenticate(req.header("authorization"));
  if (!identity) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = ScheduleSubjectExamParams.safeParse(req.params);
  const input = ScheduleSubjectExamBody.safeParse(req.body);
  if (!params.success || !input.success) {
    res.status(400).json({ error: "Kies een geldige datum en hoofdstukken." });
    return;
  }
  try {
    const examDate =
      input.data.examDate instanceof Date
        ? input.data.examDate.toISOString().slice(0, 10)
        : String(input.data.examDate).slice(0, 10);

    // One scheduled exam per subject per student — a new date replaces the old.
    await restService<Row[]>(
      `student_exams?user_id=eq.${identity.user.id}&subject_id=eq.${params.data.subjectId}`,
      { method: "DELETE" },
    );
    const rows = await restService<Row[]>("student_exams", {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        user_id: identity.user.id,
        subject_id: params.data.subjectId,
        exam_date: examDate,
        chapter_ids: input.data.chapterIds,
        spaced_repetition_enabled: input.data.spacedRepetitionEnabled ?? true,
      }),
    });
    const row = rows[0];
    if (!row) throw new Error("Exam insert returned no row.");

    res.status(201).json(
      ScheduleSubjectExamResponse.parse({
        id: row.id as string,
        subjectId: row.subject_id as string,
        examDate: row.exam_date as string,
        chapterIds: (row.chapter_ids as string[] | null) ?? [],
        spacedRepetitionEnabled: Boolean(row.spaced_repetition_enabled),
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
      }),
    );
  } catch (error) {
    req.log.warn({ error }, "Could not schedule exam");
    res.status(500).json({ error: "Toetsdatum kon niet worden opgeslagen." });
  }
});

router.get("/subjects/:subjectId/study-plan", async (req, res): Promise<void> => {
  const identity = await authenticate(req.header("authorization"));
  if (!identity) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = GetSubjectStudyPlanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Ongeldig vak." });
    return;
  }
  try {
    const examRows = await restService<Row[]>(
      `student_exams?user_id=eq.${identity.user.id}&subject_id=eq.${params.data.subjectId}&select=*`,
    );
    const exam = examRows[0];
    const examDate = exam?.exam_date ? new Date(exam.exam_date as string) : null;

    // Respect the student's opt-out: no plan when spaced repetition is off.
    if (exam && !exam.spaced_repetition_enabled) {
      res.json(
        GetSubjectStudyPlanResponse.parse({
          examDate: (exam.exam_date as string) ?? null,
          reviewTasks: [],
        }),
      );
      return;
    }

    const allChapters = await loadSubjectChapters(params.data.subjectId);
    const scoped = (exam?.chapter_ids as string[] | null)?.length
      ? allChapters.filter((chapter) =>
          (exam!.chapter_ids as string[]).includes(chapter.id),
        )
      : allChapters;

    const progress = await loadProgressForChapters(
      identity.user.id,
      scoped.map((chapter) => chapter.id),
    );
    const progressRows = await restService<Row[]>(
      `student_progress?user_id=eq.${identity.user.id}&select=chapter_id,updated_at`,
    );
    const lastAttemptByChapter = new Map(
      progressRows.map((row) => [row.chapter_id as string, new Date(row.updated_at as string)]),
    );

    const weakTopics = await getWeakTopics(identity.user.id, params.data.subjectId);

    const reviewTasks = computeReviewPlan({
      today: new Date(),
      examDate,
      weakTopics,
      chapters: scoped.map((chapter) => {
        const row = progress.get(chapter.id);
        const best = [row?.exerciseBestScore, row?.examBestScore].filter(
          (score): score is number => typeof score === "number",
        );
        return {
          id: chapter.id,
          title: chapter.title,
          topicTags: chapter.topicTags,
          bestScore: best.length ? Math.max(...best) : null,
          lastAttemptAt: row ? (lastAttemptByChapter.get(chapter.id) ?? null) : null,
        };
      }),
    });

    res.json(
      GetSubjectStudyPlanResponse.parse({
        examDate: (exam?.exam_date as string | undefined) ?? null,
        reviewTasks,
      }),
    );
  } catch (error) {
    req.log.warn({ error }, "Could not build study plan");
    res.status(500).json({ error: "Studieplan kon niet worden geladen." });
  }
});

router.get("/subjects/:subjectId/questionnaire", async (req, res): Promise<void> => {
  const identity = await authenticate(req.header("authorization"));
  if (!identity) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = GetSubjectQuestionnaireParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Ongeldig vak." });
    return;
  }
  try {
    const rows = await restService<Row[]>(
      `study_content?subject_id=eq.${params.data.subjectId}&chapter_id=is.null` +
        "&content_type=eq.diagnostic_questionnaire&status=eq.ready&select=content",
    );
    const parsed = rows[0] ? questionnaireSchema.safeParse(rows[0].content) : null;
    if (!parsed?.success) {
      res.status(404).json({ error: "Er is nog geen startvragenlijst voor dit vak." });
      return;
    }
    res.json(GetSubjectQuestionnaireResponse.parse(parsed.data));
  } catch (error) {
    req.log.warn({ error }, "Could not load questionnaire");
    res.status(500).json({ error: "Vragenlijst kon niet worden geladen." });
  }
});

router.post("/subjects/:subjectId/questionnaire/submit", async (req, res): Promise<void> => {
  const identity = await authenticate(req.header("authorization"));
  if (!identity) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = SubmitSubjectQuestionnaireParams.safeParse(req.params);
  const input = SubmitSubjectQuestionnaireBody.safeParse(req.body);
  if (!params.success || !input.success) {
    res.status(400).json({ error: "Ongeldige inzending." });
    return;
  }
  try {
    const rows = await restService<Row[]>(
      `study_content?subject_id=eq.${params.data.subjectId}&chapter_id=is.null` +
        "&content_type=eq.diagnostic_questionnaire&select=id",
    );
    const contentId = rows[0]?.id as string | undefined;
    if (!contentId) {
      res.status(404).json({ error: "Er is nog geen startvragenlijst voor dit vak." });
      return;
    }

    await restService<Row[]>(
      "student_questionnaire_responses?on_conflict=user_id,content_id",
      {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          user_id: identity.user.id,
          subject_id: params.data.subjectId,
          content_id: contentId,
          answers: input.data.answers,
        }),
      },
    );
    res.sendStatus(200);
  } catch (error) {
    req.log.warn({ error }, "Could not store questionnaire response");
    res.status(500).json({ error: "Antwoorden konden niet worden opgeslagen." });
  }
});

export default router;
