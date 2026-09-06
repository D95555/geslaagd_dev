import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import {
  Bell,
  BookOpen,
  ChevronLeft,
  CircleDashed,
  CircleHelp,
  Home,
  Lock,
  LogOut,
  Menu,
  MessageSquare,
  PanelRightOpen,
  Search,
  Sparkles,
  UserRound,
  Users2,
} from 'lucide-react';
import { getGetSubjectDetailQueryKey, useGetSubjectDetail } from '@workspace/api-client-react';
import { Button } from '@workspace/geslaagd-momentum/components/ui/button';
import { SidebarProvider } from '@workspace/geslaagd-momentum/components/ui/sidebar';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@workspace/geslaagd-momentum/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@workspace/geslaagd-momentum/components/ui/tooltip';
import { useSurfaceTheme } from '@workspace/geslaagd-momentum/hooks/use-theme';
import { useAuth } from '@/auth/auth-context';
import { CommandPalette } from '@/components/shell/command-palette';
import { RailProvider, useRailSlotContent } from '@/components/shell/rail-context';
import { ShortcutsDialog } from '@/components/shell/shortcuts-dialog';
import { VersionBadge } from '@/components/shell/version-badge';
import { useSuppressSidebarHotkeyInEditable } from '@/hooks/use-hotkeys';
import { chapterIdFrom, subjectIdFrom } from '@/lib/study-routes';

const PRIMARY_NAV = [
  { href: '/mijn-leeromgeving', label: 'Vandaag', icon: Home },
  { href: '/vakken', label: 'Vakken', icon: BookOpen },
  { href: '/social', label: 'Studenten', icon: Users2 },
  { href: '/gesprekken', label: 'Berichten', icon: MessageSquare },
] as const;

const SECONDARY_NAV = [
  { href: '/announcements', label: 'Wat is er nieuw?', icon: Bell },
  { href: '/faq', label: 'Veelgestelde vragen', icon: CircleHelp },
] as const;

function routeLabel(path: string): string {
  if (path === '/mijn-leeromgeving') return 'Vandaag';
  if (path === '/vakken') return 'Vakken';
  if (path.includes('/hoofdstuk/')) return 'Hoofdstuk';
  if (path.startsWith('/vakken/')) return 'Vakoverzicht';
  if (path.startsWith('/gesprekken/')) return 'Gesprek';
  if (path.startsWith('/gesprekken')) return 'Berichten';
  if (path.startsWith('/social') || path.startsWith('/profielen')) return 'Studenten';
  if (path.startsWith('/account')) return 'Profiel';
  if (path.startsWith('/support')) return 'Support';
  return 'Leeromgeving';
}

function isActive(path: string, href: string) {
  if (href === '/vakken' || href === '/gesprekken') return path.startsWith(href);
  if (href === '/social') return path.startsWith('/social') || path.startsWith('/profielen');
  return path === href;
}

function DockButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Home;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={`student-dock-button${active ? ' is-active' : ''}`}
          aria-label={label}
          aria-current={active ? 'page' : undefined}
          onClick={onClick}
        >
          <Icon size={19} strokeWidth={active ? 2.3 : 1.8} aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function WorkspacePanel({ location, navigate }: { location: string; navigate: (path: string) => void }) {
  const subjectId = subjectIdFrom(location);
  const activeChapterId = chapterIdFrom(location);
  const { data: subject, isLoading } = useGetSubjectDetail(subjectId ?? '', {
    query: { enabled: subjectId !== null, queryKey: getGetSubjectDetailQueryKey(subjectId ?? '') },
  });

  if (subjectId) {
    return (
      <div className="student-context-content">
        <button type="button" className="student-context-back" onClick={() => navigate('/vakken')}>
          <ChevronLeft size={15} /> Alle vakken
        </button>
        <div className="student-context-heading">
          <span>Nu aan het leren</span>
          <button type="button" onClick={() => navigate(`/vakken/${subjectId}`)}>
            {subject?.name ?? 'Vak laden…'}
          </button>
        </div>
        <div className="student-context-rule" />
        <p className="student-context-label">Hoofdstukken</p>
        <nav className="student-chapter-list" aria-label="Hoofdstukken">
          {isLoading && Array.from({ length: 5 }, (_, index) => (
            <span className="student-chapter-skeleton" key={index} />
          ))}
          {subject?.chapters.map((chapter) => {
            const ready = chapter.status === 'ready';
            const active = chapter.id === activeChapterId;
            return (
              <button
                type="button"
                className={active ? 'is-active' : undefined}
                disabled={!ready}
                key={chapter.id}
                onClick={() => ready && navigate(`/vakken/${subjectId}/hoofdstuk/${chapter.id}`)}
              >
                <span>{ready ? <CircleDashed size={14} /> : <Lock size={13} />}</span>
                <span>{chapter.position}. {chapter.title}</span>
              </button>
            );
          })}
        </nav>
      </div>
    );
  }

  return (
    <div className="student-context-content">
      <div className="student-context-heading">
        <span>Jouw workspace</span>
        <strong>Geslaagd</strong>
      </div>
      <div className="student-context-rule" />
      <p className="student-context-label">Snel naar</p>
      <nav className="student-context-nav" aria-label="Aanvullende navigatie">
        {SECONDARY_NAV.map(({ href, label, icon: Icon }) => (
          <button
            type="button"
            className={location === href ? 'is-active' : undefined}
            key={href}
            onClick={() => navigate(href)}
          >
            <Icon size={16} /> <span>{label}</span>
          </button>
        ))}
      </nav>
      <button type="button" className="student-ai-nudge" onClick={() => navigate('/vakken')}>
        <span className="student-ai-nudge-icon"><Sparkles size={16} /></span>
        <span><strong>Nieuwe studiesessie</strong><small>Kies een vak en begin direct.</small></span>
      </button>
    </div>
  );
}

