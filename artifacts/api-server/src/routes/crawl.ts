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
  GetCrawlSubjectCostsParams,
  GetCrawlSubjectMemoryParams,
  ListCrawlSubjectRequestsResponse,
  ListCrawlSubjectsResponse,
  ListCrawlsResponse,
  ListPendingSourcesResponse,
  RefreshCrawlSubjectParams,
  RefreshCrawlSubjectResponse,
  RequestCrawlSubjectRefinementBody,
  RequestCrawlSubjectRefinementParams,
  RunCrawlBody,
  RunCrawlResponse,
  SetCrawlSubjectBudgetBody,
  SetCrawlSubjectBudgetParams,
  UpdateCrawlSubjectMemoryBody,
  UpdateCrawlSubjectMemoryParams,
  UpdateGlobalCrawlMemoryBody,
} from "@workspace/api-zod";
import { appendMemoryEntry, getMemoryContent, setMemoryContent } from "../lib/crawl-memory";
import { recordDomainOutcome } from "../lib/domain-reputation";
import { queueSubjectRefresh } from "../lib/pipeline-tasks/refresh";
import { pollAndProcess } from "../lib/pipeline-worker";
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
    yearLevel: row.year_level as "havo_vwo_bovenbouw" | "universitair",
    status: row.status as "pending" | "active" | "denied" | "needs_refinement",
    publishStatus: (row.publish_status as "incomplete" | "ready" | "published" | null) ?? "incomplete",
    requestedBy: (row.requested_by as string | null) ?? null,
    approvedBy: (row.approved_by as string | null) ?? null,
    adminNote: (row.admin_note as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    emphasis: (row.emphasis as string | null) ?? null,
    preferredSourceTypes: (row.preferred_source_types as string | null) ?? null,
    creditBudget: Number(row.credit_budget ?? 300),
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

router.post("/admin/crawl/subjects/:subjectId/budget", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = SetCrawlSubjectBudgetParams.safeParse(req.params);
  const input = SetCrawlSubjectBudgetBody.safeParse(req.body);
  if (!params.success || !input.success) {
    res.status(400).json({ error: "Invalid budget." });
    return;
  }
  try {
    await restService<Row[]>(`crawl_subjects?id=eq.${params.data.subjectId}`, {
      method: "PATCH",
      body: JSON.stringify({
        credit_budget: input.data.creditBudget,
        updated_at: new Date().toISOString(),
      }),
    });
    res.sendStatus(200);
  } catch (error) {
    req.log.warn({ error }, "Could not update subject budget");
    res.status(500).json({ error: "Could not update subject budget." });
  }
});

router.post("/admin/crawl/subjects/:subjectId/refresh", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = RefreshCrawlSubjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Ongeldig vak." });
    return;
  }
  try {
    const chaptersQueued = await queueSubjectRefresh(params.data.subjectId);
    if (chaptersQueued === 0) {
      res.status(409).json({ error: "Dit vak heeft nog geen hoofdstukken om te verversen." });
      return;
    }
    void pollAndProcess();
    res.json(RefreshCrawlSubjectResponse.parse({ chaptersQueued }));
  } catch (error) {
    req.log.warn({ error }, "Could not queue subject refresh");
    res.status(500).json({ error: "De verversing kon niet worden gestart." });
  }
});

router.get("/admin/crawl/subjects/:subjectId/costs", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = GetCrawlSubjectCostsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid request." });
    return;
  }
  try {
    const [subjectRows, firecrawlRows, aiRows] = await Promise.all([
      restService<Row[]>(`crawl_subjects?id=eq.${params.data.subjectId}&select=credit_budget`),
      restService<Row[]>(
        `firecrawl_usage?subject_id=eq.${params.data.subjectId}&select=operation,credits`,
      ),
      restService<Row[]>(
        `ai_usage?subject_id=eq.${params.data.subjectId}&select=task_type,model,input_tokens,output_tokens`,
      ),
    ]);

    const byOperation = new Map<string, number>();
    let firecrawlTotal = 0;
    for (const row of firecrawlRows) {
      const credits = Number(row.credits ?? 0);
      firecrawlTotal += credits;
      const operation = row.operation as string;
      byOperation.set(operation, (byOperation.get(operation) ?? 0) + credits);
    }

    const byTask = new Map<string, { taskType: string; model: string; inputTokens: number; outputTokens: number }>();
    for (const row of aiRows) {
      const taskType = row.task_type as string;
      const model = row.model as string;
      const key = `${taskType}::${model}`;
      const existing = byTask.get(key) ?? { taskType, model, inputTokens: 0, outputTokens: 0 };
      existing.inputTokens += Number(row.input_tokens ?? 0);
      existing.outputTokens += Number(row.output_tokens ?? 0);
      byTask.set(key, existing);
    }

    res.json({
      creditBudget: Number(subjectRows[0]?.credit_budget ?? 300),
      firecrawlTotal,
      firecrawlByOperation: [...byOperation.entries()].map(([operation, credits]) => ({ operation, credits })),
      aiByTask: [...byTask.values()],
    });
  } catch (error) {
    req.log.warn({ error }, "Could not load subject costs");
    res.status(500).json({ error: "Could not load subject costs." });
  }
});

