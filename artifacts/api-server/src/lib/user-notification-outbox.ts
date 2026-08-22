import { logger } from "./logger";
import { restService } from "./supabase";

export type NotificationType = "account-blocked" | "account-unblocked" | "account-deleted";

type PendingNotification = {
  id: string;
  user_id: string;
  email: string;
  notification_type: NotificationType;
  subject: string;
  body_text: string;
};

export async function enqueueUserNotification(input: {
  idempotencyKey: string;
  userId: string;
  email: string;
  notificationType: NotificationType;
  subject: string;
  bodyText: string;
}): Promise<string> {
  const id = await restService<string>("rpc/enqueue_user_notification", {
    method: "POST",
    body: JSON.stringify({
      p_idempotency_key: input.idempotencyKey,
      p_user_id: input.userId,
      p_email: input.email,
      p_notification_type: input.notificationType,
      p_subject: input.subject,
      p_body_text: input.bodyText,
    }),
  });
  void flushPendingUserNotifications();
  return id;
}

async function completeNotification(id: string): Promise<void> {
  await restService<unknown>("rpc/complete_user_notification", {
    method: "POST",
    body: JSON.stringify({ p_notification_id: id }),
  });
}

async function releaseNotification(id: string, error?: string): Promise<void> {
  await restService<unknown>("rpc/release_user_notification", {
    method: "POST",
    body: JSON.stringify({ p_notification_id: id, p_error: error ?? null }),
  });
}

async function failNotification(id: string, error?: string): Promise<void> {
  await restService<unknown>("rpc/fail_user_notification", {
    method: "POST",
    body: JSON.stringify({ p_notification_id: id, p_error: error ?? null }),
  });
}

async function deliverNotification(n: PendingNotification): Promise<void> {
  // Primary delivery: attempt via a configured email provider URL (optional).
  // If EMAIL_API_URL + EMAIL_API_KEY are set, POST the message there.
  const emailApiUrl = process.env.EMAIL_API_URL;
  const emailApiKey = process.env.EMAIL_API_KEY;
  const emailFrom = process.env.EMAIL_FROM ?? "geslaagd.app <noreply@geslaagd.app>";

  if (emailApiUrl && emailApiKey) {
    const response = await fetch(emailApiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${emailApiKey}`,
      },
      body: JSON.stringify({
        from: emailFrom,
        to: n.email,
        subject: n.subject,
        text: n.body_text,
      }),
    });
    if (!response.ok) {
      throw new Error(`Email provider responded ${response.status}: ${await response.text()}`);
    }
    return;
  }

  // Fallback: log the notification to Slack so administrators are informed
  // that the e-mail could not be sent to the user directly (no provider
  // configured), keeping a human in the loop rather than failing silently.
  const { SLACK_BOT_TOKEN } = process.env;
  if (!SLACK_BOT_TOKEN) {
    throw new Error("No email provider configured and no Slack bot token — cannot deliver notification.");
  }

  const { logAuthEvent } = await import("./slack");
  const typeLabel: Record<NotificationType, string> = {
    "account-blocked": "⚠️ Geen e-mailprovider geconfigureerd — mededeling niet verstuurd naar gebruiker",
    "account-unblocked": "⚠️ Geen e-mailprovider geconfigureerd — mededeling niet verstuurd naar gebruiker",
    "account-deleted": "⚠️ Geen e-mailprovider geconfigureerd — mededeling niet verstuurd naar gebruiker",
  };

  await logAuthEvent(n.notification_type, {
    email: n.email,
    userId: n.user_id,
    extra: `${typeLabel[n.notification_type]}\n📧 Onderwerp: ${n.subject}\n\n${n.body_text}`,
  });
}

const MAX_ATTEMPTS = 5;
let flushing = false;

export async function flushPendingUserNotifications(): Promise<void> {
  if (flushing) return;
  flushing = true;

  try {
    const notifications = await restService<PendingNotification[]>(
      "rpc/claim_pending_user_notifications",
      { method: "POST", body: JSON.stringify({ p_limit: 20 }) },
    );

    for (const n of notifications) {
      try {
        await deliverNotification(n);
        await completeNotification(n.id);
      } catch (error) {
        const errStr = error instanceof Error ? error.message : String(error);
        // Permanently fail after MAX_ATTEMPTS to prevent infinite retry storms.
        // attempt_count was already incremented by claim; check if we've exhausted retries.
        const exhausted = (n as unknown as { attempt_count?: number }).attempt_count != null
          ? ((n as unknown as { attempt_count: number }).attempt_count) >= MAX_ATTEMPTS
          : false;
        if (exhausted) {
          await failNotification(n.id, errStr).catch(() => undefined);
        } else {
          await releaseNotification(n.id, errStr).catch(() => undefined);
        }
        logger.warn(
          { error, notificationId: n.id, notificationType: n.notification_type },
          "Could not deliver user notification",
        );
      }
    }
  } catch (error) {
    logger.warn({ error }, "Could not claim pending user notifications");
  } finally {
    flushing = false;
  }
}

export function startUserNotificationWorker(): void {
  void flushPendingUserNotifications();
  const timer = setInterval(() => void flushPendingUserNotifications(), 30_000);
  timer.unref();
}
