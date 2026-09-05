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
    restService<Row[]>("changelog_entries?select=*&order=released_at.desc,created_at.desc"),
  ]);

  type Entry = { item: FeedItem; sortDate: string; sortTiebreak: string };

  const announcementEntries: Entry[] = announcements.map((row) => ({
    item: {
      id: row.id as string,
      kind: "announcement",
      title: row.title as string,
      body: row.body as string,
      createdAt: row.created_at as string,
    },
    sortDate: row.created_at as string,
    sortTiebreak: row.created_at as string,
  }));

  const changelogEntryItems: Entry[] = changelogEntries.map((row) => ({
    item: {
      id: row.id as string,
      kind: "changelog",
      title: `${row.version as string} — ${row.summary as string}`,
      body: ((row.bullets as string[] | null) ?? []).join("\n"),
      createdAt: new Date(row.released_at as string).toISOString(),
    },
    sortDate: row.released_at as string,
    // released_at is a bare date with no time-of-day, so two entries
    // released the same day tie on sortDate alone — created_at (true
    // insertion order) breaks that tie deterministically.
    sortTiebreak: row.created_at as string,
  }));

  return [...announcementEntries, ...changelogEntryItems]
    .sort((a, b) => {
      const dateDiff = new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime();
      return dateDiff !== 0 ? dateDiff : new Date(b.sortTiebreak).getTime() - new Date(a.sortTiebreak).getTime();
    })
    .map((entry) => entry.item);
}
