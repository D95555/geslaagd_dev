import { Router, type IRouter } from "express";
import {
  GetChapterContentParams,
  GetChapterContentResponse,
  GetSubjectDetailParams,
  GetSubjectDetailResponse,
  ListSelectedSubjectsResponse,
  ListSubjectsResponse,
  MarkChapterReadParams,
  SelectSubjectParams,
} from "@workspace/api-zod";
import { loadSubjectChapters } from "../lib/pipeline-tasks/context";
import {
  computeChapterProgress,
  computeSubjectProgress,
  loadProgressForChapters,
  markSummaryRead,
} from "../lib/progress";
import { keyNotesSchema, summarySchema } from "../lib/study-content";
import { getAuthenticatedUser, restService } from "../lib/supabase";

const router: IRouter = Router();

type Row = Record<string, unknown>;

async function authenticate(header?: string) {
  const user = await getAuthenticatedUser(header);
  return user && header ? { user, token: header } : null;
}

function toSubjectSummary(row: Row) {
  return {
    id: row.id as string,
    name: row.name as string,
    yearLevel: row.year_level as "havo_vwo_bovenbouw" | "universitair",
    description: (row.description as string | null) ?? null,
    difficultyLevel: (row.difficulty_level as string | null) ?? null,
    publishStatus: row.publish_status as "incomplete" | "ready" | "published",
    chapterCount: (row.chapter_count as number | null) ?? null,
  };
}

function toChapter(row: Row) {
  return {
    id: row.id as string,
    subjectId: row.subject_id as string,
    position: Number(row.position),
    title: row.title as string,
    description: (row.description as string | null) ?? "",
    isImportant: Boolean(row.is_important),
    topicTags: (row.topic_tags as string[] | null) ?? [],
    status: row.status as "pending" | "ready",
  };
}

/** Students only ever see subjects an admin has published. */
async function loadPublishedSubject(subjectId: string): Promise<Row | null> {
  const rows = await restService<Row[]>(
    `crawl_subjects?id=eq.${subjectId}&publish_status=eq.published&select=*`,
  );
  return rows[0] ?? null;
}

router.get("/subjects", async (req, res): Promise<void> => {
  const identity = await authenticate(req.header("authorization"));
  if (!identity) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const rows = await restService<Row[]>(
      "crawl_subjects?publish_status=eq.published&select=*&order=name.asc",
    );
    res.json(ListSubjectsResponse.parse(rows.map(toSubjectSummary)));
  } catch (error) {
    req.log.warn({ error }, "Could not list subjects");
    res.status(500).json({ error: "Vakken konden niet worden geladen." });
  }
});

/** Overall completion (0-100) for one subject, averaged over its chapters. */
async function subjectProgressFor(userId: string, subjectId: string): Promise<number> {
  const chapters = await loadSubjectChapters(subjectId);
  const progress = await loadProgressForChapters(
    userId,
    chapters.map((chapter) => chapter.id),
  );
  const perChapter = chapters.map((chapter) => {
    const row = progress.get(chapter.id);
    return {
      progress: computeChapterProgress({
        summaryRead: row?.summaryRead ?? false,
        exerciseBestScore: row?.exerciseBestScore ?? null,
        examBestScore: row?.examBestScore ?? null,
        hasExam: chapter.isImportant,
      }),
    };
  });
  return computeSubjectProgress(perChapter);
}

// Registered before `/subjects/:subjectId` so "selected" is not read as an id.
router.get("/subjects/selected", async (req, res): Promise<void> => {
  const identity = await authenticate(req.header("authorization"));
  if (!identity) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const selections = await restService<Row[]>(
      `student_selected_subjects?user_id=eq.${identity.user.id}&select=subject_id,created_at&order=created_at.asc`,
    );
    const subjectIds = selections.map((row) => row.subject_id as string);
    if (subjectIds.length === 0) {
      res.json([]);
      return;
    }
    // Only surface subjects that are still published; a subject an admin has
    // unpublished simply drops out of the student's list.
    const subjects = await restService<Row[]>(
      `crawl_subjects?id=in.(${subjectIds.join(",")})&publish_status=eq.published&select=*`,
    );
    const byId = new Map(subjects.map((row) => [row.id as string, row]));
    const ordered = subjectIds
      .map((id) => byId.get(id))
      .filter((row): row is Row => row !== undefined);

    const result = await Promise.all(
      ordered.map(async (row) => ({
        ...toSubjectSummary(row),
        subjectProgress: await subjectProgressFor(identity.user.id, row.id as string),
      })),
    );
    res.json(ListSelectedSubjectsResponse.parse(result));
  } catch (error) {
    req.log.warn({ error }, "Could not list selected subjects");
    res.status(500).json({ error: "Jouw vakken konden niet worden geladen." });
  }
});

