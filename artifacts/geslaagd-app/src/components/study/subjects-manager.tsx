import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import {
  createSelectedStudySubject,
  deleteSelectedStudySubject,
  reorderSelectedStudySubjects,
  type SelectedStudySubject,
  type StudySubject,
} from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';

const MAX_SELECTED_SUBJECTS = 5;

export function SubjectsManager({
  catalogSubjects,
  selected,
  onChange,
  onClose,
}: {
  catalogSubjects: StudySubject[];
  selected: SelectedStudySubject[];
  onChange: (next: SelectedStudySubject[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [customName, setCustomName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const atLimit = selected.length >= MAX_SELECTED_SUBJECTS;
  const selectedSubjectIds = new Set(selected.map((item) => item.subjectId).filter(Boolean));
  const normalizedQuery = query.trim().toLocaleLowerCase('nl');
  const availableSubjects = catalogSubjects
    .filter((subject) => !selectedSubjectIds.has(subject.id))
    .filter((subject) => !normalizedQuery || subject.name.toLocaleLowerCase('nl').includes(normalizedQuery));

  const persistOrder = async (nextOrder: SelectedStudySubject[]) => {
    onChange(nextOrder);
    try {
      const saved = await reorderSelectedStudySubjects({ orderedIds: nextOrder.map((item) => item.id) });
      onChange(saved);
    } catch {
      setError('De volgorde kon niet worden opgeslagen. Probeer het opnieuw.');
    }
  };

  const moveItem = (index: number, delta: number) => {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= selected.length) return;
    const next = [...selected];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    void persistOrder(next);
  };

  const handleDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      return;
    }
    const next = [...selected];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(index, 0, moved);
    setDragIndex(null);
    void persistOrder(next);
  };

  const addSubject = async (subjectId: string) => {
    if (atLimit) return;
    setError('');
    setBusyId(subjectId);
    try {
      const created = await createSelectedStudySubject({ subjectId });
      onChange([...selected, created]);
    } catch {
      setError('Dit vak kon niet worden toegevoegd.');
    } finally {
      setBusyId(null);
    }
  };

  const addCustomSubject = async (event: FormEvent) => {
    event.preventDefault();
    const name = customName.trim();
    if (!name || atLimit) return;
    setError('');
    setBusyId('custom');
    try {
      const created = await createSelectedStudySubject({ customName: name });
      onChange([...selected, created]);
      setCustomName('');
    } catch {
      setError('Dit vak kon niet worden toegevoegd.');
    } finally {
      setBusyId(null);
    }
  };

  const removeSubject = async (selection: SelectedStudySubject) => {
    setError('');
    setBusyId(selection.id);
    try {
      await deleteSelectedStudySubject(selection.id);
      onChange(selected.filter((item) => item.id !== selection.id));
    } catch {
      setError('Dit vak kon niet worden verwijderd.');
    } finally {
      setBusyId(null);
    }
  };

  return <div className="subjects-manager-backdrop" role="dialog" aria-modal="true" aria-labelledby="subjects-manager-title" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="subjects-manager-card">
      <div className="subjects-manager-head">
        <div><span className="study-kicker">vakken beheren</span><h2 id="subjects-manager-title">Kies en orden je vakken</h2><p>Maximaal vijf vakken tegelijk. Sleep om te herschikken, of gebruik de pijltjes.</p></div>
        <button type="button" className="subjects-manager-close" onClick={onClose} aria-label="Sluiten"><X size={18} /></button>
      </div>

      {error && <p className="onboarding-error" role="alert">{error}</p>}

      <section className="subjects-manager-selected">
        <h3>Jouw vakken ({selected.length}/{MAX_SELECTED_SUBJECTS})</h3>
        {selected.length === 0 && <p className="study-empty">Nog geen vakken gekozen. Kies hieronder een vak uit de catalogus of voeg een eigen vak toe.</p>}
        {selected.length > 0 && <ul className="selected-subject-list">
          {selected.map((item, index) => <li
            key={item.id}
            className={dragIndex === index ? 'dragging' : ''}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => handleDrop(index)}
            onDragEnd={() => setDragIndex(null)}
          >
            <span className="drag-handle" aria-hidden="true"><GripVertical size={16} /></span>
            <strong>{item.name}</strong>
            <div className="selected-subject-actions">
              <button type="button" onClick={() => moveItem(index, -1)} disabled={index === 0} aria-label={`${item.name} omhoog verplaatsen`}><ArrowUp size={15} /></button>
              <button type="button" onClick={() => moveItem(index, 1)} disabled={index === selected.length - 1} aria-label={`${item.name} omlaag verplaatsen`}><ArrowDown size={15} /></button>
              <button type="button" onClick={() => void removeSubject(item)} disabled={busyId === item.id} aria-label={`${item.name} verwijderen`} className="danger-quiet"><Trash2 size={15} /></button>
            </div>
          </li>)}
        </ul>}
      </section>

      <section className="subjects-manager-catalog">
        <h3>Catalogus</h3>
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zoek een vak" disabled={atLimit} />
        {atLimit && <p className="study-empty">Je hebt het maximum van vijf vakken bereikt. Verwijder een vak om een ander te kiezen.</p>}
        {!atLimit && <ul className="catalog-subject-list">
          {availableSubjects.map((subject) => <li key={subject.id}>
            <button type="button" onClick={() => void addSubject(subject.id)} disabled={busyId === subject.id}>
              <span><strong>{subject.name}</strong><small>{subject.description}</small></span>
              <Plus size={16} />
            </button>
          </li>)}
          {!availableSubjects.length && <li className="study-empty">Geen vakken meer over in de catalogus.</li>}
        </ul>}
        <form className="custom-subject-form" onSubmit={addCustomSubject}>
          <Input value={customName} onChange={(event) => setCustomName(event.target.value)} maxLength={80} placeholder="Staat je vak er niet bij? Vul een eigen vaknaam in" disabled={atLimit} />
          <Button type="submit" disabled={atLimit || busyId === 'custom' || !customName.trim()}><Plus size={16} /> Toevoegen</Button>
        </form>
      </section>
    </div>
  </div>;
}
