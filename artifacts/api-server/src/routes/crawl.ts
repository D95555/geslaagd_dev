import { Router, type IRouter, type Request } from "express";
import {
  AcceptPendingSourceParams,
  ApproveCrawlSubjectRequestParams,
  CreateCrawlSubjectBody,
  CreateCrawlSubjectResponse,
  DeclinePendingSourceBody,
  DeclinePendingSourceParams,
  DeclinePendingSourceResponse,
  DenyCrawlSubjectRequestBody,
  DenyCrawlSubjectRequestParams,
  GetCrawlDetailParams,
  GetCrawlDetailResponse,
  ListCrawlSubjectRequestsResponse,
  ListCrawlSubjectsResponse,
  ListCrawlsResponse,
  ListPendingSourcesResponse,
  RequestCrawlSubjectRefinementBody,
  RequestCrawlSubjectRefinementParams,
  RunCrawlBody,
  RunCrawlResponse,
} from "@workspace/api-zod";
import { getAuthenticatedUser, restService } from "../lib/supabase";
import { rescoreSource, runCrawl } from "../lib/source-pipeline";

const router: IRouter = Router();

type Row = Record<string, unknown>;

async function admin(req: Request) {
  const token = req.header("authorization");
  const user = await getAuthenticatedUser(token);
  return user?.isAdmin ? { user, token: token! } : null;
}

function toSubject(row: Row) {
  return {
    id: row.id as string,
    name: row.name as string,
    yearLevel: row.year_level as "vwo" | "bachelor1",
    status: row.status as "pending" | "active" | "denied" | "needs_refinement",
    requestedBy: (row.requested_by as string | null) ?? null,
    approvedBy: (row.approved_by as string | null) ?? null,
    adminNote: (row.admin_note as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function toSubjectRequest(row: Row) {
  const embedded = row.crawl_subjects as Row | Row[] | null | undefined;
  const subject = Array.isArray(embedded) ? embedded[0] : embedded;
  return {
    id: row.id as string,
    subjectId: (row.subject_id as string | null) ?? null,
    subjectName: (subject?.name as string | undefined) ?? null,
    yearLevel: (subject?.year_level as "vwo" | "bachelor1" | undefined) ?? null,
    studentId: row.student_id as string,
    status: row.status as "pending" | "approved" | "denied" | "needs_refinement",
    adminNote: (row.admin_note as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function toCrawlSummary(row: Row) {
  const embedded = row.crawl_subjects as Row | Row[] | null | undefined;
  const subject = Array.isArray(embedded) ? embedded[0] : embedded;
  return {
    id: row.id as string,
    subjectId: row.subject_id as string,
    subjectName: (subject?.name as string | undefined) ?? "",
    status: row.status as "running" | "complete" | "failed",
    sourcesFound: (row.sources_found as number | null) ?? null,
    sourcesAccepted: (row.sources_accepted as number | null) ?? null,
    creditsUsed: (row.credits_used as number | null) ?? null,
    efficiencyRatio: (row.efficiency_ratio as number | null) ?? null,
    createdAt: row.created_at as string,
    completedAt: (row.completed_at as string | null) ?? null,
  };
}

function toSource(row: Row) {
  return {
    id: row.id as string,
    url: row.url as string,
    title: (row.title as string | null) ?? null,
    type: (row.type as "article" | "book" | "pdf" | "video" | "website" | null) ?? null,
    qualityScore: (row.quality_score as number | null) ?? null,
    confidenceScore: (row.confidence_score as number | null) ?? null,
    aiSummary: (row.ai_summary as string | null) ?? null,
    status: row.status as "pending" | "accepted" | "declined",
    declineReason: (row.decline_reason as string | null) ?? null,
    createdAt: (row.created_at as string | null) ?? null,
  };
}

// ─── Subjects ───────────────────────────────────────────────────────────────

router.post("/admin/crawl/subjects", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const input = CreateCrawlSubjectBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Invalid subject." });
    return;
  }
  try {
    const rows = await restService<Row[]>("crawl_subjects", {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        name: input.data.name,
        year_level: input.data.year_level,
        status: "active",
        approved_by: identity.user.id,
      }),
    });
    res.status(201).json(CreateCrawlSubjectResponse.parse(toSubject(rows[0])));
  } catch (error) {
    req.log.warn({ error }, "Could not create crawl subject");
    res.status(500).json({ error: "Could not create subject." });
  }
});

router.get("/admin/crawl/subjects", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const rows = await restService<Row[]>("crawl_subjects?select=*&order=created_at.desc");
    res.json(ListCrawlSubjectsResponse.parse(rows.map(toSubject)));
  } catch (error) {
    req.log.warn({ error }, "Could not list crawl subjects");
    res.status(500).json({ error: "Could not load subjects." });
  }
});

