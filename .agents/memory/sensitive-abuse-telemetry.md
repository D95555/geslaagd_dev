---
name: Sensitive abuse telemetry boundaries
description: Durable privacy and security rules for IP addresses and similar abuse-investigation data.
---

Sensitive abuse telemetry must be derived at a trusted server boundary, never accepted
from browser fields or caller-controlled forwarding headers. Hiding a field from an API
DTO is insufficient if the underlying database role can still read the column directly.
Retention limits must run on a reliable schedule rather than depending on future traffic.

**Why:** Browser-derived “IP” values are spoofable, direct database APIs can bypass a
sanitized application response, and cleanup-on-read can retain personal data indefinitely.

**How to apply:** Validate proxy trust, use service-only writes and admin-only reads,
remove direct role privileges for sensitive columns/tables or expose a safe view, and use
a scheduled database job for deletion or anonymization.