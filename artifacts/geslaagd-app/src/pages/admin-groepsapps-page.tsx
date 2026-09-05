import { useEffect, useState } from 'react';
import {
  closeAdminGroup,
  deleteAdminGroup,
  listAdminGroups,
  type AdminGroupSummary,
} from '@workspace/api-client-react';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/geslaagd-momentum/components/ui/dialog';
import { AlertTriangle, Loader2, Lock, LockOpen, Trash2 } from 'lucide-react';
import { AdminDenied, AdminShell } from '@/components/admin/admin-shell';
import { useAuth } from '@/auth/auth-context';

function fmtDateTime(value: string | null): string {
  if (!value) return 'nooit';
  return new Date(value).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' });
}

const statusLabel: Record<AdminGroupSummary['status'], string> = {
  active: 'Actief',
  closed: 'Gesloten',
  deleted: 'Verwijderd',
};

export default function AdminGroepsappsPage() {
  const { user, isLoading } = useAuth();
  const [groups, setGroups] = useState<AdminGroupSummary[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminGroupSummary | null>(null);

  const load = async () => {
    setState('loading');
    try {
      const result = await listAdminGroups();
      setGroups(result.groups.filter((g) => g.status !== 'deleted'));
      setState('ready');
    } catch (error) {
      setState((error as { status?: number }).status === 403 ? 'forbidden' : 'error');
    }
  };

  useEffect(() => {
    if (!isLoading && user) void load();
    else if (!isLoading) setState('forbidden');
  }, [isLoading, user?.id]);

  const toggleClosed = async (group: AdminGroupSummary) => {
    setBusyId(group.id);
    try {
      if (group.status === 'active') await closeAdminGroup(group.id);
      // Reopening isn't offered by the spec — "Sluiten" is the only reversible
      // action, and its reverse isn't specced. Closing is one-way from here;
      // a sitebeheerder who needs a group reopened would do so as a data fix.
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await deleteAdminGroup(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (state === 'forbidden') return <AdminDenied />;

  return (
    <AdminShell
      title="Groepsapps"
      intro="Alle groepen, voor misbruikdetectie. Onzichtbaar voor gewone gebruikers."
    >
      {state === 'loading' ? (
        <p className="admin-empty"><Loader2 className="spin" size={15} /> Groepen laden…</p>
      ) : state === 'error' ? (
        <p className="admin-empty">Groepen konden niet geladen worden.</p>
      ) : groups.length === 0 ? (
        <p className="admin-empty">Nog geen groepsapps.</p>
      ) : (
        <div className="account-list">
          {groups.map((group) => (
            <div key={group.id} className="account-row admin-groepsapp-row">
              <div>
                <strong>{group.title ?? 'Naamloze groep'}</strong>
                <span>
                  {group.ownerEmail ?? 'onbekende eigenaar'} · {group.memberCount}{' '}
                  {group.memberCount === 1 ? 'lid' : 'leden'} · laatst actief {fmtDateTime(group.lastMessageAt)}
                </span>
              </div>
              <div className="admin-groepsapp-actions">
                <Badge variant={group.status === 'active' ? 'default' : 'secondary'}>
                  {statusLabel[group.status]}
                </Badge>
                {group.status === 'active' && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === group.id}
                    onClick={() => void toggleClosed(group)}
                  >
                    <Lock size={14} /> Sluiten
                  </Button>
                )}
                {group.status === 'closed' && (
                  <span className="study-hint">
                    <LockOpen size={13} aria-hidden="true" /> Alleen leesbaar
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyId === group.id}
                  onClick={() => setDeleteTarget(group)}
                >
                  <Trash2 size={14} /> Verwijderen
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle><AlertTriangle size={17} /> Groep definitief verwijderen?</DialogTitle>
            <DialogDescription>
              "{deleteTarget?.title ?? 'Naamloze groep'}" wordt permanent verwijderd, inclusief alle berichten.
              Dit kan niet ongedaan worden gemaakt.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Annuleren</Button>
            <Button variant="destructive" disabled={busyId === deleteTarget?.id} onClick={() => void confirmDelete()}>
              {busyId === deleteTarget?.id ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />} Definitief verwijderen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
