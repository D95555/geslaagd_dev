import { Router, type IRouter, type Request } from "express";
import { randomUUID } from "node:crypto";
import {
  RevokeAdminSessionParams,
  SendAdminBroadcastBody,
  SendPrivateNotificationParams,
  SendPrivateNotificationBody,
} from "@workspace/api-zod";
import { broadcast, getAuthenticatedUser, rest, restService } from "../lib/supabase";
import { enqueueAuthEvent } from "../lib/auth-event-outbox";

const router: IRouter = Router();

const toSession = (row: Record<string, unknown>) => ({
  clientSessionId: row.client_session_id as string,
  userId: row.user_id as string,
  email: row.email as string,
  deviceLabel: row.device_label as string,
  createdAt: row.created_at as string,
  lastSeenAt: row.last_seen_at as string,
  revokedAt: (row.revoked_at as string | null) ?? null,
  ipAddress: (row.ip_address as string | null) ?? null,
  currentPage: (row.current_page as string | null) ?? null,
});

async function admin(req: Request) {
  const token = req.header("authorization");
  const user = await getAuthenticatedUser(token);
  return user?.isAdmin ? { user, token: token! } : null;
}

router.get("/admin/sessions", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const rows = await restService<Record<string, unknown>[]>(
      "app_sessions?select=*&order=last_seen_at.desc",
    );
    res.json(rows.map(toSession));
  } catch (error) {
    req.log.warn({ error }, "Could not list admin sessions");
    res.status(500).json({ error: "Session list failed" });
  }
});

router.post("/admin/sessions/:sessionId/revoke", async (req, res): Promise<void> => {
  const params = RevokeAdminSessionParams.safeParse(req.params);
  const identity = await admin(req);
  if (!params.success || !identity) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const existing = await restService<Record<string, unknown>[]>(
      `app_sessions?client_session_id=eq.${encodeURIComponent(params.data.sessionId)}&select=*`,
    );
    if (!existing[0]?.auth_session_id) { res.status(409).json({ error: "Session cannot be revoked safely" }); return; }
    await rest<void>(identity.token, "rpc/revoke_auth_session", { method: "POST", body: JSON.stringify({ p_auth_session_id: existing[0].auth_session_id }) });
    const rows = await restService<Record<string, unknown>[]>(`app_sessions?client_session_id=eq.${encodeURIComponent(params.data.sessionId)}`, {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({ revoked_at: new Date().toISOString(), revoked_by: identity.user.id }),
    });
    if (!rows[0]) { res.status(404).json({ error: "Session not found" }); return; }
    await broadcast(identity.token, `user:${rows[0].user_id}:session:${rows[0].client_session_id}:commands`, "logout", { reason: "admin" });
    await enqueueAuthEvent({
      dedupeKey: `session-revoked:${randomUUID()}`,
      event: "session-revoked",
      userId: rows[0].user_id as string,
      device: rows[0].device_label as string,
      extra: "Ingetrokken door een beheerder.",
    });
    res.json(toSession(rows[0]));
  } catch (error) {
    req.log.warn({ error }, "Could not revoke admin session");
    res.status(500).json({ error: "Session revoke failed" });
  }
});

router.post("/admin/broadcasts", async (req, res): Promise<void> => {
  const input = SendAdminBroadcastBody.safeParse(req.body);
  const identity = await admin(req);
  if (!input.success || !identity) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    await restService("notifications", {
      method: "POST",
      body: JSON.stringify({ account_id: null, title: input.data.title, body: input.data.body }),
    });
    await broadcast(identity.token, "app:notifications", "refresh", {});
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not send broadcast");
    res.status(502).json({ error: "Broadcast failed" });
  }
});

router.post("/admin/accounts/:userId/notify", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const params = SendPrivateNotificationParams.safeParse(req.params);
  const input = SendPrivateNotificationBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Invalid request" }); return; }
  try {
    await restService("notifications", {
      method: "POST",
      body: JSON.stringify({ account_id: params.data.userId, title: input.data.title, body: input.data.body }),
    });
    await broadcast(identity.token, `user:${params.data.userId}:notifications`, "refresh", {});
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not send private notification");
    res.status(502).json({ error: "Melding versturen is mislukt." });
  }
});

export default router;
