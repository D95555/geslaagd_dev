import { useMemo, useState } from 'react';
import type { KeyNotesContent } from '@workspace/api-client-react';
import { BookMarked, Search, X } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@workspace/geslaagd-momentum/components/ui/accordion';

export function GlossaryPanel({ notes }: { notes: KeyNotesContent }) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase('nl');
  const sections = useMemo(() => notes.sections.map((section) => ({
    ...section,
    items: section.items.filter((item) => !normalizedQuery || `${item.label} ${item.value} ${item.topicTag}`.toLocaleLowerCase('nl').includes(normalizedQuery)),
  })).filter((section) => section.items.length > 0), [notes, normalizedQuery]);
  const total = notes.sections.reduce((sum, section) => sum + section.items.length, 0);
  const visible = sections.reduce((sum, section) => sum + section.items.length, 0);

  return (
    <section className="glossary-panel" aria-label="Begrippenlijst">
      <header>
        <span className="glossary-icon"><BookMarked size={16}/></span>
        <span><strong>Begrippenlijst</strong><small>{normalizedQuery ? `${visible} van ${total}` : `${total} begrippen`}</small></span>
      </header>
      <label className="glossary-search">
        <Search size={14}/>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zoek een begrip…" aria-label="Zoek in begrippenlijst"/>
        {query && <button type="button" onClick={() => setQuery('')} aria-label="Zoekopdracht wissen"><X size={13}/></button>}
      </label>
      {sections.length === 0 ? <p className="glossary-empty">Geen begrip gevonden.</p> : (
        <div className="glossary-sections">
          {sections.map((section) => (
            <div key={section.heading}>
              <p>{section.heading}</p>
              <Accordion type="single" collapsible>
                {section.items.map((item, index) => (
                  <AccordionItem value={`${section.heading}-${item.label}-${index}`} key={`${item.label}-${index}`}>
                    <AccordionTrigger><span>{item.label}</span></AccordionTrigger>
                    <AccordionContent><p>{item.value}</p>{item.topicTag && <small>{item.topicTag}</small>}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
