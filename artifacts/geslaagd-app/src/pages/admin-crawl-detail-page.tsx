import { useEffect, useState } from 'react';
import {
  acceptPendingSource,
  declinePendingSource,
  getCrawlDetail,
  rescoreSource,
  type CrawlDetail,
  type CrawlSource,
} from '@workspace/api-client-react';
import { ArrowLeft, Check, Loader2, RefreshCw, ShieldAlert, X } from 'lucide-react';
import {
  SourceFreshness,
  SourceInfoButton,
  SourceInfoDialog,
  type SourceInfo,
} from '@/components/study/source-info-dialog';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Textarea } from '@workspace/geslaagd-momentum/components/ui/textarea';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
import { useSurfaceTheme } from '@workspace/geslaagd-momentum/hooks/use-theme';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/geslaagd-momentum/components/ui/dialog';

function fmtDateTime(value: string | null) {
  if (!value) return 'onbekend';
  return new Date(value).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' });
}

const sourceStatusLabel: Record<CrawlSource['status'], string> = {
  pending: 'In review',
  accepted: 'Geaccepteerd',
  declined: 'Afgewezen',
};

/**
 * A source is worth a second scoring pass when the first attempt failed
 * outright (the fallback writes score 1 / confidence 0) or when it landed just
 * below the acceptance bar rather than being clearly unsuitable.
 */
function scoringFailed(source: CrawlSource): boolean {
  return source.status === 'declined' && source.qualityScore === 1 && source.confidenceScore === 0;
}
function barelyMissed(source: CrawlSource): boolean {
  return source.status === 'declined' && (source.qualityScore === 2 || source.qualityScore === 3);
}

