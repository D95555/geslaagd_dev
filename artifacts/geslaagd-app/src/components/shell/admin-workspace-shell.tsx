import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { Activity, BrainCircuit, ChevronLeft, Home, LogOut, Menu, Search, ShieldCheck, Terminal, Users } from 'lucide-react';
import { SidebarProvider } from '@workspace/geslaagd-momentum/components/ui/sidebar';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@workspace/geslaagd-momentum/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@workspace/geslaagd-momentum/components/ui/tooltip';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { useSurfaceTheme } from '@workspace/geslaagd-momentum/hooks/use-theme';
import { useAuth } from '@/auth/auth-context';
import { ADMIN_NAV } from '@/components/shell/admin-sidebar';
import { CommandPalette } from '@/components/shell/command-palette';
import { ShortcutsDialog } from '@/components/shell/shortcuts-dialog';
import { VersionBadge } from '@/components/shell/version-badge';
import { LiveTaskTicker } from '@/components/admin/live-task-ticker';
import { useSuppressSidebarHotkeyInEditable } from '@/hooks/use-hotkeys';

const GROUPS = [
  { label: 'Start', paths: ['/beheer'] },
  { label: 'Content & AI', paths: ['/beheer/verkenner', '/beheer/crawl', '/beheer/beslissingen', '/beheer/pipeline', '/beheer/console'] },
  { label: 'Gebruikers', paths: ['/beheer/sessies', '/beheer/groepsapps', '/beheer/accounts', '/beheer/activatiecodes'] },
  { label: 'Communicatie', paths: ['/beheer/support', '/beheer/changelog', '/beheer/aankondigingen'] },
] as const;

const DOCK = [
  { href: '/beheer', label: 'Overzicht', icon: Home },
  { href: '/beheer/crawl', label: 'Content & crawls', icon: BrainCircuit },
  { href: '/beheer/pipeline', label: 'Live operatie', icon: Activity },
  { href: '/beheer/accounts', label: 'Gebruikers', icon: Users },
] as const;

function activeFor(location: string, href: string) {
  if (href === '/beheer') return location === href;
  if (href === '/beheer/crawl') return ['/beheer/crawl', '/beheer/verkenner', '/beheer/beslissingen'].some((path) => location.startsWith(path));
  if (href === '/beheer/pipeline') return ['/beheer/pipeline', '/beheer/console'].some((path) => location.startsWith(path));
  if (href === '/beheer/accounts') return ['/beheer/accounts', '/beheer/sessies', '/beheer/groepsapps', '/beheer/activatiecodes'].some((path) => location.startsWith(path));
  return location.startsWith(href);
}

function exactActive(location: string, href: string) {
  return href === '/beheer' ? location === href : location === href || location.startsWith(`${href}/`);
}

function labelFor(location: string) {
  return ADMIN_NAV.find((item) => exactActive(location, item.href))?.label ?? 'Beheer';
}

function AdminMenu({ location, navigate }: { location: string; navigate: (path: string) => void }) {
  return (
    <div className="admin-navigation-groups">
      {GROUPS.map((group) => (
        <section key={group.label}>
          <p>{group.label}</p>
          <nav aria-label={group.label}>
            {group.paths.map((path) => {
              const item = ADMIN_NAV.find((candidate) => candidate.href === path);
              if (!item) return null;
              const Icon = item.icon;
              const active = exactActive(location, item.href);
              return (
                <button type="button" className={active ? 'is-active' : undefined} key={item.href} onClick={() => navigate(item.href)} data-testid={`nav-${item.href.replace(/\//g, '-')}`}>
                  <Icon size={16} /><span><strong>{item.label}</strong><small>{item.hint}</small></span>
                </button>
              );
            })}
          </nav>
        </section>
      ))}
    </div>
  );
}

