export function subjectIdFrom(location: string): string | null {
  return location.match(/^\/vakken\/([^/]+)/)?.[1] ?? null;
}

export function chapterIdFrom(location: string): string | null {
  return location.match(/^\/vakken\/[^/]+\/hoofdstuk\/([^/]+)/)?.[1] ?? null;
}
