import { Router, type IRouter } from "express";
import { createHmac, randomUUID } from "node:crypto";
import {
  LogAuthEventBody,
  RequestPasswordResetBody,
  SignUpTrialBody,
  SignUpWithActivationKeyBody,
  SignUpWithActivationKeyResponse,
} from "@workspace/api-zod";
import {
  getAuthenticatedUser,
  getServiceUserIdByEmail,
  getServiceUserById,
  requestPasswordResetEmail,
  restService,
  signUpWithPassword,
} from "../lib/supabase";
import { enqueueAuthEvent } from "../lib/auth-event-outbox";
import {
  attachActivationKeyToUser,
  claimActivationKey,
  normalizeActivationCode,
  releaseActivationKey,
} from "../lib/activation-keys";
import { getPackage, syncAdminRole, type PackageKey } from "../lib/credits";
import { createTicket, insertMessage } from "../lib/support-tickets";

const router: IRouter = Router();

function rateLimitKey(value: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for rate limiting.");
  return createHmac("sha256", secret).update(value).digest("hex");
}

function passwordResetRedirect(): string {
  const configuredOrigin = process.env.APP_ORIGIN;
  const developmentDomain = process.env.REPLIT_DEV_DOMAIN;
  const origin = configuredOrigin
    ?? (process.env.NODE_ENV !== "production" && developmentDomain
      ? `https://${developmentDomain}`
      : null);
  if (!origin) {
    throw new Error("APP_ORIGIN is required for password-reset redirects.");
  }
  return new URL("/auth/herstel-wachtwoord", `${origin.replace(/\/+$/, "")}/`).toString();
}

function signupRedirect(): string {
  const configuredOrigin = process.env.APP_ORIGIN;
  const developmentDomain = process.env.REPLIT_DEV_DOMAIN;
  const origin = configuredOrigin
    ?? (process.env.NODE_ENV !== "production" && developmentDomain
      ? `https://${developmentDomain}`
      : null);
  if (!origin) {
    throw new Error("APP_ORIGIN is required for signup redirects.");
  }
  return new URL("/auth", `${origin.replace(/\/+$/, "")}/`).toString();
}

function readableSignupError(errorCode: string | null, message: string): string {
  if (errorCode === "user_already_exists" || errorCode === "email_exists") {
    return "Dit e-mailadres heeft al een account.";
  }
  if (errorCode === "weak_password") {
    return "Kies een wachtwoord van minimaal 6 tekens.";
  }
  if (errorCode === "over_email_send_rate_limit" || errorCode === "over_request_rate_limit") {
    return "Er zijn net veel verzoeken gedaan. Wacht even en probeer het opnieuw.";
  }
  const normalized = message.toLowerCase();
  if (normalized.includes("already registered") || normalized.includes("already exists")) {
    return "Dit e-mailadres heeft al een account.";
  }
  if (normalized.includes("password")) {
    return "Kies een wachtwoord van minimaal 6 tekens.";
  }
  if (normalized.includes("rate limit") || normalized.includes("only request this after")) {
    return "Er zijn net veel verzoeken gedaan. Wacht even en probeer het opnieuw.";
  }
  return "Aanmaken van het account is mislukt. Probeer het opnieuw.";
}

function allowedPasswordResetOrigins(): Set<string> {
  const origins = new Set<string>();
  const configuredOrigins = process.env.APP_ALLOWED_ORIGINS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean) ?? [];
  for (const value of configuredOrigins) {
    origins.add(new URL(value).origin);
  }

  const configuredOrigin = process.env.APP_ORIGIN;
  if (configuredOrigin) origins.add(new URL(configuredOrigin).origin);

  const developmentDomain = process.env.REPLIT_DEV_DOMAIN;
  if (process.env.NODE_ENV !== "production" && developmentDomain) {
    origins.add(`https://${developmentDomain}`);
  }
  return origins;
}

async function claimAttempt(key: string, limit: number): Promise<boolean> {
  return restService<boolean>("rpc/claim_auth_event_attempt", {
    method: "POST",
    body: JSON.stringify({
      p_client_key: rateLimitKey(key),
      p_limit: limit,
    }),
  });
}

