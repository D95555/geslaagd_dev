import { logger } from "./logger";
import { type AuthEvent, logAuthEvent } from "./slack";
import { getServiceUserById, restService } from "./supabase";

type PendingAuthEvent = {
  id: string;
  event_type: AuthEvent;
  user_id: string;
  device: string | null;
  extra: string | null;
  ip_address: string | null;
};

export async function enqueueAuthEvent(input: {
  dedupeKey: string;
  event: AuthEvent;
  userId: string;
  device?: string | null;
  extra?: string | null;
  ipAddress?: string | null;
}): Promise<string> {
  const eventId = await restService<string>("rpc/enqueue_auth_event", {
    method: "POST",
    body: JSON.stringify({
      p_dedupe_key: input.dedupeKey,
      p_event_type: input.event,
      p_user_id: input.userId,
      p_device: input.device ?? null,
      p_extra: input.extra ?? null,
      p_ip_address: input.ipAddress ?? null,
    }),
  });
  void flushPendingAuthEvents();
  return eventId;
}

async function completeDelivery(eventId: string): Promise<void> {
  await restService<unknown>("rpc/complete_auth_event", {
    method: "POST",
    body: JSON.stringify({ p_event_id: eventId }),
  });
}

async function releaseDelivery(eventId: string): Promise<void> {
  await restService<unknown>("rpc/release_auth_event", {
    method: "POST",
    body: JSON.stringify({ p_event_id: eventId }),
  });
}

let flushing = false;

export async function flushPendingAuthEvents(): Promise<void> {
  if (flushing) return;
  flushing = true;

  try {
    const events = await restService<PendingAuthEvent[]>(
      "rpc/claim_pending_auth_events",
      {
        method: "POST",
        body: JSON.stringify({ p_limit: 20 }),
      },
    );

    for (const event of events) {
      try {
        const user = await getServiceUserById(event.user_id);
        await logAuthEvent(event.event_type, {
          email: user?.email,
          userId: event.user_id,
          device: event.device,
          extra: event.extra,
          ip: event.ip_address,
          // Slack deduplicates retries that use the same client_msg_id.
          clientMessageId: event.id,
        });
        await completeDelivery(event.id);
      } catch (error) {
        await releaseDelivery(event.id).catch(() => undefined);
        logger.warn(
          { error, eventId: event.id, eventType: event.event_type },
          "Could not deliver pending auth event",
        );
      }
    }
  } catch (error) {
    logger.warn({ error }, "Could not claim pending auth events");
  } finally {
    flushing = false;
  }
}

export function startAuthEventOutboxWorker(): void {
  void flushPendingAuthEvents();
  const timer = setInterval(() => {
    void flushPendingAuthEvents();
  }, 30_000);
  timer.unref();
}
