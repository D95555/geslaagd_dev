# Consuming Geslaagd Momentum in web apps

Read `artifacts/geslaagd-momentum/docs/AGENTS.md` first. This guide covers
React/Vite and other shadcn/Tailwind web consumers. If the app already contains
a local theme or component library, also read
`artifacts/geslaagd-momentum/docs/migrating-web.md` before writing UI.

## Theme

Import this package's theme once from the app's main CSS:

```css
@import "@workspace/geslaagd-momentum/styles.css";
```

`styles.css` already imports Tailwind, its plugins, and this package's token
theme. It also registers this package's component sources. Do not add a separate
Tailwind import or a `node_modules` source path in a Tailwind v4 consumer.
Tailwind v3 consumers keep their existing `@tailwind` directives and add
`node_modules/@workspace/geslaagd-momentum/src/components` to `content`.

## Fonts

Momentum uses Sora for display text, DM Sans for interface copy, and DM Mono for
source/provenance metadata. The preview loads these fonts from Google Fonts, but
consumer applications must load them in their own document or font pipeline.
Add these tags to a web app's HTML head (or an equivalent framework font
integration) before relying on the font families:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:opsz,wght@9..40,400..700&family=Sora:wght@400..800&display=swap"
/>
```

The exported theme maps the three families to `font-serif`, `font-sans`, and
`font-mono` respectively. Preserve those mappings rather than redefining the
font stacks locally.

## Components and helpers

Import every provided primitive, `cn`, and toast API directly from this package:

```tsx
import { Button } from "@workspace/geslaagd-momentum/components/ui/button";
import { cn } from "@workspace/geslaagd-momentum/lib/utils";
import {
  toast,
  useToast,
} from "@workspace/geslaagd-momentum/hooks/use-toast";
```

Use the package component whenever it provides the required family. Keep
product-specific compositions in the app, but compose them from package
primitives rather than recreating those primitives locally.

The packaged `Toaster` and toast hook share one in-memory store. Do not call a
local toast hook while rendering the packaged `Toaster`.

## Verify

After wiring the workspace dependency, import and render
`@workspace/geslaagd-momentum/components/ui/button`. Run the app's typecheck
and dev server. The import must resolve and the Button must use this package's
theme before broader UI work begins.

## Ongoing rules

- Keep one source of theme variables.
- Import package-provided primitives and helpers from the package path.
- Add reusable product-agnostic components to this package first.
- For a non-shadcn app, use the tokens as the source of truth and adapt existing
  components to the token CSS variables without copying token values.
