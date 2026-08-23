import { useEffect, useMemo, useState } from 'react';
import { listAdminSessions, revokeAdminSession, sendAdminBroadcast } from '@workspace/api-client-react';
import { Activity, ArrowLeft, BellRing, ChevronDown, Compass, LogOut, RefreshCw, Send, ShieldAlert, Users } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/auth-context';
import { supabase } from '@/lib/supabase';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { Input } from '@workspace/geslaagd-momentum/components/ui/input';
import { Textarea } from '@workspace/geslaagd-momentum/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/geslaagd-momentum/components/ui/tabs';
import AdminAccountsPanel from './admin-accounts';

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
  '/auth': 'Inloggen',
};
function pageLabel(path: string | null) {
  if (!path) return 'onbekende pagina';
  // Some historical rows stored an environment-mangled path (e.g. a shell
  // prefix pasted in front of the route). Recover the real route by matching
  // the last known-route segment rather than showing the raw value.
  const normalized = Object.keys(knownPages).find((route) => path.endsWith(route)) ?? path;
  if (knownPages[normalized]) return knownPages[normalized];
  if (normalized.includes('/mijn-leeromgeving/')) return 'Studieplek';
  if (normalized.includes('/beheer/crawl/')) return 'Crawldetail';
  return normalized;
}

function isOnline(item: Session) {
  return !item.revokedAt && Date.now() - new Date(item.lastSeenAt).getTime() < 180000;
}

type SessionGroup = { email: string; sessions: Session[]; onlineCount: number; latest: string };

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

export default function AdminPage() {
  const [, setLocation] = useLocation();
  const { user, session, isLoading, signOut } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [notice, setNotice] = useState('');
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});

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
      setTitle(''); setBody(''); setNotice('Broadcast is live verstuurd naar alle ingelogde browsers.');
    } catch {
      setNotice('Versturen is niet gelukt. Probeer het opnieuw.');
    }
  };

  if (state === 'forbidden') return <main className="admin-denied"><ShieldAlert size={29} /><h1>Geen toegang.</h1><p>Deze omgeving is alleen voor beheerders.</p><Button onClick={() => setLocation('/')}>Terug naar de homepage</Button></main>;
  return <main className="admin-page">
    <header className="admin-header"><button className="auth-brand" onClick={() => setLocation('/')}><span className="wordmark-mark" /><span>geslaagd.app</span></button><div><span>beheerdersomgeving</span><Button variant="ghost" onClick={async () => { await signOut(); setLocation('/'); }}><LogOut size={15}/> Uitloggen</Button></div></header>
    <section className="admin-wrap">
      <div className="admin-intro"><p className="dashboard-kicker"><ShieldAlert size={15}/> prive beheer</p><h1>Houd de leeromgeving in beweging.</h1><p>Bekijk actieve sessies, stuur een broadcast of zoek een account op.</p></div>
      <div className="admin-stats"><div><Activity size={17}/><strong>{active}</strong><span>nu actief</span></div><div><Users size={17}/><strong>{sessions.length}</strong><span>geregistreerd</span></div></div>
      <Button variant="outline" className="admin-crawl-link" onClick={() => setLocation('/beheer/crawl')}><Compass size={15}/> Bronnen crawl beheren</Button>
      <Tabs defaultValue="monitoring" className="admin-tabs">
        <TabsList className="admin-tabs-list">
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
        </TabsList>
        <TabsContent value="monitoring">
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
            <section className="admin-panel admin-broadcast"><div className="admin-panel-head"><div><span>live bericht</span><h2>Stuur een broadcast</h2></div><BellRing size={19}/></div><p>Iedere ingelogde browser ziet dit bericht meteen.</p><label>Titel<Input value={title} maxLength={70} onChange={(e) => setTitle(e.target.value)} placeholder="Bijvoorbeeld: gepland onderhoud"/></label><label>Bericht<Textarea value={body} maxLength={320} onChange={(e) => setBody(e.target.value)} placeholder="Wat moeten studenten weten?" /></label>{notice && <p className="admin-notice">{notice}</p>}<Button className="admin-send" disabled={!title.trim() || !body.trim()} onClick={() => void send()}>Broadcast versturen <Send size={15}/></Button></section>
          </div>
        </TabsContent>
        <TabsContent value="accounts">
          <AdminAccountsPanel />
        </TabsContent>
      </Tabs>
      <Button className="admin-back" variant="ghost" onClick={() => setLocation('/')}><ArrowLeft size={15}/> Terug naar de site</Button>
    </section>
  </main>;
}