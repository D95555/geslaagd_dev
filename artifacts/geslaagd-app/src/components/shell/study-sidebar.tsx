import { useLocation } from 'wouter';
import { BookOpen, CircleDashed, LayoutDashboard, Lock } from 'lucide-react';
import { getGetSubjectDetailQueryKey, useGetSubjectDetail } from '@workspace/api-client-react';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '@workspace/geslaagd-momentum/components/ui/sidebar';

function subjectIdFrom(location: string): string | null {
  return location.match(/^\/vakken\/([^/]+)/)?.[1] ?? null;
}

function chapterIdFrom(location: string): string | null {
  return location.match(/^\/vakken\/[^/]+\/hoofdstuk\/([^/]+)/)?.[1] ?? null;
}

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

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={location === '/mijn-leeromgeving'}
                onClick={() => setLocation('/mijn-leeromgeving')}
              >
                <LayoutDashboard /> <span>Mijn leeromgeving</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={location === '/vakken'} onClick={() => setLocation('/vakken')}>
                <BookOpen /> <span>Vakken</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
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

              {subject?.chapters.map((chapter) => {
                const ready = chapter.status === 'ready';
                return (
                  <SidebarMenuItem key={chapter.id}>
                    <SidebarMenuButton
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
                    {chapter.isImportant && <SidebarMenuBadge>Tentamen</SidebarMenuBadge>}
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