function StudentWorkspaceSurface({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, signOut } = useAuth();
  const railContent = useRailSlotContent();
  const mainRef = useRef<HTMLDivElement>(null);
  const [panelOpen, setPanelOpen] = useState(() => {
    try { return localStorage.getItem('geslaagd:workspace-panel') !== '0'; } catch { return true; }
  });

  useSurfaceTheme('light');
  useSuppressSidebarHotkeyInEditable();

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [location]);

  const setPanel = useCallback((open: boolean) => {
    setPanelOpen(open);
    try { localStorage.setItem('geslaagd:workspace-panel', open ? '1' : '0'); } catch { /* optional */ }
  }, []);

  const leave = async () => {
    await signOut();
    setLocation('/');
  };

  return (
    <SidebarProvider open={panelOpen} onOpenChange={setPanel}>
      <CommandPalette section="study" />
      <ShortcutsDialog />
      <div className={`student-workspace${panelOpen ? ' has-context' : ''}`}>
        <aside className="student-dock" aria-label="Hoofdnavigatie">
          <button className="student-dock-brand" type="button" onClick={() => setLocation('/')} aria-label="Geslaagd.app">
            <span className="wordmark-mark" />
          </button>
          <nav>
            {PRIMARY_NAV.map((item) => (
              <DockButton
                key={item.href}
                active={isActive(location, item.href)}
                icon={item.icon}
                label={item.label}
                onClick={() => setLocation(item.href)}
              />
            ))}
          </nav>
          <div className="student-dock-bottom">
            <DockButton
              active={location.startsWith('/account')}
              icon={UserRound}
              label="Profiel"
              onClick={() => setLocation('/account')}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="student-dock-button" aria-label="Uitloggen" onClick={() => void leave()}>
                  <LogOut size={18} aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Uitloggen</TooltipContent>
            </Tooltip>
          </div>
        </aside>

        <aside className="student-context-panel">
          <div className="student-context-brand">
            <button type="button" onClick={() => setLocation('/mijn-leeromgeving')}>geslaagd.app</button>
            <button type="button" aria-label="Paneel inklappen" onClick={() => setPanel(false)}><ChevronLeft size={16} /></button>
          </div>
          <WorkspacePanel location={location} navigate={setLocation} />
          <div className="student-context-user">
            <span>{user?.email}</span>
            <VersionBadge />
          </div>
        </aside>

        <section className="student-workspace-stage">
          <header className="student-commandbar">
            <div className="student-commandbar-start">
              <button
                type="button"
                className="student-panel-toggle"
                aria-label={panelOpen ? 'Navigatie inklappen' : 'Navigatie uitklappen'}
                onClick={() => setPanel(!panelOpen)}
              >
                {panelOpen ? <ChevronLeft size={17} /> : <Menu size={18} />}
              </button>
              <span className="student-route-label">{routeLabel(location)}</span>
            </div>
            <button
              type="button"
              className="student-command-search"
              onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
            >
              <Search size={15} /> <span>Zoek in je leeromgeving</span><kbd>Ctrl K</kbd>
            </button>
            {railContent && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button className="student-context-trigger" variant="ghost" size="sm" aria-label="Context openen">
                    <PanelRightOpen size={17} /> <span>Context</span>
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
          </header>
          <div className="student-workspace-body">
            <main className="student-workspace-main" ref={mainRef}>{children}</main>
            {railContent && <aside className="student-workspace-rail">{railContent}</aside>}
          </div>
          <nav className="student-bottom-nav" aria-label="Primaire navigatie">
            {PRIMARY_NAV.map(({ href, label, icon: Icon }) => {
              const active = isActive(location, href);
              return (
                <button type="button" className={active ? 'is-active' : undefined} key={href} onClick={() => setLocation(href)}>
                  <Icon size={19} /> <span>{label}</span>
                </button>
              );
            })}
          </nav>
        </section>
      </div>
    </SidebarProvider>
  );
}

export function StudentWorkspaceShell({ children }: { children: ReactNode }) {
  return (
    <RailProvider>
      <StudentWorkspaceSurface>{children}</StudentWorkspaceSurface>
    </RailProvider>
  );
}
