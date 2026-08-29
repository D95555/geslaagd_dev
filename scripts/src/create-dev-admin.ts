/**
 * Idempotently create (or promote) a Supabase auth user with admin access,
 * for local/dev testing of the /beheer pages without needing a real
 * teammate's credentials. Safe to re-run — it upserts by email.
 *
 * Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from the environment (the
 * same names already used in artifacts/api-server/.env), so run it with:
 *
 *   cd artifacts/api-server && node --env-file=.env \
 *     -r tsx/cjs ../../scripts/src/create-dev-admin.ts <email> <password>
 *
 * or export those two vars yourself and run it directly with tsx.
 */

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("Usage: create-dev-admin.ts <email> <password>");
  process.exit(1);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing VITE_SUPABASE_URL (or SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY in the environment.",
  );
  process.exit(1);
}

const adminHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  "Content-Type": "application/json",
};

type SupabaseAuthUser = {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
};

async function findUserByEmail(targetEmail: string): Promise<SupabaseAuthUser | null> {
  // The admin list endpoint isn't searchable by email server-side, so page
  // through it — fine for the handful of users a dev project has.
  let page = 1;
  for (;;) {
    const res = await fetch(
      `${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=200`,
      { headers: adminHeaders },
    );
    if (!res.ok) throw new Error(`List users failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { users: SupabaseAuthUser[] };
    const match = body.users.find((u) => u.email?.toLowerCase() === targetEmail.toLowerCase());
    if (match) return match;
    if (body.users.length < 200) return null;
    page += 1;
  }
}

async function main() {
  const existing = await findUserByEmail(email!);

  if (existing) {
    if (existing.app_metadata?.["role"] === "admin") {
      console.log(`Already exists and already admin: ${email} (${existing.id})`);
      return;
    }
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${existing.id}`, {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ app_metadata: { ...existing.app_metadata, role: "admin" } }),
    });
    if (!res.ok) throw new Error(`Promote failed: ${res.status} ${await res.text()}`);
    console.log(`Promoted existing user to admin: ${email} (${existing.id})`);
    return;
  }

  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "admin" },
    }),
  });
  if (!res.ok) throw new Error(`Create failed: ${res.status} ${await res.text()}`);
  const created = (await res.json()) as SupabaseAuthUser;
  console.log(`Created admin dev user: ${email} (${created.id})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
