import { useEffect, useMemo, useState } from 'react';
import {
  blockAdminAccount,
  deleteAdminAccount,
  getAdminAccount,
  listAdminAccounts,
  setAdminAccountPackage,
  unblockAdminAccount,
} from '@workspace/api-client-react';
import type { AdminAccountDetail, AdminAccountSummary } from '@workspace/api-client-react';
import { AlertTriangle, Ban, Loader2, RotateCcw, Search, ShieldOff, Trash2, X } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { AdminDenied, AdminShell } from '@/components/admin/admin-shell';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import { Textarea } from '@workspace/geslaagd-momentum/components/ui/textarea';
import { Badge } from '@workspace/geslaagd-momentum/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/geslaagd-momentum/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@workspace/geslaagd-momentum/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/geslaagd-momentum/components/ui/dialog';

type StatusFilter = 'all' | 'active' | 'blocked';
type PendingAction = { kind: 'block' | 'unblock' | 'delete'; idempotencyKey: string };
type PackageKey = AdminAccountSummary['package'];

const packageLabel: Record<PackageKey, string> = {
  trial: 'Trial',
  basis: 'Basis',
  plus: 'Plus',
  beheerder: 'Beheerder',
};

const reasonLabel: Record<string, string> = {
  signup_grant: 'Startcredits',
  monthly_topup: 'Maandelijkse top-up',
  subject_open: 'Vak geopend',
  subject_create: 'Vak aangemaakt',
  package_upgrade: 'Pakket-upgrade',
  admin_adjustment: 'Aangepast door beheerder',
  migration_grandfather: 'Bestaand account',
};

function fmtDateTime(value: string | null) {
  if (!value) return 'onbekend';
  return new Date(value).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' });
}

function fmtDate(value: string | null) {
  if (!value) return 'onbekend';
  return new Date(value).toLocaleDateString('nl-NL', { dateStyle: 'medium' });
}

const actionCopy: Record<PendingAction['kind'], { title: string; description: string; confirmLabel: string; placeholder: string }> = {
  block: {
    title: 'Account tijdelijk blokkeren',
    description: 'De gebruiker wordt direct uitgelogd op alle apparaten en kan niet meer inloggen totdat je het account vrijgeeft. De gebruiker ontvangt hierover een e-mail.',
    confirmLabel: 'Blokkeren bevestigen',
    placeholder: 'Bijvoorbeeld: verdachte activiteit, misbruik van studiedata…',
  },
  unblock: {
    title: 'Blokkade opheffen',
    description: 'De gebruiker kan weer inloggen en ontvangt hierover een korte e-mailbevestiging.',
    confirmLabel: 'Vrijgeven bevestigen',
    placeholder: 'Bijvoorbeeld: onderzoek afgerond, geen misbruik vastgesteld…',
  },
  delete: {
    title: 'Account definitief opheffen',
    description: 'Dit kan niet ongedaan worden gemaakt. Het account en de toegang worden permanent verwijderd. De gebruiker ontvangt hierover een e-mail.',
    confirmLabel: 'Definitief verwijderen',
    placeholder: 'Bijvoorbeeld: verzoek van gebruiker, ernstige schending…',
  },
};

