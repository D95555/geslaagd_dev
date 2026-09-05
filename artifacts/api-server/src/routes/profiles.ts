import { Router, type IRouter } from "express";
import multer from "multer";
import {
  CreateMyProfileBody,
  GetProfileByIdParams,
  ListDirectoryQueryParams,
  UpdateMyProfileBody,
} from "@workspace/api-zod";
import { getAuthenticatedUser } from "../lib/supabase";
import { isBlocked } from "../lib/blocks";
import { uploadProfileAvatar } from "../lib/profile-avatar";
import {
  createProfile,
  getProfile,
  hasProfile,
  isUsernameTaken,
  loadVakkenFor,
  searchProfiles,
  updateProfile,
  type Profile,
} from "../lib/profiles";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

async function toProfileResponse(profile: Profile) {
  const vakken = await loadVakkenFor(profile.userId);
  return { ...profile, vakken, isBlocked: false };
}

router.get("/profiles/me", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const profile = await getProfile(user.id);
    if (!profile) { res.json({ hasProfile: false }); return; }
    res.json(await toProfileResponse(profile));
  } catch (error) {
    req.log.warn({ error }, "Could not load own profile");
    res.status(500).json({ error: "Profiel kon niet worden geladen." });
  }
});

router.post("/profiles/me", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const input = CreateMyProfileBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Ongeldig profiel." }); return; }
  try {
    if (await hasProfile(user.id)) { res.status(409).json({ error: "Je hebt al een profiel." }); return; }
    if (await isUsernameTaken(input.data.username)) {
      res.status(409).json({ error: "Deze gebruikersnaam is al in gebruik." });
      return;
    }
    const profile = await createProfile(user.id, input.data);
    res.status(201).json(await toProfileResponse(profile));
  } catch (error) {
    req.log.warn({ error }, "Could not create profile");
    res.status(500).json({ error: "Profiel kon niet worden aangemaakt." });
  }
});

router.patch("/profiles/me", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const input = UpdateMyProfileBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Ongeldige wijziging." }); return; }
  try {
    if (input.data.username !== undefined && (await isUsernameTaken(input.data.username, user.id))) {
      res.status(409).json({ error: "Deze gebruikersnaam is al in gebruik." });
      return;
    }
    const profile = await updateProfile(user.id, input.data);
    res.json(await toProfileResponse(profile));
  } catch (error) {
    req.log.warn({ error }, "Could not update profile");
    res.status(500).json({ error: "Profiel kon niet worden aangepast." });
  }
});

router.post("/profiles/me/avatar", upload.single("avatar"), async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!req.file) { res.status(400).json({ error: "Geen afbeelding meegestuurd." }); return; }
  try {
    const avatarUrl = await uploadProfileAvatar(user.id, req.file.buffer);
    const profile = await updateProfile(user.id, { avatarUrl });
    res.json(await toProfileResponse(profile));
  } catch (error) {
    req.log.warn({ error }, "Could not upload avatar");
    res.status(500).json({ error: "Avatar uploaden is mislukt." });
  }
});

router.get("/profiles/:userId", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = GetProfileByIdParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Ongeldig profiel." }); return; }
  try {
    if (await isBlocked(user.id, params.data.userId)) {
      res.json({
        userId: params.data.userId, username: "", displayName: "", avatarUrl: null,
        institution: null, studyProgram: null, description: null, vakken: [], isBlocked: true,
      });
      return;
    }
    const profile = await getProfile(params.data.userId);
    if (!profile) { res.status(404).json({ error: "Profiel niet gevonden." }); return; }
    res.json(await toProfileResponse(profile));
  } catch (error) {
    req.log.warn({ error }, "Could not load profile");
    res.status(500).json({ error: "Profiel kon niet worden geladen." });
  }
});

router.get("/social/directory", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const query = ListDirectoryQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Ongeldige zoekopdracht." }); return; }
  try {
    const profiles = await searchProfiles(query.data.query ?? "", 50, user.id);
    res.json({ profiles: await Promise.all(profiles.map(toProfileResponse)) });
  } catch (error) {
    req.log.warn({ error }, "Could not search directory");
    res.status(500).json({ error: "Zoeken is mislukt." });
  }
});

export default router;