router.get("/admin/crawl/subject-requests", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const rows = await restService<Row[]>(
      "subject_requests?select=*,crawl_subjects(name,year_level)&status=eq.pending&order=created_at.desc",
    );
    res.json(ListCrawlSubjectRequestsResponse.parse(rows.map(toSubjectRequest)));
  } catch (error) {
    req.log.warn({ error }, "Could not list subject requests");
    res.status(500).json({ error: "Could not load subject requests." });
  }
});

router.post("/admin/crawl/subject-requests/:requestId/approve", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = ApproveCrawlSubjectRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid request." });
    return;
  }
  try {
    const requests = await restService<Row[]>(
      `subject_requests?id=eq.${params.data.requestId}&select=id,subject_id`,
    );
    const request = requests[0];
    if (!request?.subject_id) {
      res.status(404).json({ error: "Subject request not found." });
      return;
    }
    await restService<Row[]>(`subject_requests?id=eq.${params.data.requestId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "approved" }),
    });
    await restService<Row[]>(`crawl_subjects?id=eq.${request.subject_id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active", approved_by: identity.user.id }),
    });
    res.sendStatus(200);
  } catch (error) {
    req.log.warn({ error }, "Could not approve subject request");
    res.status(500).json({ error: "Could not approve subject request." });
  }
});

router.post("/admin/crawl/subject-requests/:requestId/deny", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = DenyCrawlSubjectRequestParams.safeParse(req.params);
  const input = DenyCrawlSubjectRequestBody.safeParse(req.body);
  if (!params.success || !input.success) {
    res.status(400).json({ error: "adminNote is required." });
    return;
  }
  try {
    const requests = await restService<Row[]>(
      `subject_requests?id=eq.${params.data.requestId}&select=id,subject_id`,
    );
    const request = requests[0];
    if (!request?.subject_id) {
      res.status(404).json({ error: "Subject request not found." });
      return;
    }
    await restService<Row[]>(`subject_requests?id=eq.${params.data.requestId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "denied", admin_note: input.data.adminNote }),
    });
    await restService<Row[]>(`crawl_subjects?id=eq.${request.subject_id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "denied", admin_note: input.data.adminNote }),
    });
    res.sendStatus(200);
  } catch (error) {
    req.log.warn({ error }, "Could not deny subject request");
    res.status(500).json({ error: "Could not deny subject request." });
  }
});

router.post("/admin/crawl/subject-requests/:requestId/request-refinement", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = RequestCrawlSubjectRefinementParams.safeParse(req.params);
  const input = RequestCrawlSubjectRefinementBody.safeParse(req.body);
  if (!params.success || !input.success) {
    res.status(400).json({ error: "adminNote is required." });
    return;
  }
  try {
    const requests = await restService<Row[]>(
      `subject_requests?id=eq.${params.data.requestId}&select=id,subject_id`,
    );
    const request = requests[0];
    if (!request?.subject_id) {
      res.status(404).json({ error: "Subject request not found." });
      return;
    }
    await restService<Row[]>(`subject_requests?id=eq.${params.data.requestId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "needs_refinement", admin_note: input.data.adminNote }),
    });
    await restService<Row[]>(`crawl_subjects?id=eq.${request.subject_id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "needs_refinement", admin_note: input.data.adminNote }),
    });
    res.sendStatus(200);
  } catch (error) {
    req.log.warn({ error }, "Could not request refinement");
    res.status(500).json({ error: "Could not request refinement." });
  }
});

// ─── Crawls ─────────────────────────────────────────────────────────────────

router.post("/admin/crawl/run", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const input = RunCrawlBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "subjectId is required." });
    return;
  }
  try {
    const subjects = await restService<Row[]>(
      `crawl_subjects?id=eq.${input.data.subjectId}&select=id,name,year_level,status`,
    );
    const subject = subjects[0];
    if (!subject) {
      res.status(404).json({ error: "Subject not found." });
      return;
    }
    if (subject.status !== "active") {
      res.status(409).json({ error: "Subject is not active." });
      return;
    }

    const result = await runCrawl({
      subject: {
        id: subject.id as string,
        name: subject.name as string,
        yearLevel: subject.year_level as string,
      },
      triggeredBy: identity.user.id,
    });
    res.json(RunCrawlResponse.parse(result));
  } catch (error) {
    req.log.warn({ error }, "Could not run crawl");
    res.status(500).json({ error: "Could not run crawl." });
  }
});

