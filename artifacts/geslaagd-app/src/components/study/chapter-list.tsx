import type { Chapter, ChapterProgress } from '@workspace/api-client-react';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
import { CircleCheck, CircleDashed, Lock } from 'lucide-react';

export function ChapterList({
  chapters,
  progress,
  onOpen,
}: {
  chapters: Chapter[];
  progress: Map<string, ChapterProgress>;
  onOpen: (chapterId: string) => void;
}) {
  return (
    <ol className="chapter-list" data-testid="chapter-list">
      {chapters.map((chapter) => {
        const chapterProgress = progress.get(chapter.id);
        const percentage = Math.round(chapterProgress?.progress ?? 0);
        const ready = chapter.status === 'ready';
        const done = percentage >= 80;

        return (
          <li key={chapter.id}>
            <button
              type="button"
              className="chapter-row"
              onClick={() => ready && onOpen(chapter.id)}
              disabled={!ready}
              data-testid={`chapter-${chapter.position}`}
            >
              <span className="chapter-icon" aria-hidden="true">
                {!ready ? (
                  <Lock size={16} />
                ) : done ? (
                  <CircleCheck size={16} />
                ) : (
                  <CircleDashed size={16} />
                )}
              </span>
              <span className="chapter-body">
                <span className="chapter-title">
                  {chapter.position}. {chapter.title}
                </span>
                {chapter.description && (
                  <span className="chapter-description">{chapter.description}</span>
                )}
              </span>
              <span className="chapter-meta">
                {chapter.isImportant && <Badge variant="secondary">Tentamen</Badge>}
                {ready ? (
                  <span className="chapter-percentage">{percentage}%</span>
                ) : (
                  <span className="chapter-percentage">In voorbereiding</span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