export function AdminWorkspaceShell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, signOut } = useAuth();
  const mainRef = useRef<HTMLDivElement>(null);
  const [panelOpen, setPanelOpen] = useState(() => {
    try { return localStorage.getItem('geslaagd:admin-panel') !== '0'; } catch { return true; }
  });

  useSurfaceTheme('light');
  useSuppressSidebarHotkeyInEditable();

  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }); }, [location]);
  const setPanel = useCallback((open: boolean) => {
    setPanelOpen(open);
    try { localStorage.setItem('geslaagd:admin-panel', open ? '1' : '0'); } catch { /* optional */ }
  }, []);
  const leave = async () => { await signOut(); setLocation('/'); };

  return (
    <SidebarProvider open={panelOpen} onOpenChange={setPanel}>
      <CommandPalette section="admin" />
      <ShortcutsDialog />
      <div className={`admin-workspace${panelOpen ? ' has-panel' : ''}`}>
        <aside className="admin-dock" aria-label="Beheer hoofdnavigatie">
          <button className="admin-dock-brand" type="button" onClick={() => setLocation('/beheer')} aria-label="Beheer"><ShieldCheck size={20}/></button>
          <nav>
            {DOCK.map(({ href, label, icon: Icon }) => {
              const active = activeFor(location, href);
              return <Tooltip key={href}><TooltipTrigger asChild><button type="button" className={active ? 'is-active' : undefined} aria-label={label} onClick={() => setLocation(href)}><Icon size={18}/></button></TooltipTrigger><TooltipContent side="right">{label}</TooltipContent></Tooltip>;
            })}
          </nav>
          <div className="admin-dock-bottom">
            <Tooltip><TooltipTrigger asChild><button type="button" aria-label="Naar leeromgeving" onClick={() => setLocation('/mijn-leeromgeving')}><Home size={18}/></button></TooltipTrigger><TooltipContent side="right">Naar leeromgeving</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><button type="button" aria-label="Uitloggen" onClick={() => void leave()}><LogOut size={18}/></button></TooltipTrigger><TooltipContent side="right">Uitloggen</TooltipContent></Tooltip>
          </div>
        </aside>

        <aside className="admin-navigation-panel">
          <div className="admin-navigation-brand"><button type="button" onClick={() => setLocation('/beheer')}><span className="wordmark-mark"/>geslaagd.app</button><button type="button" aria-label="Beheernavigatie inklappen" onClick={() => setPanel(false)}><ChevronLeft size={16}/></button></div>
          <AdminMenu location={location} navigate={setLocation}/>
          <div className="admin-navigation-user"><span><strong>{user?.email}</strong><small>beheerder</small></span><VersionBadge/></div>
        </aside>

        <section className="admin-workspace-stage">
          <header className="admin-commandbar">
            <div><button type="button" className="admin-panel-toggle" aria-label={panelOpen ? 'Beheernavigatie inklappen' : 'Beheernavigatie uitklappen'} onClick={() => setPanel(!panelOpen)}>{panelOpen ? <ChevronLeft size={17}/> : <Menu size={18}/>}</button><span>{labelFor(location)}</span></div>
            <button type="button" className="admin-command-search" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}><Search size={15}/><span>Zoek pagina of actie</span><kbd>Ctrl K</kbd></button>
            <div className="admin-live-state"><i/><span>Systemen live</span></div>
            <Sheet>
              <SheetTrigger asChild><Button className="admin-mobile-menu" variant="ghost" size="sm"><Menu size={17}/><span>Menu</span></Button></SheetTrigger>
              <SheetContent side="left" className="admin-mobile-sheet"><SheetHeader><SheetTitle>Beheer</SheetTitle><SheetDescription>Navigeer door de beheeromgeving.</SheetDescription></SheetHeader><AdminMenu location={location} navigate={setLocation}/></SheetContent>
            </Sheet>
          </header>
          <main className="admin-workspace-main" ref={mainRef}>{children}</main>
          <LiveTaskTicker />
        </section>
      </div>
    </SidebarProvider>
  );
}
