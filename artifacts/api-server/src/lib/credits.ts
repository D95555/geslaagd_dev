import { restService } from "./supabase";

type Row = Record<string, unknown>;

export type PackageKey = "trial" | "basis" | "plus" | "beheerder";

export type Package = {
  key: PackageKey;
  label: string;
  rank: number;
  startCredits: number | null;
  monthlyCredits: number | null;
  canCreateSubjects: boolean;
};

export type SpendReason = "subject_open" | "subject_create";
export type GrantReason =
  | "signup_grant"
  | "monthly_topup"
  | "package_upgrade"
  | "admin_adjustment"
  | "migration_grandfather";

export class InsufficientCreditsError extends Error {
  constructor() {
    super("Onvoldoende credits.");
  }
}

function toPackage(row: Row): Package {
  return {
    key: row.key as PackageKey,
    label: row.label as string,
    rank: row.rank as number,
    startCredits: (row.start_credits as number | null) ?? null,
    monthlyCredits: (row.monthly_credits as number | null) ?? null,
    canCreateSubjects: Boolean(row.can_create_subjects),
  };
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export async function getPackage(key: PackageKey): Promise<Package> {
  const rows = await restService<Row[]>(`packages?key=eq.${key}&select=*`);
  const row = rows[0];
  if (!row) throw new Error(`Unknown package: ${key}`);
  return toPackage(row);
}

/**
 * Grants/revokes the actual Supabase Auth admin role to match the package.
 * The `beheerder` package is meaningless if the account can't pass the
 * server-side isAdmin check (`app_metadata.role === "admin"`), so every path
 * that sets a package to/from beheerder must call this. Reads the current
 * app_metadata first and merges, rather than overwriting it wholesale, so
 * unrelated metadata keys survive.
 */
async function syncAdminRole(userId: string, packageKey: PackageKey): Promise<void> {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase service configuration is required.");

  const getResponse = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
  });
  if (!getResponse.ok) throw new Error(`Supabase Auth admin lookup failed (${getResponse.status}).`);
  const currentUser = (await getResponse.json()) as { app_metadata?: Record<string, unknown> };

  const nextAppMetadata = { ...(currentUser.app_metadata ?? {}) };
  if (packageKey === "beheerder") {
    nextAppMetadata.role = "admin";
  } else if (nextAppMetadata.role === "admin") {
    // Supabase's admin update merges app_metadata rather than replacing it,
    // so omitting the key would leave "admin" in place — it must be
    // explicitly nulled out to actually revoke the role.
    nextAppMetadata.role = null;
  } else {
    return; // Not beheerder and wasn't admin — nothing to change.
  }

  const putResponse = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
    body: JSON.stringify({ app_metadata: nextAppMetadata }),
  });
  if (!putResponse.ok) throw new Error(`Supabase Auth admin role sync failed (${putResponse.status}).`);
}

async function insertLedgerRow(
  accountId: string,
  delta: number,
  reason: SpendReason | GrantReason,
  relatedSubjectId?: string,
  note?: string,
): Promise<void> {
  await restService("credit_transactions", {
    method: "POST",
    body: JSON.stringify({
      account_id: accountId,
      delta,
      reason,
      related_subject_id: relatedSubjectId ?? null,
      note: note ?? null,
    }),
  });
}

/**
 * Applies the lazy monthly top-up if 30+ days have passed since the last one,
 * then returns the (possibly just-updated) billing row. Called at the start
 * of getBilling/spendCredits/grantCredits so every credit-aware code path
 * benefits from it without a separate scheduler.
 */
