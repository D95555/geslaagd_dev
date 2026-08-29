import { restService } from "./supabase";

type Row = Record<string, unknown>;

export type WeakTopic = {
  topicTag: string;
  totalAttempted: number;
  totalCorrect: number;
  successRate: number;
  chapterIds: string[];
};

/** A topic needs this many attempts before its success rate means anything. */
const MIN_ATTEMPTS = 3;
const WEAK_THRESHOLD = 0.6;

/**
 * Aggregates answered questions per topic tag for one subject. PostgREST has
 * no GROUP BY, so the rows are fetched scoped to the subject's chapters and
 * folded in memory.
 */
export async function getTopicStats(userId: string, subjectId: string): Promise<WeakTopic[]> {
  const chapterRows = await restService<Row[]>(
    `chapters?subject_id=eq.${subjectId}&select=id`,
  );
  const chapterIds = chapterRows.map((row) => row.id as string);
  if (chapterIds.length === 0) return [];

  const answers = await restService<Row[]>(
    `student_answers?user_id=eq.${userId}&chapter_id=in.(${chapterIds.join(",")})` +
      "&select=topic_tag,is_correct,chapter_id",
  );

  const byTopic = new Map<string, { attempted: number; correct: number; chapters: Set<string> }>();
  for (const answer of answers) {
    const tag = (answer.topic_tag as string) || "overig";
    if (!byTopic.has(tag)) {
      byTopic.set(tag, { attempted: 0, correct: 0, chapters: new Set() });
    }
    const entry = byTopic.get(tag)!;
    entry.attempted += 1;
    if (answer.is_correct) entry.correct += 1;
    entry.chapters.add(answer.chapter_id as string);
  }

  return [...byTopic.entries()]
    .map(([topicTag, entry]) => ({
      topicTag,
      totalAttempted: entry.attempted,
      totalCorrect: entry.correct,
      successRate: entry.attempted === 0 ? 0 : entry.correct / entry.attempted,
      chapterIds: [...entry.chapters],
    }))
    .sort((a, b) => a.successRate - b.successRate);
}

/** Topics the student demonstrably struggles with — under 60% over 3+ answers. */
export async function getWeakTopics(userId: string, subjectId: string): Promise<WeakTopic[]> {
  const stats = await getTopicStats(userId, subjectId);
  return stats.filter(
    (topic) => topic.totalAttempted >= MIN_ATTEMPTS && topic.successRate < WEAK_THRESHOLD,
  );
}
