import { randomBytes } from "node:crypto";
import { restService } from "./supabase";
import { getPackage, type PackageKey } from "./credits";

type Row = Record<string, unknown>;

export type ActivationKey = {
  id: string;
  code: string;
  status: "open" | "used";
  source: "admin" | "purchase";
  package: PackageKey;
  createdAt: string;
  usedAt: string | null;
  usedByUserId: string | null;
  usedByEmail: string | null;
};

function toActivationKey(row: Row): ActivationKey {
  return {
    id: row.id as string,
    code: row.code as string,
    status: row.status as "open" | "used",
    source: row.source as "admin" | "purchase",
    package: row.package as PackageKey,
    createdAt: row.created_at as string,
    usedAt: (row.used_at as string | null) ?? null,
    usedByUserId: (row.used_by_user_id as string | null) ?? null,
    usedByEmail: (row.used_by_email as string | null) ?? null,
  };
}

// Excludes visually ambiguous characters (0/O, 1/I/L) since codes are typed by hand.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCodeGroup(length: number): string {
  const bytes = randomBytes(length);
  let group = "";
  for (let i = 0; i < length; i++) {
    group += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return group;
}

function generateCode(): string {
  return `${randomCodeGroup(4)}-${randomCodeGroup(4)}-${randomCodeGroup(4)}`;
}

export function normalizeActivationCode(input: string): string {
  return input.trim().toUpperCase();
}

export async function listActivationKeys(status?: "open" | "used"): Promise<ActivationKey[]> {
  const filter = status ? `&status=eq.${status}` : "";
  const rows = await restService<Row[]>(`activation_keys?select=*&order=created_at.desc${filter}`);
  return rows.map(toActivationKey);
}

/** Creates `count` fresh, unused keys for the given package and returns them so an admin can copy the codes immediately. */
export async function createActivationKeys(count: number, packageKey: PackageKey): Promise<ActivationKey[]> {
  const body = Array.from({ length: count }, () => ({ code: generateCode(), package: packageKey }));
  const rows = await restService<Row[]>("activation_keys", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  return rows.map(toActivationKey);
}

/**
 * Atomically flips one key from 'open' to 'used'. The conditional PATCH
 * filter is what makes this safe against two signups racing the same code —
 * only one of them can match `status=eq.open`.
 */
export async function claimActivationKey(code: string): Promise<ActivationKey | null> {
  const rows = await restService<Row[]>(
    `activation_keys?code=eq.${encodeURIComponent(code)}&status=eq.open`,
    {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({ status: "used", used_at: new Date().toISOString() }),
    },
  );
  return rows[0] ? toActivationKey(rows[0]) : null;
}

/** Rolls a claim back when the account creation that followed it failed. */
export async function releaseActivationKey(id: string): Promise<void> {
  await restService(`activation_keys?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "open", used_at: null }),
  });
}

/** Attaches the resulting account to an already-claimed key. */
export async function attachActivationKeyToUser(
  id: string,
  userId: string,
  email: string,
): Promise<void> {
  await restService(`activation_keys?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ used_by_user_id: userId, used_by_email: email }),
  });
}

/**
 * Like claimActivationKey, but additionally rejects (without touching the
 * key) any key whose package rank is not strictly higher than the caller's
 * current package. Used for the logged-in "enter an upgrade key" flow.
 */
export async function claimUpgradeKey(code: string, currentPackage: PackageKey): Promise<ActivationKey | null> {
  const rows = await restService<Row[]>(
    `activation_keys?code=eq.${encodeURIComponent(code)}&status=eq.open&select=*`,
  );
  const candidate = rows[0];
  if (!candidate) return null;

  const [currentPkg, keyPkg] = await Promise.all([
    getPackage(currentPackage),
    getPackage(candidate.package as PackageKey),
  ]);
  if (keyPkg.rank <= currentPkg.rank) return null;

  return claimActivationKey(code);
}
