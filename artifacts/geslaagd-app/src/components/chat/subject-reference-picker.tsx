import { useEffect, useRef, useState } from 'react';
import { getSubjectDetail, listSubjects, type Chapter, type MessageReference, type SubjectSummary } from '@workspace/api-client-react';

export function SubjectReferencePicker({
  draft,
  onPick,
}: {
  draft: string;
  onPick: (reference: MessageReference) => void;
}) {
  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const chaptersBySubject = useRef(new Map<string, Chapter[]>());
  const [, forceRender] = useState(0);
  const hashIndex = draft.lastIndexOf('#');
  const query = hashIndex >= 0 ? draft.slice(hashIndex + 1) : null;
  const q = (query ?? '').trim().toLowerCase();

  useEffect(() => {
    if (query === null) return;
    void listSubjects().then(setSubjects);
  }, [query !== null]);

  const matchingSubjects = subjects.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 5);
  const matchingSubjectIds = matchingSubjects.map((s) => s.id).join(',');

  // Chapters are only worth fetching once there's real text to narrow by —
  // otherwise browsing a bare "#" would need every matched subject's full
  // chapter list pulled just to show a handful of top-level results.
  useEffect(() => {
    if (query === null || q.length === 0) return;
    for (const subject of matchingSubjects) {
      if (chaptersBySubject.current.has(subject.id)) continue;
      chaptersBySubject.current.set(subject.id, []);
      void getSubjectDetail(subject.id).then((detail) => {
        chaptersBySubject.current.set(subject.id, detail.chapters);
        forceRender((n) => n + 1);
      });
    }
    // matchingSubjectIds captures which subjects are in scope this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, q, matchingSubjectIds]);

  if (query === null) return null;

  const rows: { key: string; label: string; isChapter: boolean; onPick: () => void }[] = matchingSubjects.map(
    (subject) => ({
      key: subject.id,
      label: `#${subject.name}`,
      isChapter: false,
      onPick: () => onPick({ subjectId: subject.id, label: subject.name }),
    }),
  );

  if (q.length > 0) {
    for (const subject of matchingSubjects) {
      const chapters = chaptersBySubject.current.get(subject.id) ?? [];
      for (const chapter of chapters.filter((c) => c.title.toLowerCase().includes(q))) {
        rows.push({
          key: chapter.id,
          label: `#${subject.name} › ${chapter.title}`,
          isChapter: true,
          onPick: () =>
            onPick({ subjectId: subject.id, chapterId: chapter.id, label: `${subject.name} · ${chapter.title}` }),
        });
      }
    }
  }

  if (rows.length === 0) return null;

  return (
    <div className="reference-picker">
      {rows.slice(0, 8).map((row) => (
        <button
          key={row.key}
          type="button"
          className={row.isChapter ? 'reference-picker-chapter' : undefined}
          onClick={row.onPick}
        >
          {row.label}
        </button>
      ))}
    </div>
  );
}
