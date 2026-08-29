import { useEffect, useState } from 'react';
import {
  acceptPendingSource,
  declinePendingSource,
  listPendingSources,
  type PendingSource,
} from '@workspace/api-client-react';
import { ArrowLeft, Check, Loader2, ShieldAlert, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/auth-context';
import { useLivePoll } from '@/lib/use-live-poll';
import { AdminDenied, AdminShell } from '@/components/admin/admin-shell';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Textarea } from '@workspace/geslaagd-momentum/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/geslaagd-momentum/components/ui/dialog';

export default function AdminCrawlPendingPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const [sources, setSources] = useState<PendingSource[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [declineTarget, setDeclineTarget] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [busy, setBusy] = useState(false);

  // `silent` keeps background polling from flashing the loading state.
  const load = async (silent = false) => {
    if (!silent) setState('loading');
    try {
      setSources(await listPendingSources());
      setState('ready');
    } catch (error) {
      setState((error as { status?: number }).status === 403 ? 'forbidden' : 'error');
      throw error;
    }
  };
  useEffect(() => {
    if (!isLoading && user) void load().catch(() => undefined);
    else if (!isLoading) setState('forbidden');
  }, [isLoading, user?.id]);

  useLivePoll(() => load(true), { enabled: state === 'ready' });

  const accept = async (sourceId: string) => {
    setBusy(true);
    try {
      await acceptPendingSource(sourceId);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const submitDecline = async () => {
    if (!declineTarget || !declineReason.trim()) return;
    setBusy(true);
    try {
      await declinePendingSource(declineTarget, { reason: declineReason.trim() });
      setDeclineTarget(null);
      setDeclineReason('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (state === 'forbidden') return <AdminDenied />;

  return (
    <AdminShell
      title="Bronnen beoordelen"
      intro="Deze bronnen hebben een lage zekerheidsscore en wachten op jouw oordeel."
    >

        {state === 'loading' ? (
          <p className="admin-empty"><Loader2 className="spin" size={15} /> Wachtrij laden…</p>
        ) : state === 'error' ? (
          <p className="admin-empty">Wachtrij kon niet geladen worden.</p>
        ) : sources.length === 0 ? (
          <p className="admin-empty">Geen bronnen in de wachtrij.</p>
        ) : (
          <div className="source-list">
            {sources.map((source) => (
              <div className="source-row" key={source.id}>
                <div className="source-row-main">
                  <div>
                    <strong>{source.title ?? source.url}</strong>
                    <a href={source.url} target="_blank" rel="noreferrer">{source.url}</a>
                  </div>
                </div>
                <div className="source-row-meta">
                  <span>{source.type ?? 'onbekend type'}</span>
                  <span>Score: {source.qualityScore ?? '—'}</span>
                  <span>Zekerheid: {source.confidenceScore !== null ? Math.round(source.confidenceScore * 100) + '%' : '—'}</span>
                  {source.subjectNames.length > 0 && <span>Vakken: {source.subjectNames.join(', ')}</span>}
                </div>
                {source.aiSummary && (
                  <p className="source-summary">
                    {expanded === source.id || source.aiSummary.length <= 160 ? source.aiSummary : `${source.aiSummary.slice(0, 160)}…`}
                    {source.aiSummary.length > 160 && (
                      <button type="button" onClick={() => setExpanded(expanded === source.id ? null : source.id)}>
                        {expanded === source.id ? 'minder' : 'meer'}
                      </button>
                    )}
                  </p>
                )}
                <div className="source-row-actions">
                  <Button variant="ghost" disabled={busy} onClick={() => void accept(source.id)}><Check size={14} /> Accepteren</Button>
                  <Button variant="ghost" disabled={busy} onClick={() => { setDeclineTarget(source.id); setDeclineReason(''); }}><X size={14} /> Afwijzen</Button>
                </div>
              </div>
            ))}
          </div>
        )}

      <Dialog open={!!declineTarget} onOpenChange={(open) => { if (!open) setDeclineTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bron afwijzen</DialogTitle>
          </DialogHeader>
          <Textarea value={declineReason} maxLength={1000} onChange={(e) => setDeclineReason(e.target.value)} placeholder="Reden…" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeclineTarget(null)} disabled={busy}>Annuleren</Button>
            <Button variant="destructive" onClick={() => void submitDecline()} disabled={!declineReason.trim() || busy}>
              {busy ? <Loader2 className="spin" size={14} /> : <X size={14} />} Afwijzen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
