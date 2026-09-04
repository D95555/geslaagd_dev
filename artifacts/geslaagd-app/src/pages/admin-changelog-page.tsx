import { useEffect, useState } from 'react';
import {
  createChangelogEntry,
  listChangelogAdmin,
  updateChangelogEntry,
  type ChangelogEntry,
} from '@workspace/api-client-react';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { AdminDenied, AdminShell } from '@/components/admin/admin-shell';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import { Textarea } from '@workspace/geslaagd-momentum/components/ui/textarea';

function fmtDate(value: string) {
  return new Date(value).toLocaleDateString('nl-NL', { dateStyle: 'medium' });
}

const EMPTY_FORM = { version: '', releasedAt: '', summary: '', bulletsText: '' };

export default function AdminChangelogPage() {
  const { user, isLoading } = useAuth();
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setState('loading');
    try {
      const result = await listChangelogAdmin();
      setEntries(result.entries);
      setState('ready');
    } catch (error) {
      setState((error as { status?: number }).status === 403 ? 'forbidden' : 'error');
    }
  };
  useEffect(() => {
    if (!isLoading && user) void load();
    else if (!isLoading) setState('forbidden');
  }, [isLoading, user?.id]);

  const startEdit = (entry: ChangelogEntry) => {
    setEditingId(entry.id);
    setForm({
      version: entry.version,
      releasedAt: entry.releasedAt,
      summary: entry.summary,
      bulletsText: entry.bullets.join('\n'),
    });
  };
  const startNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const submit = async () => {
    const bullets = form.bulletsText.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!form.version.trim() || !form.releasedAt || !form.summary.trim() || bullets.length === 0) return;
    setSaving(true);
    try {
      const payload = {
        version: form.version.trim(),
        releasedAt: form.releasedAt,
        summary: form.summary.trim(),
        bullets,
      };
      if (editingId) await updateChangelogEntry(editingId, payload);
      else await createChangelogEntry(payload);
      startNew();
      await load();
    } finally {
      setSaving(false);
    }
  };

  if (state === 'forbidden') return <AdminDenied />;

  return (
    <AdminShell title="Changelog" intro="Beheer de changelog die gebruikers op /changelog zien.">
      <div className="admin-panel changelog-form">
        <h2>{editingId ? 'Item bewerken' : 'Nieuw item'}</h2>
        <label>Versie<Input value={form.version} maxLength={20} onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))} placeholder="v0.51" /></label>
        <label>Datum<Input type="date" value={form.releasedAt} onChange={(e) => setForm((f) => ({ ...f, releasedAt: e.target.value }))} /></label>
        <label>Samenvatting<Input value={form.summary} maxLength={200} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} placeholder="Korte titel van deze release" /></label>
        <label>Wijzigingen (één per regel)<Textarea rows={5} value={form.bulletsText} onChange={(e) => setForm((f) => ({ ...f, bulletsText: e.target.value }))} /></label>
        <div className="request-row-actions">
          {editingId && <Button variant="ghost" onClick={startNew}>Annuleren</Button>}
          <Button disabled={saving} onClick={() => void submit()}>
            {saving ? <Loader2 className="spin" size={14} /> : editingId ? <Pencil size={14} /> : <Plus size={14} />}
            {editingId ? 'Opslaan' : 'Toevoegen'}
          </Button>
        </div>
      </div>

      {state === 'loading' ? (
        <p className="admin-empty"><Loader2 className="spin" size={15} /> Changelog laden…</p>
      ) : state === 'error' ? (
        <p className="admin-empty">Changelog kon niet geladen worden.</p>
      ) : entries.length === 0 ? (
        <p className="admin-empty">Nog geen changelog-items.</p>
      ) : (
        <div className="account-list">
          {entries.map((entry) => (
            <div key={entry.id} className="account-row">
              <div>
                <strong>{entry.version} — {entry.summary}</strong>
                <span>{fmtDate(entry.releasedAt)} · {entry.bullets.length} wijziging{entry.bullets.length === 1 ? '' : 'en'}</span>
              </div>
              <Button variant="ghost" onClick={() => startEdit(entry)}><Pencil size={14} /> Bewerken</Button>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
