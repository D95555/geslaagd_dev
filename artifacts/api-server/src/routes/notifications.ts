import { Router, type IRouter } from "express";
import { DismissNotificationParams, ListNotificationsResponse } from "@workspace/api-zod";
import { getAuthenticatedUser, restService } from "../lib/supabase";

const router: IRouter = Router();

type Row = Record<string, unknown>;

router.get("/notifications", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [rows, dismissals] = await Promise.all([
      restService<Row[]>(
        `notifications?or=(account_id.is.null,account_id.eq.${user.id})&select=*&order=created_at.desc&limit=50`,
      ),
      restService<Row[]>(`notification_dismissals?account_id=eq.${user.id}&select=notification_id`),
    ]);
    const dismissedIds = new Set(dismissals.map((d) => d.notification_id as string));
    const visible = rows.filter((row) => !dismissedIds.has(row.id as string));
    res.json(ListNotificationsResponse.parse({
      notifications: visible.map((row) => ({
        id: row.id as string,
        title: row.title as string,
        body: row.body as string,
        createdAt: row.created_at as string,
        isGlobal: row.account_id === null,
      })),
    }));
  } catch (error) {
    req.log.warn({ error }, "Could not list notifications");
    res.status(500).json({ error: "Meldingen konden niet worden geladen." });
  }
});

router.post("/notifications/:notificationId/dismiss", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = DismissNotificationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldige melding." }); return; }
  try {
    await restService("notification_dismissals?on_conflict=notification_id,account_id", {
      method: "POST",
      headers: { prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify({ notification_id: params.data.notificationId, account_id: user.id }),
    });
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not dismiss notification");
    res.status(500).json({ error: "Wegklikken is mislukt." });
  }
});

export default router;
