import { useEffect, useMemo, useState } from 'react';
import { listAdminSessions, revokeAdminSession, sendAdminBroadcast, sendPrivateNotification } from '@workspace/api-client-react';
import { Activity, BellRing, ChevronDown, Mail, RefreshCw, Send, Users } from 'lucide-react';
import { AdminDenied, AdminShell } from '@/components/admin/admin-shell';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import { Textarea } from '@workspace/geslaagd-momentum/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/geslaagd-momentum/components/ui/dialog';

type Session = Awaited<ReturnType<typeof listAdminSessions>>[number];

function ago(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 90) return 'zojuist';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min geleden`;
  return `${Math.floor(seconds / 3600)} uur geleden`;
}

const knownPages: Record<string, string> = {
  '/': 'Homepage',
  '/mijn-leeromgeving': 'Leeromgeving',
  '/beheer': 'Beheer',
  '/beheer/crawl': 'Bronnen crawl',
  '/beheer/crawl/pending': 'Bronnen wachtrij',
  '/beheer/pipeline': 'Contentpijplijn',
  '/vakken': 'Vakkencatalogus',
  '/auth': 'Inloggen',
};
function pageLabel(path: string | null) {
  if (!path) return 'onbekende pagina';
  const normalized = Object.keys(knownPages).find((route) => path.endsWith(route)) ?? path;
  if (knownPages[normalized]) return knownPages[normalized];
  if (normalized.includes('/mijn-leeromgeving/')) return 'Studieplek';
  if (normalized.includes('/beheer/crawl/')) return 'Crawldetail';
  return normalized;
}

function isOnline(item: Session) {
  return !item.revokedAt && Date.now() - new Date(item.lastSeenAt).getTime() < 180000;
}

type SessionGroup = { userId: string; email: string; sessions: Session[]; onlineCount: number; latest: string };

function groupByUser(sessions: Session[]): SessionGroup[] {
  const groups = new Map<string, Session[]>();
  for (const item of sessions) {
    const existing = groups.get(item.email);
    if (existing) existing.push(item);
    else groups.set(item.email, [item]);
  }
  return [...groups.entries()]
    .map(([email, rows]) => {
      const sorted = rows.slice().sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());
      return {
        userId: sorted[0]!.userId,
        email,
        sessions: sorted,
        onlineCount: sorted.filter(isOnline).length,
        latest: sorted[0]?.lastSeenAt ?? new Date(0).toISOString(),
      };
    })
    .sort((a, b) => {
      if (a.onlineCount !== b.onlineCount) return b.onlineCount - a.onlineCount;
      return new Date(b.latest).getTime() - new Date(a.latest).getTime();
    });
}

export default function AdminSessionsPage() {
  const { user, session, isLoading } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [notice, setNotice] = useState('');
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});

  const [notifyTarget, setNotifyTarget] = useState<SessionGroup | null>(null);
  const [notifyTitle, setNotifyTitle] = useState('');
  const [notifyBody, setNotifyBody] = useState('');
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyNotice, setNotifyNotice] = useState('');

  const load = async () => {
    setState('loading');
    try { setSessions(await listAdminSessions()); setState('ready'); }
    catch (error) { setState((error as { status?: number }).status === 403 ? 'forbidden' : 'error'); }
  };
  useEffect(() => { if (!isLoading && user) void load(); else if (!isLoading) setState('forbidden'); }, [isLoading, user?.id]);

  const active = useMemo(() => sessions.filter((item) => !item.revokedAt && Date.now() - new Date(item.lastSeenAt).getTime() < 3 * 60_000).length, [sessions]);
  const grouped = useMemo(() => groupByUser(sessions), [sessions]);
  const revoke = async (item: Session) => {
    if (!window.confirm(`Deze browser van ${item.email} uitloggen?`)) return;
    await revokeAdminSession(item.clientSessionId);
    setSessions((all) => all.map((row) => row.clientSessionId === item.clientSessionId ? { ...row, revokedAt: new Date().toISOString() } : row));
  };
  const send = async () => {
    if (!title.trim() || !body.trim() || !session) return;
    setNotice('');
    try {
      await sendAdminBroadcast({ title: title.trim(), body: body.trim() });
      setTitle(''); setBody(''); setNotice('Melding is live verstuurd naar alle ingelogde browsers.');
    } catch {
      setNotice('Versturen is niet gelukt. Probeer het opnieuw.');
    }
  };

  const openNotify = (group: SessionGroup) => {
    setNotifyTarget(group);
    setNotifyTitle('');
    setNotifyBody('');
    setNotifyNotice('');
  };
  const sendPrivate = async () => {
    if (!notifyTarget || !notifyTitle.trim() || !notifyBody.trim()) return;
    setNotifyBusy(true);
    try {
      await sendPrivateNotification(notifyTarget.userId, { title: notifyTitle.trim(), body: notifyBody.trim() });
      setNotifyTarget(null);
    } catch {
      setNotifyNotice('Versturen is niet gelukt. Probeer het opnieuw.');
    } finally {
      setNotifyBusy(false);
    }
  };

  if (state === 'forbidden') return <AdminDenied />;
  return <AdminShell
      title="Sessies"
      intro="Bekijk actieve sessies en stuur een melding."
      actions={<Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw size={15}/> Verversen</Button>}
    >
      <div className="admin-stats"><div><Activity size={17}/><strong>{active}</strong><span>nu actief</span></div><div><Users size={17}/><strong>{sessions.length}</strong><span>geregistreerd</span></div></div>
      <div className="admin-grid">
        <section className="admin-panel admin-sessions"><div className="admin-panel-head"><div><span>sessies</span><h2>Verbonden browsers</h2></div><Button variant="ghost" onClick={() => void load()} aria-label="Ververs sessies"><RefreshCw size={16}/></Button></div>
          {state === 'loading' ? <p className="admin-empty">Sessies laden…</p> : state === 'error' ? <p className="admin-empty">Sessies konden niet geladen worden.</p> : sessions.length === 0 ? <p className="admin-empty">Nog geen browsers geregistreerd.</p> : <div className="session-list">
            {grouped.map((group) => {
              const isOpen = expandedUsers[group.email] ?? false;
              const [newest, ...rest] = group.sessions;
              if (!newest) return null;
              return (
                <div className="session-group" key={group.email}>
                  <div className="session-row">
                    <div>
                      <strong>{group.email}</strong>
                      <span>{newest.deviceLabel} · IP {newest.ipAddress ?? 'onbekend'} · {pageLabel(newest.currentPage)} · {ago(newest.lastSeenAt)}</span>
                    </div>
                    <div className="session-row-actions">
                      <i className={newest.revokedAt ? 'is-offline' : isOnline(newest) ? 'is-online' : 'is-idle'}>
                        {newest.revokedAt ? 'afgemeld' : group.onlineCount > 0 ? `${group.onlineCount} actief` : 'sessie'}
                      </i>
                      <Button variant="ghost" onClick={() => openNotify(group)}><Mail size={14} /> Privé melding</Button>
                      {!newest.revokedAt && <Button variant="ghost" onClick={() => void revoke(newest)}>Uitloggen</Button>}
                    </div>
                  </div>
                  {rest.length > 0 && (
                    <>
                      <button
                        type="button"
                        className="session-group-toggle"
                        aria-expanded={isOpen}
                        onClick={() => setExpandedUsers((all) => ({ ...all, [group.email]: !isOpen }))}
                      >
                        <ChevronDown size={14} className={isOpen ? 'is-open' : undefined} aria-hidden="true" />
                        {isOpen ? 'Verberg oudere sessies' : `Nog ${rest.length} ${rest.length === 1 ? 'sessie' : 'sessies'}`}
                      </button>
                      {isOpen && rest.map((item) => (
                        <div className="session-row is-nested" key={item.clientSessionId}>
                          <div>
                            <span>{item.deviceLabel} · IP {item.ipAddress ?? 'onbekend'} · {pageLabel(item.currentPage)} · {ago(item.lastSeenAt)}</span>
                          </div>
                          <div className="session-row-actions">
                            <i className={item.revokedAt ? 'is-offline' : isOnline(item) ? 'is-online' : 'is-idle'}>{item.revokedAt ? 'afgemeld' : 'sessie'}</i>
                            {!item.revokedAt && <Button variant="ghost" onClick={() => void revoke(item)}>Uitloggen</Button>}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              );
            })}
          </div>}
        </section>
        <section className="admin-panel admin-broadcast"><div className="admin-panel-head"><div><span>live bericht</span><h2>Stuur een melding</h2></div><BellRing size={19}/></div><p>Iedere ingelogde browser ziet dit bericht totdat ze het wegklikken.</p><label>Titel<Input value={title} maxLength={70} onChange={(e) => setTitle(e.target.value)} placeholder="Bijvoorbeeld: gepland onderhoud"/></label><label>Bericht<Textarea value={body} maxLength={320} onChange={(e) => setBody(e.target.value)} placeholder="Wat moeten studenten weten?" /></label>{notice && <p className="admin-notice">{notice}</p>}<Button className="admin-send" disabled={!title.trim() || !body.trim()} onClick={() => void send()}>Melding versturen <Send size={15}/></Button></section>
      </div>

      <Dialog open={!!notifyTarget} onOpenChange={(open) => { if (!open) setNotifyTarget(null); }}>
        <DialogContent>
          {notifyTarget && (
            <>
              <DialogHeader>
                <DialogTitle>Privé melding aan {notifyTarget.email}</DialogTitle>
              </DialogHeader>
              <label>Titel<Input value={notifyTitle} maxLength={70} onChange={(e) => setNotifyTitle(e.target.value)} /></label>
              <label>Bericht<Textarea value={notifyBody} maxLength={320} onChange={(e) => setNotifyBody(e.target.value)} /></label>
              {notifyNotice && <p className="admin-notice is-error">{notifyNotice}</p>}
              <DialogFooter>
                <Button variant="ghost" onClick={() => setNotifyTarget(null)} disabled={notifyBusy}>Annuleren</Button>
                <Button disabled={notifyBusy || !notifyTitle.trim() || !notifyBody.trim()} onClick={() => void sendPrivate()}>
                  <Send size={14} /> Versturen
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
  </AdminShell>;
}