router.get("/admin/crawl/crawls", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const rows = await restService<Row[]>(
      "crawls?select=*,crawl_subjects(name)&order=created_at.desc",
    );
    res.json(ListCrawlsResponse.parse(rows.map(toCrawlSummary)));
  } catch (error) {
    req.log.warn({ error }, "Could not list crawls");
    res.status(500).json({ error: "Could not load crawls." });
  }
});

router.get("/admin/crawl/crawls/:crawlId", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = GetCrawlDetailParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid crawl." });
    return;
  }
  try {
    const crawls = await restService<Row[]>(
      `crawls?id=eq.${params.data.crawlId}&select=*,crawl_subjects(name)`,
    );
    const crawl = crawls[0];
    if (!crawl) {
      res.status(404).json({ error: "Crawl not found." });
      return;
    }
    const sources = await restService<Row[]>(
      `sources?first_crawl_id=eq.${params.data.crawlId}&select=*&order=created_at.desc`,
    );
    res.json(
      GetCrawlDetailResponse.parse({
        ...toCrawlSummary(crawl),
        promptUsed: (crawl.prompt_used as string | null) ?? null,
        errorDetail: (crawl.error_detail as string | null) ?? null,
        sources: sources.map(toSource),
      }),
    );
  } catch (error) {
    req.log.warn({ error }, "Could not load crawl detail");
    res.status(500).json({ error: "Could not load crawl." });
  }
});

router.get("/admin/crawl/pending", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const rows = await restService<Row[]>(
      "sources?status=eq.pending&select=*,source_subjects(crawl_subjects(name))&order=created_at.desc",
    );
    const payload = rows.map((row) => {
      const links = (row.source_subjects as Row[] | null) ?? [];
      const subjectNames = links
        .map((link) => {
          const embedded = link.crawl_subjects as Row | Row[] | null | undefined;
          const subject = Array.isArray(embedded) ? embedded[0] : embedded;
          return subject?.name as string | undefined;
        })
        .filter((name): name is string => Boolean(name));
      return { ...toSource(row), subjectNames };
    });
    res.json(ListPendingSourcesResponse.parse(payload));
  } catch (error) {
    req.log.warn({ error }, "Could not load pending sources");
    res.status(500).json({ error: "Could not load pending sources." });
  }
});

router.post("/admin/crawl/sources/:sourceId/accept", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = AcceptPendingSourceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid source." });
    return;
  }
  try {
    const rows = await restService<Row[]>(`sources?id=eq.${params.data.sourceId}`, {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({ status: "accepted", updated_at: new Date().toISOString() }),
    });
    if (!rows[0]) {
      res.status(404).json({ error: "Source not found." });
      return;
    }
    res.json(toSource(rows[0]));
  } catch (error) {
    req.log.warn({ error }, "Could not accept source");
    res.status(500).json({ error: "Could not accept source." });
  }
});

router.post("/admin/crawl/sources/:sourceId/decline", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = DeclinePendingSourceParams.safeParse(req.params);
  const input = DeclinePendingSourceBody.safeParse(req.body);
  if (!params.success || !input.success) {
    res.status(400).json({ error: "reason is required." });
    return;
  }
  try {
    const rows = await restService<Row[]>(`sources?id=eq.${params.data.sourceId}`, {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        status: "declined",
        decline_reason: input.data.reason,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!rows[0]) {
      res.status(404).json({ error: "Source not found." });
      return;
    }
    res.json(DeclinePendingSourceResponse.parse(toSource(rows[0])));
  } catch (error) {
    req.log.warn({ error }, "Could not decline source");
    res.status(500).json({ error: "Could not decline source." });
  }
});

router.post("/admin/crawl/sources/:sourceId/rescore", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = AcceptPendingSourceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid source." });
    return;
  }
  try {
    await rescoreSource(params.data.sourceId);
    const rows = await restService<Row[]>(`sources?id=eq.${params.data.sourceId}&select=*`);
    if (!rows[0]) {
      res.status(404).json({ error: "Source not found." });
      return;
    }
    res.json(toSource(rows[0]));
  } catch (error) {
    req.log.warn({ error }, "Could not rescore source");
    res.status(500).json({ error: "Could not rescore source." });
  }
});

export default router;
