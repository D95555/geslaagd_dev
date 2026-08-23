import { logger } from "./logger";
import { logPendingSourceEvent } from "./slack";
import { restService } from "./supabase";

type PendingSourceEvent = {
  id: string;
  source_id: string;
  source_url: string;
  source_title: string | null;
  subject_name: string | null;
  crawl_id: string | null;
};

export async function enqueuePendingSourceEvent(input: {
  dedupeKey: string;
  sourceId: string;
  sourceUrl: string;
  sourceTitle?: string | null;
  subjectName?: string | null;
  crawlId?: string | null;
}): Promise<string> {
  const eventId = await restService<string>("rpc/enqueue_source_event", {
    method: "POST",
    body: JSON.stringify({
      p_dedupe_key: input.dedupeKey,
      p_source_id: input.sourceId,
      p_source_url: input.sourceUrl,
      p_source_title: input.sourceTitle ?? null,
      p_subject_name: input.subjectName ?? null,
      p_crawl_id: input.crawlId ?? null,
    }),
  });
  void flushPendingSourceEvents();
  return eventId;
}

async function completeDelivery(eventId: string): Promise<void> {
  await restService<unknown>("rpc/complete_source_event", {
    method: "POST",
    body: JSON.stringify({ p_event_id: eventId }),
  });
}

async function releaseDelivery(eventId: string): Promise<void> {
  await restService<unknown>("rpc/release_source_event", {
    method: "POST",
    body: JSON.stringify({ p_event_id: eventId }),
  });
}

let flushing = false;

export async function flushPendingSourceEvents(): Promise<void> {
  if (flushing) return;
  flushing = true;

  try {
    const events = await restService<PendingSourceEvent[]>(
      "rpc/claim_pending_source_events",
      {
        method: "POST",
        body: JSON.stringify({ p_limit: 20 }),
      },
    );

    for (const event of events) {
      try {
        await logPendingSourceEvent({
          sourceId: event.source_id,
          sourceUrl: event.source_url,
          sourceTitle: event.source_title,
          subjectName: event.subject_name,
          crawlId: event.crawl_id,
          clientMessageId: event.id,
        });
        await completeDelivery(event.id);
      } catch (error) {
        await releaseDelivery(event.id).catch(() => undefined);
        logger.warn(
          { error, eventId: event.id, sourceId: event.source_id },
          "Could not deliver pending source event",
        );
      }
    }
  } catch (error) {
    logger.warn({ error }, "Could not claim pending source events");
  } finally {
    flushing = false;
  }
}

export function startSourceEventOutboxWorker(): void {
  void flushPendingSourceEvents();
  const timer = setInterval(() => {
    void flushPendingSourceEvents();
  }, 30_000);
  timer.unref();
}