export default function AdminCrawlDetailPage({ crawlId }: { crawlId: string }) {
  const [, setLocation] = useLocation();
  // This page still builds its own chrome instead of using AdminShell (it is
  // rebuilt in the admin phase); declare the surface theme so it does not show
  // up as the one light page in a dark admin.
  useSurfaceTheme('dark');
  const { user, isLoading } = useAuth();
  const [crawl, setCrawl] = useState<CrawlDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [declineTarget, setDeclineTarget] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [rescoring, setRescoring] = useState<string | null>(null);
  const [rescoreNotice, setRescoreNotice] = useState('');
  const [infoSource, setInfoSource] = useState<SourceInfo | null>(null);

  const load = async () => {
    setState('loading');
    try {
      setCrawl(await getCrawlDetail(crawlId));
      setState('ready');
    } catch (error) {
      setState((error as { status?: number }).status === 403 ? 'forbidden' : 'error');
    }
  };
  useEffect(() => {
    if (!isLoading && user) void load();
    else if (!isLoading) setState('forbidden');
  }, [isLoading, user?.id, crawlId]);

  const accept = async (sourceId: string) => {
    setBusy(true);
    try {
      await acceptPendingSource(sourceId);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const rescore = async (source: CrawlSource) => {
    setRescoring(source.id);
    setRescoreNotice('');
    try {
      const updated = await rescoreSource(source.id);
      const label =
        updated.status === 'accepted'
          ? 'nu geaccepteerd'
          : updated.status === 'pending'
            ? 'naar de wachtrij verplaatst'
            : 'opnieuw afgewezen';
      setRescoreNotice(`"${updated.title ?? updated.url}" is ${label} (score ${updated.qualityScore ?? '—'}).`);
      await load();
    } catch {
      setRescoreNotice('Opnieuw beoordelen is niet gelukt. Probeer het later nog eens.');
    } finally {
      setRescoring(null);
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

  if (state === 'forbidden') {
    return (
      <main className="admin-denied">
        <ShieldAlert size={29} />
        <h1>Geen toegang.</h1>
        <p>Deze omgeving is alleen voor beheerders.</p>
        <Button onClick={() => setLocation('/beheer')}>Terug naar beheer</Button>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <button className="auth-brand" onClick={() => setLocation('/beheer/crawl')}>
          <span className="wordmark-mark" /><span>geslaagd.app</span>
        </button>
        <div>
          <span>crawldetail</span>
          <Button variant="ghost" onClick={() => setLocation('/beheer/crawl')}><ArrowLeft size={15} /> Terug naar crawls</Button>
        </div>
      </header>
      <section className="admin-wrap">
        {state === 'loading' ? (
          <p className="admin-empty"><Loader2 className="spin" size={15} /> Crawl laden…</p>
        ) : state === 'error' || !crawl ? (
          <p className="admin-empty">Crawl kon niet geladen worden.</p>
        ) : (
          <>
            <div className="admin-intro">
              <p className="dashboard-kicker">crawl</p>
              <h1>{crawl.subjectName}</h1>
              <p>Gestart {fmtDateTime(crawl.createdAt)}{crawl.completedAt ? ` · voltooid ${fmtDateTime(crawl.completedAt)}` : ''}</p>
            </div>

            <div className="crawl-detail-meta">
              <div><span>Status</span><strong>{crawl.status}</strong></div>
              <div><span>Gevonden</span><strong>{crawl.sourcesFound ?? 0}</strong></div>
              <div><span>Geaccepteerd</span><strong>{crawl.sourcesAccepted ?? 0}</strong></div>
              <div><span>Credits</span><strong>{crawl.creditsUsed ?? '—'}</strong></div>
              <div><span>Efficiëntie</span><strong>{crawl.efficiencyRatio !== null ? crawl.efficiencyRatio.toFixed(3) : '—'}</strong></div>
            </div>
            {crawl.promptUsed && <p className="crawl-prompt-used"><strong>Firecrawl-query:</strong> {crawl.promptUsed}</p>}
            {crawl.errorDetail && <p className="admin-notice is-error">{crawl.errorDetail}</p>}

            {rescoreNotice && <p className="admin-notice" role="status">{rescoreNotice}</p>}

            <div className="source-list">
              {crawl.sources.length === 0 ? (
                <p className="admin-empty">Nog geen bronnen gevonden.</p>
              ) : crawl.sources.map((source) => {
                const failed = scoringFailed(source);
                const nearMiss = barelyMissed(source);
                return (
                <div className={`source-row${failed ? ' is-scoring-failed' : ''}`} key={source.id}>
                  <div className="source-row-main">
                    <div>
                      <strong>{source.title ?? source.url}</strong>
                      <a href={source.url} target="_blank" rel="noreferrer">{source.url}</a>
                    </div>
                    <div className="source-row-badges">
                      <Badge variant={source.status === 'declined' ? 'destructive' : source.status === 'pending' ? 'secondary' : 'default'}>
                        {sourceStatusLabel[source.status]}
                      </Badge>
                      <SourceInfoButton
                        label={source.title ?? source.url}
                        onClick={() => setInfoSource({
                          title: source.title,
                          url: source.url,
                          type: source.type,
                          language: null,
                          qualityScore: source.qualityScore,
                          confidenceScore: source.confidenceScore,
                          aiSummary: source.aiSummary,
                          createdAt: source.createdAt,
                          status: source.status,
                          declineReason: source.declineReason,
                        })}
                      />
                    </div>
                  </div>
                  <div className="source-row-meta">
                    <span>{source.type ?? 'onbekend type'}</span>
                    <span>Score: {source.qualityScore ?? '—'}</span>
                    <span>Zekerheid: {source.confidenceScore !== null ? Math.round(source.confidenceScore * 100) + '%' : '—'}</span>
                    <SourceFreshness createdAt={source.createdAt} />
                  </div>
                  {failed && (
                    <p className="source-scoring-failed-note">
                      De automatische beoordeling is mislukt — deze bron is niet inhoudelijk afgewezen.
                    </p>
                  )}
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
                  {source.declineReason && !failed && <p className="source-decline-reason">Reden: {source.declineReason}</p>}
                  {(source.status === 'pending' || failed || nearMiss) && (
                    <div className="source-row-actions">
                      {source.status === 'pending' && (
                        <>
                          <Button variant="ghost" disabled={busy} onClick={() => void accept(source.id)}><Check size={14} /> Accepteren</Button>
                          <Button variant="ghost" disabled={busy} onClick={() => { setDeclineTarget(source.id); setDeclineReason(''); }}><X size={14} /> Afwijzen</Button>
                        </>
                      )}
                      {(failed || nearMiss) && (
                        <Button
                          variant={failed ? 'default' : 'outline'}
                          disabled={rescoring !== null}
                          onClick={() => void rescore(source)}
                        >
                          {rescoring === source.id
                            ? <Loader2 className="spin" size={14} />
                            : <RefreshCw size={14} />}
                          {failed ? ' Opnieuw beoordelen' : ' Tweede kans'}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <SourceInfoDialog
        source={infoSource}
        open={!!infoSource}
        onOpenChange={(open) => { if (!open) setInfoSource(null); }}
      />

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
    </main>
  );
}
