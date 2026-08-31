import { z } from "zod";
import { callFastJson } from "./ai";
import { aiUsageRecorder } from "./ai-usage";
import { getServiceUserById, restService } from "./supabase";

type Row = Record<string, unknown>;

export type SupportTicket = {
  id: string;
  userId: string;
  subject: string;
  status: "open" | "closed";
  handledBy: "ai" | "admin";
  flagged: boolean;
  flagReason: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
};

export type SupportMessage = {
  id: string;
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
    handledBy: row.handled_by as "ai" | "admin",
    flagged: Boolean(row.flagged),
    flagReason: (row.flag_reason as string | null) ?? null,
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

export async function listAllTickets(filters: {
  status?: "open" | "closed";
  flagged?: boolean;
}): Promise<SupportTicket[]> {
  const parts = [
    filters.status ? `status=eq.${filters.status}` : null,
    filters.flagged !== undefined ? `flagged=eq.${filters.flagged}` : null,
  ].filter(Boolean);
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
  sender: "user" | "ai" | "admin",
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

export async function takeOverTicket(ticketId: string): Promise<void> {
  await restService(`support_tickets?id=eq.${ticketId}`, {
    method: "PATCH",
    body: JSON.stringify({
      handled_by: "admin",
      flagged: false,
      flag_reason: null,
      updated_at: new Date().toISOString(),
    }),
  });
}

export async function setTicketStatus(ticketId: string, status: "open" | "closed"): Promise<void> {
  await restService(`support_tickets?id=eq.${ticketId}`, {
    method: "PATCH",
    body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
  });
}

const aiReplySchema = z.object({
  reply: z.string(),
  flagForAdmin: z.boolean(),
  flagReason: z.string().nullish().transform((value) => value ?? null),
});

const SYSTEM_PROMPT = [
  "Je bent de supportassistent van geslaagd.app, een Nederlands studieplatform voor",
  "6 VWO en het eerste bachelorjaar. Je helpt een student met een vraag of probleem",
  "over het gebruik van het platform (inloggen, vakken, samenvattingen, oefenvragen,",
  "tentamens, activatiecodes, technische problemen).",
  "",
  "Antwoord kort, vriendelijk en in het Nederlands. Als je het probleem niet zeker",
  "kunt oplossen, of als het gaat om een account-, betaal- of technisch probleem dat",
  "een beheerder moet bekijken, zet dan flagForAdmin op true met een korte reden.",
  "Verzin nooit functionaliteit die niet bestaat.",
  "",
  "Antwoord ALLEEN met JSON:",
  '{ "reply": "je antwoord aan de student", "flagForAdmin": boolean,',
  '  "flagReason": "korte reden voor de beheerder, of null" }',
].join("\n");

const senderLabel: Record<SupportMessage["sender"], string> = {
  user: "Student",
  ai: "AI",
  admin: "Beheerder",
};

/**
 * Generates the AI's next reply for a ticket and stores it, updating the
 * flag when the AI thinks an admin should look. Never throws into the
 * caller's request/response flow -- a failed reply just leaves the ticket
 * without one rather than losing the student's own message.
 */
export async function generateAiReply(ticket: SupportTicket, history: SupportMessage[]): Promise<void> {
  const transcript = history
    .map((message) => `${senderLabel[message.sender]}: ${message.body}`)
    .join("\n\n");

  const parsed = aiReplySchema.safeParse(
    await callFastJson({
      system: SYSTEM_PROMPT,
      user: `Onderwerp: ${ticket.subject}\n\n${transcript}`,
      maxTokens: 1_000,
      onUsage: aiUsageRecorder(null, "support_reply"),
    }),
  );
  if (!parsed.success) return;

  await insertMessage(ticket.id, "ai", parsed.data.reply);
  if (parsed.data.flagForAdmin) {
    await restService(`support_tickets?id=eq.${ticket.id}`, {
      method: "PATCH",
      body: JSON.stringify({ flagged: true, flag_reason: parsed.data.flagReason }),
    });
  }
}
