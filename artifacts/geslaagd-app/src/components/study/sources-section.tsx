import { type FormEvent, useEffect, useState } from 'react';
import {
  listMySourceSubjectRequests,
  listSources,
  requestSourceSubject,
  type CrawlSubjectRequest,
  type StudentSource,
} from '@workspace/api-client-react';
import { ExternalLink, Library, Loader2, Send } from 'lucide-react';
import {
  SourceFreshness,
  SourceInfoButton,
  SourceInfoDialog,
  type SourceInfo,
} from './source-info-dialog';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/geslaagd-momentum/components/ui/select';

const statusLabel: Record<CrawlSubjectRequest['status'], string> = {
  pending: 'In behandeling',
  approved: 'Goedgekeurd',
  denied: 'Afgewezen',
  needs_refinement: 'Aanpassing gevraagd',
};

export function SourcesSection() {
  const [name, setName] = useState('');
  const [yearLevel, setYearLevel] = useState<'vwo' | 'bachelor1'>('vwo');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [requests, setRequests] = useState<CrawlSubjectRequest[]>([]);
  const [sources, setSources] = useState<StudentSource[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [infoSource, setInfoSource] = useState<SourceInfo | null>(null);

  const load = async () => {
    try {
      const [nextRequests, nextSources] = await Promise.all([
        listMySourceSubjectRequests(),
        listSources(),
      ]);
      setRequests(nextRequests);
      setSources(nextSources);
    } catch {
      // Source pipeline tables not yet migrated in this environment.
    } finally {
      setLoaded(true);
    }
  };
  useEffect(() => { void load(); }, []);

  const submitRequest = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setMessage('');
    try {
      await requestSourceSubject({ name: trimmed, year_level: yearLevel });
      setName('');
      setMessage('Je aanvraag is verstuurd.');
      await load();
    } catch (error) {
      const status = (error as { status?: number }).status;
      setMessage(status === 409 ? 'Je hebt dit vak al aangevraagd.' : 'Je aanvraag kon niet worden verstuurd.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!loaded) return null;

  return (
    <section className="sources-section">
      <div className="section-title">
        <div><span>BRONNEN</span><h2>Vakken aanvragen &amp; bronnen</h2></div>
      </div>

      <div className="source-request-card">
        <form onSubmit={submitRequest} className="source-request-form">
          <Input
            value={name}
            maxLength={160}
            onChange={(event) => setName(event.target.value)}
            placeholder="Bijvoorbeeld: Scheikunde"
            aria-label="Vaknaam"
          />
          <Select value={yearLevel} onValueChange={(value) => setYearLevel(value as 'vwo' | 'bachelor1')}>
            <SelectTrigger aria-label="Niveau"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="vwo">6 VWO</SelectItem>
              <SelectItem value="bachelor1">Eerstejaars bachelor</SelectItem>
            </SelectContent>
          </Select>
          <Button disabled={submitting || !name.trim()}>
            {submitting ? <Loader2 className="spin" size={15} /> : <Send size={15} />} Vak aanvragen
          </Button>
        </form>
        {message && <p className="admin-notice">{message}</p>}
        {requests.length > 0 && (
          <ul className="source-request-list">
            {requests.map((request) => (
              <li key={request.id}>
                <div>
                  <strong>{request.subjectName ?? 'Onbekend vak'}</strong>
                  {request.adminNote && <span>{request.adminNote}</span>}
                </div>
                <Badge variant={request.status === 'denied' ? 'destructive' : 'secondary'}>
                  {statusLabel[request.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      {sources.length > 0 ? (
        <div className="source-browse-list">
          {sources.map((source) => (
            <article className="source-browse-card" key={source.id}>
              <Library size={16} aria-hidden="true" />
              <div className="source-browse-body">
                <a
                  className="source-browse-title"
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${source.title ?? source.url} — opent in een nieuw tabblad`}
                >
                  {source.title ?? source.url}
                  <ExternalLink size={13} aria-hidden="true" />
                </a>
                {source.aiSummary && <p>{source.aiSummary}</p>}
                <SourceFreshness createdAt={source.createdAt} />
              </div>
              <SourceInfoButton
                label={source.title ?? source.url}
                onClick={() =>
                  setInfoSource({
                    title: source.title,
                    url: source.url,
                    type: source.type,
                    language: source.language,
                    qualityScore: source.qualityScore,
                    aiSummary: source.aiSummary,
                    releaseDate: source.releaseDate,
                    createdAt: source.createdAt,
                  })
                }
              />
            </article>
          ))}
        </div>
      ) : (
        <p className="study-empty">
          Nog geen bronnen beschikbaar. Zodra een vak is goedgekeurd en gecrawld, verschijnen bronnen hier automatisch.
        </p>
      )}

      <SourceInfoDialog
        source={infoSource}
        open={!!infoSource}
        onOpenChange={(open) => { if (!open) setInfoSource(null); }}
      />
    </section>
  );
}
