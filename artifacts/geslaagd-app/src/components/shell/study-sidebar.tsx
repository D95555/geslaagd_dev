import { useRef } from 'react';
import { useLocation } from 'wouter';
import { BookOpen, CircleDashed, LayoutDashboard, Lock, type LucideIcon } from 'lucide-react';
import { getGetSubjectDetailQueryKey, useGetSubjectDetail } from '@workspace/api-client-react';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '@workspace/geslaagd-momentum/components/ui/sidebar';
import { useArrowKeyListFocus } from '@/hooks/use-arrow-key-list-focus';
import { chapterIdFrom, subjectIdFrom } from '@/lib/study-routes';

export type StudyNavItem = { href: string; label: string; icon: LucideIcon };

/** Shared with the command palette so both list the same top-level pages. */
export const STUDY_NAV: StudyNavItem[] = [
  { href: '/mijn-leeromgeving', label: 'Mijn leeromgeving', icon: LayoutDashboard },
  { href: '/vakken', label: 'Vakken', icon: BookOpen },
];

/**
 * The nav that stays on screen across the whole student surface. Its point is
 * the chapter list: previously it only existed inside the subject-hub page,
 * so opening a chapter made it disappear and coming back re-fetched the
 * subject from scratch. Sharing `useGetSubjectDetail`'s query key with the
 * page means both read the same cached fetch instead of doubling it.
 */
export function StudySidebarNav({ location }: { location: string }) {
  const [, setLocation] = useLocation();
  const subjectId = subjectIdFrom(location);
  const activeChapterId = chapterIdFrom(location);

  // Passing the same query key the hook would default to (rather than
  // omitting it, which trips a type quirk in the generated options) is what
  // lets the shell and the subject-hub page share one cached fetch.
  const { data: subject, isLoading } = useGetSubjectDetail(subjectId ?? '', {
    query: { enabled: subjectId !== null, queryKey: getGetSubjectDetailQueryKey(subjectId ?? '') },
  });

  // j/k move focus through whichever list is the current context: the
  // chapter list once a subject is open, otherwise the top-level pages.
  const topItemsRef = useRef<(HTMLElement | null)[]>([]);
  const chapterItemsRef = useRef<(HTMLElement | null)[]>([]);
  const activeTopIndex = Math.max(STUDY_NAV.findIndex((item) => item.href === location), 0);
  const activeChapterIndex = Math.max(
    subject?.chapters.findIndex((chapter) => chapter.id === activeChapterId) ?? -1,
    0,
  );
  useArrowKeyListFocus(subjectId ? chapterItemsRef : topItemsRef, subjectId ? activeChapterIndex : activeTopIndex);

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {STUDY_NAV.map((item, index) => {
              const Icon = item.icon;
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    ref={(el: HTMLButtonElement | null) => {
                      topItemsRef.current[index] = el;
                    }}
                    isActive={location === item.href}
                    onClick={() => setLocation(item.href)}
                  >
                    <Icon /> <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {subjectId && (
        <SidebarGroup>
          <SidebarGroupLabel>{subject?.name ?? 'Hoofdstukken'}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {isLoading &&
                Array.from({ length: 6 }, (_, index) => <SidebarMenuSkeleton key={index} showIcon />)}

              {subject?.chapters.map((chapter, index) => {
                const ready = chapter.status === 'ready';
                return (
                  <SidebarMenuItem key={chapter.id}>
                    <SidebarMenuButton
                      ref={(el: HTMLButtonElement | null) => {
                        chapterItemsRef.current[index] = el;
                      }}
                      isActive={chapter.id === activeChapterId}
                      disabled={!ready}
                      tooltip={!ready ? 'Nog in de maak' : undefined}
                      onClick={() =>
                        ready && setLocation(`/vakken/${subjectId}/hoofdstuk/${chapter.id}`)
                      }
                    >
                      {/* Read progress lives in a separate endpoint the shell
                          doesn't fetch (only ready/locked is in SubjectDetail);
                          a completion dot here would have to guess. */}
                      {!ready ? <Lock /> : <CircleDashed />}
                      <span>
                        {chapter.position}. {chapter.title}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}
    </>
  );
}