router.get("/admin/crawl/memory/global", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    res.json({ content: await getMemoryContent(null) });
  } catch (error) {
    req.log.warn({ error }, "Could not load global crawl memory");
    res.status(500).json({ error: "Could not load global crawl memory." });
  }
});

router.post("/admin/crawl/memory/global", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const input = UpdateGlobalCrawlMemoryBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Invalid memory content." });
    return;
  }
  try {
    await setMemoryContent(null, input.data.content);
    res.sendStatus(200);
  } catch (error) {
    req.log.warn({ error }, "Could not update global crawl memory");
    res.status(500).json({ error: "Could not update global crawl memory." });
  }
});

router.get("/admin/crawl/subjects/:subjectId/memory", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = GetCrawlSubjectMemoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid request." });
    return;
  }
  try {
    res.json({ content: await getMemoryContent(params.data.subjectId) });
  } catch (error) {
    req.log.warn({ error }, "Could not load subject crawl memory");
    res.status(500).json({ error: "Could not load subject crawl memory." });
  }
});

router.post("/admin/crawl/subjects/:subjectId/memory", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = UpdateCrawlSubjectMemoryParams.safeParse(req.params);
  const input = UpdateCrawlSubjectMemoryBody.safeParse(req.body);
  if (!params.success || !input.success) {
    res.status(400).json({ error: "Invalid memory content." });
    return;
  }
  try {
    await setMemoryContent(params.data.subjectId, input.data.content);
    res.sendStatus(200);
  } catch (error) {
    req.log.warn({ error }, "Could not update subject crawl memory");
    res.status(500).json({ error: "Could not update subject crawl memory." });
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
      "subject_requests?select=*,crawl_subjects(name,year_level,description,emphasis,preferred_source_types,credit_budget)" +
        "&status=in.(pending,needs_refinement)&order=created_at.desc",
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
      `crawl_subjects?id=eq.${input.data.subjectId}&select=id,name,year_level,status,description,emphasis,preferred_source_types`,
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
        description: (subject.description as string | null) ?? null,
        emphasis: (subject.emphasis as string | null) ?? null,
        preferredSourceTypes: (subject.preferred_source_types as string | null) ?? null,
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

async function subjectIdsForSource(sourceId: string): Promise<string[]> {
  const rows = await restService<Row[]>(`source_subjects?source_id=eq.${sourceId}&select=subject_id`);
  return rows.map((row) => row.subject_id as string).filter(Boolean);
}

/**
 * Feeds a manual twijfelbron decision back into learning: the domain's
 * accept/decline tally, and a memory entry so a similar future case is less
 * likely to need a human review — the exact ask behind this endpoint.
 */
async function recordManualReviewFeedback(
  sourceId: string,
  source: { url: string; title: string },
  outcome: "accepted" | "declined",
  reason: string | null,
): Promise<void> {
  await recordDomainOutcome(source.url, outcome);

  const subjectIds = await subjectIdsForSource(sourceId);
  const label = outcome === "accepted" ? "Handmatig geaccepteerd" : "Handmatig afgewezen";
  const entry = `Twijfelgeval — ${label}: "${source.title}" (${source.url})${reason ? ` — reden: ${reason}` : ""}.`;

  for (const [index, subjectId] of subjectIds.entries()) {
    await appendMemoryEntry(subjectId, entry, index === 0 ? entry : undefined);
  }
}

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
    const source = rows[0];
    if (!source) {
      res.status(404).json({ error: "Source not found." });
      return;
    }
    await recordManualReviewFeedback(
      params.data.sourceId,
      { url: source.url as string, title: source.title as string },
      "accepted",
      null,
    ).catch((error) => req.log.warn({ error }, "Could not record manual review feedback"));
    res.json(toSource(source));
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
    const source = rows[0];
    if (!source) {
      res.status(404).json({ error: "Source not found." });
      return;
    }
    await recordManualReviewFeedback(
      params.data.sourceId,
      { url: source.url as string, title: source.title as string },
      "declined",
      input.data.reason,
    ).catch((error) => req.log.warn({ error }, "Could not record manual review feedback"));
    res.json(DeclinePendingSourceResponse.parse(toSource(source)));
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
