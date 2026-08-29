import { logger } from "./logger";
import { runCurriculumDesign } from "./pipeline-tasks/curriculum-design";
import { runExamGeneration } from "./pipeline-tasks/exam-generation";
import { runExerciseGeneration } from "./pipeline-tasks/exercise-generation";
import { runKeyNotesGeneration } from "./pipeline-tasks/key-notes-generation";
import { runQuestionnaireGeneration } from "./pipeline-tasks/questionnaire-generation";
import { runReadinessCheck } from "./pipeline-tasks/readiness-check";
import { runSourceGathering } from "./pipeline-tasks/source-gathering";
import { runSourceReview } from "./pipeline-tasks/source-review";
import { runSummaryGeneration } from "./pipeline-tasks/summary-generation";
import {
  dependenciesSatisfied,
  patchTask,
  toPipelineTask,
  type PipelineTask,
  type TaskType,
} from "./pipeline-tasks/task-store";
import { runTriage } from "./pipeline-tasks/triage";
import { logPipelineEvent } from "./slack";
import { restService } from "./supabase";

type Row = Record<string, unknown>;

const POLL_INTERVAL_MS = 30_000;
const LEASE_DURATION_MS = 5 * 60_000;
/** How many tasks one poll may run; keeps a single tick bounded. */
const MAX_TASKS_PER_TICK = 3;

const handlers: Record<TaskType, (task: PipelineTask) => Promise<Record<string, unknown>>> = {
  triage: runTriage,
  curriculum_design: runCurriculumDesign,
  source_gathering: runSourceGathering,
  source_review: runSourceReview,
  summary_generation: runSummaryGeneration,
  key_notes_generation: runKeyNotesGeneration,
  exercise_generation: runExerciseGeneration,
  exam_generation: runExamGeneration,
  questionnaire_generation: runQuestionnaireGeneration,
  readiness_check: runReadinessCheck,
};

/**
 * Claims a task by moving it to 'running' with a lease. The status filter in
 * the PATCH is the lock: a second worker patching the same row matches nothing
 * and gets no rows back, so only one worker ever runs a task.
 */
async function leaseTask(taskId: string): Promise<PipelineTask | null> {
  const lockedUntil = new Date(Date.now() + LEASE_DURATION_MS).toISOString();
  const rows = await restService<Row[]>(`pipeline_tasks?id=eq.${taskId}&status=eq.ready`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      status: "running",
      locked_until: lockedUntil,
      updated_at: new Date().toISOString(),
    }),
  });
  const row = rows[0];
  return row ? toPipelineTask(row) : null;
}

/** Returns expired 'running' tasks to the queue so a crash cannot strand them. */
async function reclaimExpiredLeases(): Promise<void> {
  const now = new Date().toISOString();
  await restService<Row[]>(
    `pipeline_tasks?status=eq.running&locked_until=lt.${now}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status: "ready", locked_until: null, updated_at: now }),
    },
  ).catch((error) => logger.warn({ error }, "Could not reclaim expired pipeline leases"));
}

/**
 * The readiness check is created up front with status 'waiting' because the
 * content tasks it depends on do not exist yet. It is released once every
 * other task for the subject has finished.
 */
async function maybeReleaseReadinessCheck(subjectId: string): Promise<void> {
  const rows = await restService<Row[]>(
    `pipeline_tasks?subject_id=eq.${subjectId}&select=id,task_type,status`,
  );
  const readiness = rows.find((row) => row.task_type === "readiness_check");
  if (!readiness || readiness.status !== "waiting") return;

  const others = rows.filter((row) => row.id !== readiness.id);
  if (others.length === 0 || !others.every((row) => row.status === "done")) return;

  await patchTask(readiness.id as string, { status: "ready" });
}

async function recordFailure(task: PipelineTask, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const attempts = task.attempts + 1;
  const exhausted = attempts >= task.maxAttempts;

  // Exponential backoff: the lease doubles as the "not before" marker.
  const backoffMs = Math.min(30 * 60_000, 60_000 * 2 ** (attempts - 1));
  await patchTask(task.id, {
    status: exhausted ? "failed" : "ready",
    attempts,
    last_error: message.slice(0, 2000),
    locked_until: exhausted ? null : new Date(Date.now() + backoffMs).toISOString(),
  });

  logger.warn({ taskId: task.id, taskType: task.taskType, attempts, error }, "Pipeline task failed");

  if (exhausted) {
    const subjects = await restService<Row[]>(
      `crawl_subjects?id=eq.${task.subjectId}&select=name`,
    ).catch(() => [] as Row[]);
    await logPipelineEvent({
      kind: "task-failed",
      subjectId: task.subjectId,
      subjectName: (subjects[0]?.name as string) ?? "onbekend",
      taskType: task.taskType,
      detail: message.slice(0, 500),
    }).catch((slackError) =>
      logger.warn({ slackError }, "Could not post pipeline failure notification"),
    );
  }
}

async function runTask(task: PipelineTask): Promise<void> {
  const handler = handlers[task.taskType];
  if (!handler) {
    await patchTask(task.id, { status: "failed", last_error: `Unknown task type ${task.taskType}` });
    return;
  }

  try {
    const result = await handler(task);
    await patchTask(task.id, { status: "done", result, locked_until: null, last_error: null });
    logger.info({ taskId: task.id, taskType: task.taskType }, "Pipeline task done");
  } catch (error) {
    await recordFailure(task, error);
  }

  await maybeReleaseReadinessCheck(task.subjectId).catch((error) =>
    logger.warn({ error }, "Could not evaluate readiness check release"),
  );
}

let ticking = false;

export async function pollAndProcess(): Promise<void> {
  if (ticking) return;
  ticking = true;

  try {
    await reclaimExpiredLeases();

    const now = new Date().toISOString();
    const rows = await restService<Row[]>(
      `pipeline_tasks?status=eq.ready` +
        `&or=(locked_until.is.null,locked_until.lt.${now})` +
        `&select=*&order=created_at.asc&limit=${MAX_TASKS_PER_TICK * 3}`,
    );

    let processed = 0;
    for (const row of rows) {
      if (processed >= MAX_TASKS_PER_TICK) break;
      const candidate = toPipelineTask(row);
      if (!(await dependenciesSatisfied(candidate.dependsOn))) continue;

      const leased = await leaseTask(candidate.id);
      if (!leased) continue;

      await runTask(leased);
      processed += 1;
    }
  } catch (error) {
    logger.warn({ error }, "Pipeline poll failed");
  } finally {
    ticking = false;
  }
}

export function startPipelineWorker(): void {
  void pollAndProcess();
  const timer = setInterval(() => {
    void pollAndProcess();
  }, POLL_INTERVAL_MS);
  timer.unref();
}