router.get("/subjects/:subjectId", async (req, res): Promise<void> => {
  const identity = await authenticate(req.header("authorization"));
  if (!identity) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = GetSubjectDetailParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Ongeldig vak." });
    return;
  }
  try {
    const subject = await loadPublishedSubject(params.data.subjectId);
    if (!subject) {
      res.status(404).json({ error: "Vak niet gevonden." });
      return;
    }
    const chapters = await restService<Row[]>(
      `chapters?subject_id=eq.${params.data.subjectId}&select=*&order=position.asc`,
    );
    // "Sources last checked" = the most recent crawl for this subject. Lets a
    // student see how fresh the material is instead of it being silently stale.
    const latestCrawl = await restService<Row[]>(
      `crawls?subject_id=eq.${params.data.subjectId}&select=created_at&order=created_at.desc&limit=1`,
    );
    res.json(
      GetSubjectDetailResponse.parse({
        ...toSubjectSummary(subject),
        chapters: chapters.map(toChapter),
        sourcesCheckedAt: (latestCrawl[0]?.created_at as string | undefined) ?? null,
      }),
    );
  } catch (error) {
    req.log.warn({ error }, "Could not load subject detail");
    res.status(500).json({ error: "Vak kon niet worden geladen." });
  }
});

router.post("/subjects/:subjectId/select", async (req, res): Promise<void> => {
  const identity = await authenticate(req.header("authorization"));
  if (!identity) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = SelectSubjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Ongeldig vak." });
    return;
  }
  try {
    const subject = await loadPublishedSubject(params.data.subjectId);
    if (!subject) {
      res.status(404).json({ error: "Vak niet gevonden." });
      return;
    }
    await restService<Row[]>("student_selected_subjects?on_conflict=user_id,subject_id", {
      method: "POST",
      headers: { prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({
        user_id: identity.user.id,
        subject_id: params.data.subjectId,
      }),
    });
    res.sendStatus(201);
  } catch (error) {
    req.log.warn({ error }, "Could not select subject");
    res.status(500).json({ error: "Vak kon niet worden toegevoegd." });
  }
});

router.get(
  "/subjects/:subjectId/chapters/:chapterId/content",
  async (req, res): Promise<void> => {
    const identity = await authenticate(req.header("authorization"));
    if (!identity) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const params = GetChapterContentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Ongeldig hoofdstuk." });
      return;
    }
    try {
      const subject = await loadPublishedSubject(params.data.subjectId);
      if (!subject) {
        res.status(404).json({ error: "Vak niet gevonden." });
        return;
      }
      const rows = await restService<Row[]>(
        `study_content?chapter_id=eq.${params.data.chapterId}&status=eq.ready` +
          "&content_type=in.(summary,key_notes)&select=content_type,content",
      );

      const summaryRow = rows.find((row) => row.content_type === "summary");
      const keyNotesRow = rows.find((row) => row.content_type === "key_notes");
      const summary = summaryRow ? summarySchema.safeParse(summaryRow.content) : null;
      const keyNotes = keyNotesRow ? keyNotesSchema.safeParse(keyNotesRow.content) : null;

      res.json(
        GetChapterContentResponse.parse({
          summary: summary?.success ? summary.data : null,
          keyNotes: keyNotes?.success ? keyNotes.data : null,
        }),
      );
    } catch (error) {
      req.log.warn({ error }, "Could not load chapter content");
      res.status(500).json({ error: "Hoofdstuk kon niet worden geladen." });
    }
  },
);

router.post(
  "/subjects/:subjectId/chapters/:chapterId/mark-read",
  async (req, res): Promise<void> => {
    const identity = await authenticate(req.header("authorization"));
    if (!identity) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const params = MarkChapterReadParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Ongeldig hoofdstuk." });
      return;
    }
    try {
      await markSummaryRead(identity.user.id, params.data.chapterId);
      res.sendStatus(200);
    } catch (error) {
      req.log.warn({ error }, "Could not mark chapter as read");
      res.status(500).json({ error: "Voortgang kon niet worden opgeslagen." });
    }
  },
);

export default router;
