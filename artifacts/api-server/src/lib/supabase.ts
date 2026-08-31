import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
type SupabaseUser = {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  created_at?: string;
  last_sign_in_at?: string | null;
  banned_until?: string | null;
  app_metadata?: Record<string, unknown>;
};

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const encryptionKey = process.env.SESSION_SECRET
  ? createHash("sha256").update(process.env.SESSION_SECRET).digest()
  : null;

if (!url || !key) throw new Error("Supabase public configuration is required.");

export type AuthenticatedUser = Required<Pick<SupabaseUser, "id">> & {
  email: string;
  isAdmin: boolean;
};

export async function getAuthenticatedUser(authorization?: string): Promise<AuthenticatedUser | null> {
  if (!authorization?.startsWith("Bearer ")) return null;
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, authorization },
  });
  if (!response.ok) return null;
  const user = (await response.json()) as SupabaseUser;
  if (!user.email || !user.email_confirmed_at) return null;
  const active = await fetch(`${url}/rest/v1/rpc/is_current_auth_session_active`, {
    method: "POST",
    headers: { apikey: key, authorization, "content-type": "application/json" },
  });
  if (!active.ok || !(await active.json() as boolean)) return null;
  return {
    id: user.id,
    email: user.email,
    isAdmin: user.app_metadata?.role === "admin",
  };
}

export async function getServiceUserById(userId: string): Promise<SupabaseUser | null> {
  if (!serviceKey) throw new Error("Supabase service role key is required.");
  const response = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Supabase Auth admin lookup failed (${response.status}).`);
  return (await response.json()) as SupabaseUser;
}

export async function getServiceUserIdByEmail(email: string): Promise<string | null> {
  return restService<string | null>("rpc/get_auth_user_id_by_email", {
    method: "POST",
    body: JSON.stringify({ p_email: email }),
  });
}

export async function requestPasswordResetEmail(
  email: string,
  redirectTo: string,
): Promise<void> {
  const response = await fetch(
    `${url}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`,
    {
      method: "POST",
      headers: {
        apikey: key,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email }),
    },
  );
  if (!response.ok) {
    throw new Error(`Supabase password reset request failed (${response.status}).`);
  }
}

export type SignUpResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; errorCode: string | null; message: string };

/**
 * Calls the same public signup endpoint the Supabase JS client hits from the
 * browser, so the confirmation-email flow stays identical — this just lets
 * the server validate an activation key before the account is created.
 */
export async function signUpWithPassword(
  email: string,
  password: string,
  redirectTo: string,
): Promise<SignUpResult> {
  const response = await fetch(`${url}/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    headers: { apikey: key, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = (await response.json().catch(() => null)) as
    | { id?: string; msg?: string; error_description?: string; message?: string; error_code?: string }
    | null;
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      errorCode: data?.error_code ?? null,
      message: data?.msg ?? data?.error_description ?? data?.message ?? "Aanmaken is mislukt.",
    };
  }
  if (!data?.id) {
    return { ok: false, status: 500, errorCode: null, message: "Supabase gaf geen gebruikers-id terug." };
  }
  return { ok: true, userId: data.id };
}

export async function rest<T>(
  authorization: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization,
      "content-type": "application/json",
      accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Supabase request failed (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  // PostgREST returns 201 with an empty body for an insert made without
  // `Prefer: return=representation` — not just 204 — so an empty body has to
  // be checked directly rather than assumed to only happen on 204.
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function restService<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!serviceKey) throw new Error("Supabase service role key is required.");
  return rest<T>(`Bearer ${serviceKey}`, path, init);
}

export function encryptSessionToken(token: string): string {
  if (!encryptionKey) throw new Error("Session encryption key is required.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function decryptSessionToken(value: string): string {
  if (!encryptionKey || !value) throw new Error("Stored session token is unavailable.");
  const data = Buffer.from(value, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
}

export function getJwtSessionId(token: string): string {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("Invalid access token.");
  const sessionId = (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { session_id?: string }).session_id;
  if (!sessionId) throw new Error("Access token has no session identifier.");
  return sessionId;
}

export async function revokeAuthSession(token: string): Promise<void> {
  const response = await fetch(`${url}/auth/v1/logout?scope=local`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Supabase Auth logout failed (${response.status}).`);
}

export async function broadcast(authorization: string, topic: string, event: string, payload: Record<string, string>): Promise<void> {
  const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: { apikey: key, authorization, "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ topic, event, payload, private: true }] }),
  });
  if (!response.ok) throw new Error(`Realtime broadcast failed (${response.status}).`);
}