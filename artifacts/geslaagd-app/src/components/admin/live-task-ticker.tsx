import { useEffect, useState } from 'react';
import { listCrawlSubjects, listPipelineTasks, type PipelineTask } from '@workspace/api-client-react';
import { ChevronDown, TerminalSquare } from 'lucide-react';
import { useLivePoll } from '@/lib/use-live-poll';
import { taskTypeLabel, TaskDetailSheet } from '@/components/admin/task-detail';

/**
 * A small, always-there indicator of what the pipeline is doing right now,
 * mounted once in AdminShell so it follows the admin around every /beheer
 * page instead of living on just one of them. Renders nothing when nothing
 * is running, so it never competes for attention on a quiet day.
 */
export function LiveTaskTicker() {
  const [tasks, setTasks] = useState<PipelineTask[]>([]);
  const [subjectNames, setSubjectNames] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  const load = async () => {
    try {
      const [running, subjects] = await Promise.all([
        listPipelineTasks({ status: 'running' }),
        listCrawlSubjects(),
      ]);
      setTasks(running);
      setSubjectNames(Object.fromEntries(subjects.map((subject) => [subject.id, subject.name])));
    } catch {
      // The ticker is a convenience, not the source of truth — stay quiet on failure.
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useLivePoll(load, { intervalMs: 6_000 });

  useEffect(() => {
    if (tasks.length === 0) setExpanded(false);
  }, [tasks.length]);

  if (tasks.length === 0) return null;

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40 font-mono">
        {!expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs text-card-foreground shadow-lg transition-colors hover:bg-muted"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            {tasks.length} {tasks.length === 1 ? 'taak' : 'taken'} actief
          </button>
        )}

        {expanded && (
          <div className="w-80 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="flex gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-destructive/70" />
                  <span className="h-2 w-2 rounded-full bg-chart-4/70" />
                  <span className="h-2 w-2 rounded-full bg-primary/70" />
                </div>
                <TerminalSquare size={12} aria-hidden="true" />
                <span>pijplijn — live</span>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Inklappen"
                className="text-muted-foreground hover:text-foreground"
              >
                <ChevronDown size={14} />
              </button>
            </div>
            <ul className="max-h-56 overflow-y-auto px-2 py-2 text-xs">
              {tasks.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => setDetailTaskId(task.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                  >
                    <span className="text-primary">$</span>
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {taskTypeLabel[task.taskType] ?? task.taskType}
                    </span>
                    <span className="shrink-0 truncate text-muted-foreground">
                      {subjectNames[task.subjectId] ?? '—'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <TaskDetailSheet taskId={detailTaskId} onClose={() => setDetailTaskId(null)} />
    </>
  );
}