router.post("/events/auth", async (req, res): Promise<void> => {
  const input = LogAuthEventBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Ongeldig account-event." }); return; }

  const user = await getAuthenticatedUser(req.header("authorization"));
  if (input.data.event === "password-reset-request") {
    res.status(400).json({ error: "Gebruik de beveiligde wachtwoordherstelroute." });
    return;
  }
  if (input.data.event !== "signup" && !user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    if (input.data.event === "signup") {
      if (!input.data.userId || !input.data.email) {
        res.status(400).json({ error: "Een registratie-event mist gebruikersgegevens." });
        return;
      }

      if (
        user &&
        (
          user.id !== input.data.userId ||
          user.email.toLocaleLowerCase() !== input.data.email.toLocaleLowerCase()
        )
      ) {
        res.status(403).json({ error: "Registratie-event hoort niet bij deze gebruiker." });
        return;
      }

      if (!user) {
        const attemptAllowed = await claimAttempt(
          `signup:ip:${req.ip ?? "unknown"}`,
          10,
        );
        if (!attemptAllowed) {
          res.status(429).json({ error: "Te veel account-events. Probeer het later opnieuw." });
          return;
        }
      }

      const verifiedSignupUser = await getServiceUserById(input.data.userId);
      const createdAt = verifiedSignupUser?.created_at ? Date.parse(verifiedSignupUser.created_at) : 0;
      if (
        !verifiedSignupUser ||
        verifiedSignupUser.email?.toLocaleLowerCase() !== input.data.email.toLocaleLowerCase() ||
        !createdAt ||
        Date.now() - createdAt > 15 * 60_000
      ) {
        res.status(403).json({ error: "Registratie-event kon niet worden geverifieerd." });
        return;
      }

      await enqueueAuthEvent({
        dedupeKey: `signup:${verifiedSignupUser.id}`,
        event: "signup",
        userId: verifiedSignupUser.id,
        device: input.data.device,
        ipAddress: req.ip ?? null,
      });
    } else {
      await enqueueAuthEvent({
        dedupeKey: `${input.data.event}:${randomUUID()}`,
        event: input.data.event,
        userId: user!.id,
        device: input.data.device,
        ipAddress: req.ip ?? null,
      });
    }

    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error, event: input.data.event }, "Could not write Slack account event");
    res.status(503).json({ error: "Het account-event kon niet naar Slack worden geschreven." });
  }
});

router.post("/auth/password-reset-request", async (req, res): Promise<void> => {
  if (
    req.body &&
    typeof req.body === "object" &&
    "redirectTo" in req.body
  ) {
    res.status(400).json({ error: "Een herstelbestemming mag niet worden opgegeven." });
    return;
  }

  const input = RequestPasswordResetBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Ongeldig verzoek voor wachtwoordherstel." });
    return;
  }

  const requestOrigin = req.get("origin");
  if (!requestOrigin || !allowedPasswordResetOrigins().has(requestOrigin)) {
    res.status(403).json({ error: "Deze aanvraag komt niet van een toegestane app." });
    return;
  }

  const email = input.data.email.trim().toLocaleLowerCase();
  try {
    const [ipAllowed, emailAllowed] = await Promise.all([
      claimAttempt(`password-reset:ip:${req.ip ?? "unknown"}`, 10),
      claimAttempt(`password-reset:email:${email}`, 3),
    ]);
    if (!ipAllowed || !emailAllowed) {
      res.status(429).json({ error: "Te veel herstelverzoeken. Probeer het later opnieuw." });
      return;
    }

    await requestPasswordResetEmail(email, passwordResetRedirect());
    const userId = await getServiceUserIdByEmail(email);
    if (userId) {
      await enqueueAuthEvent({
        dedupeKey: `password-reset-request:${randomUUID()}`,
        event: "password-reset-request",
        userId,
        device: input.data.device,
        ipAddress: req.ip ?? null,
      });
    }
    res.sendStatus(204);
  } catch (error) {
    req.log.warn({ error }, "Could not request password reset");
    res.status(502).json({ error: "Wachtwoordherstel kon niet worden aangevraagd." });
  }
});

