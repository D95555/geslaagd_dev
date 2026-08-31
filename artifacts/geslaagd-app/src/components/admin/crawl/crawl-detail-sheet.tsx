import { useEffect, useState } from 'react';
import {
  acceptPendingSource,
  declinePendingSource,
  getCrawlDetail,
  rescoreSource,
  type CrawlDetail,
  type CrawlSource,
} from '@workspace/api-client-react';
import { Check, Loader2, RefreshCw, X } from 'lucide-react';
import {
  SourceFreshness,
  SourceInfoButton,
  SourceInfoDialog,
  type SourceInfo,
} from '@/components/study/source-info-dialog';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Textarea } from '@workspace/geslaagd-momentum/components/ui/textarea';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
import { EmptyState } from '@workspace/geslaagd-momentum/components/layout/empty-state';
import { ListSkeleton } from '@workspace/geslaagd-momentum/components/layout/page-skeleton';
import { DetailSheet } from '@/components/admin/detail-sheet';
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

/** Wide slide-over with everything a crawl's own page used to show, one click away from the crawl list instead of a separate route. */
export function CrawlDetailSheet({ crawlId, onClose }: { crawlId: string | null; onClose: () => void }) {
  const [crawl, setCrawl] = useState<CrawlDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [declineTarget, setDeclineTarget] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [rescoring, setRescoring] = useState<string | null>(null);
  const [rescoreNotice, setRescoreNotice] = useState('');
  const [infoSource, setInfoSource] = useState<SourceInfo | null>(null);

  const load = async (id: string) => {
    setState('loading');
    try {
      setCrawl(await getCrawlDetail(id));
      setState('ready');
    } catch {
      setState('error');
    }
  };
  useEffect(() => {
    if (crawlId) void load(crawlId);
    else {
      setCrawl(null);
      setRescoreNotice('');
    }
  }, [crawlId]);

  const accept = async (sourceId: string) => {
    if (!crawlId) return;
    setBusy(true);
    try {
      await acceptPendingSource(sourceId);
      await load(crawlId);
    } finally {
      setBusy(false);
    }
  };

  const rescore = async (source: CrawlSource) => {
    if (!crawlId) return;
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
      await load(crawlId);
    } catch {
      setRescoreNotice('Opnieuw beoordelen is niet gelukt. Probeer het later nog eens.');
    } finally {
      setRescoring(null);
    }
  };

  const submitDecline = async () => {
    if (!crawlId || !declineTarget || !declineReason.trim()) return;
    setBusy(true);
    try {
      await declinePendingSource(declineTarget, { reason: declineReason.trim() });
      setDeclineTarget(null);
      setDeclineReason('');
      await load(crawlId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DetailSheet
      open={crawlId !== null}
      onClose={onClose}
      wide
      title={crawl?.subjectName ?? 'Crawl'}
      description={
        crawl
          ? `Gestart ${fmtDateTime(crawl.createdAt)}${crawl.completedAt ? ` · voltooid ${fmtDateTime(crawl.completedAt)}` : ''}`
          : undefined
      }
    >
      {state === 'loading' ? (
        <ListSkeleton rows={5} />
      ) : state === 'error' || !crawl ? (
        <EmptyState
          title="Crawl kon niet geladen worden"
          description="Er ging iets mis bij het ophalen. Probeer het opnieuw."
          action={crawlId ? <Button onClick={() => void load(crawlId)}>Opnieuw proberen</Button> : undefined}
        />
      ) : (
        <>
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
    </DetailSheet>
  );
}