export default function AdminAccountsPage() {
  const { user, isLoading } = useAuth();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [accounts, setAccounts] = useState<AdminAccountSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [listState, setListState] = useState<'loading' | 'ready' | 'error' | 'forbidden'>('loading');

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminAccountDetail | null>(null);
  const [detailState, setDetailState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [packageBusy, setPackageBusy] = useState(false);

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [actionState, setActionState] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const loadAccounts = async () => {
    setListState('loading');
    try {
      const result = await listAdminAccounts({
        search: debouncedSearch || undefined,
        status,
        page: 1,
        limit: 50,
      });
      setAccounts(result.accounts);
      setTotal(result.total);
      setListState('ready');
    } catch (error) {
      setListState((error as { status?: number }).status === 403 ? 'forbidden' : 'error');
    }
  };
  useEffect(() => {
    if (!isLoading && user) void loadAccounts();
    else if (!isLoading) setListState('forbidden');
  }, [isLoading, user?.id, debouncedSearch, status]);

  const loadDetail = async (userId: string) => {
    setDetailState('loading');
    try {
      const result = await getAdminAccount(userId);
      setDetail(result);
      setDetailState('ready');
    } catch {
      setDetailState('error');
    }
  };
  useEffect(() => {
    if (selectedUserId) void loadDetail(selectedUserId);
    else setDetail(null);
  }, [selectedUserId]);

  const changePackage = async (newPackage: PackageKey) => {
    if (!selectedUserId) return;
    setPackageBusy(true);
    try {
      await setAdminAccountPackage(selectedUserId, { package: newPackage });
      await loadDetail(selectedUserId);
      await loadAccounts();
    } finally {
      setPackageBusy(false);
    }
  };

  const openAction = (kind: PendingAction['kind']) => {
    setPending({ kind, idempotencyKey: crypto.randomUUID() });
    setReason('');
    setConfirmText('');
    setActionState('idle');
    setActionError('');
  };
  const closeAction = () => {
    if (actionState === 'submitting') return;
    setPending(null);
  };

  const currentTargetEmail = detail?.summary.email ?? '';
  const canSubmitAction = useMemo(() => {
    if (!pending) return false;
    if (!reason.trim()) return false;
    if (pending.kind === 'delete' && confirmText.trim().toLowerCase() !== currentTargetEmail.toLowerCase()) return false;
    return true;
  }, [pending, reason, confirmText, currentTargetEmail]);

  const submitAction = async () => {
    if (!pending || !selectedUserId || !canSubmitAction) return;
    setActionState('submitting');
    setActionError('');
    const body = { reason: reason.trim(), idempotencyKey: pending.idempotencyKey };
    try {
      if (pending.kind === 'block') await blockAdminAccount(selectedUserId, body);
      else if (pending.kind === 'unblock') await unblockAdminAccount(selectedUserId, body);
      else await deleteAdminAccount(selectedUserId, body);

      setPending(null);
      if (pending.kind === 'delete') {
        setSelectedUserId(null);
        setDetail(null);
      } else {
        await loadDetail(selectedUserId);
      }
      await loadAccounts();
    } catch (error) {
      setActionState('error');
      const httpStatus = (error as { status?: number }).status;
      setActionError(httpStatus === 409 ? 'Deze actie is al verwerkt.' : 'Actie is niet gelukt. Probeer het opnieuw.');
    }
  };

  if (listState === 'forbidden') return <AdminDenied />;

  return (
    <AdminShell
      title="Accounts"
      intro="Alle gebruikers, hun pakket en recente credit-activiteit."
      actions={<Button variant="outline" size="sm" onClick={() => void loadAccounts()}>Verversen</Button>}
    >
      <section className="admin-accounts">
        <div className="admin-accounts-toolbar">
          <div className="admin-search">
            <Search size={16} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoek op e-mailadres…"
              aria-label="Zoek accounts op e-mail"
            />
          </div>
          <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
            <SelectTrigger className="admin-status-filter" aria-label="Filter op status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle statussen</SelectItem>
              <SelectItem value="active">Actief</SelectItem>
              <SelectItem value="blocked">Geblokkeerd</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {listState === 'loading' ? (
          <p className="admin-empty"><Loader2 className="spin" size={15} /> Accounts laden…</p>
        ) : listState === 'error' ? (
          <p className="admin-empty">Accounts konden niet geladen worden. <Button variant="ghost" onClick={() => void loadAccounts()}>Opnieuw proberen</Button></p>
        ) : accounts.length === 0 ? (
          <p className="admin-empty">Geen accounts gevonden voor deze zoekopdracht.</p>
        ) : (
          <>
            <p className="admin-account-count">{total} account{total === 1 ? '' : 's'}</p>
            <div className="account-list">
              {accounts.map((account) => (
                <button key={account.userId} className="account-row" onClick={() => setSelectedUserId(account.userId)}>
                  <div>
                    <strong>{account.email}</strong>
                    <span>Lid sinds {fmtDate(account.createdAt)} · laatst gezien {fmtDateTime(account.lastSeenAt)} · {account.sessionCount} sessie{account.sessionCount === 1 ? '' : 's'}</span>
                  </div>
                  <div className="request-row-actions">
                    <Badge variant="secondary">{packageLabel[account.package]}</Badge>
                    <Badge variant={account.status === 'blocked' ? 'destructive' : 'secondary'}>
                      {account.status === 'blocked' ? 'Geblokkeerd' : 'Actief'}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        <Sheet open={!!selectedUserId} onOpenChange={(open) => { if (!open) setSelectedUserId(null); }}>
          <SheetContent side="right" className="account-sheet">
            <SheetHeader>
              <SheetTitle>Accountdetail</SheetTitle>
            </SheetHeader>
            {detailState === 'loading' ? (
              <p className="admin-empty"><Loader2 className="spin" size={15} /> Details laden…</p>
            ) : detailState === 'error' ? (
              <p className="admin-empty">Details konden niet geladen worden. <Button variant="ghost" onClick={() => selectedUserId && void loadDetail(selectedUserId)}>Opnieuw proberen</Button></p>
            ) : detail ? (
              <div className="account-detail">
                <div className="account-detail-head">
                  <div>
                    <h3>{detail.summary.email}</h3>
                    <p>Lid sinds {fmtDate(detail.summary.createdAt)} · laatst ingelogd {fmtDateTime(detail.summary.lastSignInAt)}</p>
                  </div>
                  <Badge variant={detail.summary.status === 'blocked' ? 'destructive' : 'secondary'}>
                    {detail.summary.status === 'blocked' ? 'Geblokkeerd' : 'Actief'}
                  </Badge>
                </div>

                <section className="account-section">
                  <h4>Pakket</h4>
                  <Select
                    value={detail.summary.package}
                    onValueChange={(value) => void changePackage(value as PackageKey)}
                    disabled={packageBusy}
                  >
                    <SelectTrigger className="admin-status-filter" aria-label="Pakket wijzigen">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trial">Trial</SelectItem>
                      <SelectItem value="basis">Basis</SelectItem>
                      <SelectItem value="plus">Plus</SelectItem>
                      <SelectItem value="beheerder">Beheerder</SelectItem>
                    </SelectContent>
                  </Select>
                </section>

                <div className="account-detail-actions">
                  {detail.summary.status === 'blocked' ? (
                    <Button variant="outline" onClick={() => openAction('unblock')}><RotateCcw size={14} /> Vrijgeven</Button>
                  ) : (
                    <Button variant="outline" onClick={() => openAction('block')}><Ban size={14} /> Tijdelijk blokkeren</Button>
                  )}
                  <Button variant="destructive" onClick={() => openAction('delete')}><Trash2 size={14} /> Definitief opheffen</Button>
                </div>

                <section className="account-section">
                  <h4>Recente credit-activiteit</h4>
                  {detail.summary.recentActions.length === 0 ? <p className="account-placeholder">Nog geen credit-activiteit.</p> : (
                    <ul className="account-audit-list">
                      {detail.summary.recentActions.map((a) => (
                        <li key={a.id}>
                          <span>{a.delta > 0 ? '+' : ''}{a.delta} credits · {reasonLabel[a.reason] ?? a.reason}</span>
                          <em>{fmtDateTime(a.createdAt)}</em>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="account-section">
                  <h4>Vakken</h4>
                  {detail.selectedSubjects.length === 0 ? <p className="account-placeholder">Nog geen vakken gekozen.</p> : (
                    <ul className="account-tag-list">{detail.selectedSubjects.map((s) => <li key={s.id}>{s.name}</li>)}</ul>
                  )}
                </section>

                <section className="account-section">
                  <h4>Voorkeuren</h4>
                  {detail.preferences ? (
                    <dl className="account-fact-list">
                      <div><dt>Niveau</dt><dd>{detail.preferences.educationLevel}</dd></div>
                      <div><dt>Studieprofiel</dt><dd>{detail.preferences.studyProfile}</dd></div>
                      <div><dt>Leerdoelen</dt><dd>{detail.preferences.learningGoals.length ? detail.preferences.learningGoals.join(', ') : '—'}</dd></div>
                    </dl>
                  ) : <p className="account-placeholder">Nog geen voorkeuren ingesteld.</p>}
                </section>

                <section className="account-section">
                  <h4>Studieplekken</h4>
                  {detail.studySpaces.length === 0 ? <p className="account-placeholder">Nog geen studieplekken.</p> : (
                    <ul className="account-space-list">
                      {detail.studySpaces.map((space) => (
                        <li key={space.id}>
                          <strong>{space.title}</strong>
                          <span>{space.sourceType === 'ai' ? 'AI-gegenereerd' : 'Catalogus'} · {space.status === 'active' ? 'actief' : 'concept'} · bijgewerkt {fmtDate(space.updatedAt)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="account-section">
                  <h4>Cijfers &amp; voortgang</h4>
                  <p className="account-placeholder">Nog niet beschikbaar — deze koppeling volgt in een latere fase.</p>
                </section>

                <section className="account-section">
                  <h4>Recente sessies</h4>
                  {detail.recentSessions.length === 0 ? <p className="account-placeholder">Geen sessies geregistreerd.</p> : (
                    <ul className="account-space-list">
                      {detail.recentSessions.map((s) => (
                        <li key={s.clientSessionId}>
                          <strong>{s.deviceLabel}</strong>
                          <span>{s.revokedAt ? 'afgemeld' : 'actief'} · laatst gezien {fmtDateTime(s.lastSeenAt)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="account-section">
                  <h4>Audit geschiedenis</h4>
                  {detail.recentActions.length === 0 ? <p className="account-placeholder">Nog geen beheeracties op dit account.</p> : (
                    <ul className="account-audit-list">
                      {detail.recentActions.map((a) => (
                        <li key={a.id}>
                          <span className={a.result === 'failed' ? 'is-offline' : ''}>{a.action === 'block' ? 'Geblokkeerd' : a.action === 'unblock' ? 'Vrijgegeven' : 'Opgeheven'}{a.result === 'failed' ? ' (mislukt)' : ''}</span>
                          <em>{fmtDateTime(a.createdAt)} — {a.reason}</em>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            ) : null}
          </SheetContent>
        </Sheet>

        <Dialog open={!!pending} onOpenChange={(open) => { if (!open) closeAction(); }}>
          <DialogContent className="account-action-dialog">
            {pending && (
              <>
                <DialogHeader>
                  <DialogTitle><AlertTriangle size={17} /> {actionCopy[pending.kind].title}</DialogTitle>
                  <DialogDescription>{actionCopy[pending.kind].description}</DialogDescription>
                </DialogHeader>
                <label className="account-dialog-field">
                  Reden (verplicht, zichtbaar in het auditlog)
                  <Textarea
                    value={reason}
                    maxLength={500}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={actionCopy[pending.kind].placeholder}
                  />
                </label>
                {pending.kind === 'delete' && (
                  <label className="account-dialog-field">
                    Typ het e-mailadres <strong>{currentTargetEmail}</strong> ter bevestiging
                    <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={currentTargetEmail} />
                  </label>
                )}
                {actionState === 'error' && <p className="admin-notice is-error"><X size={14} /> {actionError}</p>}
                <DialogFooter>
                  <Button variant="ghost" onClick={closeAction} disabled={actionState === 'submitting'}>Annuleren</Button>
                  <Button
                    variant={pending.kind === 'delete' ? 'destructive' : 'default'}
                    disabled={!canSubmitAction || actionState === 'submitting'}
                    onClick={() => void submitAction()}
                  >
                    {actionState === 'submitting' ? <Loader2 className="spin" size={14} /> : pending.kind === 'delete' ? <Trash2 size={14} /> : <ShieldOff size={14} />}
                    {actionCopy[pending.kind].confirmLabel}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </section>
    </AdminShell>
  );
}
