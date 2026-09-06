import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import {
  BookOpen,
  Home,
  LogOut,
  MessageSquare,
  PanelRightOpen,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@workspace/geslaagd-momentum/components/ui/sidebar';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@workspace/geslaagd-momentum/components/ui/sheet';
import { useSurfaceTheme } from '@workspace/geslaagd-momentum/hooks/use-theme';
import { useAuth } from '@/auth/auth-context';
import { AdminSidebarNav } from '@/components/shell/admin-sidebar';
import { StudySidebarNav } from '@/components/shell/study-sidebar';
import { VersionBadge } from '@/components/shell/version-badge';
import { RailProvider, useRailSlotContent } from '@/components/shell/rail-context';
import { LiveTaskTicker } from '@/components/admin/live-task-ticker';
import { CommandPalette } from '@/components/shell/command-palette';
import { ShortcutsDialog } from '@/components/shell/shortcuts-dialog';
import { useSuppressSidebarHotkeyInEditable } from '@/hooks/use-hotkeys';

type Section = 'public' | 'study' | 'admin';

function sectionFor(path: string): Section {
  if (path.startsWith('/beheer')) return 'admin';
  if (path === '/mijn-leeromgeving' || path.startsWith('/vakken') || path.startsWith('/support') || path.startsWith('/changelog') || path.startsWith('/account') || path.startsWith('/social') || path.startsWith('/profielen') || path.startsWith('/gesprekken')) return 'study';
  return 'public';
}

const SIDEBAR_STATE_KEY = 'geslaagd:sidebar-open';

const studyDestinations = [
  { href: '/mijn-leeromgeving', label: 'Vandaag', icon: Home },
  { href: '/vakken', label: 'Vakken', icon: BookOpen },
  { href: '/gesprekken', label: 'Berichten', icon: MessageSquare },
  { href: '/account', label: 'Profiel', icon: UserRound },
] as const;

function studyPageLabel(path: string): string {
  if (path === '/mijn-leeromgeving') return 'Vandaag';
  if (path.startsWith('/vakken')) return 'Studeren';
  if (path.startsWith('/gesprekken')) return 'Berichten';
  if (path.startsWith('/social') || path.startsWith('/profielen')) return 'Studenten';
  if (path.startsWith('/account')) return 'Profiel';
  if (path.startsWith('/support')) return 'Support';
  if (path.startsWith('/changelog')) return 'Updates';
  return 'Leeromgeving';
}

function StudyMobileNav({ location, navigate }: { location: string; navigate: (path: string) => void }) {
  return (
    <nav className="study-mobile-nav" aria-label="Primaire navigatie">
      {studyDestinations.map(({ href, label, icon: Icon }) => {
        const active = href === '/vakken' || href === '/gesprekken'
          ? location.startsWith(href)
          : location === href;
        return (
          <button
            key={href}
            type="button"
            className={active ? 'is-active' : undefined}
            aria-current={active ? 'page' : undefined}
            onClick={() => navigate(href)}
          >
            <Icon size={19} aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** The sidebar primitive persists to a cookie only a Next.js server reads. */
function useSidebarOpenState(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STATE_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const update = (next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(SIDEBAR_STATE_KEY, next ? '1' : '0');
    } catch {
      // Private browsing or a full storage quota -- the toggle still works
      // for this session, it just won't be remembered next time.
    }
  };
  return [open, update];
}

function ShellSurface({ section, children }: { section: 'study' | 'admin'; children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, isAdmin, signOut } = useAuth();
  const [open, setOpen] = useSidebarOpenState();
  const railContent = useRailSlotContent();
  const mainRef = useRef<HTMLDivElement>(null);

  useSurfaceTheme('light');
  useSuppressSidebarHotkeyInEditable();

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [location]);

  const leave = async () => {
    await signOut();
    setLocation('/');
  };

  return (
    <SidebarProvider open={open} onOpenChange={setOpen}>
      <CommandPalette section={section} />
      <ShortcutsDialog />
      <Sidebar collapsible="icon" className={section === 'admin' ? 'density-compact' : undefined}>
        <SidebarHeader>
          <button className="shell-brand" onClick={() => setLocation('/')} aria-label="Naar geslaagd.app">
            <span className="wordmark-mark" />
            <span>geslaagd.app</span>
          </button>
        </SidebarHeader>

        <SidebarContent>
          {section === 'study' ? (
            <StudySidebarNav location={location} />
          ) : (
            <AdminSidebarNav location={location} />
          )}
        </SidebarContent>

        <SidebarFooter>
          {section === 'admin' ? (
            <Button variant="ghost" size="sm" onClick={() => setLocation('/mijn-leeromgeving')}>
              Mijn leeromgeving
            </Button>
          ) : (
            isAdmin && (
              <Button variant="ghost" size="sm" onClick={() => setLocation('/beheer')}>
                <ShieldCheck size={15} /> Beheer
              </Button>
            )
          )}
          <div className="shell-user">
            {user && <span>{user.email}</span>}
            <VersionBadge />
            <Button variant="ghost" size="sm" onClick={() => void leave()}>
              <LogOut size={15} /> Uitloggen
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className={section === 'study' ? 'student-surface' : undefined}>
        <div className="shell-topbar">
          <SidebarTrigger />
          <span className="shell-page-label">{section === 'study' ? studyPageLabel(location) : 'Beheer'}</span>
          {railContent && (
            <Sheet>
              <SheetTrigger asChild>
                <Button className="shell-context-trigger" variant="ghost" size="sm" aria-label="Context openen">
                  <PanelRightOpen size={17} aria-hidden="true" />
                  <span>Context</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="shell-context-sheet">
                <SheetHeader>
                  <SheetTitle>Context</SheetTitle>
                  <SheetDescription>Naslag en details voor wat je nu bekijkt.</SheetDescription>
                </SheetHeader>
                <div className="shell-context-sheet-body">{railContent}</div>
              </SheetContent>
            </Sheet>
          )}
        </div>
        <div className="shell-body">
          <div className="shell-main" ref={mainRef}>{children}</div>
          {railContent && <aside className="shell-rail">{railContent}</aside>}
        </div>
        {section === 'study' && <StudyMobileNav location={location} navigate={setLocation} />}
        {section === 'admin' && <LiveTaskTicker />}
      </SidebarInset>
    </SidebarProvider>
  );
}

/**
 * Mounted once, outside the router's error boundary, so it survives page
 * navigation instead of being torn down and rebuilt on every route change --
 * that was the actual bug behind "the chapter list disappears when you open
 * a chapter". Marketing and auth keep their own bespoke full-page layouts and
 * pass straight through.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const section = sectionFor(location);

  if (section === 'public') return <>{children}</>;

  return (
    <RailProvider>
      <ShellSurface section={section}>{children}</ShellSurface>
    </RailProvider>
  );
}
