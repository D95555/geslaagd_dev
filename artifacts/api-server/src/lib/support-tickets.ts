import { getServiceUserById, restService } from "./supabase";

type Row = Record<string, unknown>;

export type SupportTicket = {
  id: string;
  userId: string;
  subject: string;
  status: "open" | "closed";
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
};

export type SupportMessage = {
  id: string;
  // 'ai' still appears in old rows written while the AI auto-reply existed;
  // nothing writes it anymore, but history keeps displaying correctly.
  sender: "user" | "ai" | "admin";
  senderUserId: string | null;
  body: string;
  createdAt: string;
};

function toTicket(row: Row): SupportTicket {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    subject: row.subject as string,
    status: row.status as "open" | "closed",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    lastMessageAt: row.last_message_at as string,
  };
}

function toMessage(row: Row): SupportMessage {
  return {
    id: row.id as string,
    sender: row.sender as "user" | "ai" | "admin",
    senderUserId: (row.sender_user_id as string | null) ?? null,
    body: row.body as string,
    createdAt: row.created_at as string,
  };
}

export async function getTicket(ticketId: string): Promise<SupportTicket | null> {
  const rows = await restService<Row[]>(`support_tickets?id=eq.${ticketId}&select=*`);
  return rows[0] ? toTicket(rows[0]) : null;
}

export async function listMessages(ticketId: string): Promise<SupportMessage[]> {
  const rows = await restService<Row[]>(
    `support_messages?ticket_id=eq.${ticketId}&select=*&order=created_at.asc`,
  );
  return rows.map(toMessage);
}

export async function listTicketsForUser(userId: string): Promise<SupportTicket[]> {
  const rows = await restService<Row[]>(
    `support_tickets?user_id=eq.${userId}&select=*&order=last_message_at.desc`,
  );
  return rows.map(toTicket);
}

export async function listAllTickets(filters: { status?: "open" | "closed" }): Promise<SupportTicket[]> {
  const parts = [filters.status ? `status=eq.${filters.status}` : null].filter(Boolean);
  const rows = await restService<Row[]>(
    `support_tickets?select=*&order=last_message_at.desc${parts.length ? `&${parts.join("&")}` : ""}`,
  );
  return rows.map(toTicket);
}

/** Best-effort; a missing email just shows as empty rather than failing the whole list. */
export async function emailForUser(userId: string): Promise<string> {
  const user = await getServiceUserById(userId).catch(() => null);
  return user?.email ?? "";
}

export async function createTicket(userId: string, subject: string): Promise<SupportTicket> {
  const rows = await restService<Row[]>("support_tickets", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({ user_id: userId, subject }),
  });
  const row = rows[0];
  if (!row) throw new Error("Support ticket insert returned no row.");
  return toTicket(row);
}

export async function insertMessage(
  ticketId: string,
  sender: "user" | "admin",
  body: string,
  senderUserId: string | null = null,
): Promise<SupportMessage> {
  const rows = await restService<Row[]>("support_messages", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({ ticket_id: ticketId, sender, sender_user_id: senderUserId, body }),
  });
  const row = rows[0];
  if (!row) throw new Error("Support message insert returned no row.");
  await restService(`support_tickets?id=eq.${ticketId}`, {
    method: "PATCH",
    body: JSON.stringify({ last_message_at: row.created_at, updated_at: new Date().toISOString() }),
  });
  return toMessage(row);
}

export async function setTicketStatus(ticketId: string, status: "open" | "closed"): Promise<void> {
  await restService(`support_tickets?id=eq.${ticketId}`, {
    method: "PATCH",
    body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
  });
}
