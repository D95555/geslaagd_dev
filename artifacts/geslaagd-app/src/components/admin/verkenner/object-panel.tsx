import { useEffect, useState } from 'react';
import {
  getVerkennerObject,
  type VerkennerObjectDetailResponse,
} from '@workspace/api-client-react';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Loader2, X } from 'lucide-react';
import { LogLine, taskTypeLabel } from '@/components/admin/task-detail';
import { CONTENT_TYPE_LABEL, OBJECT_TYPE_META, type VerkennerObjectType } from './object-type-meta';

export function ObjectPanel({
  type,
  id,
  onClose,
}: {
  type: Exclude<VerkennerObjectType, 'subject'>;
  id: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<VerkennerObjectDetailResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setDetail(null);
    getVerkennerObject(type, id)
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
  }, [type, id]);

  const meta = OBJECT_TYPE_META[type];
  const Icon = meta.icon;

  return (
    <aside className="verkenner-object-panel" aria-label="Objectdetail">
      <header className="verkenner-object-panel-head">
        <span className={meta.accent}>
          <Icon size={16} aria-hidden="true" />
          {meta.label}
        </span>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Sluiten">
          <X size={16} />
        </Button>
      </header>

      {state === 'loading' && (
        <p className="study-loading">
          <Loader2 className="spin" size={16} aria-hidden="true" /> Laden…
        </p>
      )}
      {state === 'error' && <p className="admin-notice is-error">Object kon niet worden geladen.</p>}

      {state === 'ready' && detail && (
        <div className="verkenner-object-panel-body">
          {type === 'content' && (
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

          {type === 'source' && (
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

          {type === 'crawl' && detail.crawl && (
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

          {type === 'task' && detail.task && (
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

          {type === 'chapter' && (
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
    </aside>
  );
}
