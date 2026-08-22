import { Router, type IRouter } from "express";
import { createHmac, randomUUID } from "node:crypto";
import {
  LogAuthEventBody,
  RequestPasswordResetBody,
} from "@workspace/api-zod";
import {
  getAuthenticatedUser,
  getServiceUserIdByEmail,
  getServiceUserById,
  requestPasswordResetEmail,
  restService,
} from "../lib/supabase";
import { enqueueAuthEvent } from "../lib/auth-event-outbox";

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

export default router;