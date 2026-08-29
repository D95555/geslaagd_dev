import { logger } from "../logger";
import { logPipelineEvent } from "../slack";
import { restService } from "../supabase";
import { loadSubject, loadSubjectChapters } from "./context";
import type { PipelineTask } from "./task-store";
import { taskLog } from "./task-log";

type Row = Record<string, unknown>;

/**
 * Phase 6 — the gate before a subject can be published. It never publishes by
 * itself; it only records what is missing and flips publish_status to 'ready'
 * so an admin can make the final call.
 */
export async function runReadinessCheck(task: PipelineTask): Promise<Record<string, unknown>> {
  const subject = await loadSubject(task.subjectId);
  const chapters = await loadSubjectChapters(task.subjectId);
  const missing: string[] = [];

  if (!subject.description) missing.push("Vakbeschrijving ontbreekt.");
  if (!subject.difficultyLevel) missing.push("Moeilijkheidsniveau ontbreekt.");
  if (chapters.length === 0) missing.push("Vak heeft geen hoofdstukken.");

  const contentRows = await restService<Row[]>(
    `study_content?subject_id=eq.${task.subjectId}&status=eq.ready&select=chapter_id,content_type`,
  );
  const byChapter = new Map<string, Set<string>>();
  let hasQuestionnaire = false;
  for (const row of contentRows) {
    const chapterId = (row.chapter_id as string | null) ?? null;
    const type = row.content_type as string;
    if (!chapterId) {
      if (type === "diagnostic_questionnaire") hasQuestionnaire = true;
      continue;
    }
    if (!byChapter.has(chapterId)) byChapter.set(chapterId, new Set());
    byChapter.get(chapterId)!.add(type);
  }

  const sourceRows = await restService<Row[]>(
    `chapter_sources?select=chapter_id,sources!inner(status)&sources.status=eq.accepted`,
  );
  const chaptersWithSources = new Set(
    sourceRows.map((row) => row.chapter_id as string),
  );

  for (const chapter of chapters) {
    const label = `H${chapter.position} "${chapter.title}"`;
    const present = byChapter.get(chapter.id) ?? new Set<string>();

    for (const required of ["summary", "key_notes", "exercise_bank"]) {
      if (!present.has(required)) missing.push(`${label}: ${required} ontbreekt.`);
    }
    if (chapter.isImportant && !present.has("exam")) {
      missing.push(`${label}: tentamen ontbreekt.`);
    }
    if (!chaptersWithSources.has(chapter.id)) {
      missing.push(`${label}: geen goedgekeurde bron.`);
    }
  }

  if (!hasQuestionnaire) missing.push("Startvragenlijst ontbreekt.");

  const passed = missing.length === 0;
  await restService<Row[]>(`crawl_subjects?id=eq.${task.subjectId}`, {
    method: "PATCH",
    body: JSON.stringify({
      publish_status: passed ? "ready" : "incomplete",
      updated_at: new Date().toISOString(),
    }),
  });

  await logPipelineEvent(
    passed
      ? { kind: "subject-ready", subjectName: subject.name, subjectId: subject.id }
      : {
          kind: "subject-incomplete",
          subjectName: subject.name,
          subjectId: subject.id,
          detail: missing.slice(0, 10).join("\n"),
        },
  ).catch((error) => logger.warn({ error }, "Could not post readiness notification"));

  await taskLog(task).conclude(
    passed
      ? `"${subject.name}" heeft de gereedheidscontrole doorstaan: ${chapters.length} hoofdstukken ` +
        `met samenvatting, kernpunten en oefenvragen, tentamens waar nodig, bronnen per hoofdstuk ` +
        `en een startvragenlijst. Het vak kan gepubliceerd worden.`
      : `"${subject.name}" is nog niet compleet. Er ontbreken ${missing.length} onderdelen, ` +
        `waaronder: ${missing.slice(0, 3).join(" ")}`,
  );

  return { passed, missing };
}
