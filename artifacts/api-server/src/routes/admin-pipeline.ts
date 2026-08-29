import { Router, type IRouter, type Request } from "express";
import {
  CancelPipelineTaskParams,
  GetPipelineTaskDetailParams,
  GetPipelineTaskDetailResponse,
  ListPipelineLogsQueryParams,
  ListPipelineLogsResponse,
  CancelPipelineTaskResponse,
  GetAdminSubjectContentParams,
  GetAdminSubjectContentResponse,
  ListPipelineTasksQueryParams,
  ListPipelineTasksResponse,
  PublishSubjectParams,
  PublishSubjectResponse,
  RetryPipelineTaskBody,
  RetryPipelineTaskParams,
  RetryPipelineTaskResponse,
} from "@workspace/api-zod";
import { loadSubject, loadSubjectChapters } from "../lib/pipeline-tasks/context";
import { toPipelineTask } from "../lib/pipeline-tasks/task-store";
import { loadRecentLogs, loadTaskLogs } from "../lib/pipeline-tasks/task-log";
import { pollAndProcess } from "../lib/pipeline-worker";
import { getAuthenticatedUser, restService } from "../lib/supabase";

const router: IRouter = Router();

type Row = Record<string, unknown>;

async function admin(req: Request) {
  const token = req.header("authorization");
  const user = await getAuthenticatedUser(token);
  return user?.isAdmin ? { user, token: token! } : null;
}

function toTaskResponse(row: Row) {
  const task = toPipelineTask(row);
  return {
    id: task.id,
    subjectId: task.subjectId,
    chapterId: task.chapterId,
    taskType: task.taskType,
    status: task.status,
    attempts: task.attempts,
    lastError: task.lastError,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

router.get("/admin/pipeline/tasks", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const query = ListPipelineTasksQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Ongeldige filters." });
    return;
  }
  try {
    const filters = [
      query.data.subjectId ? `subject_id=eq.${query.data.subjectId}` : null,
      query.data.status ? `status=eq.${query.data.status}` : null,
    ].filter(Boolean);
    const rows = await restService<Row[]>(
      `pipeline_tasks?select=*&order=created_at.desc&limit=200${filters.length ? `&${filters.join("&")}` : ""}`,
    );
    res.json(ListPipelineTasksResponse.parse(rows.map(toTaskResponse)));
  } catch (error) {
    req.log.warn({ error }, "Could not list pipeline tasks");
    res.status(500).json({ error: "Taken konden niet worden geladen." });
  }
});

router.get("/admin/pipeline/logs", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const query = ListPipelineLogsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Ongeldige filters." });
    return;
  }
  try {
    const logs = await loadRecentLogs({
      ...(query.data.subjectId ? { subjectId: query.data.subjectId } : {}),
      ...(query.data.level ? { level: query.data.level } : {}),
      ...(query.data.limit ? { limit: query.data.limit } : {}),
    });
    res.json(ListPipelineLogsResponse.parse(logs));
  } catch (error) {
    req.log.warn({ error }, "Could not load pipeline logs");
    res.status(500).json({ error: "Logboek kon niet worden geladen." });
  }
});

router.get("/admin/pipeline/tasks/:taskId", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = GetPipelineTaskDetailParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Ongeldige taak." });
    return;
  }
  try {
    const rows = await restService<Row[]>(
      `pipeline_tasks?id=eq.${params.data.taskId}` +
        "&select=*,crawl_subjects(name),chapters(title)",
    );
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "Taak niet gevonden." });
      return;
    }

    const subjectEmbed = row.crawl_subjects as Row | Row[] | null | undefined;
    const subject = Array.isArray(subjectEmbed) ? subjectEmbed[0] : subjectEmbed;
    const chapterEmbed = row.chapters as Row | Row[] | null | undefined;
    const chapter = Array.isArray(chapterEmbed) ? chapterEmbed[0] : chapterEmbed;

    const task = toPipelineTask(row);
    res.json(
      GetPipelineTaskDetailResponse.parse({
        ...toTaskResponse(row),
        summary: (row.summary as string | null) ?? null,
        subjectName: (subject?.name as string | undefined) ?? null,
        chapterTitle: (chapter?.title as string | undefined) ?? null,
        dependsOn: task.dependsOn,
        config: task.config,
        result: (row.result as Record<string, unknown> | null) ?? null,
        logs: await loadTaskLogs(params.data.taskId),
      }),
    );
  } catch (error) {
    req.log.warn({ error }, "Could not load pipeline task detail");
    res.status(500).json({ error: "Taakdetails konden niet worden geladen." });
  }
});

router.post("/admin/pipeline/tasks/:taskId/retry", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = RetryPipelineTaskParams.safeParse(req.params);
  const input = RetryPipelineTaskBody.safeParse(req.body ?? {});
  if (!params.success) {
    res.status(400).json({ error: "Ongeldige taak." });
    return;
  }
  try {
    // Retrying resets the attempt counter so the worker gets a fresh budget.
    const rows = await restService<Row[]>(`pipeline_tasks?id=eq.${params.data.taskId}`, {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        status: "ready",
        attempts: 0,
        last_error: null,
        locked_until: null,
        ...(input.success && input.data.config ? { config: input.data.config } : {}),
        updated_at: new Date().toISOString(),
      }),
    });
    if (!rows[0]) {
      res.status(404).json({ error: "Taak niet gevonden." });
      return;
    }
    void pollAndProcess();
    res.json(RetryPipelineTaskResponse.parse(toTaskResponse(rows[0])));
  } catch (error) {
    req.log.warn({ error }, "Could not retry pipeline task");
    res.status(500).json({ error: "Taak kon niet opnieuw worden gestart." });
  }
});

