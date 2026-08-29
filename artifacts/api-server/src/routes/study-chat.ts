import { Router, type IRouter } from "express";
import {
  ListChatMessagesQueryParams,
  ListChatMessagesResponse,
  SendChatMessageBody,
  SendChatMessageParams,
  SendChatMessageResponse,
} from "@workspace/api-zod";
import { handleChatMessage, loadChatHistory } from "../lib/study-handler";
import { getAuthenticatedUser, restService } from "../lib/supabase";

const router: IRouter = Router();

async function authenticate(header?: string) {
  const user = await getAuthenticatedUser(header);
  return user && header ? { user, token: header } : null;
}

router.get("/subjects/:subjectId/chat", async (req, res): Promise<void> => {
  const identity = await authenticate(req.header("authorization"));
  if (!identity) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = SendChatMessageParams.safeParse(req.params);
  const query = ListChatMessagesQueryParams.safeParse(req.query);
  if (!params.success || !query.success) {
    res.status(400).json({ error: "Ongeldig verzoek." });
    return;
  }
  try {
    const messages = await loadChatHistory(
      identity.user.id,
      params.data.subjectId,
      query.data.limit ?? 20,
    );
    res.json(ListChatMessagesResponse.parse(messages));
  } catch (error) {
    req.log.warn({ error }, "Could not load chat history");
    res.status(500).json({ error: "Gesprek kon niet worden geladen." });
  }
});

router.post("/subjects/:subjectId/chat", async (req, res): Promise<void> => {
  const identity = await authenticate(req.header("authorization"));
  if (!identity) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = SendChatMessageParams.safeParse(req.params);
  const input = SendChatMessageBody.safeParse(req.body);
  if (!params.success || !input.success) {
    res.status(400).json({ error: "Stel een vraag van minimaal één teken." });
    return;
  }
  try {
    const allowed = await restService<boolean>("rpc/claim_study_ai_request", {
      method: "POST",
      body: JSON.stringify({ p_user_id: identity.user.id }),
    });
    if (!allowed) {
      res
        .status(429)
        .json({ error: "Je hebt veel AI-verzoeken gedaan. Probeer het over een kwartier opnieuw." });
      return;
    }

    const message = await handleChatMessage({
      userId: identity.user.id,
      subjectId: params.data.subjectId,
      chapterId: input.data.chapterId ?? null,
      message: input.data.message,
    });
    res.json(SendChatMessageResponse.parse(message));
  } catch (error) {
    req.log.warn({ error }, "Could not handle chat message");
    res.status(500).json({ error: "De studieassistent kon niet antwoorden." });
  }
});

export default router;
