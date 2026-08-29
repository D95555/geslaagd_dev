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
              <span className="chapter-index" aria-hidden="true">
                {String(chapter.position).padStart(2, '0')}
              </span>
              <span className="chapter-main">
                <span className="chapter-title-row">
                  <span className="chapter-title">{chapter.title}</span>
                  {chapter.isImportant && <Badge variant="secondary">Tentamen</Badge>}
                </span>
                {chapter.description && (
                  <span className="chapter-description">{chapter.description}</span>
                )}
              </span>
              <span className="chapter-status">
                {!ready ? (
                  <Lock size={14} aria-hidden="true" />
                ) : done ? (
                  <CircleCheck size={14} aria-hidden="true" />
                ) : (
                  <CircleDashed size={14} aria-hidden="true" />
                )}
                <span className="chapter-percentage">
                  {ready ? `${percentage}%` : 'In voorbereiding'}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
