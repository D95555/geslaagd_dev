import { restService } from "./supabase";

type Row = Record<string, unknown>;

export type ChapterProgressRow = {
  chapterId: string;
  summaryRead: boolean;
  exerciseBestScore: number | null;
  examBestScore: number | null;
  exerciseAttempts: number;
  examAttempts: number;
};

/**
 * Weighted per-chapter completion, 0-100. Chapters with an exam split
 * 20/40/40 across reading, exercises and exam; chapters without one split
 * 30/70. Scores count proportionally — a 7.0 fills 70% of its slice.
 */
export function computeChapterProgress(input: {
  summaryRead: boolean;
  exerciseBestScore: number | null;
  examBestScore: number | null;
  hasExam: boolean;
}): number {
  const readWeight = input.hasExam ? 0.2 : 0.3;
  const exerciseWeight = input.hasExam ? 0.4 : 0.7;
  const examWeight = input.hasExam ? 0.4 : 0;

  const readScore = input.summaryRead ? 1 : 0;
  const exerciseScore = input.exerciseBestScore ? input.exerciseBestScore / 10 : 0;
  const examScore = input.examBestScore ? input.examBestScore / 10 : 0;

  const progress =
    (readScore * readWeight + exerciseScore * exerciseWeight + examScore * examWeight) * 100;
  return Math.round(progress * 10) / 10;
}

export function computeSubjectProgress(chapters: Array<{ progress: number }>): number {
  if (chapters.length === 0) return 0;
  const total = chapters.reduce((sum, chapter) => sum + chapter.progress, 0);
  return Math.round((total / chapters.length) * 10) / 10;
}

export function toChapterProgressRow(row: Row): ChapterProgressRow {
  return {
    chapterId: row.chapter_id as string,
    summaryRead: Boolean(row.summary_read),
    exerciseBestScore:
      row.exercise_best_score === null || row.exercise_best_score === undefined
        ? null
        : Number(row.exercise_best_score),
    examBestScore:
      row.exam_best_score === null || row.exam_best_score === undefined
        ? null
        : Number(row.exam_best_score),
    exerciseAttempts: Number(row.exercise_attempts ?? 0),
    examAttempts: Number(row.exam_attempts ?? 0),
  };
}

export async function loadProgressForChapters(
  userId: string,
  chapterIds: string[],
): Promise<Map<string, ChapterProgressRow>> {
  if (chapterIds.length === 0) return new Map();
  const rows = await restService<Row[]>(
    `student_progress?user_id=eq.${userId}&chapter_id=in.(${chapterIds.join(",")})&select=*`,
  );
  return new Map(
    rows.map((row) => {
      const parsed = toChapterProgressRow(row);
      return [parsed.chapterId, parsed];
    }),
  );
}

async function ensureProgressRow(userId: string, chapterId: string): Promise<ChapterProgressRow> {
  const existing = await restService<Row[]>(
    `student_progress?user_id=eq.${userId}&chapter_id=eq.${chapterId}&select=*`,
  );
  if (existing[0]) return toChapterProgressRow(existing[0]);

  const inserted = await restService<Row[]>("student_progress?on_conflict=user_id,chapter_id", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ user_id: userId, chapter_id: chapterId }),
  });
  if (inserted[0]) return toChapterProgressRow(inserted[0]);

  const refetched = await restService<Row[]>(
    `student_progress?user_id=eq.${userId}&chapter_id=eq.${chapterId}&select=*`,
  );
  if (!refetched[0]) throw new Error("Could not create progress row.");
  return toChapterProgressRow(refetched[0]);
}

export async function markSummaryRead(userId: string, chapterId: string): Promise<void> {
  await ensureProgressRow(userId, chapterId);
  await restService<Row[]>(
    `student_progress?user_id=eq.${userId}&chapter_id=eq.${chapterId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ summary_read: true, updated_at: new Date().toISOString() }),
    },
  );
}

/**
 * High-water-mark: the stored best score only ever rises, while the attempt
 * counter always increments. Progress can therefore never go down.
 */
export async function recordAttempt(input: {
  userId: string;
  chapterId: string;
  kind: "exercise" | "exam";
  grade: number;
}): Promise<ChapterProgressRow> {
  const current = await ensureProgressRow(input.userId, input.chapterId);
  const scoreField = input.kind === "exercise" ? "exercise_best_score" : "exam_best_score";
  const attemptsField = input.kind === "exercise" ? "exercise_attempts" : "exam_attempts";
  const currentBest =
    input.kind === "exercise" ? current.exerciseBestScore : current.examBestScore;
  const currentAttempts =
    input.kind === "exercise" ? current.exerciseAttempts : current.examAttempts;

  const patch: Row = {
    [attemptsField]: currentAttempts + 1,
    updated_at: new Date().toISOString(),
  };
  if (currentBest === null || input.grade > currentBest) {
    patch[scoreField] = input.grade;
  }

  const updated = await restService<Row[]>(
    `student_progress?user_id=eq.${input.userId}&chapter_id=eq.${input.chapterId}`,
    { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify(patch) },
  );
  return updated[0] ? toChapterProgressRow(updated[0]) : current;
}
