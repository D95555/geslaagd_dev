import type { PipelineTask } from '@workspace/api-client-react';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { RotateCcw, X } from 'lucide-react';

const statusLabel: Record<PipelineTask['status'], string> = {
  waiting: 'Wacht',
  ready: 'Klaar om te draaien',
  running: 'Bezig',
  done: 'Klaar',
  failed: 'Mislukt',
};

import { taskTypeLabel } from './task-detail';

function fmtDateTime(value: string) {
  return new Date(value).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' });
}

export function TaskQueue({
  tasks,
  subjectNames,
  onRetry,
  onCancel,
  onOpen,
  busyTaskId,
}: {
  tasks: PipelineTask[];
  subjectNames: Map<string, string>;
  onRetry: (task: PipelineTask) => void;
  onCancel: (task: PipelineTask) => void;
  onOpen: (task: PipelineTask) => void;
  busyTaskId: string | null;
}) {
  if (tasks.length === 0) {
    return <p className="admin-empty">Geen taken die aan dit filter voldoen.</p>;
  }

  return (
    <table className="task-queue" data-testid="task-queue">
      <thead>
        <tr>
          <th>Vak</th>
          <th>Taak</th>
          <th>Status</th>
          <th>Pogingen</th>
          <th>Bijgewerkt</th>
          <th>Acties</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((task) => (
          <tr key={task.id} data-testid={`task-${task.id}`}>
            <td>{subjectNames.get(task.subjectId) ?? task.subjectId.slice(0, 8)}</td>
            <td>
              <button type="button" className="task-open" onClick={() => onOpen(task)}>
                {taskTypeLabel[task.taskType] ?? task.taskType}
              </button>
            </td>
            <td>
              <Badge
                variant={
                  task.status === 'failed'
                    ? 'destructive'
                    : task.status === 'done'
                      ? 'secondary'
                      : 'outline'
                }
              >
                {statusLabel[task.status]}
              </Badge>
              {task.lastError && <p className="task-error">{task.lastError}</p>}
            </td>
            <td>{task.attempts}</td>
            <td>{fmtDateTime(task.updatedAt)}</td>
            <td className="task-actions">
              <Button variant="ghost" size="sm" onClick={() => onOpen(task)}>
                Details
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busyTaskId === task.id}
                onClick={() => onRetry(task)}
              >
                <RotateCcw size={14} /> Opnieuw
              </Button>
              {task.status !== 'done' && task.status !== 'failed' && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyTaskId === task.id}
                  onClick={() => onCancel(task)}
                >
                  <X size={14} /> Annuleren
                </Button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
