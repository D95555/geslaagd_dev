import type { ReviewTask } from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';

const priorityLabel: Record<ReviewTask['priority'], string> = {
  high: 'Nu oefenen',
  medium: 'Binnenkort',
  low: 'Even opfrissen',
};

export function ReviewPlan({
  tasks,
  onOpenChapter,
}: {
  tasks: ReviewTask[];
  onOpenChapter?: (chapterId: string) => void;
}) {
  if (tasks.length === 0) {
    return (
      <section className="review-plan" data-testid="review-plan">
        <h3>Herhaalplan van vandaag</h3>
        <p className="review-plan-empty">
          Niets te herhalen vandaag. Goed bezig — kom morgen terug.
        </p>
      </section>
    );
  }

  return (
    <section className="review-plan" data-testid="review-plan">
      <h3>Herhaalplan van vandaag</h3>
      <ul>
        {tasks.map((task) => (
          <li key={task.chapterId}>
            <div className="review-plan-body">
              <strong>{task.chapterTitle}</strong>
              {task.topicTags.length > 0 && <span>{task.topicTags.slice(0, 3).join(' · ')}</span>}
            </div>
            <div className="review-plan-actions">
              <Badge variant={task.priority === 'high' ? 'destructive' : 'secondary'}>
                {priorityLabel[task.priority]}
              </Badge>
              {onOpenChapter && (
                <Button variant="outline" size="sm" onClick={() => onOpenChapter(task.chapterId)}>
                  Openen
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
