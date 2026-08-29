import { useState } from 'react';
import type { VerkennerChapterSummary } from '@workspace/api-client-react';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
import { ChevronDown, ChevronRight, FileText, Link2 } from 'lucide-react';
import { CONTENT_TYPE_LABEL } from './object-type-meta';
import { InlineEditableTitle } from './inline-editable-title';

export function CurriculumTree({
  chapters,
  onSelectContent,
  onRenameChapter,
}: {
  chapters: VerkennerChapterSummary[];
  onSelectContent: (contentId: string) => void;
  onRenameChapter: (chapterId: string, title: string) => Promise<void>;
}) {
  const [openChapterId, setOpenChapterId] = useState<string | null>(chapters[0]?.chapter.id ?? null);

  if (chapters.length === 0) {
    return (
      <div className="verkenner-card">
        <h3>Curriculum</h3>
        <p className="study-hint">Nog geen hoofdstukken.</p>
      </div>
    );
  }

  return (
    <div className="verkenner-card">
      <h3>Curriculum</h3>
      <ul className="verkenner-chapter-list">
        {chapters.map(({ chapter, content, sourceCount }) => {
          const open = openChapterId === chapter.id;
          return (
            <li key={chapter.id} className="verkenner-chapter-row">
              <div className="verkenner-chapter-head">
                <button
                  type="button"
                  className="verkenner-chapter-toggle"
                  onClick={() => setOpenChapterId(open ? null : chapter.id)}
                  aria-expanded={open}
                >
                  {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  <span className="verkenner-chapter-position">{chapter.position}.</span>
                </button>
                <InlineEditableTitle
                  value={chapter.title}
                  onSave={(next) => onRenameChapter(chapter.id, next)}
                />
                <Badge variant="secondary">{chapter.status === 'ready' ? 'gereed' : 'in behandeling'}</Badge>
                <span className="verkenner-chapter-source-count">
                  <Link2 size={12} /> {sourceCount}
                </span>
              </div>
              {open && (
                <ul className="verkenner-content-list">
                  {content.length === 0 && <li className="study-hint">Nog geen inhoud gegenereerd.</li>}
                  {content.map((item) => (
                    <li key={item.id}>
                      <button type="button" onClick={() => onSelectContent(item.id)}>
                        <FileText size={13} aria-hidden="true" />
                        {CONTENT_TYPE_LABEL[item.contentType] ?? item.contentType}
                        <Badge variant="secondary">v{item.version}</Badge>
                        <Badge variant={item.status === 'ready' ? 'secondary' : 'destructive'}>{item.status}</Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
