import {
  determineAcceptance,
  scoreBatch,
  type CrawlSubject,
  type FirecrawlResult,
} from "./crawl-brain";
import { restService } from "./supabase";

type Row = Record<string, unknown>;

export type RescoreResult = {
  id: string;
  qualityScore: number;
  confidenceScore: number;
  status: "accepted" | "declined" | "pending";
  aiSummary: string;
  declineReason: string | null;
};

/**
 * Re-run the source scorer for a single already-stored source. Used from the
 * crawl detail view when the original batch scoring failed (score 1 /
 * confidence 0) or a "barely missed" source deserves a second look. Uses the
 * stored content_preview as the model input and normal (non-scarcity)
 * acceptance thresholds.
 *
 * This is the only piece kept from the retired legacy source-pipeline: every
 * crawl now runs through the async task pipeline (source-gathering /
 * source-review), which maps sources to chapters and generates content — the
 * old subject-level synchronous crawl did neither.
 */
export async function rescoreSource(sourceId: string): Promise<RescoreResult> {
  const rows = await restService<Row[]>(
    `sources?id=eq.${sourceId}&select=id,url,title,content_preview,ai_summary,source_subjects(crawl_subjects(id,name,year_level))`,
  );
  const row = rows[0];
  if (!row) throw new Error("Source not found.");

  const links = (row.source_subjects as Row[] | null) ?? [];
  const embedded = links[0]?.crawl_subjects as Row | Row[] | null | undefined;
  const subjectRow = Array.isArray(embedded) ? embedded[0] : embedded;
  if (!subjectRow) throw new Error("Source is not linked to a subject.");
  const subject: CrawlSubject = {
    id: subjectRow.id as string,
    name: subjectRow.name as string,
    yearLevel: subjectRow.year_level as string,
  };

  const candidate: FirecrawlResult = {
    url: row.url as string,
    title: (row.title as string | null) ?? undefined,
    markdown: (row.content_preview as string | null) ?? undefined,
    description: (row.ai_summary as string | null) ?? undefined,
  };

  const [scored] = await scoreBatch(subject, [candidate]);
  if (!scored) throw new Error("Rescoring returned no result.");

  // Normal thresholds only — pass a high accepted count so scarcity mode is off.
  const status = determineAcceptance(scored.quality_score, scored.confidence, 8);

  const updated = await restService<Row[]>(`sources?id=eq.${sourceId}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      title: scored.title,
      type: scored.type,
      language: scored.language,
      quality_score: scored.quality_score,
      confidence_score: scored.confidence,
      ai_summary: scored.ai_summary,
      status,
      decline_reason: status === "declined" ? scored.decline_reason : null,
      updated_at: new Date().toISOString(),
    }),
  });
  const result = updated[0];
  if (!result) throw new Error("Could not update source after rescoring.");

  return {
    id: result.id as string,
    qualityScore: Number(result.quality_score ?? scored.quality_score),
    confidenceScore: Number(result.confidence_score ?? scored.confidence),
    status,
    aiSummary: (result.ai_summary as string | null) ?? scored.ai_summary,
    declineReason: (result.decline_reason as string | null) ?? null,
  };
}
