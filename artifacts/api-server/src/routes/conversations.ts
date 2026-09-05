import { Router, type IRouter, type Request } from "express";
import {
  AddConversationMemberParams,
  CreateGroupRouteBody,
  GetConversationRouteParams,
  RemoveConversationMemberParams,
  SetConversationMutedBody,
  SetConversationMutedParams,
  StartDmParams,
  TransferOwnershipRouteBody,
  TransferOwnershipRouteParams,
  UpdateGroupRouteBody,
  UpdateGroupRouteParams,
} from "@workspace/api-zod";
import { getAuthenticatedUser } from "../lib/supabase";
import {
  addMember,
  BlockedError,
  createGroup,
  findOrCreateDm,
  getConversation,
  isMember,
  listConversationsFor,
  markRead,
  removeMember,
  setMuted,
  transferOwnership,
  updateGroupMeta,
} from "../lib/conversations";

const router: IRouter = Router();

async function requireUser(req: Request) {
  return getAuthenticatedUser(req.header("authorization"));
}

router.get("/conversations", async (req, res): Promise<void> => {
  const user = await requireUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    res.json({ conversations: await listConversationsFor(user.id) });
  } catch (error) {
    req.log.warn({ error }, "Could not list conversations");
    res.status(500).json({ error: "Gesprekken konden niet worden geladen." });
  }
});

router.post("/conversations/dm/:userId", async (req, res): Promise<void> => {
  const user = await requireUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = StartDmParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    res.json(await findOrCreateDm(user.id, params.data.userId));
  } catch (error) {
    if (error instanceof BlockedError) { res.status(403).json({ error: error.message }); return; }
    req.log.warn({ error }, "Could not start DM");
    res.status(500).json({ error: "Gesprek starten is mislukt." });
  }
});

router.post("/conversations/group", async (req, res): Promise<void> => {
  const user = await requireUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const input = CreateGroupRouteBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Ongeldige groep." }); return; }
  try {
    res.status(201).json(await createGroup(user.id, input.data.title, input.data.memberIds));
  } catch (error) {
    req.log.warn({ error }, "Could not create group");
    res.status(500).json({ error: "Groep aanmaken is mislukt." });
  }
});

router.get("/conversations/:conversationId", async (req, res): Promise<void> => {
  const user = await requireUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = GetConversationRouteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldig gesprek." }); return; }
  try {
    if (!(await isMember(params.data.conversationId, user.id))) { res.status(403).json({ error: "Forbidden" }); return; }
    const conversation = await getConversation(params.data.conversationId);
    if (!conversation) { res.status(404).json({ error: "Niet gevonden." }); return; }
    res.json(conversation);
  } catch (error) {
    req.log.warn({ error }, "Could not load conversation");
    res.status(500).json({ error: "Gesprek kon niet worden geladen." });
  }
});

router.patch("/conversations/:conversationId", async (req, res): Promise<void> => {
  const user = await requireUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = UpdateGroupRouteParams.safeParse(req.params);
  const input = UpdateGroupRouteBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    const conversation = await getConversation(params.data.conversationId);
    if (!conversation || conversation.ownerId !== user.id) { res.status(403).json({ error: "Forbidden" }); return; }
    res.json(await updateGroupMeta(params.data.conversationId, input.data));
  } catch (error) {
    req.log.warn({ error }, "Could not update group");
    res.status(500).json({ error: "Groep aanpassen is mislukt." });
  }
});

router.post("/conversations/:conversationId/members/:userId", async (req, res): Promise<void> => {
  const user = await requireUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = AddConversationMemberParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    const conversation = await getConversation(params.data.conversationId);
    if (!conversation || conversation.ownerId !== user.id) { res.status(403).json({ error: "Forbidden" }); return; }
    await addMember(params.data.conversationId, params.data.userId);
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not add member");
    res.status(500).json({ error: "Lid toevoegen is mislukt." });
  }
});

router.delete("/conversations/:conversationId/members/:userId", async (req, res): Promise<void> => {
  const user = await requireUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = RemoveConversationMemberParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    const conversation = await getConversation(params.data.conversationId);
    if (!conversation || conversation.ownerId !== user.id) { res.status(403).json({ error: "Forbidden" }); return; }
    await removeMember(params.data.conversationId, params.data.userId);
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not remove member");
    res.status(500).json({ error: "Lid verwijderen is mislukt." });
  }
});

router.post("/conversations/:conversationId/transfer-ownership", async (req, res): Promise<void> => {
  const user = await requireUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = TransferOwnershipRouteParams.safeParse(req.params);
  const input = TransferOwnershipRouteBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    const conversation = await getConversation(params.data.conversationId);
    if (!conversation || conversation.ownerId !== user.id) { res.status(403).json({ error: "Forbidden" }); return; }
    if (!(await isMember(params.data.conversationId, input.data.newOwnerId))) {
      res.status(400).json({ error: "Deze gebruiker is geen lid van de groep." });
      return;
    }
    await transferOwnership(params.data.conversationId, input.data.newOwnerId);
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not transfer ownership");
    res.status(500).json({ error: "Eigenaarschap overdragen is mislukt." });
  }
});

router.post("/conversations/:conversationId/mute", async (req, res): Promise<void> => {
  const user = await requireUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = SetConversationMutedParams.safeParse(req.params);
  const input = SetConversationMutedBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    await setMuted(params.data.conversationId, user.id, input.data.muted);
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not set muted");
    res.status(500).json({ error: "Dempen is mislukt." });
  }
});

router.post("/conversations/:conversationId/read", async (req, res): Promise<void> => {
  const user = await requireUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = SetConversationMutedParams.safeParse(req.params); // same shape: { conversationId }
  if (!params.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    await markRead(params.data.conversationId, user.id);
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not mark read");
    res.status(500).json({ error: "Markeren als gelezen is mislukt." });
  }
});

export default router;
