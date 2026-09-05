import { restService } from "./supabase";

export async function isBlocked(a: string, b: string): Promise<boolean> {
  const rows = await restService<Record<string, unknown>[]>(
    `blocks?or=(and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a}))&select=blocker_id`,
  );
  return rows.length > 0;
}

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  await restService("blocks?on_conflict=blocker_id,blocked_id", {
    method: "POST",
    headers: { prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify({ blocker_id: blockerId, blocked_id: blockedId }),
  });
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  await restService(`blocks?blocker_id=eq.${blockerId}&blocked_id=eq.${blockedId}`, { method: "DELETE" });
}
