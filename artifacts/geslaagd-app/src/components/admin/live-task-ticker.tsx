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
            className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 shadow-lg transition-colors hover:bg-zinc-900"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            {tasks.length} {tasks.length === 1 ? 'taak' : 'taken'} actief
          </button>
        )}

        {expanded && (
          <div className="w-80 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <div className="flex gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-red-500/70" />
                  <span className="h-2 w-2 rounded-full bg-yellow-500/70" />
                  <span className="h-2 w-2 rounded-full bg-emerald-500/70" />
                </div>
                <TerminalSquare size={12} aria-hidden="true" />
                <span>pijplijn — live</span>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Inklappen"
                className="text-zinc-500 hover:text-zinc-200"
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
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-zinc-900"
                  >
                    <span className="text-emerald-400">$</span>
                    <span className="min-w-0 flex-1 truncate text-zinc-100">
                      {taskTypeLabel[task.taskType] ?? task.taskType}
                    </span>
                    <span className="shrink-0 truncate text-zinc-500">
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
