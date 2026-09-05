import { useRef } from 'react';
import { useLocation } from 'wouter';
import {
  Activity,
  BrainCircuit,
  Compass,
  History,
  KeyRound,
  LayoutDashboard,
  Megaphone,
  MessageCircleQuestion,
  Sparkles,
  Terminal,
  Users,
  Users2,
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
import { useArrowKeyListFocus } from '@/hooks/use-arrow-key-list-focus';

export type NavItem = { href: string; label: string; hint: string; icon: LucideIcon };

/**
 * One place that says what lives where. At compact sidebar height there's no
 * room for the old two-line (label + hint) rows, so the hint moves into the
 * hover tooltip the sidebar primitive already supports. Also shared with the
 * command palette so both list the same pages.
 */
export const ADMIN_NAV: NavItem[] = [
  { href: '/beheer', label: 'Overzicht', hint: 'Wat vraagt aandacht', icon: LayoutDashboard },
  { href: '/beheer/verkenner', label: 'Verkenner', hint: 'Elk object opzoeken, met beslissingen en logs', icon: Sparkles },
  { href: '/beheer/crawl', label: 'Vakken & crawls', hint: 'Aanvragen, zoekopdrachten en twijfelgevallen', icon: Compass },
  { href: '/beheer/beslissingen', label: 'AI-beslissingen', hint: 'Elke keuze die de AI maakte, met reden', icon: BrainCircuit },
  { href: '/beheer/pipeline', label: 'Contentpijplijn', hint: 'Taken van aanvraag tot publicatie', icon: Workflow },
  { href: '/beheer/console', label: 'Console', hint: 'Live logboek van de pijplijn', icon: Terminal },
  { href: '/beheer/sessies', label: 'Sessies', hint: 'Wie is online, meldingen en privé-berichten', icon: Activity },
  { href: '/beheer/groepsapps', label: 'Groepsapps', hint: 'Alle groepen, voor misbruikdetectie', icon: Users2 },
  { href: '/beheer/accounts', label: 'Accounts', hint: 'Gebruikers, pakketten en credits', icon: Users },
  { href: '/beheer/activatiecodes', label: 'Activatiecodes', hint: 'Codes om een account aan te maken of te upgraden', icon: KeyRound },
  { href: '/beheer/support', label: 'Support', hint: 'Tickets van studenten', icon: MessageCircleQuestion },
  { href: '/beheer/changelog', label: 'Changelog', hint: 'Wat is er veranderd', icon: History },
  { href: '/beheer/aankondigingen', label: 'Aankondigingen', hint: 'Berichten voor alle bezoekers', icon: Megaphone },
];

function isActive(current: string, href: string): boolean {
  if (href === '/beheer') return current === '/beheer';
  return current === href || current.startsWith(`${href}/`);
}

export function AdminSidebarNav({ location }: { location: string }) {
  const [, setLocation] = useLocation();
  const itemsRef = useRef<(HTMLElement | null)[]>([]);
  const activeIndex = Math.max(
    ADMIN_NAV.findIndex((item) => isActive(location, item.href)),
    0,
  );
  useArrowKeyListFocus(itemsRef, activeIndex);

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {ADMIN_NAV.map((item, index) => {
            const Icon = item.icon;
            const active = isActive(location, item.href);
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  ref={(el: HTMLButtonElement | null) => {
                    itemsRef.current[index] = el;
                  }}
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
