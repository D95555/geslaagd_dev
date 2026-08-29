import { Router, type IRouter, type Request } from "express";
import {
  GetVerkennerObjectParams,
  GetVerkennerObjectResponse,
  GetVerkennerSubjectParams,
  GetVerkennerSubjectResponse,
  ListVerkennerSubjectsQueryParams,
  ListVerkennerSubjectsResponse,
  LookupVerkennerObjectQueryParams,
  LookupVerkennerObjectResponse,
  UpdateVerkennerChapterTitleBody,
  UpdateVerkennerChapterTitleParams,
  UpdateVerkennerChapterTitleResponse,
  UpdateVerkennerSubjectTitleBody,
  UpdateVerkennerSubjectTitleParams,
  UpdateVerkennerSubjectTitleResponse,
} from "@workspace/api-zod";
import { getAuthenticatedUser, restService } from "../lib/supabase";
import { loadTaskLogs } from "../lib/pipeline-tasks/task-log";

const router: IRouter = Router();

type Row = Record<string, unknown>;

async function admin(req: Request) {
  const token = req.header("authorization");
  const user = await getAuthenticatedUser(token);
  return user?.isAdmin ? { user, token: token! } : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CONTENT_TYPE_TO_TASK_TYPE: Record<string, string> = {
  summary: "summary_generation",
  key_notes: "key_notes_generation",
  exercise_bank: "exercise_generation",
  exam: "exam_generation",
  exam_rubric: "exam_generation",
  diagnostic_questionnaire: "questionnaire_generation",
};

function toSubjectSummary(row: Row) {
  return {
    id: row.id as string,
    name: row.name as string,
    yearLevel: row.year_level as "havo_vwo_bovenbouw" | "universitair",
    status: row.status as "pending" | "active" | "denied" | "needs_refinement",
    publishStatus: (row.publish_status as "incomplete" | "ready" | "published" | null) ?? "incomplete",
    chapterCount: (row.chapter_count as number | null) ?? null,
    createdAt: row.created_at as string,
  };
}

function toCrawlSummary(row: Row) {
  return {
    id: row.id as string,
    subjectId: row.subject_id as string,
    subjectName: "",
    status: row.status as "running" | "complete" | "failed",
    sourcesFound: (row.sources_found as number | null) ?? null,
    sourcesAccepted: (row.sources_accepted as number | null) ?? null,
    creditsUsed: (row.credits_used as number | null) ?? null,
    efficiencyRatio: (row.efficiency_ratio as number | null) ?? null,
    createdAt: row.created_at as string,
    completedAt: (row.completed_at as string | null) ?? null,
  };
}

function toTaskSummary(row: Row) {
  return {
    id: row.id as string,
    taskType: row.task_type as string,
    status: row.status as "waiting" | "ready" | "running" | "done" | "failed",
    summary: (row.summary as string | null) ?? null,
  };
}

function toContentSummary(row: Row) {
  return {
    id: row.id as string,
    contentType: row.content_type as string,
    version: Number(row.version ?? 1),
    status: row.status as "generating" | "ready" | "failed",
  };
}

router.get("/admin/verkenner/subjects", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const query = ListVerkennerSubjectsQueryParams.safeParse(req.query);
  const q = query.success ? query.data.q?.trim() : undefined;
  try {
    let filter = "";
    if (q) {
      const escaped = q.replace(/[,()]/g, "");
      filter = UUID_RE.test(q)
        ? `&or=(name.ilike.*${encodeURIComponent(escaped)}*,id.eq.${q})`
        : `&name=ilike.*${encodeURIComponent(escaped)}*`;
    }
    const rows = await restService<Row[]>(
      `crawl_subjects?select=*&order=created_at.desc${filter}`,
    );
    res.json(ListVerkennerSubjectsResponse.parse({ subjects: rows.map(toSubjectSummary) }));
  } catch (error) {
    req.log.warn({ error }, "Could not search Verkenner subjects");
    res.status(500).json({ error: "Vakken konden niet worden geladen." });
  }
});