router.post("/admin/pipeline/tasks/:taskId/cancel", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = CancelPipelineTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Ongeldige taak." });
    return;
  }
  try {
    const rows = await restService<Row[]>(`pipeline_tasks?id=eq.${params.data.taskId}`, {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        status: "failed",
        last_error: "Handmatig geannuleerd door beheerder.",
        locked_until: null,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!rows[0]) {
      res.status(404).json({ error: "Taak niet gevonden." });
      return;
    }
    res.json(CancelPipelineTaskResponse.parse(toTaskResponse(rows[0])));
  } catch (error) {
    req.log.warn({ error }, "Could not cancel pipeline task");
    res.status(500).json({ error: "Taak kon niet worden geannuleerd." });
  }
});

router.get("/admin/subjects/:subjectId/content", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = GetAdminSubjectContentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Ongeldig vak." });
    return;
  }
  try {
    const subjectRows = await restService<Row[]>(
      `crawl_subjects?id=eq.${params.data.subjectId}&select=*`,
    );
    const subjectRow = subjectRows[0];
    if (!subjectRow) {
      res.status(404).json({ error: "Vak niet gevonden." });
      return;
    }
    const chapters = await loadSubjectChapters(params.data.subjectId);
    const contentRows = await restService<Row[]>(
      `study_content?subject_id=eq.${params.data.subjectId}&select=id,chapter_id,content_type,status,version,content`,
    );

    res.json(
      GetAdminSubjectContentResponse.parse({
        subject: {
          id: subjectRow.id as string,
          name: subjectRow.name as string,
          yearLevel: subjectRow.year_level as "havo_vwo_bovenbouw" | "universitair",
          description: (subjectRow.description as string | null) ?? null,
          difficultyLevel: (subjectRow.difficulty_level as string | null) ?? null,
          publishStatus: subjectRow.publish_status as "incomplete" | "ready" | "published",
          chapterCount: (subjectRow.chapter_count as number | null) ?? null,
          chapters: chapters.map((chapter) => ({
            id: chapter.id,
            subjectId: chapter.subjectId,
            position: chapter.position,
            title: chapter.title,
            description: chapter.description,
            isImportant: chapter.isImportant,
            topicTags: chapter.topicTags,
            status: "pending" as const,
          })),
        },
        chapters: chapters.map((chapter) => ({
          chapter: {
            id: chapter.id,
            subjectId: chapter.subjectId,
            position: chapter.position,
            title: chapter.title,
            description: chapter.description,
            isImportant: chapter.isImportant,
            topicTags: chapter.topicTags,
            status: "pending" as const,
          },
          content: contentRows
            .filter((row) => row.chapter_id === chapter.id)
            .map((row) => ({
              id: row.id as string,
              contentType: row.content_type as string,
              status: row.status as "generating" | "ready" | "failed",
              version: Number(row.version ?? 1),
              content: (row.content ?? {}) as Record<string, unknown>,
            })),
        })),
      }),
    );
  } catch (error) {
    req.log.warn({ error }, "Could not load subject content preview");
    res.status(500).json({ error: "Inhoud kon niet worden geladen." });
  }
});

router.post("/admin/subjects/:subjectId/publish", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = PublishSubjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Ongeldig vak." });
    return;
  }
  try {
    const subject = await loadSubject(params.data.subjectId);
    const rows = await restService<Row[]>(
      `crawl_subjects?id=eq.${params.data.subjectId}&select=publish_status`,
    );
    const current = rows[0]?.publish_status as string | undefined;
    if (current !== "ready" && current !== "published") {
      res.status(409).json({
        error: "Dit vak is nog niet klaar om te publiceren. Draai eerst de gereedheidscontrole.",
      });
      return;
    }

    const updated = await restService<Row[]>(`crawl_subjects?id=eq.${params.data.subjectId}`, {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        publish_status: "published",
        updated_at: new Date().toISOString(),
      }),
    });
    const row = updated[0];
    if (!row) throw new Error("Publish returned no row.");

    res.json(
      PublishSubjectResponse.parse({
        id: row.id as string,
        name: row.name as string,
        yearLevel: row.year_level as "havo_vwo_bovenbouw" | "universitair",
        description: (row.description as string | null) ?? subject.description,
        difficultyLevel: (row.difficulty_level as string | null) ?? subject.difficultyLevel,
        publishStatus: row.publish_status as "incomplete" | "ready" | "published",
        chapterCount: (row.chapter_count as number | null) ?? null,
      }),
    );
  } catch (error) {
    req.log.warn({ error }, "Could not publish subject");
    res.status(500).json({ error: "Vak kon niet worden gepubliceerd." });
  }
});

export default router;
