import { Router, type IRouter, type Request } from "express";
import {
  AddSupportMessageBody,
  AddSupportMessageParams,
  CloseSupportTicketParams,
  CreateSupportTicketBody,
  GetSupportTicketParams,
  GrantSupportTicketPackageBody,
  GrantSupportTicketPackageParams,
  ListAdminSupportTicketsQueryParams,
  ReopenSupportTicketParams,
} from "@workspace/api-zod";
import { getAuthenticatedUser } from "../lib/supabase";
import { setAccountPackage } from "../lib/credits";
import {
  createTicket,
  emailForUser,
  getTicket,
  insertMessage,
  listAllTickets,
  listMessages,
  listTicketsForUser,
  setTicketStatus,
  type SupportTicket,
} from "../lib/support-tickets";

const router: IRouter = Router();

async function requireUser(req: Request) {
  return getAuthenticatedUser(req.header("authorization"));
}

async function toSummary(ticket: SupportTicket) {
  return { ...ticket, userEmail: await emailForUser(ticket.userId) };
}

async function toDetail(ticket: SupportTicket) {
  const [summary, messages] = await Promise.all([toSummary(ticket), listMessages(ticket.id)]);
  return { ...summary, messages };
}

router.get("/support/tickets", async (req, res): Promise<void> => {
  const user = await requireUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const tickets = await listTicketsForUser(user.id);
    res.json({ tickets: await Promise.all(tickets.map(toSummary)) });
  } catch (error) {
    req.log.warn({ error }, "Could not list support tickets");
    res.status(500).json({ error: "Tickets konden niet worden geladen." });
  }
});

router.post("/support/tickets", async (req, res): Promise<void> => {
  const user = await requireUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const input = CreateSupportTicketBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Onderwerp en bericht zijn verplicht." }); return; }
  try {
    const ticket = await createTicket(user.id, input.data.subject.trim());
    await insertMessage(ticket.id, "user", input.data.message.trim(), user.id);
    res.status(201).json(await toDetail(ticket));
  } catch (error) {
    req.log.warn({ error }, "Could not create support ticket");
    res.status(500).json({ error: "Ticket kon niet worden aangemaakt." });
  }
});

router.get("/support/tickets/:ticketId", async (req, res): Promise<void> => {
  const user = await requireUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = GetSupportTicketParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldig ticket." }); return; }
  try {
    const ticket = await getTicket(params.data.ticketId);
    if (!ticket) { res.status(404).json({ error: "Ticket niet gevonden." }); return; }
    if (ticket.userId !== user.id && !user.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }
    res.json(await toDetail(ticket));
  } catch (error) {
    req.log.warn({ error }, "Could not load support ticket");
    res.status(500).json({ error: "Ticket kon niet worden geladen." });
  }
});

router.post("/support/tickets/:ticketId/messages", async (req, res): Promise<void> => {
  const user = await requireUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = AddSupportMessageParams.safeParse(req.params);
  const input = AddSupportMessageBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Bericht is verplicht." }); return; }
  try {
    const ticket = await getTicket(params.data.ticketId);
    if (!ticket) { res.status(404).json({ error: "Ticket niet gevonden." }); return; }
    const isOwner = ticket.userId === user.id;
    if (!isOwner && !user.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

    await insertMessage(ticket.id, user.isAdmin ? "admin" : "user", input.data.message.trim(), user.id);
    res.status(201).json(await toDetail(ticket));
  } catch (error) {
    req.log.warn({ error }, "Could not add support message");
    res.status(500).json({ error: "Bericht kon niet worden verstuurd." });
  }
});

async function admin(req: Request) {
  const user = await getAuthenticatedUser(req.header("authorization"));
  return user?.isAdmin ? user : null;
}

router.get("/admin/support/tickets", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const query = ListAdminSupportTicketsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Ongeldige filter." }); return; }
  try {
    const tickets = await listAllTickets(query.data);
    res.json({ tickets: await Promise.all(tickets.map(toSummary)) });
  } catch (error) {
    req.log.warn({ error }, "Could not list admin support tickets");
    res.status(500).json({ error: "Tickets konden niet worden geladen." });
  }
});

router.post("/admin/support/tickets/:ticketId/close", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const params = CloseSupportTicketParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldig ticket." }); return; }
  try {
    const ticket = await getTicket(params.data.ticketId);
    if (!ticket) { res.status(404).json({ error: "Ticket niet gevonden." }); return; }
    await setTicketStatus(ticket.id, "closed");
    res.json(await toDetail((await getTicket(ticket.id))!));
  } catch (error) {
    req.log.warn({ error }, "Could not close support ticket");
    res.status(500).json({ error: "Sluiten is mislukt." });
  }
});

router.post("/admin/support/tickets/:ticketId/reopen", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const params = ReopenSupportTicketParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldig ticket." }); return; }
  try {
    const ticket = await getTicket(params.data.ticketId);
    if (!ticket) { res.status(404).json({ error: "Ticket niet gevonden." }); return; }
    await setTicketStatus(ticket.id, "open");
    res.json(await toDetail((await getTicket(ticket.id))!));
  } catch (error) {
    req.log.warn({ error }, "Could not reopen support ticket");
    res.status(500).json({ error: "Heropenen is mislukt." });
  }
});

router.post("/admin/support/tickets/:ticketId/grant-package", async (req, res): Promise<void> => {
  const identity = await admin(req);
  if (!identity) { res.status(403).json({ error: "Forbidden" }); return; }
  const params = GrantSupportTicketPackageParams.safeParse(req.params);
  const input = GrantSupportTicketPackageBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Ongeldig verzoek." }); return; }
  try {
    const ticket = await getTicket(params.data.ticketId);
    if (!ticket) { res.status(404).json({ error: "Ticket niet gevonden." }); return; }

    await setAccountPackage(ticket.userId, input.data.package, "admin_adjustment", "Pakket toegekend via verificatieticket");
    await setTicketStatus(ticket.id, "closed");
    res.json(await toDetail((await getTicket(ticket.id))!));
  } catch (error) {
    req.log.warn({ error }, "Could not grant package from ticket");
    res.status(500).json({ error: "Pakket toekennen is mislukt." });
  }
});

export default router;
