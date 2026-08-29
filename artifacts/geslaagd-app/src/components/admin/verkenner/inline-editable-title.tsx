import { useState } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';

export function InlineEditableTitle({
  value,
  onSave,
  className,
}: {
  value: string;
  onSave: (next: string) => Promise<void>;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setDraft(value);
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch {
      setError('Kon niet worden opgeslagen.');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        className={className ? `${className} verkenner-editable-title` : 'verkenner-editable-title'}
        onClick={start}
      >
        <span>{value}</span>
        <Pencil size={14} aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className="verkenner-editable-title-form">
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={saving}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save();
          if (e.key === 'Escape') cancel();
        }}
      />
      <Button size="sm" onClick={() => void save()} disabled={saving}>
        {saving ? <Loader2 className="spin" size={14} /> : <Check size={14} />}
      </Button>
      <Button size="sm" variant="ghost" onClick={cancel} disabled={saving}>
        <X size={14} />
      </Button>
      {error && <span className="admin-notice is-error">{error}</span>}
    </div>
  );
}
