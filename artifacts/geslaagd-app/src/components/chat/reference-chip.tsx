import { useLocation } from 'wouter';
import { Hash } from 'lucide-react';
import type { MessageReference } from '@workspace/api-client-react';

export function ReferenceChip({ reference }: { reference: MessageReference }) {
  const [, setLocation] = useLocation();
  const href = reference.chapterId
    ? `/vakken/${reference.subjectId}/hoofdstuk/${reference.chapterId}`
    : `/vakken/${reference.subjectId}`;
  return (
    <button type="button" className="reference-chip" onClick={() => setLocation(href)}>
      <Hash size={12} aria-hidden="true" /> {reference.label}
    </button>
  );
}
