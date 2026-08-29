import { callFastText } from "./ai";
import {
  loadChapter,
  loadChapterSources,
  loadSubject,
  loadSubjectChapters,
  type SourceContext,
} from "./pipeline-tasks/context";
import { computeChapterProgress, loadProgressForChapters } from "./progress";
import type { Citation } from "./study-content";
import { restService } from "./supabase";
import { getWeakTopics } from "./weakness";

type Row = Record<string, unknown>;

export type ChatMessage = {
  id: string;
  role: "student" | "assistant";
  content: string;
  citations: Citation[] | null;
  createdAt: string;
};

const HISTORY_LIMIT = 20;
const MAX_CONTEXT_SOURCES = 5;

export function toChatMessage(row: Row): ChatMessage {
  return {
    id: row.id as string,
    role: row.role as "student" | "assistant",
    content: row.content as string,
    citations: (row.citations as Citation[] | null) ?? null,
    createdAt: row.created_at as string,
  };
}

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9àáâäèéêëìíîïòóôöùúûü]+/i)
    .filter((word) => word.length > 3);
}

/**
 * Picks the sources most likely to back up this particular question, by simple
 * keyword overlap against each source's relevance note, title and content.
 */
export function selectRelevantSources(
  sources: SourceContext[],
  message: string,
  topicTags: string[],
): SourceContext[] {
  if (sources.length <= MAX_CONTEXT_SOURCES) return sources;

  const needle = new Set([...tokenise(message), ...tokenise(topicTags.join(" "))]);
  return [...sources]
    .map((source) => {
      const haystack = tokenise(`${source.title} ${source.relevanceNote} ${source.content.slice(0, 2000)}`);
      const score = haystack.reduce((sum, word) => sum + (needle.has(word) ? 1 : 0), 0);
      return { source, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CONTEXT_SOURCES)
    .map((entry) => entry.source);
}

/**
 * Turns the [Bron N] markers the model wrote into structured citations, so the
 * frontend renders from data instead of parsing text. Markers that point at a
 * source which was not in context are dropped.
 */
export function extractCitations(content: string, sources: SourceContext[]): Citation[] {
  const citations: Citation[] = [];
  const seen = new Set<number>();

  for (const match of content.matchAll(/\[Bron\s*(\d+)\]/gi)) {
    const index = Number(match[1]);
    if (seen.has(index)) continue;
    const source = sources[index - 1];
    if (!source) continue;
    seen.add(index);
    citations.push({ index, sourceId: source.id, title: source.title, url: source.url });
  }
  return citations;
}

async function storeMessage(input: {
  userId: string;
  subjectId: string;
  chapterId: string | null;
  role: "student" | "assistant";
  content: string;
  citations: Citation[] | null;
}): Promise<ChatMessage> {
  const rows = await restService<Row[]>("chat_messages", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      user_id: input.userId,
      subject_id: input.subjectId,
      chapter_id: input.chapterId,
      role: input.role,
      content: input.content,
      citations: input.citations,
    }),
  });
  const row = rows[0];
  if (!row) throw new Error("Could not store chat message.");
  return toChatMessage(row);
}

export async function loadChatHistory(
  userId: string,
  subjectId: string,
  limit = HISTORY_LIMIT,
): Promise<ChatMessage[]> {
  const rows = await restService<Row[]>(
    `chat_messages?user_id=eq.${userId}&subject_id=eq.${subjectId}` +
      `&select=*&order=created_at.desc&limit=${limit}`,
  );
  return rows.map(toChatMessage).reverse();
}

async function buildProgressSummary(userId: string, subjectId: string): Promise<string> {
  const chapters = await loadSubjectChapters(subjectId);
  if (chapters.length === 0) return "nog geen hoofdstukken";

  const progress = await loadProgressForChapters(
    userId,
    chapters.map((chapter) => chapter.id),
  );
  const completed = chapters.filter((chapter) => {
    const row = progress.get(chapter.id);
    if (!row) return false;
    return (
      computeChapterProgress({
        summaryRead: row.summaryRead,
        exerciseBestScore: row.exerciseBestScore,
        examBestScore: row.examBestScore,
        hasExam: chapter.isImportant,
      }) >= 80
    );
  }).length;

  return `${completed} van ${chapters.length} hoofdstukken grotendeels afgerond`;
}

/**
 * One turn of the StudyHandler conversation: gathers subject, chapter, source,
 * weakness and history context, asks the fast model, then persists both sides
 * of the exchange with structured citations.
 */
export async function handleChatMessage(input: {
  userId: string;
  subjectId: string;
  chapterId: string | null;
  message: string;
}): Promise<ChatMessage> {
  const subject = await loadSubject(input.subjectId);
  const chapter = input.chapterId ? await loadChapter(input.chapterId) : null;

  const chapterSources = chapter ? await loadChapterSources(chapter.id, { charLimit: 4_000 }) : [];
  const sources = selectRelevantSources(chapterSources, input.message, chapter?.topicTags ?? []);

  const [weakTopics, progressSummary, history] = await Promise.all([
    getWeakTopics(input.userId, input.subjectId),
    buildProgressSummary(input.userId, input.subjectId),
    loadChatHistory(input.userId, input.subjectId),
  ]);

  const systemPrompt = [
    "Je bent de studieassistent van Geslaagd, een Nederlands studieplatform voor",
    "VWO- en bachelorstudenten. Je bent vriendelijk, geduldig en duidelijk.",
    "",
    `Vak: ${subject.name}`,
    chapter ? `Huidig hoofdstuk: ${chapter.title}` : "Huidig hoofdstuk: (geen)",
    "",
    "Beschikbare bronnen voor citaties:",
    sources.length
      ? sources
          .map(
            (source, index) =>
              `[Bron ${index + 1}] ${source.title} — ${source.relevanceNote || source.url}\n` +
              `${source.content.slice(0, 1200)}`,
          )
          .join("\n\n")
      : "(geen bronnen beschikbaar — citeer dan niet)",
    "",
    `Zwakke onderwerpen van deze student: ${
      weakTopics.length ? weakTopics.map((topic) => topic.topicTag).join(", ") : "nog geen"
    }`,
    `Voortgang: ${progressSummary}`,
    "",
    "Regels:",
    "- Antwoord in het Nederlands",
    "- Citeer belangrijke claims met [Bron X] — NIET universele feiten",
    "- Als de student om een simpelere uitleg vraagt, gebruik kortere zinnen,",
    "  meer vergelijkingen en minder vakjargon",
    "- Als een vraag over een zwak onderwerp gaat, bied extra oefenvragen aan",
    "- Geef nooit direct het antwoord op een oefen- of tentamenvraag — help de",
    "  student zelf op het antwoord te komen",
    "- Als je iets niet zeker weet, zeg dat eerlijk",
  ].join("\n");

  await storeMessage({
    userId: input.userId,
    subjectId: input.subjectId,
    chapterId: input.chapterId,
    role: "student",
    content: input.message,
    citations: null,
  });

  const content = await callFastText({
    system: systemPrompt,
    messages: [
      ...history.map((message) => ({
        role: message.role === "student" ? ("user" as const) : ("assistant" as const),
        content: message.content,
      })),
      { role: "user" as const, content: input.message },
    ],
    maxTokens: 1_500,
  });

  return storeMessage({
    userId: input.userId,
    subjectId: input.subjectId,
    chapterId: input.chapterId,
    role: "assistant",
    content,
    citations: extractCitations(content, sources),
  });
}
