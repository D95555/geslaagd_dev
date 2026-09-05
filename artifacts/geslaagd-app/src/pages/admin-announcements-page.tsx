import { useEffect, useState } from 'react';
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncementsAdmin,
  updateAnnouncement,
  type Announcement,
} from '@workspace/api-client-react';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { AdminDenied, AdminShell } from '@/components/admin/admin-shell';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import { Textarea } from '@workspace/geslaagd-momentum/components/ui/textarea';

function fmtDateTime(value: string) {
  return new Date(value).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' });
}

const EMPTY_FORM = { title: '', body: '' };

export default function AdminAnnouncementsPage() {
  const { user, isLoading } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setState('loading');
    try {
      const result = await listAnnouncementsAdmin();
      setAnnouncements(result.announcements);
      setState('ready');
    } catch (error) {
      setState((error as { status?: number }).status === 403 ? 'forbidden' : 'error');
    }
  };
  useEffect(() => {
    if (!isLoading && user) void load();
    else if (!isLoading) setState('forbidden');
  }, [isLoading, user?.id]);

  const startEdit = (announcement: Announcement) => {
    setEditingId(announcement.id);
    setForm({ title: announcement.title, body: announcement.body });
  };
  const startNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const submit = async () => {
    if (!form.title.trim() || !form.body.trim()) return;
    setSaving(true);
    try {
      if (editingId) await updateAnnouncement(editingId, form);
      else await createAnnouncement(form);
      startNew();
      await load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Deze aankondiging definitief verwijderen?')) return;
    await deleteAnnouncement(id);
    if (editingId === id) startNew();
    await load();
  };

  if (state === 'forbidden') return <AdminDenied />;

  return (
    <AdminShell title="Aankondigingen" intro="Beheer de aankondigingen die iedereen op /announcements ziet.">
      <div className="admin-panel changelog-form">
        <h2>{editingId ? 'Aankondiging bewerken' : 'Nieuwe aankondiging'}</h2>
        <label>Titel<Input value={form.title} maxLength={160} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></label>
        <label>Tekst<Textarea rows={5} maxLength={2000} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} /></label>
        <div className="request-row-actions">
          {editingId && <Button variant="ghost" onClick={startNew}>Annuleren</Button>}
          <Button disabled={saving || !form.title.trim() || !form.body.trim()} onClick={() => void submit()}>
            {saving ? <Loader2 className="spin" size={14} /> : editingId ? <Pencil size={14} /> : <Plus size={14} />}
            {editingId ? 'Opslaan' : 'Toevoegen'}
          </Button>
        </div>
      </div>

      {state === 'loading' ? (
        <p className="admin-empty"><Loader2 className="spin" size={15} /> Aankondigingen laden…</p>
      ) : state === 'error' ? (
        <p className="admin-empty">Aankondigingen konden niet geladen worden.</p>
      ) : announcements.length === 0 ? (
        <p className="admin-empty">Nog geen aankondigingen.</p>
      ) : (
        <div className="account-list">
          {announcements.map((announcement) => (
            <div key={announcement.id} className="account-row">
              <div>
                <strong>{announcement.title}</strong>
                <span>{fmtDateTime(announcement.updatedAt)}</span>
              </div>
              <div className="request-row-actions">
                <Button variant="ghost" onClick={() => startEdit(announcement)}><Pencil size={14} /> Bewerken</Button>
                <Button variant="ghost" onClick={() => void remove(announcement.id)}><Trash2 size={14} /> Verwijderen</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
