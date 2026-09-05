import { restService } from "../supabase";

type Row = Record<string, unknown>;

export type SourceInput = {
  url: string;
  title: string;
  type?: string;
  language?: string;
  qualityScore?: number;
  confidenceScore?: number;
  aiSummary?: string;
  status?: "pending" | "accepted" | "declined";
  declineReason?: string | null;
  contentPreview?: string | null;
  fullContent?: string | null;
  /** The crawl that first turned this URL up, so a crawl can list its finds. */
  firstCrawlId?: string | null;
};

/** Inserts a source, or returns the existing row when the URL is already known. */
export async function upsertSource(input: SourceInput): Promise<string | null> {
  const payload = {
    url: input.url,
    title: input.title,
    type: input.type ?? "website",
    language: input.language ?? "nl",
    quality_score: input.qualityScore ?? null,
    confidence_score: input.confidenceScore ?? null,
    ai_summary: input.aiSummary ?? null,
    status: input.status ?? "pending",
    decline_reason: input.declineReason ?? null,
    content_preview: input.contentPreview ?? null,
    full_content: input.fullContent ?? null,
    first_crawl_id: input.firstCrawlId ?? null,
  };

  const inserted = await restService<Row[]>("sources?on_conflict=url", {
    method: "POST",
    headers: { prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify(payload),
  });
  const id = inserted[0]?.id as string | undefined;
  if (id) return id;

  const existing = await restService<Row[]>(
    `sources?url=eq.${encodeURIComponent(input.url)}&select=id`,
  );
  return (existing[0]?.id as string) ?? null;
}

export async function linkSourceToSubject(sourceId: string, subjectId: string): Promise<void> {
  await restService<Row[]>("source_subjects?on_conflict=source_id,subject_id", {
    method: "POST",
    headers: { prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({ source_id: sourceId, subject_id: subjectId }),
  });
}

export async function linkSourceToChapter(
  sourceId: string,
  chapterId: string,
  relevanceNote = "",
): Promise<void> {
  await restService<Row[]>("chapter_sources?on_conflict=chapter_id,source_id", {
    method: "POST",
    headers: { prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({
      chapter_id: chapterId,
      source_id: sourceId,
      relevance_note: relevanceNote,
    }),
  });
}

export async function setSourceStatus(
  sourceId: string,
  status: "pending" | "accepted" | "declined",
  declineReason: string | null = null,
): Promise<void> {
  await restService<Row[]>(`sources?id=eq.${sourceId}`, {
    method: "PATCH",
    body: JSON.stringify({
      status,
      decline_reason: declineReason,
      updated_at: new Date().toISOString(),
    }),
  });
}

/** Overwrites a source's stored text, e.g. once free PDF full text comes in later. */
export async function setSourceFullContent(
  sourceId: string,
  fullContent: string,
  contentPreview: string,
): Promise<void> {
  await restService<Row[]>(`sources?id=eq.${sourceId}`, {
    method: "PATCH",
    body: JSON.stringify({
      full_content: fullContent,
      content_preview: contentPreview,
      updated_at: new Date().toISOString(),
    }),
  });
}

export async function setChapterSourceRelevance(
  chapterId: string,
  sourceId: string,
  relevanceNote: string,
): Promise<void> {
  await restService<Row[]>(
    `chapter_sources?chapter_id=eq.${chapterId}&source_id=eq.${sourceId}`,
    { method: "PATCH", body: JSON.stringify({ relevance_note: relevanceNote }) },
  );
}

/**
 * Cross-vak content-cache: geeft voor de gevraagde URL's de al opgeslagen niet-lege
 * `sources.full_content` terug. `sources` is globaal op URL gededupliceerd, dus content
 * die voor een ander vak is opgehaald hoeft niet opnieuw (betaald) te worden gescraped.
 */
export async function getStoredContentByUrl(urls: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (urls.length === 0) return result;
  const inList = urls.map((url) => `"${encodeURIComponent(url)}"`).join(",");
  const rows = await restService<Row[]>(
    `sources?url=in.(${inList})&full_content=not.is.null&select=url,full_content`,
  );
  for (const row of rows) {
    const url = row.url as string;
    const content = row.full_content as string | null;
    if (url && content && content.length > 0) result.set(url, content);
  }
  return result;
}
