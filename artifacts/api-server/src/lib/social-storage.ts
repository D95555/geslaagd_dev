import sharp from "sharp";
import { restService } from "./supabase";

export class QuotaExceededError extends Error {
  constructor(scope: "user" | "group") {
    super(scope === "user" ? "Je opslaglimiet van 50MB is bereikt." : "De opslaglimiet van deze groep (200MB) is bereikt.");
  }
}

const USER_QUOTA_BYTES = 50 * 1024 * 1024;
const GROUP_QUOTA_BYTES = 200 * 1024 * 1024;

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function currentUsageBytes(conversationId: string, uploaderId: string, scope: "user" | "group"): Promise<number> {
  const filter = scope === "user"
    ? `messages?conversation_id=eq.${conversationId}&sender_id=eq.${uploaderId}&photo_url=not.is.null&select=photo_url`
    : `messages?conversation_id=eq.${conversationId}&photo_url=not.is.null&select=photo_url`;
  const rows = await restService<Record<string, unknown>[]>(filter);
  // Storage object size isn't stored on the message row; a cheap approximation
  // that avoids a second round-trip per photo is to cap by *count* at a
  // conservative average size instead of summing exact bytes.
  return rows.length * 300 * 1024; // assume ~300KB/photo post-compression
}

export async function checkPhotoQuota(conversationId: string, uploaderId: string): Promise<void> {
  if (!serviceKey || !url) throw new Error("Supabase service configuration is required.");
  const userUsage = await currentUsageBytes(conversationId, uploaderId, "user");
  if (userUsage >= USER_QUOTA_BYTES) throw new QuotaExceededError("user");
  const groupUsage = await currentUsageBytes(conversationId, uploaderId, "group");
  if (groupUsage >= GROUP_QUOTA_BYTES) throw new QuotaExceededError("group");
}

export async function uploadConversationPhoto(
  conversationId: string,
  fileBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  if (!serviceKey || !url) throw new Error("Supabase service configuration is required.");
  const resized = await sharp(fileBuffer).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  const path = `${conversationId}/${crypto.randomUUID()}.jpg`;

  const uploadResponse = await fetch(`${url}/storage/v1/object/social-photos/${path}`, {
    method: "POST",
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "image/jpeg" },
    body: resized,
  });
  if (!uploadResponse.ok) throw new Error(`Storage upload failed (${uploadResponse.status}).`);

  const signResponse = await fetch(`${url}/storage/v1/object/sign/social-photos/${path}`, {
    method: "POST",
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
    body: JSON.stringify({ expiresIn: 60 * 60 * 24 * 7 }), // 7 days; the client re-fetches the message list to refresh
  });
  if (!signResponse.ok) throw new Error(`Storage sign failed (${signResponse.status}).`);
  const { signedURL } = (await signResponse.json()) as { signedURL: string };
  return `${url}/storage/v1${signedURL}`;
}
