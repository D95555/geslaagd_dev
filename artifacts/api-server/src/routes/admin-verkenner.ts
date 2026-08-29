import { Router, type IRouter, type Request } from "express";
import {
  GetVerkennerObjectParams,
  GetVerkennerSubjectParams,
  ListVerkennerSubjectsQueryParams,
  ListVerkennerSubjectsResponse,
  LookupVerkennerObjectQueryParams,
  UpdateVerkennerChapterTitleBody,
  UpdateVerkennerChapterTitleParams,
  UpdateVerkennerSubjectTitleBody,
  UpdateVerkennerSubjectTitleParams,
  VerkennerLookupResponse,
  VerkennerObjectDetailResponse,
  VerkennerSubjectDetailResponse,
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

export default router;
