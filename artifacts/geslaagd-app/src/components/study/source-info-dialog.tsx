import { Info } from 'lucide-react';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@workspace/geslaagd-momentum/components/ui/dialog';

export type SourceInfo = {
  title: string | null;
  url: string;
  type: string | null;
  language: string | null;
  qualityScore: number | null;
  confidenceScore?: number | null;
  aiSummary: string | null;
  releaseDate?: string | null;
  createdAt: string | null;
  status?: string | null;
  declineReason?: string | null;
};

const typeLabel: Record<string, string> = {
  article: 'Artikel',
  book: 'Boek',
  pdf: 'PDF',
  video: 'Video',
  website: 'Website',
};

const languageLabel: Record<string, string> = {
  nl: 'Nederlands',
  en: 'Engels',
};

export function fmtDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Short, muted freshness line shown directly on a source card. */
export function SourceFreshness({ createdAt }: { createdAt: string | null }) {
  const formatted = fmtDate(createdAt);
  if (!formatted) return null;
  return <span className="source-freshness">Gevonden op {formatted}</span>;
}

export function SourceInfoDialog({
  source,
  open,
  onOpenChange,
}: {
  source: SourceInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="source-info-dialog">
        {source && (
          <>
            <DialogHeader>
              <DialogTitle>{source.title ?? 'Bron'}</DialogTitle>
              <DialogDescription>Alles wat we over deze bron weten.</DialogDescription>
            </DialogHeader>

            {source.aiSummary && <p className="source-info-summary">{source.aiSummary}</p>}

            <dl className="source-info-facts">
              <div>
                <dt>Link</dt>
                <dd>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.url}
                  </a>
                </dd>
              </div>
              <div>
                <dt>Soort</dt>
                <dd>{source.type ? (typeLabel[source.type] ?? source.type) : 'Onbekend'}</dd>
              </div>
              <div>
                <dt>Taal</dt>
                <dd>{source.language ? (languageLabel[source.language] ?? source.language) : 'Onbekend'}</dd>
              </div>
              <div>
                <dt>Kwaliteit</dt>
                <dd>
                  {source.qualityScore !== null && source.qualityScore !== undefined ? (
                    <span className="source-score">
                      <span className="source-score-value">{source.qualityScore}</span>
                      <span aria-hidden="true" className="source-score-track">
                        <span style={{ width: `${(source.qualityScore / 5) * 100}%` }} />
                      </span>
                      <span className="source-score-max">van 5</span>
                    </span>
                  ) : (
                    'Onbekend'
                  )}
                </dd>
              </div>
              {source.confidenceScore !== null && source.confidenceScore !== undefined && (
                <div>
                  <dt>Zekerheid</dt>
                  <dd>{Math.round(source.confidenceScore * 100)}%</dd>
                </div>
              )}
              {fmtDate(source.releaseDate) && (
                <div>
                  <dt>Publicatie</dt>
                  <dd>{fmtDate(source.releaseDate)}</dd>
                </div>
              )}
              <div>
                <dt>Gevonden op</dt>
                <dd>{fmtDate(source.createdAt) ?? 'Onbekend'}</dd>
              </div>
              {source.status && (
                <div>
                  <dt>Status</dt>
                  <dd>
                    <Badge variant={source.status === 'declined' ? 'destructive' : source.status === 'pending' ? 'secondary' : 'default'}>
                      {source.status === 'accepted' ? 'Geaccepteerd' : source.status === 'declined' ? 'Afgewezen' : 'In review'}
                    </Badge>
                  </dd>
                </div>
              )}
              {source.declineReason && (
                <div>
                  <dt>Reden</dt>
                  <dd>{source.declineReason}</dd>
                </div>
              )}
            </dl>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Small round info trigger placed on a source card. */
export function SourceInfoButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="source-info-button" onClick={onClick} aria-label={`Meer informatie over ${label}`}>
      <Info size={15} aria-hidden="true" />
    </button>
  );
}
