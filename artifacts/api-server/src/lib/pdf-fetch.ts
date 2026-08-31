import { callStrongTextWithDocument } from "./ai";
import { aiUsageRecorder } from "./ai-usage";
import { isPdfUrl } from "./firecrawl";
import { logger } from "./logger";
import { setSourceFullContent } from "./pipeline-tasks/source-store";

// Anthropic's PDF document input caps out well above this; staying small
// keeps a stray huge file from ever being worth blocking on — it just falls
// back to the snippet it already had.
const MAX_PDF_BYTES = 20 * 1024 * 1024;

const SYSTEM_PROMPT = [
  "Je zet een PDF-document om naar platte studietekst.",
  "Geef alleen de inhoudelijke tekst terug, in leesvolgorde, zonder eigen",
  "commentaar, samenvatting, of opmaak-ruis zoals paginanummers en kopregels.",
].join("\n");

async function fetchPdfBytes(url: string): Promise<Buffer | null> {
  const response = await fetch(url);
  if (!response.ok) {
    logger.warn({ url, status: response.status }, "PDF fetch failed; keeping snippet");
    return null;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_PDF_BYTES) {
    logger.warn({ url, size: buffer.byteLength }, "PDF skipped: empty or too large");
    return null;
  }
  return buffer;
}

/**
 * Enriches an accepted PDF source with its real full text, fetched directly
 * (no Firecrawl, no credits) and read by Claude's native document input.
 * Any failure just leaves the source with whatever snippet it already had —
 * this is a bonus on top of an already-accepted source, not a dependency of
 * the pipeline.
 */
export async function enrichAcceptedPdfSource(
  sourceId: string,
  url: string,
  subjectId: string | null = null,
): Promise<void> {
  if (!isPdfUrl(url)) return;
  try {
    const buffer = await fetchPdfBytes(url);
    if (!buffer) return;
    const text = await callStrongTextWithDocument({
      system: SYSTEM_PROMPT,
      user: "Geef de volledige inhoudelijke tekst van dit document.",
      documentBase64: buffer.toString("base64"),
      maxTokens: 8_000,
      onUsage: aiUsageRecorder(subjectId, "pdf_extraction"),
    });
    await setSourceFullContent(sourceId, text, text.slice(0, 500));
    logger.info({ url }, "PDF full text fetched for free (no Firecrawl credits)");
  } catch (error) {
    logger.warn({ error, url }, "PDF full-text extraction failed; keeping snippet");
  }
}