router.post("/auth/signup", async (req, res): Promise<void> => {
  const input = SignUpWithActivationKeyBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Ongeldige aanmeldgegevens." });
    return;
  }

  const attemptAllowed = await claimAttempt(`signup:ip:${req.ip ?? "unknown"}`, 10);
  if (!attemptAllowed) {
    res.status(429).json({ error: "Te veel pogingen. Probeer het later opnieuw." });
    return;
  }

  const email = input.data.email.trim().toLowerCase();
  const code = normalizeActivationCode(input.data.activationKey);

  try {
    const claimed = await claimActivationKey(code);
    if (!claimed) {
      res.status(400).json({ error: "Deze activatiecode is ongeldig of al gebruikt." });
      return;
    }

    const signUpResult = await signUpWithPassword(email, input.data.password, signupRedirect());
    if (!signUpResult.ok) {
      await releaseActivationKey(claimed.id);
      res.status(400).json({ error: readableSignupError(signUpResult.errorCode, signUpResult.message) });
      return;
    }

    await attachActivationKeyToUser(claimed.id, signUpResult.userId, email);

    const pkg = await getPackage(claimed.package as PackageKey);
    await restService("account_billing", {
      method: "POST",
      body: JSON.stringify({
        user_id: signUpResult.userId,
        package: pkg.key,
        credits: pkg.startCredits ?? 0,
      }),
    });
    await restService("credit_transactions", {
      method: "POST",
      body: JSON.stringify({
        account_id: signUpResult.userId,
        delta: pkg.startCredits ?? 0,
        reason: "signup_grant",
      }),
    });
    // A key can grant the beheerder package directly at signup — make sure
    // that account actually has the admin role, not just the label.
    await syncAdminRole(signUpResult.userId, pkg.key);

    await enqueueAuthEvent({
      dedupeKey: `signup:${signUpResult.userId}`,
      event: "signup",
      userId: signUpResult.userId,
      device: input.data.device,
      ipAddress: req.ip ?? null,
    }).catch((error) => req.log.warn({ error }, "Could not enqueue signup auth event"));

    res.status(201).json(SignUpWithActivationKeyResponse.parse({ userId: signUpResult.userId }));
  } catch (error) {
    req.log.warn({ error }, "Signup failed");
    res.status(500).json({ error: "Aanmaken van het account is mislukt. Probeer het opnieuw." });
  }
});

const TRIAL_VERIFICATION_MESSAGE =
  "Welkom bij geslaagd.app! Om toegang te krijgen tot een ander pakket (Basis/Plus), moet een beheerder even bevestigen dat je een studerende gebruiker bent. Beantwoord hieronder kort:\n" +
  "1. Voor- en achternaam\n" +
  "2. Onderwijsinstelling\n" +
  "3. Studierichting\n" +
  "4. Waarvoor wil je geslaagd.app gebruiken?\n\n" +
  "Een beheerder reageert zo snel mogelijk.";

router.post("/auth/signup-trial", async (req, res): Promise<void> => {
  const input = SignUpTrialBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Ongeldige aanmeldgegevens." });
    return;
  }

  const attemptAllowed = await claimAttempt(`signup:ip:${req.ip ?? "unknown"}`, 10);
  if (!attemptAllowed) {
    res.status(429).json({ error: "Te veel pogingen. Probeer het later opnieuw." });
    return;
  }

  const email = input.data.email.trim().toLowerCase();

  try {
    const signUpResult = await signUpWithPassword(email, input.data.password, signupRedirect());
    if (!signUpResult.ok) {
      res.status(400).json({ error: readableSignupError(signUpResult.errorCode, signUpResult.message) });
      return;
    }

    const trialPkg = await getPackage("trial");
    await restService("account_billing", {
      method: "POST",
      body: JSON.stringify({
        user_id: signUpResult.userId,
        package: "trial",
        credits: trialPkg.startCredits ?? 0,
      }),
    });
    await restService("credit_transactions", {
      method: "POST",
      body: JSON.stringify({
        account_id: signUpResult.userId,
        delta: trialPkg.startCredits ?? 0,
        reason: "signup_grant",
      }),
    });

    const ticket = await createTicket(signUpResult.userId, "Verificatie studentenstatus");
    await insertMessage(ticket.id, "admin", TRIAL_VERIFICATION_MESSAGE, null);
    await restService(`support_tickets?id=eq.${ticket.id}`, {
      method: "PATCH",
      body: JSON.stringify({ category: "pakket_verificatie" }),
    });

    await enqueueAuthEvent({
      dedupeKey: `signup:${signUpResult.userId}`,
      event: "signup",
      userId: signUpResult.userId,
      device: input.data.device ?? "",
      ipAddress: req.ip ?? null,
    }).catch((error) => req.log.warn({ error }, "Could not enqueue signup auth event"));

    res.status(201).json(SignUpWithActivationKeyResponse.parse({ userId: signUpResult.userId }));
  } catch (error) {
    req.log.warn({ error }, "Trial signup failed");
    res.status(500).json({ error: "Aanmaken van het account is mislukt. Probeer het opnieuw." });
  }
});

export default router;