router.get("/admin/verkenner/subjects/:subjectId", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = GetVerkennerSubjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Ongeldig vak." });
    return;
  }
  const { subjectId } = params.data;
  try {
    const subjects = await restService<Row[]>(`crawl_subjects?id=eq.${subjectId}&select=*`);
    const subjectRow = subjects[0];
    if (!subjectRow) {
      res.status(404).json({ error: "Vak niet gevonden." });
      return;
    }

    const [triageTasks, requests, chapters, contentRows, sourceCounts, crawls, tasks] = await Promise.all([
      restService<Row[]>(
        `pipeline_tasks?subject_id=eq.${subjectId}&task_type=eq.triage&select=id,result,summary&limit=1`,
      ),
      restService<Row[]>(
        `subject_requests?subject_id=eq.${subjectId}&select=status,admin_note&order=created_at.desc&limit=1`,
      ),
      restService<Row[]>(`chapters?subject_id=eq.${subjectId}&select=*&order=position.asc`),
      restService<Row[]>(
        `study_content?subject_id=eq.${subjectId}&select=id,chapter_id,content_type,version,status`,
      ),
      restService<Row[]>(
        `chapter_sources?chapter_id=in.(${
          (await restService<Row[]>(`chapters?subject_id=eq.${subjectId}&select=id`))
            .map((c) => c.id as string)
            .join(",") || "00000000-0000-0000-0000-000000000000"
        })&select=chapter_id`,
      ),
      restService<Row[]>(`crawls?subject_id=eq.${subjectId}&select=*&order=created_at.desc`),
      restService<Row[]>(
        `pipeline_tasks?subject_id=eq.${subjectId}&select=id,task_type,status,summary&order=created_at.asc`,
      ),
    ]);

    const triageTask = triageTasks[0];
    const triageResult = (triageTask?.result as Record<string, unknown> | null) ?? null;
    const request = requests[0];
    const decision =
      triageTask || request
        ? {
            taskId: (triageTask?.id as string | null) ?? null,
            approved: (triageResult?.approved as boolean | null) ?? null,
            reason: (triageResult?.reason as string | null) ?? null,
            suggestions: (triageResult?.suggestions as string | null) ?? null,
            model: (triageResult?.model as string | null) ?? null,
            summary: (triageTask?.summary as string | null) ?? null,
            requestStatus: (request?.status as string | null) ?? null,
            requestAdminNote: (request?.admin_note as string | null) ?? null,
          }
        : null;

    const sourceCountByChapter = new Map<string, number>();
    for (const row of sourceCounts) {
      const chapterId = row.chapter_id as string;
      sourceCountByChapter.set(chapterId, (sourceCountByChapter.get(chapterId) ?? 0) + 1);
    }

    const chapterSummaries = chapters.map((chapter) => ({
      chapter: {
        id: chapter.id as string,
        subjectId: chapter.subject_id as string,
        position: Number(chapter.position),
        title: chapter.title as string,
        description: (chapter.description as string | null) ?? "",
        isImportant: Boolean(chapter.is_important),
        topicTags: (chapter.topic_tags as string[] | null) ?? [],
        status: chapter.status as "pending" | "ready",
      },
      content: contentRows
        .filter((row) => row.chapter_id === chapter.id)
        .map(toContentSummary),
      sourceCount: sourceCountByChapter.get(chapter.id as string) ?? 0,
    }));

    const subjectContent = contentRows.filter((row) => row.chapter_id == null).map(toContentSummary);

    res.json(
      GetVerkennerSubjectResponse.parse({
        subject: {
          id: subjectRow.id as string,
          name: subjectRow.name as string,
          yearLevel: subjectRow.year_level as "havo_vwo_bovenbouw" | "universitair",
          status: subjectRow.status as "pending" | "active" | "denied" | "needs_refinement",
          publishStatus: (subjectRow.publish_status as "incomplete" | "ready" | "published" | null) ?? "incomplete",
          description: (subjectRow.description as string | null) ?? null,
          difficultyLevel: (subjectRow.difficulty_level as string | null) ?? null,
          adminNote: (subjectRow.admin_note as string | null) ?? null,
          requestedBy: (subjectRow.requested_by as string | null) ?? null,
        },
        decision,
        chapters: chapterSummaries,
        subjectContent,
        crawls: crawls.map((row) => ({ ...toCrawlSummary(row), subjectName: subjectRow.name as string })),
        tasks: tasks.map(toTaskSummary),
      }),
    );
  } catch (error) {
    req.log.warn({ error }, "Could not load Verkenner subject detail");
    res.status(500).json({ error: "Vakdetail kon niet worden geladen." });
  }
});

function toLogEntry(row: Row) {
  return {
    id: String(row.id),
    taskId: row.task_id as string,
    chapterId: (row.chapter_id as string | null) ?? null,
    level: row.level as "info" | "warn" | "error",
    phase: (row.phase as string | null) ?? "",
    message: row.message as string,
    data: (row.data as Record<string, unknown> | null) ?? null,
    createdAt: row.created_at as string,
  };
}

