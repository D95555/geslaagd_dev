---
name: Reliable external audit delivery
description: Durable rules for sending security audit events to third-party services without loss or duplication.
---

Security audit events sent to an external provider must use a durable pending/delivered outbox with retryable leases and a stable provider idempotency key. Do not treat a database deduplication claim made before the network call as final delivery.

**Why:** A provider outage after an irreversible claim permanently suppresses retries, while a lost success response can produce duplicates. Security logs need to survive both failure windows.

**How to apply:** Persist a pending event without raw sensitive data, let workers atomically lease due events, mark delivery only after provider success, release failures for backoff, and reuse one deterministic provider message ID across every retry.