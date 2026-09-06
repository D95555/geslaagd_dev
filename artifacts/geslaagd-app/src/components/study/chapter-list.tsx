import { useMemo, useState } from 'react';
import type { Chapter, ChapterProgress } from '@workspace/api-client-react';
import { ArrowUpRight, Check, Lock, Search } from 'lucide-react';

type Filter = 'all' | 'open' | 'done';

export function ChapterList({ chapters, progress, onOpen }: { chapters: Chapter[]; progress: Map<string, ChapterProgress>; onOpen: (chapterId: string) => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const doneCount = chapters.filter((chapter) => Math.round(progress.get(chapter.id)?.progress ?? 0) >= 80).length;
  const filtered = useMemo(() => chapters.filter((chapter) => {
    const percentage = Math.round(progress.get(chapter.id)?.progress ?? 0);
    const matchesFilter = filter === 'all' || (filter === 'done' ? percentage >= 80 : percentage < 80 && chapter.status === 'ready');
    return matchesFilter && `${chapter.title} ${chapter.description ?? ''}`.toLocaleLowerCase('nl').includes(query.trim().toLocaleLowerCase('nl'));
  }), [chapters, filter, progress, query]);

  return (
    <section className="chapter-queue" data-testid="chapter-list">
      <header className="chapter-queue-head">
        <div><span>Jouw leerroute</span><strong>{doneCount} van {chapters.length} hoofdstukken afgerond</strong></div>
        <div className="chapter-queue-tools">
          <label><Search size={14}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zoek hoofdstuk" aria-label="Zoek hoofdstuk"/></label>
          <div role="group" aria-label="Filter hoofdstukken">
            {([['all', 'Alles'], ['open', 'Open'], ['done', 'Klaar']] as const).map(([value, label]) => <button type="button" className={filter === value ? 'is-active' : undefined} aria-pressed={filter === value} onClick={() => setFilter(value)} key={value}>{label}</button>)}
          </div>
        </div>
      </header>
      <ol className="chapter-queue-list">
        {filtered.map((chapter) => {
          const percentage = Math.round(progress.get(chapter.id)?.progress ?? 0);
          const ready = chapter.status === 'ready';
          const done = percentage >= 80;
          return (
            <li key={chapter.id} className={done ? 'is-done' : !ready ? 'is-locked' : undefined}>
              <button type="button" onClick={() => ready && onOpen(chapter.id)} disabled={!ready} data-testid={`chapter-${chapter.position}`}>
                <span className="chapter-queue-marker">{!ready ? <Lock size={14}/> : done ? <Check size={15}/> : String(chapter.position).padStart(2, '0')}</span>
                <span className="chapter-queue-copy"><span><strong>{chapter.title}</strong>{chapter.isImportant && <i>Tentamenstof</i>}</span>{chapter.description && <small>{chapter.description}</small>}</span>
                <span className="chapter-queue-progress"><span><b>{ready ? (done ? 'Afgerond' : percentage > 0 ? `${percentage}%` : 'Nog starten') : 'In voorbereiding'}</b>{ready && <i><span style={{ width: `${Math.max(percentage, 3)}%` }}/></i>}</span>{ready && <ArrowUpRight size={17}/>}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {filtered.length === 0 && <div className="chapter-queue-empty">Geen hoofdstukken passen bij deze selectie.</div>}
    </section>
  );
}
