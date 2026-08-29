import { restService } from "../supabase";

type Row = Record<string, unknown>;

export type TaskType =
  | "triage"
  | "curriculum_design"
  | "source_gathering"
  | "source_review"
  | "summary_generation"
  | "key_notes_generation"
  | "exercise_generation"
  | "exam_generation"
  | "questionnaire_generation"
  | "readiness_check";

export type TaskStatus = "waiting" | "ready" | "running" | "done" | "failed";

export type PipelineTask = {
  id: string;
  subjectId: string;
  chapterId: string | null;
  taskType: TaskType;
  dependsOn: string[];
  status: TaskStatus;
  config: Record<string, unknown> | null;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export function toPipelineTask(row: Row): PipelineTask {
  return {
    id: row.id as string,
    subjectId: row.subject_id as string,
    chapterId: (row.chapter_id as string | null) ?? null,
    taskType: row.task_type as TaskType,
    dependsOn: (row.depends_on as string[] | null) ?? [],
    status: row.status as TaskStatus,
    config: (row.config as Record<string, unknown> | null) ?? null,
    attempts: Number(row.attempts ?? 0),
    maxAttempts: Number(row.max_attempts ?? 3),
    lastError: (row.last_error as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function createTask(input: {
  subjectId: string;
  chapterId?: string | null;
  taskType: TaskType;
  dependsOn?: string[];
  status?: TaskStatus;
  config?: Record<string, unknown> | null;
}): Promise<PipelineTask> {
  const rows = await restService<Row[]>("pipeline_tasks", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      subject_id: input.subjectId,
      chapter_id: input.chapterId ?? null,
      task_type: input.taskType,
      depends_on: input.dependsOn ?? [],
      status: input.status ?? "ready",
      config: input.config ?? null,
    }),
  });
  const row = rows[0];
  if (!row) throw new Error("Could not create pipeline task.");
  return toPipelineTask(row);
}

export async function patchTask(taskId: string, patch: Row): Promise<void> {
  await restService<Row[]>(`pipeline_tasks?id=eq.${taskId}`, {
    method: "PATCH",
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
}

export async function getTasksForSubject(
  subjectId: string,
  taskType?: TaskType,
): Promise<PipelineTask[]> {
  const filter = taskType ? `&task_type=eq.${taskType}` : "";
  const rows = await restService<Row[]>(
    `pipeline_tasks?subject_id=eq.${subjectId}${filter}&select=*&order=created_at.asc`,
  );
  return rows.map(toPipelineTask);
}

/** True when every task listed in depends_on has reached status 'done'. */
export async function dependenciesSatisfied(dependsOn: string[]): Promise<boolean> {
  if (dependsOn.length === 0) return true;
  const unfinished = await restService<Row[]>(
    `pipeline_tasks?id=in.(${dependsOn.join(",")})&status=neq.done&select=id&limit=1`,
  );
  return unfinished.length === 0;
}
