import { type FormEvent, useEffect, useState } from 'react';
import {
  addSupportMessage,
  closeSupportTicket,
  getSupportTicket,
  listAdminSupportTickets,
  reopenSupportTicket,
  takeoverSupportTicket,
  type SupportTicketDetail,
  type SupportTicketSummary,
} from '@workspace/api-client-react';
import { AlertTriangle, Loader2, Send, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { useLivePoll } from '@/lib/use-live-poll';
import { AdminDenied, AdminShell } from '@/components/admin/admin-shell';
import { DetailSheet } from '@/components/admin/detail-sheet';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Textarea } from '@workspace/geslaagd-momentum/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/geslaagd-momentum/components/ui/select';

function fmtDateTime(value: string) {
  return new Date(value).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' });
}

const statusLabel: Record<SupportTicketSummary['status'], string> = {
  open: 'Open',
  closed: 'Gesloten',
};

const senderLabel: Record<SupportTicketDetail['messages'][number]['sender'], string> = {
  user: 'Student',
  ai: 'Support-AI',
  admin: 'Beheerder',
};

function TicketDetailPanel({
  ticket,
  onUpdated,
}: {
  ticket: SupportTicketDetail;
  onUpdated: (ticket: SupportTicketDetail) => void;
}) {
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    try {
      const updated = await addSupportMessage(ticket.id, { message: reply.trim() });
      setReply('');
      onUpdated(updated);
    } finally {
      setBusy(false);
    }
  };

  const takeover = async () => {
    setBusy(true);
    try {
      onUpdated(await takeoverSupportTicket(ticket.id));
    } finally {
      setBusy(false);
    }
  };

  const toggleClosed = async () => {
    setBusy(true);
    try {
      onUpdated(ticket.status === 'open' ? await closeSupportTicket(ticket.id) : await reopenSupportTicket(ticket.id));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="request-row-actions">
        <Badge variant={ticket.status === 'open' ? 'default' : 'secondary'}>{statusLabel[ticket.status]}</Badge>
        <Badge variant="secondary">{ticket.handledBy === 'ai' ? 'AI reageert' : 'Bij beheerder'}</Badge>
        {ticket.flagged && <Badge variant="destructive"><AlertTriangle size={12} /> {ticket.flagReason ?? 'gemarkeerd'}</Badge>}
      </div>
      <div className="request-row-actions">
        {ticket.handledBy === 'ai' && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void takeover()}>
            <ShieldCheck size={14} /> Overnemen
          </Button>
        )}
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void toggleClosed()}>
          <X size={14} /> {ticket.status === 'open' ? 'Sluiten' : 'Heropenen'}
        </Button>
      </div>

      <div className="support-message-list">
        {ticket.messages.map((message) => (
          <div key={message.id} className={`support-message support-message-${message.sender}`}>
            <div className="support-message-meta">
              <strong>{senderLabel[message.sender]}</strong>
              <span>{fmtDateTime(message.createdAt)}</span>
            </div>
            <p>{message.body}</p>
          </div>
        ))}
      </div>

      {ticket.status === 'open' && (
        <form className="support-reply-form" onSubmit={(event) => void send(event)}>
          <Textarea
            rows={3}
            value={reply}
            maxLength={4000}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Reageer als beheerder… (dit neemt het ticket automatisch over)"
          />
          <Button type="submit" disabled={busy || !reply.trim()}>
            {busy ? <Loader2 className="spin" size={14} /> : <Send size={14} />} Versturen
          </Button>
        </form>
      )}
    </>
  );
}

export default function AdminSupportPage() {
  const { user, isLoading } = useAuth();
  const [tickets, setTickets] = useState<SupportTicketSummary[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('open');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SupportTicketDetail | null>(null);

  const load = async (silent = false) => {
    if (!silent) setState('loading');
    try {
      const result = await listAdminSupportTickets({
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
        ...(flaggedOnly ? { flagged: true } : {}),
      });
      setTickets(result.tickets);
      setState('ready');
    } catch (error) {
      setState((error as { status?: number }).status === 403 ? 'forbidden' : 'error');
    }
  };
  useEffect(() => {
    if (!isLoading && user) void load();
    else if (!isLoading) setState('forbidden');
  }, [isLoading, user?.id, statusFilter, flaggedOnly]);

  useLivePoll(() => load(true), { enabled: state === 'ready', intervalMs: 8_000 });

  useEffect(() => {
    if (selectedId) void getSupportTicket(selectedId).then(setSelected);
    else setSelected(null);
  }, [selectedId]);

  if (state === 'forbidden') return <AdminDenied />;

  return (
    <AdminShell
      title="Support"
      intro="Elke ticket is zichtbaar. De AI reageert vanzelf en markeert wat jouw aandacht nodig heeft."
    >
      <div className="pipeline-filters">
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
          <SelectTrigger className="pipeline-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closed">Gesloten</SelectItem>
            <SelectItem value="all">Alles</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={flaggedOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFlaggedOnly((now) => !now)}
        >
          <AlertTriangle size={14} /> Alleen gemarkeerd
        </Button>
      </div>

      {state === 'loading' ? (
        <p className="admin-empty"><Loader2 className="spin" size={15} /> Tickets laden…</p>
      ) : state === 'error' ? (
        <p className="admin-empty">Tickets konden niet geladen worden.</p>
      ) : tickets.length === 0 ? (
        <p className="admin-empty">Geen tickets voor dit filter.</p>
      ) : (
        <div className="account-list">
          {tickets.map((ticket) => (
            <button key={ticket.id} className="account-row" onClick={() => setSelectedId(ticket.id)}>
              <div>
                <strong>{ticket.subject}</strong>
                <span>{ticket.userEmail} · {fmtDateTime(ticket.lastMessageAt)}</span>
              </div>
              <div className="request-row-actions">
                {ticket.flagged && <Badge variant="destructive"><AlertTriangle size={12} /></Badge>}
                <Badge variant="secondary">{ticket.handledBy === 'ai' ? 'AI' : 'Beheerder'}</Badge>
                <Badge variant={ticket.status === 'open' ? 'default' : 'secondary'}>{statusLabel[ticket.status]}</Badge>
              </div>
            </button>
          ))}
        </div>
      )}

      <DetailSheet
        open={selectedId !== null}
        onClose={() => setSelectedId(null)}
        wide
        title={selected?.subject ?? 'Ticket'}
        description={selected?.userEmail}
      >
        {selected ? <TicketDetailPanel ticket={selected} onUpdated={setSelected} /> : <Loader2 className="spin" size={18} />}
      </DetailSheet>
    </AdminShell>
  );
}
