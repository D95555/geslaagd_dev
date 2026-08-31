import { useEffect, useMemo, useState } from 'react';
import {
  listCrawlSubjects,
  listPipelineLogs,
  type CrawlSubject,
  type PipelineLogEntry,
} from '@workspace/api-client-react';
import { BadgeCheck, CircleHelp, Loader2, RefreshCw, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { useLivePoll } from '@/lib/use-live-poll';
import { AdminDenied, AdminShell } from '@/components/admin/admin-shell';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/geslaagd-momentum/components/ui/select';

/** How each decision-carrying log phase should read to an admin, not just the raw phase string. */
const DECISION_META: Record<string, { label: string; icon: typeof BadgeCheck }> = {
  beoordeeld: { label: 'Bronbeoordeling', icon: BadgeCheck },
  'link-beoordeeld': { label: 'Bronbeoordeling (via link)', icon: BadgeCheck },
  behouden: { label: 'Bron behouden bij review', icon: ThumbsUp },
  afgewezen: { label: 'Bron afgewezen bij review', icon: ThumbsDown },
  triage: { label: 'Vakaanvraag beoordeeld', icon: CircleHelp },
};

function fmtDateTime(value: string) {
  return new Date(value).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'medium' });
}

function DecisionRow({ entry, subjectName }: { entry: PipelineLogEntry; subjectName: string | null }) {
  const [open, setOpen] = useState(false);
  const meta = DECISION_META[entry.phase] ?? { label: entry.phase || 'Beslissing', icon: CircleHelp };
  const Icon = meta.icon;
  const hasData = entry.data && Object.keys(entry.data).length > 0;

  return (
    <div className="account-row decision-row">
      <div className="decision-row-icon" aria-hidden="true"><Icon size={16} /></div>
      <div className="decision-row-body">
        <div className="decision-row-head">
          <strong>{meta.label}</strong>
          {subjectName && <span className="decision-row-subject">{subjectName}</span>}
          <span className="decision-row-time">{fmtDateTime(entry.createdAt)}</span>
        </div>
        <p>{entry.message}</p>
        {hasData && (
          <>
            <button type="button" className="log-toggle" onClick={() => setOpen((now) => !now)}>
              {open ? 'verberg details' : 'details'}
            </button>
            {open && <pre className="log-data">{JSON.stringify(entry.data, null, 2)}</pre>}
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminAiDecisionsPage() {
  const { user, isLoading } = useAuth();
  const [entries, setEntries] = useState<PipelineLogEntry[]>([]);
  const [subjects, setSubjects] = useState<CrawlSubject[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');

  const load = async (silent = false) => {
    if (!silent) setState('loading');
    try {
      const [nextEntries, nextSubjects] = await Promise.all([
        listPipelineLogs({
          decisionsOnly: true,
          limit: 200,
          ...(subjectFilter !== 'all' ? { subjectId: subjectFilter } : {}),
        }),
        listCrawlSubjects(),
      ]);
      setEntries(nextEntries);
      setSubjects(nextSubjects);
      setState('ready');
    } catch (error) {
      setState((error as { status?: number }).status === 403 ? 'forbidden' : 'error');
      throw error;
    }
  };

  useEffect(() => {
    if (!isLoading && user) void load().catch(() => undefined);
    else if (!isLoading) setState('forbidden');
  }, [isLoading, user?.id, subjectFilter]);

  useLivePoll(() => load(true), { enabled: state === 'ready', intervalMs: 8_000 });

  const subjectNameById = useMemo(
    () => new Map(subjects.map((subject) => [subject.id, subject.name])),
    [subjects],
  );

  if (state === 'forbidden') return <AdminDenied />;

  return (
    <AdminShell
      title="AI-beslissingen"
      intro="Elke keuze die de AI over een bron of vakaanvraag maakte, met de reden erbij."
      actions={
        <Button variant="outline" size="sm" onClick={() => void load().catch(() => undefined)}>
          <RefreshCw size={15} /> Verversen
        </Button>
      }
    >
      <div className="pipeline-filters">
        <Select value={subjectFilter} onValueChange={setSubjectFilter}>
          <SelectTrigger className="pipeline-filter">
            <SelectValue placeholder="Vak" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle vakken</SelectItem>
            {subjects.map((subject) => (
              <SelectItem key={subject.id} value={subject.id}>
                {subject.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {state === 'loading' ? (
        <p className="admin-empty"><Loader2 className="spin" size={15} /> Beslissingen laden…</p>
      ) : state === 'error' ? (
        <p className="admin-empty">Beslissingen konden niet geladen worden.</p>
      ) : entries.length === 0 ? (
        <p className="admin-empty">Nog geen AI-beslissingen geregistreerd.</p>
      ) : (
        <div className="account-list decision-list">
          {entries.map((entry) => (
            <DecisionRow key={entry.id} entry={entry} subjectName={entry.subjectId ? subjectNameById.get(entry.subjectId) ?? null : null} />
          ))}
        </div>
      )}
    </AdminShell>
  );
}
