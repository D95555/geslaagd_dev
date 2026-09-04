import { z } from "zod";
import { callJsonForTask, MODEL_BY_TASK, modelNameFor } from "../ai";
import { aiUsageRecorder } from "../ai-usage";
import { modelList, modelText } from "../study-content";
import { restService } from "../supabase";
import { loadChapter, loadChapterSources, loadSubject } from "./context";
import type { PipelineTask } from "./task-store";
import { taskLog } from "./task-log";

type Row = Record<string, unknown>;

const contradictionSchema = z.object({
  contradictions: modelList(
    z.object({
      topic: modelText(),
      description: modelText(),
      sources: modelList(z.string()),
    }),
  ),
});

const SYSTEM_PROMPT = [
  "Je vergelijkt de goedgekeurde bronnen van één studiehoofdstuk en zoekt naar",
  "ECHTE feitelijke tegenstrijdigheden: plekken waar twee bronnen elkaar direct",
  "tegenspreken over een feit, getal, definitie, mechanisme, dosering of uitkomst.",
  "",
  "Meld ALLEEN harde tegenstrijdigheden. Meld NIET:",
  "- verschil in nadruk, detailniveau, formulering of volledigheid",
  "- verschillende maar verenigbare voorbeelden of perspectieven",
  "- iets wat maar in één bron staat (dat is geen tegenstrijdigheid)",
  "Bij twijfel: niet melden. Verzin niets.",
  "",
  "Voor elke echte tegenstrijdigheid:",
  "- topic: het onderwerp waarover de bronnen het oneens zijn (paar woorden)",
  "- description: 1-2 zinnen in het Nederlands die uitleggen waarin ze verschillen",
  "- sources: de URL's van de bronnen die elkaar tegenspreken (letterlijk overnemen)",
  "",
  "Laat de lijst leeg als de bronnen elkaar niet tegenspreken.",
  "",
  "Antwoord ALLEEN met JSON:",
  '{ "contradictions": [{ "topic": "...", "description": "...", "sources": ["..."] }] }',
].join("\n");

/**
 * Non-blocking annotation step: after a chapter's sources are reviewed, flag
 * where the accepted sources genuinely disagree. It is a leaf task — nothing
 * depends on it, and a failure here never affects the sources that were kept or
 * the content that was generated. With fewer than two accepted sources there is
 * nothing to compare, so it records an empty result and stops.
 */
export async function runContradictionCheck(task: PipelineTask): Promise<Record<string, unknown>> {
  if (!task.chapterId) throw new Error("contradiction_check requires a chapter.");

  const chapter = await loadChapter(task.chapterId);
  const subject = await loadSubject(task.subjectId);
  const log = taskLog(task);
  const sources = await loadChapterSources(task.chapterId, { onlyAccepted: true, maxSources: 6 });

  const store = (contradictions: unknown[]) =>
    restService<Row[]>(`chapters?id=eq.${task.chapterId}`, {
      method: "PATCH",
      body: JSON.stringify({ contradictions }),
    });

  if (sources.length < 2) {
    await store([]);
    await log.conclude(`Te weinig goedgekeurde bronnen (${sources.length}) om te vergelijken; geen tegenstrijdigheden.`);
    return { contradictions: 0, compared: sources.length };
  }

  // This is a leaf annotation task and the readiness gate waits for every task
  // to reach 'done', so it must never fail the subject: any error is logged,
  // the chapter is left with an empty result, and the task still completes.
  try {
    const parsed = contradictionSchema.safeParse(
      await callJsonForTask("contradiction_check", {
        system: SYSTEM_PROMPT,
        user: [
          `Vak: ${subject.name}`,
          `Hoofdstuk: ${chapter.title}`,
          "",
          "Bronnen:",
          ...sources.map((source) =>
            [`URL: ${source.url}`, `Titel: ${source.title}`, `Inhoud: ${source.content.slice(0, 2_000) || "(geen inhoud)"}`].join("\n"),
          ),
        ].join("\n\n"),
        maxTokens: 4_000,
        onUsage: aiUsageRecorder(task.subjectId, "contradiction_check"),
      }),
    );
    if (!parsed.success) {
      await store([]);
      await log.warn("mislukt", "Tegenstrijdigheidscheck gaf onbruikbare JSON; hoofdstuk zonder tegenstrijdigheden gelaten.");
      await log.conclude(`${sources.length} bronnen vergeleken; check kon niet worden voltooid, geen tegenstrijdigheden vastgelegd.`);
      return { contradictions: 0, compared: sources.length, failed: true };
    }

    // Keep only contradictions that actually reference at least two of this
    // chapter's accepted source URLs — a guard against the model inventing a
    // conflict or citing a source that was not in the set.
    const knownUrls = new Set(sources.map((source) => source.url));
    const contradictions = parsed.data.contradictions
      .map((item) => ({
        topic: item.topic.trim(),
        description: item.description.trim(),
        sources: item.sources.filter((url) => knownUrls.has(url)),
      }))
      .filter((item) => item.topic && item.description && item.sources.length >= 2);

    await store(contradictions);

    for (const item of contradictions) {
      await log.info("tegenstrijdigheid", `Bronnen spreken elkaar tegen over: ${item.topic}`, {
        uitleg: item.description,
        bronnen: item.sources,
      });
    }
    await log.conclude(
      contradictions.length === 0
        ? `${sources.length} bronnen vergeleken; geen feitelijke tegenstrijdigheden gevonden.`
        : `${sources.length} bronnen vergeleken; ${contradictions.length} tegenstrijdigheid(en) gevonden.`,
    );

    return { contradictions: contradictions.length, compared: sources.length, model: modelNameFor(MODEL_BY_TASK.contradiction_check) };
  } catch (error) {
    await store([]).catch(() => undefined);
    await log.warn("mislukt", `Tegenstrijdigheidscheck mislukt: ${error instanceof Error ? error.message : String(error)}`);
    await log.conclude(`${sources.length} bronnen vergeleken; check mislukt, hoofdstuk zonder tegenstrijdigheden gelaten.`);
    return { contradictions: 0, compared: sources.length, failed: true };
  }
}
