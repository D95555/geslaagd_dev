import { Router, type IRouter, type Request } from "express";
import {
  BlockAdminAccountBody,
  BlockAdminAccountParams,
  CreateActivationKeysBody,
  DeleteAdminAccountBody,
  DeleteAdminAccountParams,
  GetAdminAccountParams,
  ListActivationKeysQueryParams,
  ListAdminAccountsQueryParams,
  SetAdminAccountPackageBody,
  UnblockAdminAccountBody,
  UnblockAdminAccountParams,
} from "@workspace/api-zod";
import { broadcast, getAuthenticatedUser, getServiceUserById, rest, restService } from "../lib/supabase";
import { enqueueAuthEvent } from "../lib/auth-event-outbox";
import { enqueueUserNotification } from "../lib/user-notification-outbox";
import { createActivationKeys, listActivationKeys } from "../lib/activation-keys";
import { setAccountPackage } from "../lib/credits";

const router: IRouter = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

type SupabaseAuthUser = {
  id: string;
  email?: string;
  created_at?: string;
  last_sign_in_at?: string | null;
  banned_until?: string | null;
  app_metadata?: Record<string, unknown>;
};

function accountStatus(user: SupabaseAuthUser): "active" | "blocked" {
  if (!user.banned_until) return "active";
  const until = new Date(user.banned_until);
  // Supabase returns "none" when not banned; also treat past dates as active
  return until > new Date() ? "blocked" : "active";
}

type RecentAction = { id: string; delta: number; reason: string; createdAt: string };

function toAccountSummary(
  user: SupabaseAuthUser,
  sessionCount = 0,
  lastSeenAt: string | null = null,
  billing?: { package: string; recentActions: RecentAction[] },
) {
  return {
    userId: user.id,
    email: user.email ?? "",
    status: accountStatus(user),
    createdAt: user.created_at ?? "",
    lastSignInAt: user.last_sign_in_at ?? null,
    bannedUntil: user.banned_until ?? null,
    sessionCount,
    lastSeenAt,
    package: billing?.package ?? "trial",
    recentActions: billing?.recentActions ?? [],
  };
}