router.get("/admin/verkenner/objects/:type/:id", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = GetVerkennerObjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Ongeldig object." });
    return;
  }
  const { type, id } = params.data;
  try {
    if (type === "chapter") {
      const rows = await restService<Row[]>(`chapters?id=eq.${id}&select=*`);
      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: "Hoofdstuk niet gevonden." });
        return;
      }
      const logs = await restService<Row[]>(
        `pipeline_task_logs?chapter_id=eq.${id}&select=*&order=id.asc&limit=500`,
      );
      res.json(
        GetVerkennerObjectResponse.parse({
          type,
          id,
          chapterTitle: row.title as string,
          chapterDescription: (row.description as string | null) ?? "",
          chapterIsImportant: Boolean(row.is_important),
          chapterTopicTags: (row.topic_tags as string[] | null) ?? [],
          chapterStatus: row.status as "pending" | "ready",
          logs: logs.map(toLogEntry),
        }),
      );
      return;
    }

    if (type === "source") {
      const rows = await restService<Row[]>(`sources?id=eq.${id}&select=*`);
      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: "Bron niet gevonden." });
        return;
      }
      const [chapterLinks, subjectLinks] = await Promise.all([
        restService<Row[]>(`chapter_sources?source_id=eq.${id}&select=chapters(id,title)`),
        restService<Row[]>(`source_subjects?source_id=eq.${id}&select=crawl_subjects(id,name)`),
      ]);
      res.json(
        GetVerkennerObjectResponse.parse({
          type,
          id,
          sourceUrl: row.url as string,
          sourceTitle: (row.title as string | null) ?? null,
          sourceType: (row.type as string | null) ?? null,
          sourceQualityScore: (row.quality_score as number | null) ?? null,
          sourceAiSummary: (row.ai_summary as string | null) ?? null,
          sourceStatus: row.status as "pending" | "accepted" | "declined",
          linkedChapters: chapterLinks
            .map((link) => link.chapters as Row | null)
            .filter((chapter): chapter is Row => Boolean(chapter))
            .map((chapter) => ({ id: chapter.id as string, name: chapter.title as string })),
          linkedSubjects: subjectLinks
            .map((link) => link.crawl_subjects as Row | null)
            .filter((subject): subject is Row => Boolean(subject))
            .map((subject) => ({ id: subject.id as string, name: subject.name as string })),
          logs: [],
        }),
      );
      return;
    }

    if (type === "crawl") {
      const rows = await restService<Row[]>(`crawls?id=eq.${id}&select=*`);
      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: "Crawl niet gevonden." });
        return;
      }
      res.json(
        GetVerkennerObjectResponse.parse({
          type,
          id,
          crawl: {
            ...toCrawlSummary(row),
            subjectName: "",
            promptUsed: (row.prompt_used as string | null) ?? null,
            errorDetail: (row.error_detail as string | null) ?? null,
            sources: [],
          },
          logs: [],
        }),
      );
      return;
    }

    if (type === "content") {
      const rows = await restService<Row[]>(`study_content?id=eq.${id}&select=*`);
      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: "Inhoud niet gevonden." });
        return;
      }
      const contentType = row.content_type as string;
      const taskType = CONTENT_TYPE_TO_TASK_TYPE[contentType];
      let generatingTask: {
        id: string;
        taskType: string;
        status: "waiting" | "ready" | "running" | "done" | "failed";
        summary: string | null;
        result: Record<string, unknown> | null;
        lastError: string | null;
      } | null = null;
      let logs: ReturnType<typeof toLogEntry>[] = [];
      if (taskType) {
        const chapterFilter = row.chapter_id ? `chapter_id.eq.${row.chapter_id}` : "chapter_id.is.null";
        const taskRows = await restService<Row[]>(
          `pipeline_tasks?subject_id=eq.${row.subject_id}&${chapterFilter}&task_type=eq.${taskType}&select=*&limit=1`,
        );
        const taskRow = taskRows[0];
        if (taskRow) {
          generatingTask = {
            id: taskRow.id as string,
            taskType: taskRow.task_type as string,
            status: taskRow.status as "waiting" | "ready" | "running" | "done" | "failed",
            summary: (taskRow.summary as string | null) ?? null,
            result: (taskRow.result as Record<string, unknown> | null) ?? null,
            lastError: (taskRow.last_error as string | null) ?? null,
          };
          const rawLogs = await loadTaskLogs(taskRow.id as string);
          logs = rawLogs.map((entry) => ({
            id: entry.id,
            taskId: entry.taskId,
            chapterId: entry.chapterId,
            level: entry.level,
            phase: entry.phase,
            message: entry.message,
            data: entry.data,
            createdAt: entry.createdAt,
          }));
        }
      }
      res.json(
        GetVerkennerObjectResponse.parse({
          type,
          id,
          contentType,
          contentVersion: Number(row.version ?? 1),
          contentStatus: row.status as "generating" | "ready" | "failed",
          content: (row.content as Record<string, unknown> | null) ?? {},
          generatedByModel: (row.generated_by_model as string | null) ?? null,
          generatingTask,
          logs,
        }),
      );
      return;
    }

    if (type === "task") {
      const rows = await restService<Row[]>(`pipeline_tasks?id=eq.${id}&select=*`);
      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: "Taak niet gevonden." });
        return;
      }
      const logs = await loadTaskLogs(id);
      res.json(
        GetVerkennerObjectResponse.parse({
          type,
          id,
          task: {
            id: row.id as string,
            taskType: row.task_type as string,
            status: row.status as "waiting" | "ready" | "running" | "done" | "failed",
            summary: (row.summary as string | null) ?? null,
            result: (row.result as Record<string, unknown> | null) ?? null,
            lastError: (row.last_error as string | null) ?? null,
          },
          logs: logs.map((entry) => ({
            id: entry.id,
            taskId: entry.taskId,
            chapterId: entry.chapterId,
            level: entry.level,
            phase: entry.phase,
            message: entry.message,
            data: entry.data,
            createdAt: entry.createdAt,
          })),
        }),
      );
      return;
    }

    res.status(404).json({ error: "Onbekend objecttype." });
  } catch (error) {
    req.log.warn({ error, type: req.params.type }, "Could not load Verkenner object detail");
    res.status(500).json({ error: "Object kon niet worden geladen." });
  }
});

export default router;
