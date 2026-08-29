import { useEffect, useMemo, useRef, useState } from 'react';
import {
  listCrawlSubjects,
  listPipelineLogs,
  type CrawlSubject,
  type PipelineLogEntry,
  type ListPipelineLogsLevel,
} from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/geslaagd-momentum/components/ui/select';
import { Loader2, RefreshCw, TerminalSquare } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { AdminDenied, AdminShell } from '@/components/admin/admin-shell';
import { LogLine, TaskDetailSheet } from '@/components/admin/task-detail';
import { useLivePoll } from '@/lib/use-live-poll';

export default function AdminConsolePage() {
  const { user, isLoading } = useAuth();
  const [logs, setLogs] = useState<PipelineLogEntry[]>([]);
  const [subjects, setSubjects] = useState<CrawlSubject[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const load = async (silent = false) => {
    if (!silent) setState('loading');
    try {
      const [nextLogs, nextSubjects] = await Promise.all([
        listPipelineLogs({
          limit: 200,
          ...(subjectFilter !== 'all' ? { subjectId: subjectFilter } : {}),
          ...(levelFilter !== 'all' ? { level: levelFilter as ListPipelineLogsLevel } : {}),
        }),
        listCrawlSubjects(),
      ]);
      setLogs(nextLogs);
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
  }, [isLoading, user?.id, subjectFilter, levelFilter]);

  // The console is the page you leave open while the pipeline runs.
  useLivePoll(() => load(true), { enabled: state === 'ready', intervalMs: 4_000 });

  // The API feeds logs newest-first; a terminal reads top-to-bottom with the
  // newest line at the bottom, like `tail -f`.
  const chronological = useMemo(() => [...logs].reverse(), [logs]);

  useEffect(() => {
    const el = screenRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [chronological]);

  const handleScroll = () => {
    const el = screenRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  if (state === 'forbidden') return <AdminDenied />;

  return (
    <AdminShell
      title="Console"
      intro="Wat de pijplijn doet, regel voor regel. Klik een regel om de hele taak te openen."
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

        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="pipeline-filter">
            <SelectValue placeholder="Niveau" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alles</SelectItem>
            <SelectItem value="info">Alleen informatie</SelectItem>
            <SelectItem value="warn">Alleen waarschuwingen</SelectItem>
            <SelectItem value="error">Alleen fouten</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="console-terminal">
        <div className="console-terminal-chrome">
          <span className="console-terminal-dot dot-red" />
          <span className="console-terminal-dot dot-yellow" />
          <span className="console-terminal-dot dot-green" />
          <span className="console-terminal-title">
            <TerminalSquare size={12} aria-hidden="true" /> pipeline@geslaagd — logboek
          </span>
        </div>

        <div className="console-terminal-screen" ref={screenRef} onScroll={handleScroll}>
          {state === 'loading' && (
            <p className="console-terminal-status">
              <Loader2 className="spin" size={16} aria-hidden="true" /> Logboek laden…
            </p>
          )}

          {state === 'error' && (
            <div className="console-terminal-status">
              <p>Het logboek kon niet worden geladen.</p>
              <Button size="sm" onClick={() => void load().catch(() => undefined)}>
                Opnieuw proberen
              </Button>
            </div>
          )}

          {state === 'ready' &&
            (chronological.length === 0 ? (
              <p className="console-terminal-status">
                Nog geen logregels. Zodra de pijplijn een taak oppakt, verschijnt hier live wat er
                gebeurt.
              </p>
            ) : (
              <ul className="log-list console-list">
                {chronological.map((entry) => (
                  <li key={entry.id} className="console-row">
                    <button
                      type="button"
                      className="console-open"
                      onClick={() => setDetailTaskId(entry.taskId)}
                      aria-label="Taak openen"
                    />
                    <LogLine entry={entry} />
                  </li>
                ))}
                <li className="console-cursor" aria-hidden="true" />
              </ul>
            ))}
        </div>
      </div>

      <TaskDetailSheet taskId={detailTaskId} onClose={() => setDetailTaskId(null)} />
    </AdminShell>
  );
}
