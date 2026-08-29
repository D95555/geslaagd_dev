import { useEffect, useState } from 'react';
import {
  getPipelineTaskDetail,
  type PipelineTaskDetail,
  type PipelineLogEntry,
} from '@workspace/api-client-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@workspace/geslaagd-momentum/components/ui/dialog';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useLivePoll } from '@/lib/use-live-poll';

export const taskTypeLabel: Record<string, string> = {
  triage: 'Beoordeling aanvraag',
  curriculum_design: 'Curriculumontwerp',
  source_gathering: 'Bronnen verzamelen',
  source_review: 'Bronnen beoordelen',
  summary_generation: 'Samenvatting',
  key_notes_generation: 'Kernpunten',
  exercise_generation: 'Oefenvragen',
  exam_generation: 'Tentamen',
  questionnaire_generation: 'Startvragenlijst',
  readiness_check: 'Gereedheidscontrole',
};

function fmtTime(value: string) {
  return new Date(value).toLocaleTimeString('nl-NL', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function LogLine({ entry }: { entry: PipelineLogEntry }) {
  const [open, setOpen] = useState(false);
  const hasData = entry.data && Object.keys(entry.data).length > 0;

  return (
    <li className={`log-line log-${entry.level}`}>
      <span className="log-time">{fmtTime(entry.createdAt)}</span>
      <span className="log-phase">{entry.phase || '—'}</span>
      <span className="log-message">
        {entry.message}
        {hasData && (
          <button type="button" className="log-toggle" onClick={() => setOpen((now) => !now)}>
            {open ? 'verberg details' : 'details'}
          </button>
        )}
        {open && hasData && (
          <pre className="log-data">{JSON.stringify(entry.data, null, 2)}</pre>
        )}
      </span>
    </li>
  );
}

export function TaskDetailDialog({
  taskId,
  onClose,
}: {
  taskId: string | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<PipelineTaskDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = async (silent = false) => {
    if (!taskId) return;
    if (!silent) setState('loading');
    try {
      setDetail(await getPipelineTaskDetail(taskId));
      setState('ready');
    } catch (error) {
      setState('error');
      throw error;
    }
  };

  useEffect(() => {
    setDetail(null);
    if (taskId) void load().catch(() => undefined);
  }, [taskId]);

  // A running task keeps producing log lines, so keep reading while it does.
  useLivePoll(() => load(true), {
    enabled: state === 'ready' && (detail?.status === 'running' || detail?.status === 'ready'),
    intervalMs: 4_000,
  });

  return (
    <Dialog open={taskId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="task-detail-dialog">
        <DialogHeader>
          <DialogTitle>
            {detail ? (taskTypeLabel[detail.taskType] ?? detail.taskType) : 'Taakdetails'}
          </DialogTitle>
          <DialogDescription>
            {detail
              ? [detail.subjectName, detail.chapterTitle].filter(Boolean).join(' · ') ||
                'Taak zonder hoofdstuk'
              : 'Laden…'}
          </DialogDescription>
        </DialogHeader>

        {state === 'loading' && (
          <p className="study-loading">
            <Loader2 className="spin" size={16} aria-hidden="true" /> Details laden…
          </p>
        )}

        {state === 'error' && <p className="admin-empty">Details konden niet worden geladen.</p>}

        {state === 'ready' && detail && (
          <div className="task-detail">
            <div className="task-detail-meta">
              <Badge
                variant={
                  detail.status === 'failed'
                    ? 'destructive'
                    : detail.status === 'done'
                      ? 'secondary'
                      : 'outline'
                }
              >
                {detail.status}
              </Badge>
              <span>Poging {detail.attempts}</span>
              <span>{new Date(detail.createdAt).toLocaleString('nl-NL')}</span>
            </div>

            {detail.summary && (
              <section className="task-detail-block">
                <h3>Conclusie</h3>
                <p className="task-summary">{detail.summary}</p>
              </section>
            )}

            {detail.lastError && (
              <section className="task-detail-block">
                <h3>Fout</h3>
                <pre className="log-data log-error-detail">{detail.lastError}</pre>
              </section>
            )}

            <section className="task-detail-block">
              <h3>Verloop</h3>
              {detail.logs.length === 0 ? (
                <p className="admin-empty">
                  Nog geen logregels. Taken die vóór deze versie draaiden hebben geen logboek.
                </p>
              ) : (
                <ul className="log-list">
                  {detail.logs.map((entry) => (
                    <LogLine key={entry.id} entry={entry} />
                  ))}
                </ul>
              )}
            </section>

            {detail.config && (
              <details className="task-detail-raw">
                <summary>Instellingen</summary>
                <pre className="log-data">{JSON.stringify(detail.config, null, 2)}</pre>
              </details>
            )}
            {detail.result && (
              <details className="task-detail-raw">
                <summary>Resultaat</summary>
                <pre className="log-data">{JSON.stringify(detail.result, null, 2)}</pre>
              </details>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
