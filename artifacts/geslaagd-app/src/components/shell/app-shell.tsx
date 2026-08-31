import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { LogOut, ShieldCheck } from 'lucide-react';
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
import { useSurfaceTheme } from '@workspace/geslaagd-momentum/hooks/use-theme';
import { useAuth } from '@/auth/auth-context';
import { AdminSidebarNav } from '@/components/shell/admin-sidebar';
import { StudySidebarNav } from '@/components/shell/study-sidebar';
import { RailProvider, useRailSlotContent } from '@/components/shell/rail-context';
import { LiveTaskTicker } from '@/components/admin/live-task-ticker';
import { CommandPalette } from '@/components/shell/command-palette';
import { ShortcutsDialog } from '@/components/shell/shortcuts-dialog';
import { useSuppressSidebarHotkeyInEditable } from '@/hooks/use-hotkeys';

type Section = 'public' | 'study' | 'admin';

function sectionFor(path: string): Section {
  if (path.startsWith('/beheer')) return 'admin';
  if (path === '/mijn-leeromgeving' || path.startsWith('/vakken') || path.startsWith('/support')) return 'study';
  return 'public';
}

const SIDEBAR_STATE_KEY = 'geslaagd:sidebar-open';

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

  useSurfaceTheme('dark');
  useSuppressSidebarHotkeyInEditable();

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
            <Button variant="ghost" size="sm" onClick={() => void leave()}>
              <LogOut size={15} /> Uitloggen
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <div className="shell-topbar">
          <SidebarTrigger />
        </div>
        <div className="shell-body">
          <div className="shell-main">{children}</div>
          {railContent && <aside className="shell-rail">{railContent}</aside>}
        </div>
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
