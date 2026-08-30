import { Router, type IRouter } from "express";
import {
  ListMySourceSubjectRequestsResponse,
  ListSourcesQueryParams,
  ListSourcesResponse,
  ReconsiderSourceBody,
  ReconsiderSourceParams,
  RequestSourceSubjectBody,
  RequestSourceSubjectResponse,
} from "@workspace/api-zod";
import { createTask } from "../lib/pipeline-tasks/task-store";
import { pollAndProcess } from "../lib/pipeline-worker";
import { getAuthenticatedUser, rest, restService } from "../lib/supabase";

const router: IRouter = Router();

type Row = Record<string, unknown>;

async function authenticate(header?: string) {
  const user = await getAuthenticatedUser(header);
  return user && header ? { user, token: header } : null;
}

const MAX_RECONSIDERATION_REQUESTS = 2;

function toSubjectRequest(row: Row) {
  const embedded = row.crawl_subjects as Row | Row[] | null | undefined;
  const subject = Array.isArray(embedded) ? embedded[0] : embedded;
  return {
    id: row.id as string,
    subjectId: (row.subject_id as string | null) ?? null,
    subjectName: (subject?.name as string | undefined) ?? null,
    yearLevel: (subject?.year_level as "havo_vwo_bovenbouw" | "universitair" | undefined) ?? null,
    studentId: row.student_id as string,
    status: row.status as "pending" | "approved" | "denied" | "needs_refinement",
    adminNote: (row.admin_note as string | null) ?? null,
    description: (subject?.description as string | null) ?? null,
    emphasis: (subject?.emphasis as string | null) ?? null,
    preferredSourceTypes: (subject?.preferred_source_types as string | null) ?? null,
    creditBudget: (subject?.credit_budget as number | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function toStudentSource(row: Row) {
  return {
    id: row.id as string,
    url: row.url as string,
    title: (row.title as string | null) ?? null,
    type: (row.type as "article" | "book" | "pdf" | "video" | "website" | null) ?? null,
    language: (row.language as string | null) ?? null,
    releaseDate: (row.release_date as string | null) ?? null,
    qualityScore: (row.quality_score as number | null) ?? null,
    aiSummary: (row.ai_summary as string | null) ?? null,
    createdAt: (row.created_at as string | null) ?? null,
  };
}

router.post("/sources/request-subject", async (req, res): Promise<void> => {
  const identity = await authenticate(req.header("authorization"));
  if (!identity) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const input = RequestSourceSubjectBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Vul een geldige vaknaam en niveau in." });
    return;
  }
  try {
    const duplicate = await restService<Row[]>(
      `crawl_subjects?requested_by=eq.${identity.user.id}&name=ilike.${encodeURIComponent(input.data.name)}&select=id`,
    );
    if (duplicate.length > 0) {
      res.status(409).json({ error: "Je hebt dit vak al aangevraagd." });
      return;
    }

    const subjects = await restService<Row[]>("crawl_subjects", {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        name: input.data.name,
        year_level: input.data.year_level,
        description: input.data.description ?? null,
        emphasis: input.data.emphasis ?? null,
        preferred_source_types: input.data.preferred_source_types ?? null,
        credit_budget: input.data.credit_tier,
        status: "pending",
        requested_by: identity.user.id,
      }),
    });
    const subject = subjects[0];
    if (!subject) throw new Error("Subject insert returned no row.");

    const requests = await restService<Row[]>("subject_requests", {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        subject_id: subject.id,
        student_id: identity.user.id,
        status: "pending",
      }),
    });

    // The pipeline triages the request on its own; the worker picks this up
    // within one poll, so the student does not wait on the AI call here.
    await createTask({
      subjectId: subject.id as string,
      taskType: "triage",
      status: "ready",
    }).catch((error) => req.log.warn({ error }, "Could not queue triage task"));
    void pollAndProcess();

    res.status(201).json(
      RequestSourceSubjectResponse.parse({
        requestId: requests[0]?.id as string,
        subjectId: subject.id as string,
      }),
    );
  } catch (error) {
    req.log.warn({ error }, "Could not create subject request");
    res.status(500).json({ error: "Je aanvraag kon niet worden verstuurd." });
  }
});

router.get("/sources/subject-requests", async (req, res): Promise<void> => {
  const identity = await authenticate(req.header("authorization"));
  if (!identity) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const rows = await restService<Row[]>(
      `subject_requests?student_id=eq.${identity.user.id}&select=*,crawl_subjects(name,year_level,description,emphasis,preferred_source_types,credit_budget)&order=created_at.desc`,
    );
    res.json(ListMySourceSubjectRequestsResponse.parse(rows.map(toSubjectRequest)));
  } catch (error) {
    req.log.warn({ error }, "Could not list subject requests");
    res.status(500).json({ error: "Je aanvragen konden niet worden geladen." });
  }
});

router.post("/sources/:sourceId/reconsider", async (req, res): Promise<void> => {
  const identity = await authenticate(req.header("authorization"));
  if (!identity) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = ReconsiderSourceParams.safeParse(req.params);
  const input = ReconsiderSourceBody.safeParse(req.body);
  if (!params.success || !input.success) {
    res.status(400).json({ error: "Ongeldig verzoek." });
    return;
  }
  try {
    const sources = await restService<Row[]>(`sources?id=eq.${params.data.sourceId}&select=id,status`);
    const source = sources[0];
    if (!source) {
      res.status(404).json({ error: "Bron niet gevonden." });
      return;
    }
    if (source.status !== "declined") {
      res.status(409).json({ error: "Deze bron staat niet open voor heroverweging." });
      return;
    }

    const existingRequests = await restService<Row[]>(
      `source_reconsideration_requests?student_id=eq.${identity.user.id}&select=id`,
    );
    if (existingRequests.length >= MAX_RECONSIDERATION_REQUESTS) {
      res.status(429).json({ error: "Je hebt het maximum aantal heroverwegingsverzoeken bereikt." });
      return;
    }

    await restService<Row[]>("source_reconsideration_requests", {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        source_id: params.data.sourceId,
        student_id: identity.user.id,
        reason: input.data.reason ?? null,
        status: "pending",
      }),
    });
    await restService<Row[]>(`sources?id=eq.${params.data.sourceId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "pending", updated_at: new Date().toISOString() }),
    });

    res.sendStatus(201);
  } catch (error) {
    req.log.warn({ error }, "Could not submit reconsideration request");
    res.status(500).json({ error: "Je verzoek kon niet worden verstuurd." });
  }
});

router.get("/sources", async (req, res): Promise<void> => {
  const identity = await authenticate(req.header("authorization"));
  if (!identity) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const query = ListSourcesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Ongeldige zoekopdracht." });
    return;
  }
  try {
    const subjectId = query.data.subject;
    const path = subjectId
      ? `sources?status=eq.accepted&select=id,url,title,type,language,release_date,quality_score,ai_summary,created_at,source_subjects!inner(subject_id)&source_subjects.subject_id=eq.${encodeURIComponent(subjectId)}&order=created_at.desc`
      : "sources?status=eq.accepted&select=id,url,title,type,language,release_date,quality_score,ai_summary,created_at&order=created_at.desc";
    const rows = await rest<Row[]>(identity.token, path);
    res.json(ListSourcesResponse.parse(rows.map(toStudentSource)));
  } catch (error) {
    req.log.warn({ error }, "Could not list sources");
    res.status(500).json({ error: "Bronnen konden niet worden geladen." });
  }
});

export default router;
