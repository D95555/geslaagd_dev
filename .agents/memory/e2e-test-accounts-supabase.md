---
name: Pre-confirmed E2E accounts for Supabase apps
description: The durable test-account strategy for authenticated E2E flows when email verification is required.
---

Create isolated, pre-confirmed users through the Supabase Auth Admin API for
authenticated E2E scenarios, then delete them when the test finishes. Do not weaken or
bypass the product's real email-verification flow to make tests easier.

**Why:** UI signup correctly blocks login until the user follows an email link, while
automated tests have no inbox and must not change production security behavior.

**How to apply:** Use service-role Admin API access only inside the test harness, assign
each run a unique synthetic address, and clean up the account even when the test fails.
