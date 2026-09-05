import { Router, type IRouter } from "express";
import { BlockUserRouteParams, UnblockUserRouteParams } from "@workspace/api-zod";
import { getAuthenticatedUser } from "../lib/supabase";
import { blockUser, unblockUser } from "../lib/blocks";

const router: IRouter = Router();

router.post("/blocks/:userId", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = BlockUserRouteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    await blockUser(user.id, params.data.userId);
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not block user");
    res.status(500).json({ error: "Blokkeren is mislukt." });
  }
});

router.delete("/blocks/:userId", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = UnblockUserRouteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    await unblockUser(user.id, params.data.userId);
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not unblock user");
    res.status(500).json({ error: "Deblokkeren is mislukt." });
  }
});

export default router;