/** Call Supabase Auth Admin API with the service role key. */
async function authAdmin<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase service configuration is required.");
  const response = await fetch(`${url}/auth/v1/admin/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
      accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase Auth Admin ${path} failed (${response.status}): ${body}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// ─── Activation keys ──────────────────────────────────────────────────────────

router.get("/admin/activation-keys", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const query = ListActivationKeysQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Ongeldige filter." }); return; }
  try {
    const keys = await listActivationKeys(query.data.status);
    res.json({ keys });
  } catch (error) {
    req.log.warn({ error }, "Could not list activation keys");
    res.status(500).json({ error: "Activatiecodes konden niet worden geladen." });
  }
});

router.post("/admin/activation-keys", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const input = CreateActivationKeysBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Ongeldig aantal of pakket." }); return; }
  try {
    const keys = await createActivationKeys(input.data.count, input.data.package);
    res.status(201).json({ keys });
  } catch (error) {
    req.log.warn({ error }, "Could not create activation keys");
    res.status(500).json({ error: "Activatiecodes konden niet worden aangemaakt." });
  }
});

// ─── Account list ─────────────────────────────────────────────────────────────

router.get("/admin/accounts", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const query = ListAdminAccountsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query parameters" }); return; }

  try {
    const { search, status, page = 1, limit = 50 } = query.data;
    // Supabase Auth Admin API supports page/per_page
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(Math.min(limit, 100)),
    });
    const authResult = await authAdmin<{ users: SupabaseAuthUser[]; total?: number }>(
      `users?${params.toString()}`,
    );
    let users: SupabaseAuthUser[] = authResult.users ?? [];

    // Client-side filter (Supabase Admin list doesn't support server-side text search)
    if (search) {
      const q = search.toLowerCase();
      users = users.filter((u) => u.email?.toLowerCase().includes(q));
    }
    if (status === "blocked") {
      users = users.filter((u) => accountStatus(u) === "blocked");
    } else if (status === "active") {
      users = users.filter((u) => accountStatus(u) === "active");
    }

    // Fetch session counts for listed users in one query
    const userIds = users.map((u) => u.id);
    let sessionRows: Record<string, unknown>[] = [];
    let billingRows: Record<string, unknown>[] = [];
    let ledgerRows: Record<string, unknown>[] = [];
    if (userIds.length > 0) {
      const idList = userIds.map((id) => encodeURIComponent(id)).join(",");
      [sessionRows, billingRows, ledgerRows] = await Promise.all([
        restService<Record<string, unknown>[]>(
          `app_sessions?user_id=in.(${idList})&select=user_id,last_seen_at&revoked_at=is.null`,
        ),
        restService<Record<string, unknown>[]>(
          `account_billing?user_id=in.(${idList})&select=user_id,package`,
        ),
        restService<Record<string, unknown>[]>(
          `credit_transactions?account_id=in.(${idList})&select=id,account_id,delta,reason,created_at&order=created_at.desc&limit=200`,
        ),
      ]);
    }
    const sessionByUser = new Map<string, { count: number; lastSeenAt: string | null }>();
    for (const row of sessionRows) {
      const uid = row.user_id as string;
      const existing = sessionByUser.get(uid);
      const seenAt = row.last_seen_at as string;
      sessionByUser.set(uid, {
        count: (existing?.count ?? 0) + 1,
        lastSeenAt: !existing?.lastSeenAt || seenAt > existing.lastSeenAt ? seenAt : existing.lastSeenAt,
      });
    }
    const packageByUser = new Map(billingRows.map((r) => [r.user_id as string, r.package as string]));
    const actionsByUser = new Map<string, RecentAction[]>();
    for (const row of ledgerRows) {
      const uid = row.account_id as string;
      const list = actionsByUser.get(uid) ?? [];
      if (list.length < 5) {
        list.push({
          id: row.id as string,
          delta: row.delta as number,
          reason: row.reason as string,
          createdAt: row.created_at as string,
        });
      }
      actionsByUser.set(uid, list);
    }

    const accounts = users.map((u) => {
      const s = sessionByUser.get(u.id);
      return toAccountSummary(u, s?.count ?? 0, s?.lastSeenAt ?? null, {
        package: packageByUser.get(u.id) ?? "trial",
        recentActions: actionsByUser.get(u.id) ?? [],
      });
    });

    res.json({ accounts, total: authResult.total ?? accounts.length, page, limit });
  } catch (error) {
    req.log.warn({ error }, "Could not list admin accounts");
    res.status(500).json({ error: "Account list failed" });
  }
});

// ─── Account detail ───────────────────────────────────────────────────────────

router.get("/admin/accounts/:userId", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const params = GetAdminAccountParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid user ID" }); return; }

  try {
    const { userId } = params.data;

    // Fetch everything in parallel
    const [authUser, sessions, selectedSubjects, preferences, studySpaces, recentActions, billing] = await Promise.all([
      getServiceUserById(userId),
      restService<Record<string, unknown>[]>(
        `app_sessions?user_id=eq.${encodeURIComponent(userId)}&select=*&order=last_seen_at.desc&limit=10`,
      ),
      restService<Record<string, unknown>[]>(
        `study_selected_subjects?user_id=eq.${encodeURIComponent(userId)}&select=*,study_subjects(name)&order=sort_order.asc`,
      ),
      restService<Record<string, unknown>[]>(
        `study_preferences?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
      ),
      restService<Record<string, unknown>[]>(
        `study_spaces?user_id=eq.${encodeURIComponent(userId)}&select=id,title,source_type,status,level,created_at,updated_at,last_viewed_at&order=updated_at.desc&limit=20`,
      ),
      restService<Record<string, unknown>[]>(
        `admin_account_actions?target_user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc&limit=20`,
      ),
      restService<Record<string, unknown>[]>(
        `account_billing?user_id=eq.${encodeURIComponent(userId)}&select=package`,
      ),
    ]);

    if (!authUser) { res.status(404).json({ error: "Account niet gevonden" }); return; }

    const typedUser = authUser as SupabaseAuthUser;
    const s = sessions.filter((row) => !row.revoked_at);
    const ledgerRows = await restService<Record<string, unknown>[]>(
      `credit_transactions?account_id=eq.${encodeURIComponent(userId)}&select=id,delta,reason,created_at&order=created_at.desc&limit=5`,
    );
    const summary = toAccountSummary(typedUser, s.length, s[0]?.last_seen_at as string ?? null, {
      package: (billing[0]?.package as string) ?? "trial",
      recentActions: ledgerRows.map((row) => ({
        id: row.id as string,
        delta: row.delta as number,
        reason: row.reason as string,
        createdAt: row.created_at as string,
      })),
    });

    const toSelectedSubject = (row: Record<string, unknown>) => ({
      id: row.id as string,
      subjectId: (row.subject_id as string | null) ?? null,
      customName: (row.custom_name as string | null) ?? null,
      name: ((row.study_subjects as Record<string, unknown> | null)?.name as string | null) ?? (row.custom_name as string) ?? "",
      sortOrder: row.sort_order as number,
      createdAt: row.created_at as string,
    });

    const toStudySpaceSummary = (row: Record<string, unknown>) => ({
      id: row.id as string,
      title: row.title as string,
      sourceType: row.source_type as "catalog" | "ai",
      status: row.status as "draft" | "active",
      level: (row.level as string | null) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      lastViewedAt: (row.last_viewed_at as string | null) ?? null,
    });

    const toPreferences = (row: Record<string, unknown> | undefined) => row
      ? {
          educationLevel: row.education_level as string,
          studyProfile: row.study_profile as string,
          learningGoals: row.learning_goals as string[],
          updatedAt: row.updated_at as string,
        }
      : null;

    const toAction = (row: Record<string, unknown>) => ({
      id: row.id as string,
      actorId: row.actor_id as string,
      action: row.action as "block" | "unblock" | "delete",
      reason: row.reason as string,
      result: row.result as "success" | "failed",
      errorDetail: (row.error_detail as string | null) ?? null,
      createdAt: row.created_at as string,
    });

    res.json({
      summary,
      selectedSubjects: selectedSubjects.map(toSelectedSubject),
      preferences: toPreferences(preferences[0]),
      studySpaces: studySpaces.map(toStudySpaceSummary),
      recentSessions: sessions.map(toSession),
      recentActions: recentActions.map(toAction),
    });
  } catch (error) {
    req.log.warn({ error }, "Could not fetch admin account detail");
    res.status(500).json({ error: "Account detail ophalen is mislukt" });
  }
});

