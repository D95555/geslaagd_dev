import { Router, type IRouter } from "express";
import {
  GetChapterContentParams,
  GetChapterContentResponse,
  GetSubjectDetailParams,
  GetSubjectDetailResponse,
  ListSubjectsResponse,
  MarkChapterReadParams,
  SelectSubjectParams,
} from "@workspace/api-zod";
import { markSummaryRead } from "../lib/progress";
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
    yearLevel: row.year_level as "vwo" | "bachelor1",
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
    res.json(
      GetSubjectDetailResponse.parse({
        ...toSubjectSummary(subject),
        chapters: chapters.map(toChapter),
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
