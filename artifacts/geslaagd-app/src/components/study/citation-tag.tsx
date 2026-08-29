import { useState } from 'react';
import type { Citation } from '@workspace/api-client-react';
import { ExternalLink } from 'lucide-react';

/**
 * Renders assistant text with its [Bron X] markers turned into tappable tags.
 * Markers are matched against structured citation data, so a marker without a
 * matching source stays plain text instead of becoming a dead link.
 */
export function CitedText({ content, citations }: { content: string; citations: Citation[] }) {
  const [open, setOpen] = useState<Citation | null>(null);
  const byIndex = new Map(citations.map((citation) => [citation.index, citation]));
  const parts = content.split(/(\[Bron\s*\d+\])/gi);

  return (
    <div className="cited-text">
      <p>
        {parts.map((part, position) => {
          const match = part.match(/^\[Bron\s*(\d+)\]$/i);
          const citation = match ? byIndex.get(Number(match[1])) : undefined;
          if (!citation) return <span key={position}>{part}</span>;
          return (
            <button
              key={position}
              type="button"
              className="citation-tag"
              onClick={() => setOpen(open?.index === citation.index ? null : citation)}
              data-testid={`citation-${citation.index}`}
            >
              Bron {citation.index}
            </button>
          );
        })}
      </p>
      {open && (
        <aside className="citation-card" role="note">
          <strong>{open.title}</strong>
          <a href={open.url} target="_blank" rel="noreferrer noopener">
            {open.url} <ExternalLink size={12} aria-hidden="true" />
          </a>
          <button type="button" onClick={() => setOpen(null)}>
            Sluiten
          </button>
        </aside>
      )}
    </div>
  );
}
