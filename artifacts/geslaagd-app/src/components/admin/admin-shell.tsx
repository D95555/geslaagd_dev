import type { ReactNode } from 'react';
import { useLocation } from 'wouter';
import {
  ClipboardList,
  Compass,
  LayoutDashboard,
  LogOut,
  ShieldAlert,
  Sparkles,
  Terminal,
  Users,
  Workflow,
} from 'lucide-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { useAuth } from '@/auth/auth-context';

type NavItem = {
  href: string;
  label: string;
  hint: string;
  icon: typeof LayoutDashboard;
};

/**
 * One place that says what lives where. Admin pages used to be reachable only
 * by knowing their URL, which made it hard to tell crawls, subject requests
 * and the content pipeline apart.
 */
const NAV: NavItem[] = [
  { href: '/beheer', label: 'Overzicht', hint: 'Wat vraagt aandacht', icon: LayoutDashboard },
  { href: '/beheer/verkenner', label: 'Verkenner', hint: 'Elk object opzoeken, met beslissingen en logs', icon: Sparkles },
  { href: '/beheer/crawl', label: 'Vakken & crawls', hint: 'Aanvragen en zoekopdrachten', icon: Compass },
  { href: '/beheer/crawl/pending', label: 'Bronnen beoordelen', hint: 'Wachtrij met twijfelgevallen', icon: ClipboardList },
  { href: '/beheer/pipeline', label: 'Contentpijplijn', hint: 'Taken van aanvraag tot publicatie', icon: Workflow },
  { href: '/beheer/console', label: 'Console', hint: 'Live logboek van de pijplijn', icon: Terminal },
  { href: '/beheer/accounts', label: 'Accounts & sessies', hint: 'Gebruikers en broadcasts', icon: Users },
];

function isActive(current: string, href: string): boolean {
  if (href === '/beheer') return current === '/beheer';
  return current === href || current.startsWith(`${href}/`);
}

export function AdminShell({
  title,
  intro,
  actions,
  children,
}: {
  title: string;
  intro?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [location, setLocation] = useLocation();
  const { user, signOut } = useAuth();

  const leave = async () => {
    await signOut();
    setLocation('/');
  };

  return (
    <main className="admin-page">
      <header className="admin-header">
        <button className="auth-brand" onClick={() => setLocation('/')} aria-label="Naar geslaagd.app">
          <span className="wordmark-mark" />
          <span>geslaagd.app</span>
        </button>
        <div className="admin-header-actions">
          {user && <span className="admin-header-user">{user.email}</span>}
          <Button variant="ghost" size="sm" onClick={() => setLocation('/mijn-leeromgeving')}>
            Mijn leeromgeving
          </Button>
          <Button variant="ghost" size="sm" onClick={leave}>
            <LogOut size={15} /> Uitloggen
          </Button>
        </div>
      </header>

      <div className="admin-layout">
        <nav className="admin-nav" aria-label="Beheernavigatie">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(location, item.href);
            return (
              <button
                key={item.href}
                type="button"
                className={active ? 'admin-nav-item active' : 'admin-nav-item'}
                aria-current={active ? 'page' : undefined}
                onClick={() => setLocation(item.href)}
                data-testid={`nav-${item.href.replace(/\//g, '-')}`}
              >
                <Icon size={16} aria-hidden="true" />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </span>
              </button>
            );
          })}
        </nav>

        <section className="admin-content">
          <div className="admin-content-head">
            <div>
              <h1>{title}</h1>
              {intro && <p>{intro}</p>}
            </div>
            {actions && <div className="admin-content-actions">{actions}</div>}
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}

/** Shared refusal screen so every admin page fails the same way. */
export function AdminDenied() {
  const [, setLocation] = useLocation();
  return (
    <main className="admin-denied">
      <ShieldAlert size={22} aria-hidden="true" />
      <h1>Geen toegang</h1>
      <p>Deze pagina is alleen voor beheerders.</p>
      <Button onClick={() => setLocation('/')}>Naar de homepage</Button>
    </main>
  );
}
