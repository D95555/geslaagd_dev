import { restService } from "./supabase";

type Row = Record<string, unknown>;

export type Profile = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  institution: string | null;
  studyProgram: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

function toProfile(row: Row): Profile {
  return {
    userId: row.user_id as string,
    username: row.username as string,
    displayName: row.display_name as string,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    institution: (row.institution as string | null) ?? null,
    studyProgram: (row.study_program as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const rows = await restService<Row[]>(`profiles?user_id=eq.${userId}&select=*`);
  return rows[0] ? toProfile(rows[0]) : null;
}

export async function hasProfile(userId: string): Promise<boolean> {
  return (await getProfile(userId)) !== null;
}

export async function isUsernameTaken(username: string, excludingUserId?: string): Promise<boolean> {
  const rows = await restService<Row[]>(`profiles?username=eq.${encodeURIComponent(username)}&select=user_id`);
  return rows.some((row) => row.user_id !== excludingUserId);
}

export type ProfileInput = {
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  institution?: string | null;
  studyProgram?: string | null;
  description?: string | null;
};

export async function createProfile(userId: string, input: ProfileInput): Promise<Profile> {
  const rows = await restService<Row[]>("profiles", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      user_id: userId,
      username: input.username,
      display_name: input.displayName,
      avatar_url: input.avatarUrl ?? null,
      institution: input.institution ?? null,
      study_program: input.studyProgram ?? null,
      description: input.description ?? null,
    }),
  });
  return toProfile(rows[0]!);
}

export async function updateProfile(userId: string, input: Partial<ProfileInput>): Promise<Profile> {
  const patch: Row = { updated_at: new Date().toISOString() };
  if (input.displayName !== undefined) patch.display_name = input.displayName;
  if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl;
  if (input.institution !== undefined) patch.institution = input.institution;
  if (input.studyProgram !== undefined) patch.study_program = input.studyProgram;
  if (input.description !== undefined) patch.description = input.description;

  const rows = await restService<Row[]>(`profiles?user_id=eq.${userId}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  return toProfile(rows[0]!);
}

export async function searchProfiles(query: string, limit: number): Promise<Profile[]> {
  const q = encodeURIComponent(`%${query}%`);
  const rows = await restService<Row[]>(
    `profiles?or=(username.ilike.${q},display_name.ilike.${q},study_program.ilike.${q})&select=*&limit=${limit}`,
  );
  return rows.map(toProfile);
}

export async function loadVakkenFor(userId: string): Promise<{ subjectId: string; name: string }[]> {
  const rows = await restService<Row[]>(
    `student_selected_subjects?user_id=eq.${userId}&select=subject_id,crawl_subjects(name)`,
  );
  return rows
    .map((row) => ({
      subjectId: row.subject_id as string,
      name: ((row.crawl_subjects as Row | null)?.name as string | undefined) ?? "",
    }))
    .filter((entry) => entry.name);
}
