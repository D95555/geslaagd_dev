import { Router, type IRouter } from "express";
import multer from "multer";
import { ListConversationMessagesParams, SendConversationMessageBody, SendConversationMessageParams } from "@workspace/api-zod";
import { getAuthenticatedUser, restService } from "../lib/supabase";
import { getConversation, isMember } from "../lib/conversations";
import { extractMentionedUsernames, insertMessage, listMessages } from "../lib/messages";
import { checkPhotoQuota, QuotaExceededError, uploadConversationPhoto } from "../lib/social-storage";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

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

    if (input.data.body.trim().toLowerCase().startsWith("/ai ")) {
      const question = input.data.body.trim().slice(4).trim();
      const subjectRef = (input.data.references ?? [])[0];
      if (!subjectRef) {
        await insertMessage(
          token,
          params.data.conversationId,
          null,
          "ai",
          "Vermeld eerst een vak met # zodat ik weet waarover je het hebt — bijvoorbeeld: /ai #Scheikunde wat is een redoxreactie?",
        );
      } else {
        const allowed = await restService<boolean>("rpc/claim_study_ai_request", {
          method: "POST",
          body: JSON.stringify({ p_user_id: user.id }),
        });
        if (!allowed) {
          await insertMessage(
            token,
            params.data.conversationId,
            null,
            "ai",
            "Je hebt net veel AI-verzoeken gedaan. Probeer het over een kwartier opnieuw.",
          );
        } else {
          const { handleChatMessage } = await import("../lib/study-handler");
          const reply = await handleChatMessage({
            userId: user.id,
            subjectId: subjectRef.subjectId,
            chapterId: subjectRef.chapterId ?? null,
            message: question,
          });
          await insertMessage(token, params.data.conversationId, null, "ai", reply.content);
        }
      }
    }

    const mentionedUsernames = extractMentionedUsernames(input.data.body);
    if (mentionedUsernames.length > 0) {
      const mentioned = await restService<Record<string, unknown>[]>(
        `profiles?username=in.(${mentionedUsernames.map((u) => encodeURIComponent(u)).join(",")})&select=user_id,username`,
      );
      const senderProfile = await restService<Record<string, unknown>[]>(
        `profiles?user_id=eq.${user.id}&select=display_name`,
      );
      const senderName = (senderProfile[0]?.display_name as string | undefined) ?? "Iemand";
      const conversationLabel = conversation.kind === "group" ? conversation.title ?? "een groepsapp" : "een gesprek";
      for (const row of mentioned) {
        const mentionedUserId = row.user_id as string;
        if (mentionedUserId === user.id) continue; // no self-notification
        if (!(await isMember(params.data.conversationId, mentionedUserId))) continue; // only notify actual members
        const muted = (await restService<Record<string, unknown>[]>(
          `conversation_members?conversation_id=eq.${params.data.conversationId}&user_id=eq.${mentionedUserId}&select=muted`,
        ))[0]?.muted;
        if (muted) continue;
        await restService("notifications", {
          method: "POST",
          body: JSON.stringify({
            account_id: mentionedUserId,
            title: `${senderName} vermeldde je`,
            body: `In ${conversationLabel}: "${input.data.body.slice(0, 120)}"`,
          }),
        });
      }
    }

    res.status(201).json(message);
  } catch (error) {
    req.log.warn({ error }, "Could not send message");
    res.status(500).json({ error: "Bericht kon niet worden verstuurd." });
  }
});

router.post("/conversations/:conversationId/photos", upload.single("photo"), async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = SendConversationMessageParams.safeParse(req.params); // same {conversationId} shape
  if (!params.success || !req.file) { res.status(400).json({ error: "Geen foto meegestuurd." }); return; }
  try {
    if (!(await isMember(params.data.conversationId, user.id))) { res.status(403).json({ error: "Forbidden" }); return; }
    await checkPhotoQuota(params.data.conversationId, user.id);
    const photoUrl = await uploadConversationPhoto(params.data.conversationId, req.file.buffer, req.file.mimetype);
    res.status(201).json({ photoUrl });
  } catch (error) {
    if (error instanceof QuotaExceededError) { res.status(413).json({ error: error.message }); return; }
    req.log.warn({ error }, "Could not upload photo");
    res.status(500).json({ error: "Uploaden is mislukt." });
  }
});

export default router;
