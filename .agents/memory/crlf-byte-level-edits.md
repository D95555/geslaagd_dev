---
name: CRLF files in geslaagd-app need byte-level edits
description: Some files use Windows CRLF line endings and break plain Edit string matching.
---

`artifacts/geslaagd-app/src/index.css`, `artifacts/api-server/src/routes/study.ts`, and other files scattered across this repo (e.g. `admin-page.tsx`, `lib/api-spec/openapi.yaml`) use CRLF (`\r\n`) line endings — check with `file <path>` before assuming LF. The `Edit` tool matches verbatim byte sequences; a multi-line `old_string` with LF-only content will not match CRLF content.

**Why:** These files were created or edited by a tool that wrote CRLF. The `Edit` tool copies the exact bytes of the `old_string`, which are LF-terminated when written from agent context.

**How to apply:** For small targeted edits that span one or two lines, short `old_string` values with no embedded newlines often still match. For longer multi-line replacements or append operations, use a Python byte-level script:

```python
path = 'artifacts/geslaagd-app/src/index.css'
with open(path, 'rb') as f:
    data = f.read()
addition = b"... your new CSS ...\n"
# Insert before a marker, or append:
data = data + addition.replace(b"\n", b"\r\n")
with open(path, 'wb') as f:
    f.write(data)
```
