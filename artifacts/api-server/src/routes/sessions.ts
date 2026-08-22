import { Router, type IRouter, type Request, type Response } from "express";
import { HeartbeatSessionBody, RegisterSessionBody } from "@workspace/api-zod";
import {
  encryptSessionToken,
  getAuthenticatedUser,
  getJwtSessionId,
  restService,
} from "../lib/supabase";

const router: IRouter = Router();

const toSession = (row: Record<string, unknown>) => ({
  clientSessionId: row.client_session_id as string,
  userId: row.user_id as string,
  email: row.email as string,
  deviceLabel: row.device_label as string,
  createdAt: row.created_at as string,
  lastSeenAt: row.last_seen_at as string,
  revokedAt: (row.revoked_at as string | null) ?? null,
});

async function requireUser(authorization?: string) {
  const user = await getAuthenticatedUser(authorization);
  return user;
}

function sanitizePagePath(raw: string | undefined): string | null {
  if (!raw) return null;
  const path = raw.split("?")[0]!.split("#")[0]!.trim();
  if (!path) return null;
  return path.slice(0, 200);
}

async function recordSessionIp(
  clientSessionId: string,
  userId: string,
  ipAddress?: string,
  currentPage?: string | null,
): Promise<Record<string, unknown> | null> {
  const rows = await restService<Record<string, unknown>[]>(
    `app_sessions?client_session_id=eq.${encodeURIComponent(clientSessionId)}&user_id=eq.${encodeURIComponent(userId)}&revoked_at=is.null`,
    {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        ip_address: ipAddress ?? null,
        last_seen_at: new Date().toISOString(),
        current_page: currentPage ?? null,
      }),
    },
  );
  return rows[0] ?? null;
}

router.post("/sessions", async (req, res): Promise<void> => {
  const input = RegisterSessionBody.safeParse(req.body);
  const user = await requireUser(req.header("authorization"));
  if (!input.success || !user) {
    res.status(401).json({ error: "Unauthorized" }); return;
  }
  try {
    const row = await restService<Record<string, unknown>>(
      "rpc/register_app_session_service",
      {
      method: "POST",
      body: JSON.stringify({
        p_client_session_id: input.data.clientSessionId,
        p_user_id: user.id,
        p_device_label: input.data.deviceLabel,
        p_auth_access_token_ciphertext: encryptSessionToken(req.header("authorization")!.slice(7)),
        p_auth_session_id: getJwtSessionId(req.header("authorization")!.slice(7)),
        p_ip_address: req.ip ?? null,
      }),
      },
    );
    res.status(201).json(toSession(row));
  } catch (error) {
    console.error("DEBUG register session", error);
    req.log.warn({ error }, "Could not register session");
    res.status(500).json({ error: "Session registration failed" });
  }
});

async function updateSession(req: Request, res: Response): Promise<void> {
  const parsed = HeartbeatSessionBody.safeParse(req.body);
  const user = await requireUser(req.header("authorization"));
  if (!parsed.success || !user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const row = await recordSessionIp(parsed.data.clientSessionId, user.id, req.ip, sanitizePagePath(parsed.data.currentPage));
    if (!row) { res.status(409).json({ error: "Session revoked" }); return; }
    res.sendStatus(204);
  } catch {
    res.status(500).json({ error: "Session update failed" });
  }
}

router.post("/sessions/heartbeat", (req, res) => updateSession(req, res));

export default router;