import { useEffect, useState } from 'react';
import { listSubjects, type MessageReference, type SubjectSummary } from '@workspace/api-client-react';

export function SubjectReferencePicker({
  draft,
  onPick,
}: {
  draft: string;
  onPick: (reference: MessageReference) => void;
}) {
  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const hashIndex = draft.lastIndexOf('#');
  const query = hashIndex >= 0 ? draft.slice(hashIndex + 1) : null;

  useEffect(() => {
    if (query === null) return;
    void listSubjects().then(setSubjects);
  }, [query !== null]);

  if (query === null) return null;
  const matches = subjects.filter((s) => s.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);
  if (matches.length === 0) return null;

  return (
    <div className="reference-picker">
      {matches.map((subject) => (
        <button
          key={subject.id}
          type="button"
          onClick={() => onPick({ subjectId: subject.id, label: subject.name })}
        >
          #{subject.name}
        </button>
      ))}
    </div>
  );
}
