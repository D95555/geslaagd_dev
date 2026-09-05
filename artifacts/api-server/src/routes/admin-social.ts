import { Router, type IRouter, type Request } from "express";
import { CloseAdminGroupParams, DeleteAdminGroupMessageParams, DeleteAdminGroupParams } from "@workspace/api-zod";
import { getAuthenticatedUser, getServiceUserById, restService } from "../lib/supabase";
import { getConversation, listMembers } from "../lib/conversations";
import { softDeleteMessage } from "../lib/messages";

const router: IRouter = Router();

async function admin(req: Request) {
  const token = req.header("authorization");
  const user = await getAuthenticatedUser(token);
  return user?.isAdmin ? { user, token: token! } : null;
}

router.get("/admin/groepsapps", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const groups = await restService<Record<string, unknown>[]>(
      "conversations?kind=eq.group&select=*&order=created_at.desc",
    );
    const summaries = await Promise.all(
      groups.map(async (group) => {
        const conversationId = group.id as string;
        const [members, latest, owner] = await Promise.all([
          listMembers(conversationId),
          restService<Record<string, unknown>[]>(
            `messages?conversation_id=eq.${conversationId}&select=created_at&order=created_at.desc&limit=1`,
          ),
          group.owner_id ? getServiceUserById(group.owner_id as string) : Promise.resolve(null),
        ]);
        return {
          id: conversationId,
          title: (group.title as string | null) ?? null,
          ownerId: (group.owner_id as string | null) ?? null,
          ownerEmail: (owner as { email?: string } | null)?.email ?? null,
          memberCount: members.length,
          lastMessageAt: (latest[0]?.created_at as string | undefined) ?? null,
          status: group.status as "active" | "closed" | "deleted",
          createdAt: group.created_at as string,
        };
      }),
    );
    res.json({ groups: summaries });
  } catch (error) {
    req.log.warn({ error }, "Could not list admin groups");
    res.status(500).json({ error: "Groepen konden niet worden geladen." });
  }
});

router.post("/admin/groepsapps/:conversationId/close", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const params = CloseAdminGroupParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    await restService(`conversations?id=eq.${params.data.conversationId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "closed" }),
    });
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not close group");
    res.status(500).json({ error: "Sluiten is mislukt." });
  }
});

router.post("/admin/groepsapps/:conversationId/delete", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const params = DeleteAdminGroupParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    await restService(`conversations?id=eq.${params.data.conversationId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "deleted" }),
    });
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not delete group");
    res.status(500).json({ error: "Verwijderen is mislukt." });
  }
});

router.delete("/admin/groepsapps/:conversationId/messages/:messageId", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const params = DeleteAdminGroupMessageParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    const conversation = await getConversation(params.data.conversationId);
    if (!conversation) { res.status(404).json({ error: "Gesprek niet gevonden." }); return; }
    await softDeleteMessage(identity.token, params.data.conversationId, params.data.messageId);
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not delete message");
    res.status(500).json({ error: "Verwijderen is mislukt." });
  }
});

export default router;
