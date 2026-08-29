import { useLocation } from 'wouter';
import {
  ClipboardList,
  Compass,
  LayoutDashboard,
  Sparkles,
  Terminal,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@workspace/geslaagd-momentum/components/ui/sidebar';

type NavItem = { href: string; label: string; hint: string; icon: LucideIcon };

/**
 * One place that says what lives where. At compact sidebar height there's no
 * room for the old two-line (label + hint) rows, so the hint moves into the
 * hover tooltip the sidebar primitive already supports.
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

export function AdminSidebarNav({ location }: { location: string }) {
  const [, setLocation] = useLocation();

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(location, item.href);
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  isActive={active}
                  tooltip={item.hint}
                  onClick={() => setLocation(item.href)}
                  data-testid={`nav-${item.href.replace(/\//g, '-')}`}
                >
                  <Icon /> <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
