import { logger } from "../logger";
import { restService } from "../supabase";

type Row = Record<string, unknown>;

export type LogLevel = "info" | "warn" | "error";

export type TaskLogEntry = {
  id: string;
  taskId: string;
  subjectId: string | null;
  chapterId: string | null;
  level: LogLevel;
  phase: string;
  message: string;
  data: Record<string, unknown> | null;
  createdAt: string;
};

export function toTaskLogEntry(row: Row): TaskLogEntry {
  return {
    id: String(row.id),
    taskId: row.task_id as string,
    subjectId: (row.subject_id as string | null) ?? null,
    chapterId: (row.chapter_id as string | null) ?? null,
    level: row.level as LogLevel,
    phase: (row.phase as string | null) ?? "",
    message: row.message as string,
    data: (row.data as Record<string, unknown> | null) ?? null,
    createdAt: row.created_at as string,
  };
}

/**
 * Phases that represent an actual AI judgment call (accept/decline/tier-fit,
 * not routine progress narration like "zoeken" or "gescraped"). Drives the
 * AI-beslissingen admin page, which is a filtered view over this same log.
 */
export const DECISION_PHASES = [
  "beoordeeld",
  "link-beoordeeld",
  "behouden",
  "afgewezen",
  "triage",
] as const;

/**
 * Records one step of a task. Logging must never break the work it describes,
 * so a failed write is reported to the server log and otherwise swallowed.
 */
export async function logTask(input: {
  taskId: string;
  subjectId: string;
  chapterId?: string | null;
  level?: LogLevel;
  phase: string;
  message: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  try {
    await restService<Row[]>("pipeline_task_logs", {
      method: "POST",
      body: JSON.stringify({
        task_id: input.taskId,
        subject_id: input.subjectId,
        chapter_id: input.chapterId ?? null,
        level: input.level ?? "info",
        phase: input.phase,
        message: input.message,
        data: input.data ?? null,
      }),
    });
  } catch (error) {
    logger.warn({ error, taskId: input.taskId }, "Could not write pipeline task log");
  }
}

/**
 * A task's closing paragraph in Dutch: what it did and what came out. Shown at
 * the top of the task detail so an admin does not have to read every line.
 */
export async function setTaskSummary(taskId: string, summary: string): Promise<void> {
  try {
    await restService<Row[]>(`pipeline_tasks?id=eq.${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ summary }),
    });
  } catch (error) {
    logger.warn({ error, taskId }, "Could not store pipeline task summary");
  }
}

export type TaskLog = {
  info: (phase: string, message: string, data?: Record<string, unknown>) => Promise<void>;
  warn: (phase: string, message: string, data?: Record<string, unknown>) => Promise<void>;
  error: (phase: string, message: string, data?: Record<string, unknown>) => Promise<void>;
  conclude: (summary: string) => Promise<void>;
};

/** Binds the log helpers to one task so handlers stay readable. */
export function taskLog(task: {
  id: string;
  subjectId: string;
  chapterId: string | null;
}): TaskLog {
  const write =
    (level: LogLevel) =>
    (phase: string, message: string, data?: Record<string, unknown>) =>
      logTask({
        taskId: task.id,
        subjectId: task.subjectId,
        chapterId: task.chapterId,
        level,
        phase,
        message,
        ...(data ? { data } : {}),
      });

  return {
    info: write("info"),
    warn: write("warn"),
    error: write("error"),
    conclude: (summary: string) => setTaskSummary(task.id, summary),
  };
}

export async function loadTaskLogs(taskId: string): Promise<TaskLogEntry[]> {
  const rows = await restService<Row[]>(
    `pipeline_task_logs?task_id=eq.${taskId}&select=*&order=id.asc&limit=500`,
  );
  return rows.map(toTaskLogEntry);
}

/** Newest-first feed across every task, for the console and AI-beslissingen pages. */
export async function loadRecentLogs(filters: {
  subjectId?: string;
  level?: LogLevel;
  decisionsOnly?: boolean;
  limit?: number;
}): Promise<TaskLogEntry[]> {
  const parts = [
    filters.subjectId ? `subject_id=eq.${filters.subjectId}` : null,
    filters.level ? `level=eq.${filters.level}` : null,
    filters.decisionsOnly ? `phase=in.(${DECISION_PHASES.join(",")})` : null,
  ].filter(Boolean);
  const rows = await restService<Row[]>(
    `pipeline_task_logs?select=*&order=created_at.desc,id.desc&limit=${filters.limit ?? 200}` +
      (parts.length ? `&${parts.join("&")}` : ""),
  );
  return rows.map(toTaskLogEntry);
}
