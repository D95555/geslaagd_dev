import { z } from "zod";
import { callFastJson, FAST_MODEL } from "../ai";
import { restService } from "../supabase";
import { loadSubject } from "./context";
import { createTask, type PipelineTask } from "./task-store";
import { taskLog } from "./task-log";

type Row = Record<string, unknown>;

const triageSchema = z.object({
  approved: z.boolean(),
  reason: z.string(),
  suggestions: z.string().nullable().optional(),
  tierFits: z.boolean(),
  tierReason: z.string().nullable().optional(),
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
  "Dit platform is alleen toegankelijk met een activatiecode die persoonlijk wordt",
  "uitgegeven aan geverifieerde universitaire studenten (o.a. Farmakunde, Geneeskunde,",
  "Toxicologie). Werkingsmechanismen, dosering (zowel therapeutisch als supratherapeutisch",
  "of recreatief), interacties, potentiëring, misbruikpatronen, verslaving en de behandeling",
  "daarvan, en juridische of regelgevende kaders rond genees- en genotmiddelen zijn standaard,",
  "verplichte onderdelen van universitaire farmacologie-, toxicologie- en geneeskundecurricula.",
  "Wijs een verzoek NIET af enkel omdat het deze onderwerpen bevat, en beschouw ze niet als",
  "'te praktisch' of 'risicovol' — beoordeel uitsluitend of het een herkenbaar academisch",
  "onderwerp is waarvoor voldoende studiemateriaal te vinden is. Wijs alleen af als het",
  "helemaal geen echt studieonderwerp is, of als het verzoek expliciet vraagt om instructies",
  "voor illegale vervaardiging of synthese losstaand van een academische, farmacologische context.",
  "",
  "Beoordeel daarnaast of het gekozen creditbudget (300, 600 of 800) realistisch is",
  "voor de omvang van dit vak. 300 credits is bedoeld voor een klein of algemeen vak;",
  "600 credits is bedoeld voor een groot vak of een vak dat specifieke, diepgaande",
  "kennis vereist (bijv. een universitaire specialisatie of subvak); 800 credits is de",
  "niche-tier voor een specialistisch onderwerp waarover bronnen schaars zijn en dat",
  "daarom extra diepgaand onderzoek vereist. Als de keuze niet bij de geschatte omvang",
  "past (te ruim of te krap), zet tierFits op false en leg in tierReason uit waarom,",
  "zodat een admin dit handmatig kan beoordelen.",
  "",
  "Antwoord ALLEEN met JSON:",
  '{ "approved": boolean, "reason": "korte toelichting in het Nederlands",',
  '  "suggestions": "als afgewezen: tips voor een beter verzoek, anders null",',
  '  "tierFits": boolean, "tierReason": "bij tierFits=false: uitleg, anders null" }',
].join("\n");

/**
 * Phase 1 — the fast model decides whether a requested subject is workable.
 * Approved subjects go straight to 'active' so the existing admin crawl tools
 * keep working, and a curriculum_design task is queued.
 */
export async function runTriage(task: PipelineTask): Promise<Record<string, unknown>> {
  const subject = await loadSubject(task.subjectId);

  const userLines = [
    `Vak: ${subject.name}`,
    `Niveau: ${subject.yearLevel}`,
    subject.description ? `Beschrijving: ${subject.description}` : null,
    subject.emphasis ? `Nadruk: ${subject.emphasis}` : null,
    `Gekozen creditbudget: ${subject.creditBudget}`,
  ].filter((line): line is string => line !== null);

  const parsed = triageSchema.safeParse(
    await callFastJson({
      system: SYSTEM_PROMPT,
      user: userLines.join("\n"),
    }),
  );
  if (!parsed.success) {
    throw new Error(`Triage returned unusable JSON: ${parsed.error.message}`);
  }
  const { approved, reason, suggestions, tierFits, tierReason } = parsed.data;

  // Three outcomes: denied (not workable at all), needs_refinement (workable,
  // but the chosen credit tier doesn't match the estimated scope — an admin
  // decides manually), or active (both checks pass, curriculum design starts).
  const status = !approved ? "denied" : tierFits ? "active" : "needs_refinement";
  const adminNote =
    status === "denied"
      ? [reason, suggestions].filter(Boolean).join(" — ")
      : status === "needs_refinement"
        ? tierReason ?? reason
        : reason;

  await restService<Row[]>(`crawl_subjects?id=eq.${task.subjectId}`, {
    method: "PATCH",
    body: JSON.stringify({
      status,
      admin_note: adminNote,
      updated_at: new Date().toISOString(),
    }),
  });

  // Keep the student-visible request row in step with the decision.
  await restService<Row[]>(`subject_requests?subject_id=eq.${task.subjectId}&status=eq.pending`, {
    method: "PATCH",
    body: JSON.stringify({
      status: status === "active" ? "approved" : status,
      admin_note: adminNote,
      updated_at: new Date().toISOString(),
    }),
  }).catch(() => undefined);

  if (status === "active") {
    await createTask({
      subjectId: task.subjectId,
      taskType: "curriculum_design",
      status: "ready",
    });
  }

  await taskLog(task).info(
    "triage",
    status === "active"
      ? `Aanvraag goedgekeurd: ${reason}`
      : status === "needs_refinement"
        ? `Creditbudget sluit niet aan bij de omvang: ${tierReason ?? reason}`
        : `Aanvraag afgewezen: ${reason}`,
    { subject: subject.name, status, tierFits, creditBudget: subject.creditBudget },
  );

  await taskLog(task).conclude(
    status === "active"
      ? `De aanvraag voor "${subject.name}" is goedgekeurd: ${reason} Het vak staat nu op actief ` +
        `en het curriculumontwerp is in de wachtrij gezet.`
      : status === "needs_refinement"
        ? `De aanvraag voor "${subject.name}" is haalbaar, maar het gekozen creditbudget ` +
          `(${subject.creditBudget}) sluit niet aan bij de geschatte omvang: ${tierReason ?? reason} ` +
          `Een admin moet dit handmatig beoordelen.`
        : `De aanvraag voor "${subject.name}" is afgewezen: ${reason}${
            suggestions ? ` Advies aan de student: ${suggestions}` : ""
          }`,
  );

  return { approved, status, reason, suggestions: suggestions ?? null, tierFits, tierReason: tierReason ?? null, model: FAST_MODEL };
}
