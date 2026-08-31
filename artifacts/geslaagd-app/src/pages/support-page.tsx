import { type FormEvent, useEffect, useState } from 'react';
import {
  addSupportMessage,
  createSupportTicket,
  getSupportTicket,
  listSupportTickets,
  type SupportTicketDetail,
  type SupportTicketSummary,
} from '@workspace/api-client-react';
import { ArrowLeft, Loader2, MessageCircleQuestion, Plus, Send } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import { Textarea } from '@workspace/geslaagd-momentum/components/ui/textarea';
import { EmptyState } from '@workspace/geslaagd-momentum/components/layout/empty-state';

function fmtDateTime(value: string) {
  return new Date(value).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' });
}

const statusLabel: Record<SupportTicketSummary['status'], string> = {
  open: 'Open',
  closed: 'Gesloten',
};

const senderLabel: Record<SupportTicketDetail['messages'][number]['sender'], string> = {
  user: 'Jij',
  ai: 'Support-AI',
  admin: 'Beheerder',
};

function NewTicketForm({ onCreated }: { onCreated: (ticket: SupportTicketDetail) => void }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setBusy(true);
    setError('');
    try {
      const ticket = await createSupportTicket({ subject: subject.trim(), message: message.trim() });
      onCreated(ticket);
    } catch {
      setError('Ticket aanmaken is niet gelukt. Probeer het opnieuw.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="support-new-form" onSubmit={(event) => void submit(event)}>
      <label htmlFor="support-subject">Onderwerp</label>
      <Input
        id="support-subject"
        value={subject}
        maxLength={160}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Waar gaat het over?"
        required
      />
      <label htmlFor="support-message">Bericht</label>
      <Textarea
        id="support-message"
        rows={5}
        value={message}
        maxLength={4000}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Beschrijf je vraag of probleem zo duidelijk mogelijk."
        required
      />
      {error && <p className="admin-notice is-error">{error}</p>}
      <Button type="submit" disabled={busy || !subject.trim() || !message.trim()}>
        {busy ? <Loader2 className="spin" size={14} /> : <Send size={14} />} Ticket versturen
      </Button>
    </form>
  );
}

function TicketThread({
  ticket,
  onBack,
  onUpdated,
}: {
  ticket: SupportTicketDetail;
  onBack: () => void;
  onUpdated: (ticket: SupportTicketDetail) => void;
}) {
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      const updated = await addSupportMessage(ticket.id, { message: reply.trim() });
      setReply('');
      onUpdated(updated);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="support-thread">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft size={14} /> Terug naar tickets</Button>
      <div className="support-thread-head">
        <h2>{ticket.subject}</h2>
        <Badge variant={ticket.status === 'open' ? 'default' : 'secondary'}>{statusLabel[ticket.status]}</Badge>
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
      {ticket.status === 'open' ? (
        <form className="support-reply-form" onSubmit={(event) => void send(event)}>
          <Textarea
            rows={3}
            value={reply}
            maxLength={4000}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Typ je bericht…"
          />
          <Button type="submit" disabled={sending || !reply.trim()}>
            {sending ? <Loader2 className="spin" size={14} /> : <Send size={14} />} Versturen
          </Button>
        </form>
      ) : (
        <p className="study-hint">Dit ticket is gesloten.</p>
      )}
    </div>
  );
}

export default function SupportPage() {
  const { user, isLoading } = useAuth();
  const [tickets, setTickets] = useState<SupportTicketSummary[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selected, setSelected] = useState<SupportTicketDetail | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setState('loading');
    try {
      const result = await listSupportTickets();
      setTickets(result.tickets);
      setState('ready');
    } catch {
      setState('error');
    }
  };
  useEffect(() => {
    if (!isLoading && user) void load();
  }, [isLoading, user?.id]);

  const openTicket = async (id: string) => {
    const detail = await getSupportTicket(id);
    setSelected(detail);
  };

  if (selected) {
    return (
      <section className="admin-content support-page">
        <TicketThread
          ticket={selected}
          onBack={() => { setSelected(null); void load(); }}
          onUpdated={setSelected}
        />
      </section>
    );
  }

  return (
    <section className="admin-content support-page">
      <div className="admin-content-head">
        <div>
          <h1>Support</h1>
          <p>Heb je een vraag of loop je tegen iets aan? Stel hem hier.</p>
        </div>
        {!creating && tickets.length > 0 && (
          <div className="admin-content-actions">
            <Button onClick={() => setCreating(true)}><Plus size={14} /> Nieuw ticket</Button>
          </div>
        )}
      </div>

      {creating || tickets.length === 0 ? (
        <>
          <NewTicketForm
            onCreated={(ticket) => { setCreating(false); setSelected(ticket); }}
          />
          {tickets.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>Annuleren</Button>
          )}
        </>
      ) : state === 'loading' ? (
        <p className="admin-empty"><Loader2 className="spin" size={15} /> Tickets laden…</p>
      ) : state === 'error' ? (
        <p className="admin-empty">Tickets konden niet geladen worden.</p>
      ) : tickets.length === 0 ? (
        <EmptyState
          title="Nog geen tickets"
          description="Stel hierboven je eerste vraag."
          icon={<MessageCircleQuestion size={22} />}
        />
      ) : (
        <div className="account-list">
          {tickets.map((ticket) => (
            <button key={ticket.id} className="account-row" onClick={() => void openTicket(ticket.id)}>
              <div>
                <strong>{ticket.subject}</strong>
                <span>
                  {fmtDateTime(ticket.lastMessageAt)}
                  {ticket.handledBy === 'admin' ? ' · door een beheerder opgepakt' : ''}
                </span>
              </div>
              <Badge variant={ticket.status === 'open' ? 'default' : 'secondary'}>
                {statusLabel[ticket.status]}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