// ─── Package change ───────────────────────────────────────────────────────────

router.post("/admin/accounts/:userId/package", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const params = GetAdminAccountParams.safeParse(req.params);
  const input = SetAdminAccountPackageBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Invalid request" }); return; }
  try {
    await setAccountPackage(
      params.data.userId,
      input.data.package,
      "admin_adjustment",
      `Pakket door beheerder gezet op ${input.data.package}`,
    );
    const authUser = await getServiceUserById(params.data.userId);
    res.json(toAccountSummary(authUser as SupabaseAuthUser, 0, null, { package: input.data.package, recentActions: [] }));
  } catch (error) {
    req.log.warn({ error }, "Could not set account package");
    res.status(500).json({ error: "Pakket aanpassen is mislukt." });
  }
});

// ─── Block ────────────────────────────────────────────────────────────────────

router.post("/admin/accounts/:userId/block", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const params = BlockAdminAccountParams.safeParse(req.params);
  const input = BlockAdminAccountBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const { userId } = params.data;
  const { reason, idempotencyKey } = input.data;
  let result: "success" | "failed" = "success";
  let errorDetail: string | null = null;

  try {
    // Prevent self-block
    if (userId === identity.user.id) {
      res.status(409).json({ error: "Een beheerder kan het eigen account niet blokkeren" }); return;
    }

    const authUser = await getServiceUserById(userId);
    if (!authUser) { res.status(404).json({ error: "Account niet gevonden" }); return; }

    // Set 10-year ban via Supabase Auth Admin API
    await authAdmin(`users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      body: JSON.stringify({ ban_duration: "87600h" }),
    });

    // Revoke all active app sessions
    const activeSessions = await restService<Record<string, unknown>[]>(
      `app_sessions?user_id=eq.${encodeURIComponent(userId)}&revoked_at=is.null&select=*`,
    );
    await Promise.allSettled(activeSessions.map(async (session) => {
      if (session.auth_session_id) {
        await rest<void>(identity.token, "rpc/revoke_auth_session", {
          method: "POST",
          body: JSON.stringify({ p_auth_session_id: session.auth_session_id }),
        }).catch(() => undefined);
      }
      await restService<void>(`app_sessions?client_session_id=eq.${encodeURIComponent(session.client_session_id as string)}`, {
        method: "PATCH",
        body: JSON.stringify({ revoked_at: new Date().toISOString(), revoked_by: identity.user.id }),
      }).catch(() => undefined);
      await broadcast(identity.token, `user:${userId}:session:${session.client_session_id}:commands`, "logout", { reason: "admin-block" }).catch(() => undefined);
    }));

    // Audit log
    await enqueueAuthEvent({
      dedupeKey: `account-blocked:${idempotencyKey}`,
      event: "account-blocked",
      userId,
      extra: `Geblokkeerd door beheerder. Reden: ${reason}`,
    });

    // User notification (durable outbox)
    await enqueueUserNotification({
      idempotencyKey: `block-notify:${idempotencyKey}`,
      userId,
      email: (authUser as { email?: string }).email ?? "",
      notificationType: "account-blocked",
      subject: "Je account is tijdelijk geblokkeerd",
      bodyText: `Hallo,\n\nJe account bij geslaagd.app is tijdelijk geblokkeerd.\n\nReden: ${reason}\n\nNeem contact op met ons via de website als je vragen hebt.\n\nMet vriendelijke groet,\nHet geslaagd.app team`,
    });

    const updatedUser = await getServiceUserById(userId);
    res.json(toAccountSummary(updatedUser as SupabaseAuthUser ?? { id: userId, email: (authUser as { email?: string }).email }));
  } catch (error) {
    result = "failed";
    errorDetail = error instanceof Error ? error.message : String(error);
    req.log.warn({ error }, "Could not block account");
    res.status(500).json({ error: "Account blokkeren is mislukt" });
  } finally {
    await restService<string>("rpc/record_admin_account_action", {
      method: "POST",
      body: JSON.stringify({
        p_idempotency_key: idempotencyKey,
        p_actor_id: identity.user.id,
        p_target_user_id: userId,
        p_action: "block",
        p_reason: reason,
        p_result: result,
        p_error_detail: errorDetail,
      }),
    }).catch((auditError) => req.log.error({ auditError }, "CRITICAL: audit log failed for block action"));
  }
});

// ─── Unblock ──────────────────────────────────────────────────────────────────

router.post("/admin/accounts/:userId/unblock", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const params = UnblockAdminAccountParams.safeParse(req.params);
  const input = UnblockAdminAccountBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const { userId } = params.data;
  const { reason, idempotencyKey } = input.data;
  let result: "success" | "failed" = "success";
  let errorDetail: string | null = null;

  try {
    const authUser = await getServiceUserById(userId);
    if (!authUser) { res.status(404).json({ error: "Account niet gevonden" }); return; }

    await authAdmin(`users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      body: JSON.stringify({ ban_duration: "none" }),
    });

    await enqueueAuthEvent({
      dedupeKey: `account-unblocked:${idempotencyKey}`,
      event: "account-unblocked",
      userId,
      extra: `Gedeblokkeerd door beheerder. Reden: ${reason}`,
    });

    await enqueueUserNotification({
      idempotencyKey: `unblock-notify:${idempotencyKey}`,
      userId,
      email: (authUser as { email?: string }).email ?? "",
      notificationType: "account-unblocked",
      subject: "Je account is gedeblokkeerd",
      bodyText: `Hallo,\n\nJe account bij geslaagd.app is weer actief.\n\nJe kunt nu opnieuw inloggen en leren.\n\nMet vriendelijke groet,\nHet geslaagd.app team`,
    });

    const updatedUser = await getServiceUserById(userId);
    res.json(toAccountSummary(updatedUser as SupabaseAuthUser ?? { id: userId }));
  } catch (error) {
    result = "failed";
    errorDetail = error instanceof Error ? error.message : String(error);
    req.log.warn({ error }, "Could not unblock account");
    res.status(500).json({ error: "Account deblokkeren is mislukt" });
  } finally {
    await restService<string>("rpc/record_admin_account_action", {
      method: "POST",
      body: JSON.stringify({
        p_idempotency_key: idempotencyKey,
        p_actor_id: identity.user.id,
        p_target_user_id: userId,
        p_action: "unblock",
        p_reason: reason,
        p_result: result,
        p_error_detail: errorDetail,
      }),
    }).catch((auditError) => req.log.error({ auditError }, "CRITICAL: audit log failed for unblock action"));
  }
});

