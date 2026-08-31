import { callFastText } from "./ai";
import { aiUsageRecorder } from "./ai-usage";
import { logger } from "./logger";
import { restService } from "./supabase";

type Row = Record<string, unknown>;

const ENTRY_SEPARATOR = "\n\n---\n\n";
// Once memory grows past this, older entries get compressed -- but never the
// most recent ones, so a lesson from the last few crawls is never lost to
// summarization before there has been a chance to see if it still applies.
const MAX_MEMORY_CHARS = 6_000;
const RECENT_BUFFER_COUNT = 5;

function splitEntries(content: string): string[] {
  return content
    .split(ENTRY_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function joinEntries(entries: string[]): string {
  return entries.join(ENTRY_SEPARATOR);
}

async function loadMemoryRow(subjectId: string | null): Promise<{ id: string | null; content: string }> {
  const filter = subjectId ? `subject_id=eq.${subjectId}` : "subject_id=is.null";
  const rows = await restService<Row[]>(`crawl_memory?${filter}&select=id,content`);
  const row = rows[0];
  return { id: (row?.id as string) ?? null, content: (row?.content as string) ?? "" };
}

async function saveMemoryRow(subjectId: string | null, id: string | null, content: string): Promise<void> {
  if (id) {
    await restService<Row[]>(`crawl_memory?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ content, updated_at: new Date().toISOString() }),
    });
  } else {
    await restService<Row[]>("crawl_memory", {
      method: "POST",
      body: JSON.stringify({ subject_id: subjectId, content }),
    });
  }
}

/** Loads both memory texts for use as prompt context when planning new queries. */
export async function loadMemory(subjectId: string): Promise<{ global: string; subject: string }> {
  const [global, subject] = await Promise.all([loadMemoryRow(null), loadMemoryRow(subjectId)]);
  return { global: global.content, subject: subject.content };
}

/** Direct read for the admin UI -- pass null for the global memory. */
export async function getMemoryContent(subjectId: string | null): Promise<string> {
  return (await loadMemoryRow(subjectId)).content;
}

/** Direct overwrite for the admin UI (not an append) -- pass null for the global memory. */
export async function setMemoryContent(subjectId: string | null, content: string): Promise<void> {
  const row = await loadMemoryRow(subjectId);
  await saveMemoryRow(subjectId, row.id, content);
}

const COMPRESS_SYSTEM_PROMPT = [
  "Je comprimeert het leer-geheugen van een crawl-systeem.",
  "Behoud duurzame lessen: patronen over domeinen, zoekformuleringen, en",
  "vak-specifieke valkuilen. Laat verouderde of overbodige entries weg.",
  "Geef een korte, puntsgewijze samenvatting terug in het Nederlands.",
  "Verzin niets dat niet al in de tekst stond.",
].join("\n");

/** Compresses everything except the most recent entries once memory grows too long. */
async function compressIfNeeded(content: string, subjectId: string | null): Promise<string> {
  if (content.length <= MAX_MEMORY_CHARS) return content;

  const entries = splitEntries(content);
  if (entries.length <= RECENT_BUFFER_COUNT) return content;

  const recent = entries.slice(-RECENT_BUFFER_COUNT);
  const older = entries.slice(0, -RECENT_BUFFER_COUNT);

  try {
    const compressed = await callFastText({
      system: COMPRESS_SYSTEM_PROMPT,
      messages: [{ role: "user", content: joinEntries(older) }],
      maxTokens: 1_500,
      onUsage: aiUsageRecorder(subjectId, "memory_compression"),
    });
    const summaryEntry = `## Samengevatte lessen (ouder)\n${compressed.trim()}`;
    return joinEntries([summaryEntry, ...recent]);
  } catch (error) {
    logger.warn({ error }, "Memory compression failed; keeping memory uncompressed for now");
    return content;
  }
}

/**
 * Appends a dated lesson to a subject's memory and, optionally, the global
 * memory shared across every subject. Compresses older entries first if
 * needed so memory does not grow without bound.
 */
export async function appendMemoryEntry(
  subjectId: string,
  subjectEntry: string,
  globalEntry?: string | null,
): Promise<void> {
  const dateHeading = `## ${new Date().toISOString().slice(0, 10)}`;

  try {
    const subjectRow = await loadMemoryRow(subjectId);
    const nextSubjectContent = await compressIfNeeded(
      joinEntries([...splitEntries(subjectRow.content), `${dateHeading}\n${subjectEntry}`]),
      subjectId,
    );
    await saveMemoryRow(subjectId, subjectRow.id, nextSubjectContent);

    if (globalEntry) {
      const globalRow = await loadMemoryRow(null);
      const nextGlobalContent = await compressIfNeeded(
        joinEntries([...splitEntries(globalRow.content), `${dateHeading}\n${globalEntry}`]),
        null,
      );
      await saveMemoryRow(null, globalRow.id, nextGlobalContent);
    }
  } catch (error) {
    logger.warn({ error, subjectId }, "Could not append crawl memory entry");
  }
}
