import { restService, broadcast } from "./supabase";

type Row = Record<string, unknown>;

export type MessageRef = { subjectId: string; chapterId?: string; label: string };

export type Message = {
  id: string;
  conversationId: string;
  senderId: string | null;
  kind: "user" | "ai";
  body: string;
  photoUrl: string | null;
  references: MessageRef[];
  createdAt: string;
  deletedAt: string | null;
};

function toMessage(row: Row): Message {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    senderId: (row.sender_id as string | null) ?? null,
    kind: row.kind as "user" | "ai",
    body: row.deleted_at ? "Dit bericht is verwijderd door een beheerder." : (row.body as string),
    photoUrl: row.deleted_at ? null : ((row.photo_url as string | null) ?? null),
    references: row.deleted_at ? [] : ((row.references as MessageRef[] | null) ?? []),
    createdAt: row.created_at as string,
    deletedAt: (row.deleted_at as string | null) ?? null,
  };
}

export async function listMessages(conversationId: string, limit = 50): Promise<Message[]> {
  const rows = await restService<Row[]>(
    `messages?conversation_id=eq.${conversationId}&select=*&order=created_at.desc&limit=${limit}`,
  );
  return rows.map(toMessage).reverse();
}

/**
 * Inserts a message and broadcasts it to `conversation:<id>` immediately.
 * `authToken` is the sender's own bearer token, reused for the broadcast
 * call the same way every other broadcast() call site in this codebase
 * does — an AI-authored message (senderId null) has no user token, so
 * those call sites pass the token of whichever request triggered them
 * (the human's `/ai` message), which is always available since an AI
 * reply is always a response to a human request in the same handler.
 */
export async function insertMessage(
  authToken: string,
  conversationId: string,
  senderId: string | null,
  kind: "user" | "ai",
  body: string,
  opts: { photoUrl?: string; references?: MessageRef[] } = {},
): Promise<Message> {
  const rows = await restService<Row[]>("messages", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      conversation_id: conversationId,
      sender_id: senderId,
      kind,
      body,
      photo_url: opts.photoUrl ?? null,
      references: opts.references ?? [],
    }),
  });
  const message = toMessage(rows[0]!);
  await broadcast(authToken, `conversation:${conversationId}`, "new-message", { messageId: message.id });
  return message;
}

export function extractMentionedUsernames(body: string): string[] {
  const matches = body.match(/@([a-z0-9_]{3,24})/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.slice(1))));
}

export async function softDeleteMessage(authToken: string, conversationId: string, messageId: string): Promise<void> {
  await restService(`messages?id=eq.${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  });
  await broadcast(authToken, `conversation:${conversationId}`, "message-deleted", { messageId });
}
