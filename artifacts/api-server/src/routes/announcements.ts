import { Router, type IRouter, type Request } from "express";
import {
  CreateAnnouncementBody,
  DeleteAnnouncementParams,
  ListAnnouncementFeedResponse,
  ListAnnouncementsAdminResponse,
  UpdateAnnouncementBody,
  UpdateAnnouncementParams,
} from "@workspace/api-zod";
import { getAuthenticatedUser } from "../lib/supabase";
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncementFeed,
  listAnnouncements,
  updateAnnouncement,
} from "../lib/announcements";

const router: IRouter = Router();

async function admin(req: Request) {
  const user = await getAuthenticatedUser(req.header("authorization"));
  return user?.isAdmin ? user : null;
}

router.get("/announcements", async (_req, res): Promise<void> => {
  try {
    res.json(ListAnnouncementFeedResponse.parse({ items: await listAnnouncementFeed() }));
  } catch (error) {
    res.status(500).json({ error: "Aankondigingen konden niet worden geladen." });
  }
});

router.get("/admin/announcements", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    res.json(ListAnnouncementsAdminResponse.parse({ announcements: await listAnnouncements() }));
  } catch (error) {
    req.log.warn({ error }, "Could not list announcements");
    res.status(500).json({ error: "Aankondigingen konden niet worden geladen." });
  }
});

router.post("/admin/announcements", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const input = CreateAnnouncementBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Titel en tekst zijn verplicht." }); return; }
  try {
    res.status(201).json(await createAnnouncement(identity.id, input.data.title, input.data.body));
  } catch (error) {
    req.log.warn({ error }, "Could not create announcement");
    res.status(500).json({ error: "Aankondiging kon niet worden aangemaakt." });
  }
});

router.patch("/admin/announcements/:announcementId", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const params = UpdateAnnouncementParams.safeParse(req.params);
  const input = UpdateAnnouncementBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Ongeldige invoer." }); return; }
  try {
    const updated = await updateAnnouncement(params.data.announcementId, input.data.title, input.data.body);
    if (!updated) { res.status(404).json({ error: "Aankondiging niet gevonden." }); return; }
    res.json(updated);
  } catch (error) {
    req.log.warn({ error }, "Could not update announcement");
    res.status(500).json({ error: "Aankondiging kon niet worden aangepast." });
  }
});

router.delete("/admin/announcements/:announcementId", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const params = DeleteAnnouncementParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    await deleteAnnouncement(params.data.announcementId);
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not delete announcement");
    res.status(500).json({ error: "Verwijderen is mislukt." });
  }
});

export default router;
