import { useState } from 'react';
import { useLocation } from 'wouter';
import { LogOut, PanelLeft } from 'lucide-react';
import { getGetSubjectDetailQueryKey, useGetSubjectDetail } from '@workspace/api-client-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@workspace/geslaagd-momentum/components/ui/command';
import { DialogDescription, DialogTitle } from '@workspace/geslaagd-momentum/components/ui/dialog';
import { useSidebar } from '@workspace/geslaagd-momentum/components/ui/sidebar';
import { useAuth } from '@/auth/auth-context';
import { STUDY_NAV } from '@/components/shell/study-sidebar';
import { ADMIN_NAV } from '@/components/shell/admin-sidebar';
import { useHotkeys } from '@/hooks/use-hotkeys';
import { subjectIdFrom } from '@/lib/study-routes';

/**
 * Cmd/Ctrl+K, everywhere in the study and admin shell. Lists the same pages
 * as the sidebar plus, inside a subject, its chapters -- so jumping to a
 * chapter doesn't require the sidebar to be open first.
 */
export function CommandPalette({ section }: { section: 'study' | 'admin' }) {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { toggleSidebar } = useSidebar();
  const { signOut } = useAuth();
  const subjectId = section === 'study' ? subjectIdFrom(location) : null;

  const { data: subject } = useGetSubjectDetail(subjectId ?? '', {
    query: { enabled: subjectId !== null, queryKey: getGetSubjectDetailQueryKey(subjectId ?? '') },
  });

  useHotkeys([{ key: 'k', meta: true, handler: () => setOpen((current) => !current) }]);

  function go(href: string) {
    setLocation(href);
    setOpen(false);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      {/* Radix requires a DialogTitle for a11y; the palette's own visual
          heading is the search input, so this one is screen-reader-only. */}
      <DialogTitle className="sr-only">Commando's</DialogTitle>
      <DialogDescription className="sr-only">Zoek en navigeer met het toetsenbord</DialogDescription>
      <CommandInput placeholder="Zoek een pagina..." />
      <CommandList>
        <CommandEmpty>Niets gevonden.</CommandEmpty>
        <CommandGroup heading="Pagina's">
          {(section === 'study' ? STUDY_NAV : ADMIN_NAV).map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem key={item.href} onSelect={() => go(item.href)}>
                <Icon /> <span>{item.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        {subjectId && subject && subject.chapters.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={subject.name}>
              {subject.chapters.map((chapter) => (
                <CommandItem
                  key={chapter.id}
                  disabled={chapter.status !== 'ready'}
                  onSelect={() => go(`/vakken/${subjectId}/hoofdstuk/${chapter.id}`)}
                >
                  <span>
                    {chapter.position}. {chapter.title}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Acties">
          <CommandItem
            onSelect={() => {
              toggleSidebar();
              setOpen(false);
            }}
          >
            <PanelLeft /> <span>Zijbalk in-/uitklappen</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setOpen(false);
              void signOut().then(() => setLocation('/'));
            }}
          >
            <LogOut /> <span>Uitloggen</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