// ─── Delete ───────────────────────────────────────────────────────────────────

router.delete("/admin/accounts/:userId", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const params = DeleteAdminAccountParams.safeParse(req.params);
  const input = DeleteAdminAccountBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const { userId } = params.data;
  const { reason, idempotencyKey } = input.data;
  let result: "success" | "failed" = "success";
  let errorDetail: string | null = null;

  try {
    if (userId === identity.user.id) {
      res.status(409).json({ error: "Een beheerder kan het eigen account niet verwijderen" }); return;
    }

    const authUser = await getServiceUserById(userId);
    if (!authUser) { res.status(404).json({ error: "Account niet gevonden" }); return; }
    const userEmail = (authUser as { email?: string }).email ?? "";

    // Enqueue notification BEFORE deleting so we still have the email address
    await enqueueUserNotification({
      idempotencyKey: `delete-notify:${idempotencyKey}`,
      userId,
      email: userEmail,
      notificationType: "account-deleted",
      subject: "Je account is verwijderd",
      bodyText: `Hallo,\n\nJe account bij geslaagd.app is definitief verwijderd.\n\nAl je leerdata is gewist.\n\nMet vriendelijke groet,\nHet geslaagd.app team`,
    });

    // Audit event BEFORE deleting (userId will no longer be valid afterward)
    await enqueueAuthEvent({
      dedupeKey: `account-deleted:${idempotencyKey}`,
      event: "account-deleted",
      userId,
      extra: `Verwijderd door beheerder. Reden: ${reason}`,
    });

    // Delete from Supabase Auth (cascades to related auth data)
    await authAdmin(`users/${encodeURIComponent(userId)}`, { method: "DELETE" });

    res.sendStatus(204);
  } catch (error) {
    result = "failed";
    errorDetail = error instanceof Error ? error.message : String(error);
    req.log.warn({ error }, "Could not delete account");
    res.status(500).json({ error: "Account verwijderen is mislukt" });
  } finally {
    // Audit using actor_id only; target may no longer exist
    await restService<string>("rpc/record_admin_account_action", {
      method: "POST",
      body: JSON.stringify({
        p_idempotency_key: idempotencyKey,
        p_actor_id: identity.user.id,
        p_target_user_id: userId,
        p_action: "delete",
        p_reason: reason,
        p_result: result,
        p_error_detail: errorDetail,
      }),
    }).catch((auditError) => req.log.error({ auditError }, "CRITICAL: audit log failed for delete action"));
  }
});

export default router;
