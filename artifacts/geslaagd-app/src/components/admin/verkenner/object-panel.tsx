import { useEffect, useState } from 'react';
import {
  getVerkennerObject,
  type VerkennerObjectDetailResponse,
} from '@workspace/api-client-react';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { LogLine, taskTypeLabel } from '@/components/admin/task-detail';
import { DetailSheet } from '@/components/admin/detail-sheet';
import { CONTENT_TYPE_LABEL, OBJECT_TYPE_META, type VerkennerObjectType } from './object-type-meta';

export type VerkennerPanelTarget = { type: Exclude<VerkennerObjectType, 'subject'>; id: string };

export function ObjectPanel({
  object,
  onClose,
}: {
  object: VerkennerPanelTarget | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<VerkennerObjectDetailResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  // Kept so the sheet still shows content while it slides shut, instead of
  // going blank the instant `object` is cleared.
  const [lastTarget, setLastTarget] = useState<VerkennerPanelTarget | null>(null);

  useEffect(() => {
    if (!object) return;
    setLastTarget(object);
    let cancelled = false;
    setState('loading');
    setDetail(null);
    getVerkennerObject(object.type, object.id)
      .then((result) => {
        if (!cancelled) {
          setDetail(result);
          setState('ready');
        }
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [object?.type, object?.id]);

  const target = object ?? lastTarget;
  if (!target) return null;

  const meta = OBJECT_TYPE_META[target.type];
  const Icon = meta.icon;

  return (
    <DetailSheet
      open={object !== null}
      onClose={onClose}
      title={
        <>
          <Icon size={16} aria-hidden="true" className={meta.accent} />
          {meta.label}
        </>
      }
    >
      {state === 'loading' && (
        <p className="study-loading">
          <Loader2 className="spin" size={16} aria-hidden="true" /> Laden…
        </p>
      )}
      {state === 'error' && <p className="admin-notice is-error">Object kon niet worden geladen.</p>}

      {state === 'ready' && detail && (
        <div className="grid gap-3">
          {target.type === 'content' && (
            <>
              <p>
                <strong>{CONTENT_TYPE_LABEL[detail.contentType ?? ''] ?? detail.contentType}</strong>{' '}
                <Badge variant="secondary">v{detail.contentVersion}</Badge>{' '}
                <Badge variant={detail.contentStatus === 'ready' ? 'secondary' : 'destructive'}>
                  {detail.contentStatus}
                </Badge>
              </p>
              {detail.generatedByModel && <p className="study-hint">Model: {detail.generatedByModel}</p>}
              <pre className="verkenner-content-json">{JSON.stringify(detail.content, null, 2)}</pre>
              {detail.generatingTask && (
                <div className="verkenner-card">
                  <h4>Genererende taak</h4>
                  <p>{taskTypeLabel[detail.generatingTask.taskType] ?? detail.generatingTask.taskType}</p>
                  {detail.generatingTask.summary && <p>{detail.generatingTask.summary}</p>}
                </div>
              )}
            </>
          )}

          {target.type === 'source' && (
            <>
              <p>
                <a href={detail.sourceUrl ?? '#'} target="_blank" rel="noreferrer">
                  {detail.sourceTitle ?? detail.sourceUrl}
                </a>
              </p>
              <p className="study-hint">{detail.sourceType} · kwaliteit {detail.sourceQualityScore ?? '—'}</p>
              {detail.sourceAiSummary && <p>{detail.sourceAiSummary}</p>}
              {(detail.linkedSubjects?.length ?? 0) > 0 && (
                <p className="study-hint">
                  Gekoppelde vakken: {detail.linkedSubjects?.map((s) => s.name).join(', ')}
                </p>
              )}
              {(detail.linkedChapters?.length ?? 0) > 0 && (
                <p className="study-hint">
                  Gekoppelde hoofdstukken: {detail.linkedChapters?.map((c) => c.name).join(', ')}
                </p>
              )}
            </>
          )}

          {target.type === 'crawl' && detail.crawl && (
            <>
              <p>
                <Badge variant={detail.crawl.status === 'complete' ? 'secondary' : 'destructive'}>
                  {detail.crawl.status}
                </Badge>
              </p>
              <p className="study-hint">
                {detail.crawl.sourcesAccepted}/{detail.crawl.sourcesFound} bronnen · {detail.crawl.creditsUsed} credits
              </p>
              {detail.crawl.promptUsed && <p>Zoekopdracht: {detail.crawl.promptUsed}</p>}
              {detail.crawl.errorDetail && <p className="admin-notice is-error">{detail.crawl.errorDetail}</p>}
            </>
          )}

          {target.type === 'task' && detail.task && (
            <>
              <p>
                {taskTypeLabel[detail.task.taskType] ?? detail.task.taskType}{' '}
                <Badge variant={detail.task.status === 'done' ? 'secondary' : 'destructive'}>
                  {detail.task.status}
                </Badge>
              </p>
              {detail.task.summary && <p>{detail.task.summary}</p>}
              {detail.task.lastError && <p className="admin-notice is-error">{detail.task.lastError}</p>}
            </>
          )}

          {target.type === 'chapter' && (
            <>
              <p>{detail.chapterDescription}</p>
              <p className="study-hint">
                {detail.chapterIsImportant ? 'Belangrijk hoofdstuk' : 'Regulier hoofdstuk'} · {detail.chapterStatus}
              </p>
            </>
          )}

          {detail.logs.length > 0 && (
            <div className="verkenner-card">
              <h4>Logs</h4>
              <ul className="task-log-list">
                {detail.logs.map((entry) => (
                  <LogLine key={entry.id} entry={entry} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </DetailSheet>
  );
}
