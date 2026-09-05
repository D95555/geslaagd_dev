import { restService } from "./supabase";

type Row = Record<string, unknown>;

export type Announcement = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type FeedItem = {
  id: string;
  kind: "announcement" | "changelog";
  title: string;
  body: string;
  createdAt: string;
};

function toAnnouncement(row: Row): Announcement {
  return {
    id: row.id as string,
    title: row.title as string,
    body: row.body as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listAnnouncements(): Promise<Announcement[]> {
  const rows = await restService<Row[]>("announcements?select=*&order=created_at.desc");
  return rows.map(toAnnouncement);
}

export async function createAnnouncement(createdBy: string, title: string, body: string): Promise<Announcement> {
  const rows = await restService<Row[]>("announcements", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({ title, body, created_by: createdBy }),
  });
  return toAnnouncement(rows[0]!);
}

export async function updateAnnouncement(id: string, title: string, body: string): Promise<Announcement | null> {
  const rows = await restService<Row[]>(`announcements?id=eq.${id}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({ title, body, updated_at: new Date().toISOString() }),
  });
  return rows[0] ? toAnnouncement(rows[0]) : null;
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await restService(`announcements?id=eq.${id}`, { method: "DELETE" });
}

/** Public feed: announcements and changelog entries merged, newest first. */
export async function listAnnouncementFeed(): Promise<FeedItem[]> {
  const [announcements, changelogEntries] = await Promise.all([
    restService<Row[]>("announcements?select=*&order=created_at.desc"),
    restService<Row[]>("changelog_entries?select=*&order=released_at.desc"),
  ]);

  const announcementItems: FeedItem[] = announcements.map((row) => ({
    id: row.id as string,
    kind: "announcement",
    title: row.title as string,
    body: row.body as string,
    createdAt: row.created_at as string,
  }));

  const changelogItems: FeedItem[] = changelogEntries.map((row) => ({
    id: row.id as string,
    kind: "changelog",
    title: `${row.version as string} — ${row.summary as string}`,
    body: ((row.bullets as string[] | null) ?? []).join("\n"),
    createdAt: new Date(row.released_at as string).toISOString(),
  }));

  return [...announcementItems, ...changelogItems].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
