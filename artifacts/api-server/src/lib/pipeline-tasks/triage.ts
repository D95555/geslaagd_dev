import { z } from "zod";
import { callFastJson, FAST_MODEL } from "../ai";
import { restService } from "../supabase";
import { loadSubject } from "./context";
import { createTask, type PipelineTask } from "./task-store";

type Row = Record<string, unknown>;

const triageSchema = z.object({
  approved: z.boolean(),
  reason: z.string(),
  suggestions: z.string().nullable().optional(),
});

const SYSTEM_PROMPT = [
  "Je bent een beoordelaar voor nieuwe vakverzoeken op Geslaagd, een studieplatform",
  "voor VWO- en eerstejaars bachelorstudenten.",
  "",
  "Beoordeel of het verzoek haalbaar is. Beantwoord drie vragen:",
  "1. Is dit een echt, herkenbaar schoolvak of studieonderwerp?",
  "2. Kan er via 2-3 zoekopdrachten voldoende studiemateriaal worden gevonden?",
  "3. Past het bij VWO- of bachelorstudenten?",
  "",
  "Antwoord ALLEEN met JSON:",
  '{ "approved": boolean, "reason": "korte toelichting in het Nederlands",',
  '  "suggestions": "als afgewezen: tips voor een beter verzoek, anders null" }',
].join("\n");

/**
 * Phase 1 — the fast model decides whether a requested subject is workable.
 * Approved subjects go straight to 'active' so the existing admin crawl tools
 * keep working, and a curriculum_design task is queued.
 */
export async function runTriage(task: PipelineTask): Promise<Record<string, unknown>> {
  const subject = await loadSubject(task.subjectId);

  const parsed = triageSchema.safeParse(
    await callFastJson({
      system: SYSTEM_PROMPT,
      user: `Vak: ${subject.name}\nNiveau: ${subject.yearLevel}`,
    }),
  );
  if (!parsed.success) {
    throw new Error(`Triage returned unusable JSON: ${parsed.error.message}`);
  }
  const { approved, reason, suggestions } = parsed.data;

  const adminNote = approved
    ? reason
    : [reason, suggestions].filter(Boolean).join(" — ");

  await restService<Row[]>(`crawl_subjects?id=eq.${task.subjectId}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: approved ? "active" : "denied",
      admin_note: adminNote,
      updated_at: new Date().toISOString(),
    }),
  });

  // Keep the student-visible request row in step with the decision.
  await restService<Row[]>(`subject_requests?subject_id=eq.${task.subjectId}&status=eq.pending`, {
    method: "PATCH",
    body: JSON.stringify({
      status: approved ? "approved" : "denied",
      admin_note: adminNote,
      updated_at: new Date().toISOString(),
    }),
  }).catch(() => undefined);

  if (approved) {
    await createTask({
      subjectId: task.subjectId,
      taskType: "curriculum_design",
      status: "ready",
    });
  }

  return { approved, reason, suggestions: suggestions ?? null, model: FAST_MODEL };
}
