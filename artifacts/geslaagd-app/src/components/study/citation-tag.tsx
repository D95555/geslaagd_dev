import { useState } from 'react';
import type { Citation } from '@workspace/api-client-react';
import { ExternalLink } from 'lucide-react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** [Bron X] markers turned into markdown links the citation scheme owns, so
 * react-markdown's normal inline parsing (bold, tables, etc. can sit right
 * next to a marker) still applies to the rest of the text. */
const CITATION_HREF_PREFIX = 'geslaagd-citation:';

function toCitationLinks(content: string): string {
  return content.replace(
    /\[Bron\s*(\d+)\]/gi,
    (match, index) => `[${match}](${CITATION_HREF_PREFIX}${index})`,
  );
}

/**
 * Renders assistant text (Markdown, from the AI pipeline) with its [Bron X]
 * markers turned into tappable tags. Markers are matched against structured
 * citation data, so a marker without a matching source stays plain text
 * instead of becoming a dead link.
 */
export function CitedText({ content, citations }: { content: string; citations: Citation[] }) {
  const [open, setOpen] = useState<Citation | null>(null);
  const byIndex = new Map(citations.map((citation) => [citation.index, citation]));

  const components: Components = {
    a({ href, children }) {
      if (href?.startsWith(CITATION_HREF_PREFIX)) {
        const citation = byIndex.get(Number(href.slice(CITATION_HREF_PREFIX.length)));
        if (!citation) return <>{children}</>;
        return (
          <button
            type="button"
            className="citation-tag"
            onClick={() => setOpen(open?.index === citation.index ? null : citation)}
            data-testid={`citation-${citation.index}`}
          >
            Bron {citation.index}
          </button>
        );
      }
      return (
        <a href={href} target="_blank" rel="noreferrer noopener">
          {children}
        </a>
      );
    },
    // A wide table would otherwise force the whole reading column wider
    // than its measure; scope the scrollbar to just the table instead.
    table({ children }) {
      return (
        <div className="cited-text-table">
          <table>{children}</table>
        </div>
      );
    },
  };

  return (
    <div className="cited-text">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {toCitationLinks(content)}
      </ReactMarkdown>
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