async function ensureMonthlyTopup(userId: string): Promise<Row> {
  const rows = await restService<Row[]>(`account_billing?user_id=eq.${userId}&select=*`);
  const billing = rows[0];
  if (!billing) throw new Error(`No account_billing row for user ${userId}`);

  const lastTopup = new Date(billing.last_credit_topup_at as string).getTime();
  if (Date.now() - lastTopup < MONTH_MS) return billing;

  const pkg = await getPackage(billing.package as PackageKey);
  if (pkg.key === "beheerder" || !pkg.monthlyCredits) {
    await restService(`account_billing?user_id=eq.${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ last_credit_topup_at: new Date().toISOString() }),
    });
    return { ...billing, last_credit_topup_at: new Date().toISOString() };
  }

  const currentCredits = billing.credits as number;
  const cap = pkg.startCredits ?? currentCredits + pkg.monthlyCredits;
  const applied = Math.max(0, Math.min(pkg.monthlyCredits, cap - currentCredits));

  const updated = await restService<Row[]>(`account_billing?user_id=eq.${userId}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      credits: currentCredits + applied,
      last_credit_topup_at: new Date().toISOString(),
    }),
  });
  if (applied > 0) await insertLedgerRow(userId, applied, "monthly_topup");
  return updated[0] ?? billing;
}

export async function getBilling(userId: string): Promise<{ package: Package; credits: number }> {
  const billing = await ensureMonthlyTopup(userId);
  const pkg = await getPackage(billing.package as PackageKey);
  return { package: pkg, credits: billing.credits as number };
}

export async function spendCredits(
  userId: string,
  amount: number,
  reason: SpendReason,
  relatedSubjectId?: string,
): Promise<void> {
  const { package: pkg, credits } = await getBilling(userId);
  if (pkg.key === "beheerder") return;
  if (credits < amount) throw new InsufficientCreditsError();

  await restService(`account_billing?user_id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ credits: credits - amount }),
  });
  await insertLedgerRow(userId, -amount, reason, relatedSubjectId);
}

export async function grantCredits(
  userId: string,
  amount: number,
  reason: GrantReason,
  note?: string,
): Promise<void> {
  const { package: pkg, credits } = await getBilling(userId);
  const cap = pkg.startCredits ?? credits + amount;
  const applied = Math.max(0, Math.min(amount, cap - credits));

  await restService(`account_billing?user_id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ credits: credits + applied }),
  });
  await insertLedgerRow(userId, applied, reason, undefined, note);
}

export type SetPackageReason = "package_upgrade" | "admin_adjustment";

/**
 * Changes an existing account's package: resets credits to the new
 * package's start amount, records the ledger row, and syncs the real
 * Supabase admin role. Used by both the key-upgrade endpoint and the admin
 * package-override endpoint so the admin-role sync can never be forgotten
 * at one of the two call sites.
 */
export async function setAccountPackage(
  userId: string,
  packageKey: PackageKey,
  reason: SetPackageReason,
  note?: string,
): Promise<void> {
  const pkg = await getPackage(packageKey);
  const startCredits = pkg.startCredits ?? 0;
  await restService(`account_billing?user_id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ package: packageKey, credits: startCredits }),
  });
  await insertLedgerRow(userId, startCredits, reason, undefined, note);
  await syncAdminRole(userId, packageKey);
}

/** Exported so the signup routes can sync the role right after the initial account_billing insert. */
export { syncAdminRole };

/** Rolling-30-day count of subjects this account has requested. */
export async function subjectsCreatedThisMonth(userId: string): Promise<number> {
  const cutoff = new Date(Date.now() - MONTH_MS).toISOString();
  const rows = await restService<Row[]>(
    `crawl_subjects?requested_by=eq.${userId}&created_at=gte.${encodeURIComponent(cutoff)}&select=id`,
  );
  return rows.length;
}

export async function hasPurchasedSubject(userId: string, subjectId: string): Promise<boolean> {
  const rows = await restService<Row[]>(
    `subject_purchases?account_id=eq.${userId}&subject_id=eq.${subjectId}&select=account_id`,
  );
  return rows.length > 0;
}

export async function recordSubjectPurchase(userId: string, subjectId: string): Promise<void> {
  await restService("subject_purchases?on_conflict=account_id,subject_id", {
    method: "POST",
    headers: { prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify({ account_id: userId, subject_id: subjectId }),
  });
}
