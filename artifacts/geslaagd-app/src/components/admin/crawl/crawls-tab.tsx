import { useEffect, useState } from 'react';
import { listCrawls, type CrawlSummary } from '@workspace/api-client-react';
import { Loader2 } from 'lucide-react';
import { useLivePoll } from '@/lib/use-live-poll';
import { CrawlCharts } from '@/components/admin/crawl-charts';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
import { CrawlDetailSheet } from '@/components/admin/crawl/crawl-detail-sheet';

function fmtDateTime(value: string | null) {
  if (!value) return 'onbekend';
  return new Date(value).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' });
}

const crawlStatusLabel: Record<CrawlSummary['status'], string> = {
  running: 'Bezig',
  complete: 'Voltooid',
  failed: 'Mislukt',
};

export function CrawlsTab() {
  const [crawls, setCrawls] = useState<CrawlSummary[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selectedCrawlId, setSelectedCrawlId] = useState<string | null>(null);

  const load = async (silent = false) => {
    if (!silent) setState('loading');
    try {
      setCrawls(await listCrawls());
      setState('ready');
    } catch {
      setState('error');
    }
  };
  useEffect(() => { void load(); }, []);
  useLivePoll(() => load(true), { enabled: state === 'ready' });

  return (
    <>
      {state === 'loading' ? (
        <p className="admin-empty"><Loader2 className="spin" size={15} /> Crawls laden…</p>
      ) : state === 'error' ? (
        <p className="admin-empty">Crawls konden niet geladen worden.</p>
      ) : crawls.length === 0 ? (
        <p className="admin-empty">Nog geen crawls uitgevoerd.</p>
      ) : (
        <>
          <CrawlCharts crawls={crawls} />
          <div className="account-list">
            {crawls.map((crawl) => (
              <button
                key={crawl.id}
                className="account-row crawl-row"
                onClick={() => setSelectedCrawlId(crawl.id)}
              >
                <div>
                  <strong>{crawl.subjectName}</strong>
                  <span>
                    {fmtDateTime(crawl.createdAt)} · {crawl.sourcesFound ?? 0} gevonden · {crawl.sourcesAccepted ?? 0} geaccepteerd
                    {crawl.creditsUsed !== null ? ` · ${crawl.creditsUsed} credits` : ''}
                    {crawl.efficiencyRatio !== null ? ` · efficiëntie ${crawl.efficiencyRatio.toFixed(2)}` : ''}
                  </span>
                </div>
                <Badge variant={crawl.status === 'failed' ? 'destructive' : crawl.status === 'running' ? 'secondary' : 'default'}>
                  {crawlStatusLabel[crawl.status]}
                </Badge>
              </button>
            ))}
          </div>
        </>
      )}

      <CrawlDetailSheet crawlId={selectedCrawlId} onClose={() => setSelectedCrawlId(null)} />
    </>
  );
}
