import { restService } from "./supabase";
import { isBlocked } from "./blocks";

type Row = Record<string, unknown>;

export class BlockedError extends Error {
  constructor() { super("Deze gebruiker heeft je geblokkeerd, of jij hen."); }
}

export type Conversation = {
  id: string;
  kind: "dm" | "group";
  title: string | null;
  description: string | null;
  photoUrl: string | null;
  ownerId: string | null;
  status: "active" | "closed" | "deleted";
  createdAt: string;
};

export type Member = { userId: string; joinedAt: string; lastReadAt: string | null; muted: boolean };

function toConversation(row: Row): Conversation {
  return {
    id: row.id as string,
    kind: row.kind as "dm" | "group",
    title: (row.title as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    photoUrl: (row.photo_url as string | null) ?? null,
    ownerId: (row.owner_id as string | null) ?? null,
    status: row.status as "active" | "closed" | "deleted",
    createdAt: row.created_at as string,
  };
}

function toMember(row: Row): Member {
  return {
    userId: row.user_id as string,
    joinedAt: row.joined_at as string,
    lastReadAt: (row.last_read_at as string | null) ?? null,
    muted: Boolean(row.muted),
  };
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const rows = await restService<Row[]>(`conversations?id=eq.${id}&select=*`);
  return rows[0] ? toConversation(rows[0]) : null;
}

export async function listMembers(conversationId: string): Promise<Member[]> {
  const rows = await restService<Row[]>(`conversation_members?conversation_id=eq.${conversationId}&select=*`);
  return rows.map(toMember);
}

export async function isMember(conversationId: string, userId: string): Promise<boolean> {
  const rows = await restService<Row[]>(
    `conversation_members?conversation_id=eq.${conversationId}&user_id=eq.${userId}&select=user_id`,
  );
  return rows.length > 0;
}

export async function findOrCreateDm(userA: string, userB: string): Promise<Conversation> {
  if (await isBlocked(userA, userB)) throw new BlockedError();

  // Find an existing DM containing exactly these two members: conversations
  // whose member set for kind='dm' includes both, intersected client-side
  // since PostgREST can't express "exact set of two" in one query cheaply
  // at this table size.
  const candidateIds = await restService<Row[]>(
    `conversation_members?user_id=eq.${userA}&select=conversation_id,conversations!inner(kind)&conversations.kind=eq.dm`,
  );
  for (const candidate of candidateIds) {
    const members = await listMembers(candidate.conversation_id as string);
    if (members.length === 2 && members.some((m) => m.userId === userB)) {
      return (await getConversation(candidate.conversation_id as string))!;
    }
  }

  const created = await restService<Row[]>("conversations", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({ kind: "dm" }),
  });
  const conversation = toConversation(created[0]!);
  await restService("conversation_members", {
    method: "POST",
    body: JSON.stringify([
      { conversation_id: conversation.id, user_id: userA },
      { conversation_id: conversation.id, user_id: userB },
    ]),
  });
  return conversation;
}

export async function createGroup(ownerId: string, title: string, memberIds: string[]): Promise<Conversation> {
  const created = await restService<Row[]>("conversations", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({ kind: "group", title, owner_id: ownerId }),
  });
  const conversation = toConversation(created[0]!);
  const allMembers = Array.from(new Set([ownerId, ...memberIds]));
  await restService("conversation_members", {
    method: "POST",
    body: JSON.stringify(allMembers.map((userId) => ({ conversation_id: conversation.id, user_id: userId }))),
  });
  return conversation;
}

export async function listConversationsFor(
  userId: string,
): Promise<(Conversation & { lastMessageAt: string | null; unread: boolean })[]> {
  const memberships = await restService<Row[]>(
    `conversation_members?user_id=eq.${userId}&select=conversation_id,last_read_at`,
  );
  const results = await Promise.all(
    memberships.map(async (membership) => {
      const conversation = await getConversation(membership.conversation_id as string);
      if (!conversation || conversation.status === "deleted") return null;
      const latest = await restService<Row[]>(
        `messages?conversation_id=eq.${conversation.id}&select=created_at&order=created_at.desc&limit=1`,
      );
      const lastMessageAt = (latest[0]?.created_at as string | undefined) ?? null;
      const lastReadAt = membership.last_read_at as string | null;
      return {
        ...conversation,
        lastMessageAt,
        unread: lastMessageAt !== null && (!lastReadAt || lastReadAt < lastMessageAt),
      };
    }),
  );
  return results.filter((row): row is NonNullable<typeof row> => row !== null);
}

export async function addMember(conversationId: string, userId: string): Promise<void> {
  await restService("conversation_members?on_conflict=conversation_id,user_id", {
    method: "POST",
    headers: { prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify({ conversation_id: conversationId, user_id: userId }),
  });
}

export async function removeMember(conversationId: string, userId: string): Promise<void> {
  await restService(`conversation_members?conversation_id=eq.${conversationId}&user_id=eq.${userId}`, {
    method: "DELETE",
  });
}

export async function updateGroupMeta(
  conversationId: string,
  patch: { title?: string; description?: string | null; photoUrl?: string | null },
): Promise<Conversation> {
  const body: Row = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.photoUrl !== undefined) body.photo_url = patch.photoUrl;
  const rows = await restService<Row[]>(`conversations?id=eq.${conversationId}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  return toConversation(rows[0]!);
}

export async function transferOwnership(conversationId: string, newOwnerId: string): Promise<void> {
  await restService(`conversations?id=eq.${conversationId}`, {
    method: "PATCH",
    body: JSON.stringify({ owner_id: newOwnerId }),
  });
}

export async function setMuted(conversationId: string, userId: string, muted: boolean): Promise<void> {
  await restService(`conversation_members?conversation_id=eq.${conversationId}&user_id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ muted }),
  });
}

export async function markRead(conversationId: string, userId: string): Promise<void> {
  await restService(`conversation_members?conversation_id=eq.${conversationId}&user_id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ last_read_at: new Date().toISOString() }),
  });
}
