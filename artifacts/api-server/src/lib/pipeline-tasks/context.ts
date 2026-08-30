import { restService } from "../supabase";

type Row = Record<string, unknown>;

export type SubjectContext = {
  id: string;
  name: string;
  yearLevel: string;
  description: string | null;
  difficultyLevel: string | null;
  emphasis: string | null;
  preferredSourceTypes: string | null;
  creditBudget: number;
};

export type ChapterContext = {
  id: string;
  subjectId: string;
  position: number;
  title: string;
  description: string;
  isImportant: boolean;
  topicTags: string[];
};

export type SourceContext = {
  id: string;
  url: string;
  title: string;
  relevanceNote: string;
  content: string;
};

export type ContentType =
  | "summary"
  | "key_notes"
  | "exercise_bank"
  | "exam"
  | "exam_rubric"
  | "diagnostic_questionnaire";

export async function loadSubject(subjectId: string): Promise<SubjectContext> {
  const rows = await restService<Row[]>(
    `crawl_subjects?id=eq.${subjectId}&select=id,name,year_level,description,difficulty_level,emphasis,preferred_source_types,credit_budget`,
  );
  const row = rows[0];
  if (!row) throw new Error(`Subject ${subjectId} not found.`);
  return {
    id: row.id as string,
    name: row.name as string,
    yearLevel: row.year_level as string,
    description: (row.description as string | null) ?? null,
    difficultyLevel: (row.difficulty_level as string | null) ?? null,
    emphasis: (row.emphasis as string | null) ?? null,
    preferredSourceTypes: (row.preferred_source_types as string | null) ?? null,
    creditBudget: Number(row.credit_budget ?? 300),
  };
}

export function toChapterContext(row: Row): ChapterContext {
  return {
    id: row.id as string,
    subjectId: row.subject_id as string,
    position: Number(row.position),
    title: row.title as string,
    description: (row.description as string | null) ?? "",
    isImportant: Boolean(row.is_important),
    topicTags: (row.topic_tags as string[] | null) ?? [],
  };
}

export async function loadChapter(chapterId: string): Promise<ChapterContext> {
  const rows = await restService<Row[]>(`chapters?id=eq.${chapterId}&select=*`);
  const row = rows[0];
  if (!row) throw new Error(`Chapter ${chapterId} not found.`);
  return toChapterContext(row);
}

export async function loadSubjectChapters(subjectId: string): Promise<ChapterContext[]> {
  const rows = await restService<Row[]>(
    `chapters?subject_id=eq.${subjectId}&select=*&order=position.asc`,
  );
  return rows.map(toChapterContext);
}

/**
 * Approved sources mapped to a chapter, with the richest text available:
 * the full scraped markdown when present, otherwise the short preview.
 */
export async function loadChapterSources(
  chapterId: string,
  options: { onlyAccepted?: boolean; charLimit?: number; maxSources?: number } = {},
): Promise<SourceContext[]> {
  // Prompts carry a handful of sources, not everything a crawl found: a chapter
  // can accumulate 20+ pages, and sending them all was by far the largest cost
  // in the pipeline for no measurable gain in quality.
  const { onlyAccepted = true, charLimit = 3_000, maxSources = 5 } = options;
  const rows = await restService<Row[]>(
    `chapter_sources?chapter_id=eq.${chapterId}` +
      "&select=relevance_note,sources(id,url,title,status,full_content,content_preview,ai_summary)",
  );

  const sources: SourceContext[] = [];
  for (const row of rows) {
    const embedded = row.sources as Row | Row[] | null | undefined;
    const source = Array.isArray(embedded) ? embedded[0] : embedded;
    if (!source) continue;
    if (onlyAccepted && source.status !== "accepted") continue;

    const body =
      (source.full_content as string | null) ??
      (source.content_preview as string | null) ??
      (source.ai_summary as string | null) ??
      "";
    sources.push({
      id: source.id as string,
      url: source.url as string,
      title: (source.title as string | null) ?? (source.url as string),
      relevanceNote: (row.relevance_note as string | null) ?? "",
      content: body.slice(0, charLimit),
    });
  }
  // Richest sources first, so the cap keeps the most substantial material.
  return sources
    .sort((a, b) => b.content.length - a.content.length)
    .slice(0, maxSources);
}

/**
 * The generated summary for a chapter. Key notes, exercises and exams are
 * derived from this rather than re-reading the raw sources: the summary is the
 * only material the student actually studies, so questions drawn from it test
 * what was really taught — and the prompt shrinks from tens of thousands of
 * tokens of scraped pages to a few thousand of curated text.
 */
export async function loadChapterSummaryText(chapterId: string): Promise<string | null> {
  const rows = await restService<Row[]>(
    `study_content?chapter_id=eq.${chapterId}&content_type=eq.summary&status=eq.ready&select=content`,
  );
  const content = rows[0]?.content as { body?: string; title?: string } | undefined;
  const body = content?.body?.trim();
  return body ? body : null;
}

/** Renders sources as the numbered [Bron N] block the content prompts expect. */
export function formatSourcesForPrompt(sources: SourceContext[]): string {
  if (sources.length === 0) return "(geen bronnen beschikbaar)";
  return sources
    .map((source, index) =>
      [
        `[Bron ${index + 1}]`,
        `sourceId: ${source.id}`,
        `Titel: ${source.title}`,
        `URL: ${source.url}`,
        source.relevanceNote ? `Relevantie: ${source.relevanceNote}` : null,
        `Inhoud: ${source.content || "(geen inhoud beschikbaar)"}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

/**
 * Writes generated material. Regenerating the same content type replaces the
 * previous row and bumps its version, so a chapter always has one live copy.
 */
export async function saveStudyContent(input: {
  subjectId: string;
  chapterId: string | null;
  contentType: ContentType;
  content: unknown;
  model: string;
}): Promise<string> {
  const scope = input.chapterId
    ? `chapter_id=eq.${input.chapterId}`
    : `subject_id=eq.${input.subjectId}&chapter_id=is.null`;
  const existing = await restService<Row[]>(
    `study_content?${scope}&content_type=eq.${input.contentType}&select=id,version`,
  );

  const previous = existing[0];
  if (previous) {
    const updated = await restService<Row[]>(`study_content?id=eq.${previous.id}`, {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        content: input.content,
        generated_by_model: input.model,
        version: Number(previous.version ?? 1) + 1,
        status: "ready",
        updated_at: new Date().toISOString(),
      }),
    });
    return (updated[0]?.id as string) ?? (previous.id as string);
  }

  const inserted = await restService<Row[]>("study_content", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      subject_id: input.subjectId,
      chapter_id: input.chapterId,
      content_type: input.contentType,
      content: input.content,
      generated_by_model: input.model,
      status: "ready",
    }),
  });
  const id = inserted[0]?.id as string | undefined;
  if (!id) throw new Error("Could not store generated study content.");
  return id;
}

/** Marks a chapter ready once its required content types are all present. */
export async function refreshChapterStatus(chapterId: string): Promise<void> {
  const chapter = await loadChapter(chapterId);
  const rows = await restService<Row[]>(
    `study_content?chapter_id=eq.${chapterId}&status=eq.ready&select=content_type`,
  );
  const present = new Set(rows.map((row) => row.content_type as string));

  const required = ["summary", "key_notes", "exercise_bank"];
  if (chapter.isImportant) required.push("exam");

  const ready = required.every((type) => present.has(type));
  await restService<Row[]>(`chapters?id=eq.${chapterId}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: ready ? "ready" : "pending",
      updated_at: new Date().toISOString(),
    }),
  });
}
