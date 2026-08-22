import { Plus, X } from 'lucide-react';
import { type KeyboardEvent, useState } from 'react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';

export function TagListInput({
  label,
  hint,
  values,
  onChange,
  placeholder,
  maxItems,
  maxLength,
}: {
  label: string;
  hint?: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  maxItems: number;
  maxLength: number;
}) {
  const [draft, setDraft] = useState('');
  const atLimit = values.length >= maxItems;

  const add = () => {
    const next = draft.trim();
    if (!next || atLimit) return;
    if (values.some((value) => value.toLocaleLowerCase('nl') === next.toLocaleLowerCase('nl'))) {
      setDraft('');
      return;
    }
    onChange([...values, next.slice(0, maxLength)]);
    setDraft('');
  };

  const remove = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      add();
    }
  };

  return (
    <label className="tag-list-field">
      <span>{label}</span>
      {hint && <small className="tag-list-hint">{hint}</small>}
      {values.length > 0 && (
        <ul className="tag-list-chips">
          {values.map((value, index) => (
            <li key={`${value}-${index}`}>
              <span>{value}</span>
              <button type="button" onClick={() => remove(index)} aria-label={`Verwijder ${value}`}>
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!atLimit && (
        <div className="tag-list-add">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            maxLength={maxLength}
            aria-label={`Nieuw item toevoegen: ${label}`}
          />
          <Button type="button" variant="ghost" onClick={add} disabled={!draft.trim()}>
            <Plus size={15} /> Toevoegen
          </Button>
        </div>
      )}
      {atLimit && <small className="tag-list-hint">Je hebt het maximum van {maxItems} bereikt.</small>}
    </label>
  );
}
