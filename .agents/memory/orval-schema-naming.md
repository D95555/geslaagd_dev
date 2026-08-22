---
name: Orval-generated zod/type names follow operationId, not a domain prefix
description: How to predict the exact exported schema/type names orval generates from openapi.yaml paths, to avoid guessing wrong import names.
---

For a path with `operationId: blockAdminAccount`, orval's split-mode output (this
project's `lib/api-zod` + `lib/api-client-react` setup) names the per-operation params/body
zod schemas and TS types by capitalizing the operationId directly — `BlockAdminAccountParams`,
`BlockAdminAccountBody` — not by any domain-first convention like `AdminBlockAccountParams`.
The same applies to query-param schemas (`ListAdminAccountsQueryParams` for
`operationId: listAdminAccounts`) and path-param schemas (`GetAdminAccountParams`).

**Why:** Guessing plausible names before checking the generated output wastes a
typecheck cycle — imports fail with "no exported member" even though the operation and
response shape are otherwise correct.

**How to apply:** After running the api-spec codegen, grep the actual exported names in
`lib/api-zod/src/generated/api.ts` (or `api.schemas.ts` for types) before writing imports
in route handlers or frontend code, rather than inferring them from the OpenAPI schema
names you wrote.
