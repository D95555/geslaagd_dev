---
name: Supabase auth session lifecycle gotchas (React)
description: Two non-obvious Supabase Auth + React pitfalls — duplicate re-sync from redundant session fetches at mount, and authenticated requests racing against signOut()'s session revocation.
---

## Duplicate re-sync on mount from combining getSession() + onAuthStateChange

Calling both `supabase.auth.getSession()` and relying on `onAuthStateChange` at mount is
redundant: `onAuthStateChange` already fires once immediately with the current session
(event `INITIAL_SESSION`). Calling `getSession()` too produces a second, independent
resolution of the same session, yielding a fresh `user`/`session` object reference (same
underlying user, different reference).

**Why:** Any `useEffect` keyed on the `user` or `session` object itself (not a derived
primitive) re-fires on this second, redundant sync, causing data loads to run twice on
mount. If something forces an error state and another effect run completes right after,
the later successful run can silently overwrite the forced error — masking real
regressions in tests and making error states appear to "flicker away" for real users on
flaky networks.

**How to apply:** Rely solely on `onAuthStateChange` to source session/user state — don't
also call `getSession()` at mount. Key effects on stable derived values like `user?.id`,
not the `user`/`session` object reference.

## Authenticated request racing against signOut()'s session revocation

A fire-and-forget authenticated request (e.g. an audit/security-log call) fired just
before `await supabase.auth.signOut()` can lose the race against sign-out. `signOut()`
revokes the session server-side; if your backend validates the bearer token by also
checking the session is still active (not just that the JWT is well-formed and
unexpired), the log request can arrive after revocation and get rejected with 401 —
silently, if the call's errors are swallowed (e.g. `.catch(() => undefined)`).

**Why:** This is not (only) a token-availability race — capturing the access token
explicitly before calling signOut, instead of trusting an ambient token getter, avoids
that layer but is not sufficient by itself. The deeper issue is a server-side timing race
between two independent requests: the log call vs. Supabase's own logout/revocation call.

**How to apply:** `await` the authenticated log/audit call to completion *before* calling
`signOut()`, rather than firing it in parallel. The added latency is one network round
trip; worth it so the security log reliably lands. Applies to any authenticated request
intentionally triggered right before a session-ending action.
