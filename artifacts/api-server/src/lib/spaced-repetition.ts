import type { WeakTopic } from "./weakness";

export type ReviewTask = {
  chapterId: string;
  chapterTitle: string;
  topicTags: string[];
  priority: "high" | "medium" | "low";
  lastReviewed: string | null;
};

/** Enough review work for one sitting without overwhelming the student. */
const MAX_TASKS_PER_DAY = 5;

const priorityRank: Record<ReviewTask["priority"], number> = { high: 0, medium: 1, low: 2 };

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Expanding-interval review plan. Chapters that were never practised, scored
 * poorly, or touch a weak topic come back soonest; recently reviewed strong
 * chapters are skipped until their interval has elapsed.
 */
export function computeReviewPlan(input: {
  today: Date;
  examDate: Date | null;
  chapters: Array<{
    id: string;
    title: string;
    topicTags: string[];
    bestScore: number | null;
    lastAttemptAt: Date | null;
  }>;
  weakTopics: WeakTopic[];
}): ReviewTask[] {
  const weakTags = new Set(input.weakTopics.map((topic) => topic.topicTag));
  const examSoon =
    input.examDate !== null && daysBetween(input.today, input.examDate) <= 7;

  const tasks: ReviewTask[] = [];

  for (const chapter of input.chapters) {
    const touchesWeakTopic = chapter.topicTags.some((tag) => weakTags.has(tag));
    const daysSince =
      chapter.lastAttemptAt === null ? null : daysBetween(chapter.lastAttemptAt, input.today);

    let priority: ReviewTask["priority"];

    if (chapter.bestScore === null || daysSince === null) {
      priority = "high";
    } else if (chapter.bestScore < 6) {
      priority = "high";
    } else if (daysSince < 3) {
      // Recently reviewed and scoring well — skip unless the exam is imminent.
      if (!examSoon && !touchesWeakTopic) continue;
      priority = "low";
    } else if (daysSince < 7) {
      priority = "medium";
    } else {
      priority = "high";
    }

    if (touchesWeakTopic && priority !== "high") priority = "high";

    tasks.push({
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      topicTags: chapter.topicTags,
      priority,
      lastReviewed: chapter.lastAttemptAt?.toISOString() ?? null,
    });
  }

  return tasks
    .sort((a, b) => {
      const byPriority = priorityRank[a.priority] - priorityRank[b.priority];
      if (byPriority !== 0) return byPriority;
      const aDays = a.lastReviewed ? new Date(a.lastReviewed).getTime() : 0;
      const bDays = b.lastReviewed ? new Date(b.lastReviewed).getTime() : 0;
      return aDays - bDays;
    })
    .slice(0, MAX_TASKS_PER_DAY);
}
