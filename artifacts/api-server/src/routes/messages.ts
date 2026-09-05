import { Router, type IRouter } from "express";
import { ListConversationMessagesParams, SendConversationMessageBody, SendConversationMessageParams } from "@workspace/api-zod";
import { getAuthenticatedUser } from "../lib/supabase";
import { getConversation, isMember } from "../lib/conversations";
import { insertMessage, listMessages } from "../lib/messages";

const router: IRouter = Router();

router.get("/conversations/:conversationId/messages", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = ListConversationMessagesParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldig gesprek." }); return; }
  try {
    if (!(await isMember(params.data.conversationId, user.id))) { res.status(403).json({ error: "Forbidden" }); return; }
    res.json({ messages: await listMessages(params.data.conversationId) });
  } catch (error) {
    req.log.warn({ error }, "Could not list messages");
    res.status(500).json({ error: "Berichten konden niet worden geladen." });
  }
});

router.post("/conversations/:conversationId/messages", async (req, res): Promise<void> => {
  const token = req.header("authorization")!;
  const user = await getAuthenticatedUser(token);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = SendConversationMessageParams.safeParse(req.params);
  const input = SendConversationMessageBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Ongeldig bericht." }); return; }
  try {
    if (!(await isMember(params.data.conversationId, user.id))) { res.status(403).json({ error: "Forbidden" }); return; }
    const conversation = await getConversation(params.data.conversationId);
    if (!conversation || conversation.status !== "active") { res.status(403).json({ error: "Dit gesprek is gesloten." }); return; }

    const message = await insertMessage(token, params.data.conversationId, user.id, "user", input.data.body, {
      photoUrl: input.data.photoUrl,
      references: input.data.references,
    });

    // Task 10 (/ai) and Task 11 (@mentions) hook in here, after the human
    // message is stored, using `message`/`conversation`/`token` already in
    // scope — see those tasks for the exact code inserted at this point.

    res.status(201).json(message);
  } catch (error) {
    req.log.warn({ error }, "Could not send message");
    res.status(500).json({ error: "Bericht kon niet worden verstuurd." });
  }
});

export default router;
