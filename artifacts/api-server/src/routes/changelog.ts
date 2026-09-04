import { Router, type IRouter, type Request } from "express";
import {
  CreateChangelogEntryBody,
  CreateChangelogEntryResponse,
  GetChangelogResponse,
  ListChangelogAdminResponse,
  UpdateChangelogEntryBody,
  UpdateChangelogEntryParams,
  UpdateChangelogEntryResponse,
} from "@workspace/api-zod";
import { getAuthenticatedUser, restService } from "../lib/supabase";

const router: IRouter = Router();

type Row = Record<string, unknown>;

function toEntry(row: Row) {
  return {
    id: row.id as string,
    version: row.version as string,
    releasedAt: row.released_at as string,
    summary: row.summary as string,
    bullets: (row.bullets as string[] | null) ?? [],
  };
}

async function admin(req: Request) {
  const user = await getAuthenticatedUser(req.header("authorization"));
  return user?.isAdmin ? user : null;
}

router.get("/changelog", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const rows = await restService<Row[]>("changelog_entries?select=*&order=released_at.desc");
    res.json(GetChangelogResponse.parse({ entries: rows.map(toEntry) }));
  } catch (error) {
    req.log.warn({ error }, "Could not list changelog");
    res.status(500).json({ error: "Changelog kon niet worden geladen." });
  }
});

router.get("/admin/changelog", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const rows = await restService<Row[]>("changelog_entries?select=*&order=released_at.desc");
    res.json(ListChangelogAdminResponse.parse({ entries: rows.map(toEntry) }));
  } catch (error) {
    req.log.warn({ error }, "Could not list changelog");
    res.status(500).json({ error: "Changelog kon niet worden geladen." });
  }
});

router.post("/admin/changelog", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const input = CreateChangelogEntryBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Ongeldige changelog-invoer." }); return; }
  try {
    const rows = await restService<Row[]>("changelog_entries", {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        version: input.data.version,
        released_at: input.data.releasedAt,
        summary: input.data.summary,
        bullets: input.data.bullets,
        created_by: identity.id,
      }),
    });
    res.status(201).json(CreateChangelogEntryResponse.parse(toEntry(rows[0]!)));
  } catch (error) {
    req.log.warn({ error }, "Could not create changelog entry");
    res.status(500).json({ error: "Changelog-item kon niet worden aangemaakt." });
  }
});

router.patch("/admin/changelog/:entryId", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const params = UpdateChangelogEntryParams.safeParse(req.params);
  const input = UpdateChangelogEntryBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Ongeldige changelog-invoer." }); return; }
  try {
    const rows = await restService<Row[]>(`changelog_entries?id=eq.${params.data.entryId}`, {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        version: input.data.version,
        released_at: input.data.releasedAt,
        summary: input.data.summary,
        bullets: input.data.bullets,
      }),
    });
    if (!rows[0]) { res.status(404).json({ error: "Changelog-item niet gevonden." }); return; }
    res.json(UpdateChangelogEntryResponse.parse(toEntry(rows[0])));
  } catch (error) {
    req.log.warn({ error }, "Could not update changelog entry");
    res.status(500).json({ error: "Changelog-item kon niet worden aangepast." });
  }
});

export default router;
