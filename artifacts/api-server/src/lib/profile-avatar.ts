import sharp from "sharp";

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Verkleint de geüploade afbeelding tot een vierkante avatar en zet 'm in de
 * publieke `avatars`-bucket op een vast pad per gebruiker (`{userId}.jpg`, wordt
 * overschreven bij een nieuwe upload). Geeft de publieke URL terug, met een
 * cache-bust-query zodat een vervangen avatar direct zichtbaar is ondanks het
 * vaste pad.
 */
export async function uploadProfileAvatar(userId: string, fileBuffer: Buffer): Promise<string> {
  if (!serviceKey || !url) throw new Error("Supabase service configuration is required.");
  const resized = await sharp(fileBuffer)
    .resize(256, 256, { fit: "cover" })
    .jpeg({ quality: 82 })
    .toBuffer();
  const path = `${userId}.jpg`;

  const uploadResponse = await fetch(`${url}/storage/v1/object/avatars/${path}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "image/jpeg",
      "x-upsert": "true",
    },
    body: resized,
  });
  if (!uploadResponse.ok) throw new Error(`Avatar upload failed (${uploadResponse.status}).`);

  return `${url}/storage/v1/object/public/avatars/${path}?v=${Date.now()}`;
}
