/**
 * Generates the consumable web theme (src/index.css) and the portable token
 * object (src/generated/tokens.tsx) from tokens.json.
 *
 * tokens.json (DTCG) is the single source of truth. This runs on dev start and
 * on every tokens.json change (see vite.config.ts) and before build/typecheck
 * (see package.json). Do not edit the generated files by hand.
 *
 * - src/index.css        the design system's theme. The preview app imports it,
 *                        and consuming apps import this same file (web).
 * - src/generated/tokens.tsx  portable hex token object for inspection and
 *                             future platform adapters.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const tokensPath = join(root, "tokens.json");
const templatePath = join(here, "theme-template.css");
const cssOut = join(root, "src", "index.css");
const tsOutDir = join(root, "src", "generated");
const indexHtmlPath = join(root, "index.html");
const faviconOut = join(root, "public", "favicon.svg");

/** Resolve a DTCG node's $value, following {alias} references. */
function resolveValue(node, tokens) {
  const raw = node?.$value;
  if (typeof raw === "string" && raw.startsWith("{") && raw.endsWith("}")) {
    const path = raw.slice(1, -1).split(".");
    let cur = tokens;
    for (const key of path) cur = cur?.[key];
    return resolveValue(cur, tokens);
  }
  return raw;
}

function hexToHslChannels(hex) {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0;
  let hue = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        hue = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        hue = (b - r) / d + 2;
        break;
      default:
        hue = (r - g) / d + 4;
    }
    hue /= 6;
  }
  const H = Math.round(hue * 360);
  const S = Math.round(s * 1000) / 10;
  const L = Math.round(l * 1000) / 10;
  return `${H} ${S}% ${L}%`;
}

function toFontStack(value) {
  return Array.isArray(value) ? value.join(", ") : value;
}

function normalizeHex(hex) {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return `#${h}`;
}

/** Pick black or white text for best contrast on the given background hex. */
function contrastColor(hex) {
  const h = normalizeHex(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

/** First alphanumeric character of the design system's title, uppercased. */
function faviconLetter() {
  let title = "";
  try {
    const html = readFileSync(indexHtmlPath, "utf8");
    title = html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "";
  } catch {
    title = "";
  }
  const match = title.match(/[A-Za-z0-9]/);
  return (match?.[0] ?? "D").toUpperCase();
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildFavicon(tokens) {
  const primary = normalizeHex(resolveValue(tokens.color.light.primary, tokens));
  const letter = escapeXml(faviconLetter());
  const fg = contrastColor(primary);
  return `<svg width="180" height="180" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="180" height="180" rx="36" fill="${primary}"/>
  <text x="90" y="92" fill="${fg}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="104" font-weight="700" text-anchor="middle" dominant-baseline="central">${letter}</text>
</svg>
`;
}

function colorEntries(scope, tokens) {
  const out = {};
  for (const [name, node] of Object.entries(tokens.color[scope])) {
    if (name.startsWith("$")) continue;
    out[name] = resolveValue(node, tokens);
  }
  return out;
}

/** camelCase token name -> kebab-case CSS custom property segment. */
function kebab(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function typeScaleEntries(tokens) {
  const out = {};
  for (const [name, node] of Object.entries(tokens.typography.scale)) {
    if (name.startsWith("$")) continue;
    out[name] = resolveValue(node, tokens);
  }
  return out;
}

/** The `--text-<step>-*` custom properties, one group per semantic step. */
function buildTypeScaleVars(tokens) {
  return Object.entries(typeScaleEntries(tokens))
    .map(([name, step]) => {
      const k = kebab(name);
      return [
        `  --text-${k}-font: var(--app-font-${step.font});`,
        `  --text-${k}-size: ${step.size};`,
        `  --text-${k}-line-height: ${step.lineHeight};`,
        `  --text-${k}-weight: ${step.weight};`,
        `  --text-${k}-tracking: ${step.tracking};`,
      ].join("\n");
    })
    .join("\n\n");
}

/** Matching `.type-<step>` utility classes so markup names the role, not the size. */
function buildTypeScaleClasses(tokens) {
  return Object.entries(typeScaleEntries(tokens))
    .map(([name]) => {
      const k = kebab(name);
      return [
        `  .type-${k} {`,
        `    font-family: var(--text-${k}-font);`,
        `    font-size: var(--text-${k}-size);`,
        `    line-height: var(--text-${k}-line-height);`,
        `    font-weight: var(--text-${k}-weight);`,
        `    letter-spacing: var(--text-${k}-tracking);`,
        `  }`,
      ].join("\n");
    })
    .join("\n\n");
}

function densityEntries(scale, tokens) {
  const out = {};
  for (const [name, node] of Object.entries(tokens.density[scale])) {
    if (name.startsWith("$")) continue;
    out[name] = resolveValue(node, tokens);
  }
  return out;
}

/** `--density-*` custom properties for one density scale. */
function buildDensityVars(tokens, scale, indent = "  ") {
  return Object.entries(tokens.density[scale])
    .filter(([name]) => !name.startsWith("$"))
    .map(
      ([name, node]) =>
        `${indent}--density-${kebab(name)}: ${resolveValue(node, tokens)};`,
    )
    .join("\n");
}

function buildCss(tokens) {
  let css = readFileSync(templatePath, "utf8");
  const replacements = {};

  for (const scope of ["light", "dark"]) {
    for (const [name, hex] of Object.entries(colorEntries(scope, tokens))) {
      replacements[`__DS_${scope.toUpperCase()}_${name.toUpperCase()}__`] =
        hexToHslChannels(hex);
    }
  }

  replacements.__DS_FONT_SANS__ = toFontStack(
    resolveValue(tokens.typography.fontFamily.sans, tokens),
  );
  replacements.__DS_FONT_SERIF__ = toFontStack(
    resolveValue(tokens.typography.fontFamily.serif, tokens),
  );
  replacements.__DS_FONT_MONO__ = toFontStack(
    resolveValue(tokens.typography.fontFamily.mono, tokens),
  );
  replacements.__DS_RADIUS__ = resolveValue(tokens.radius.base, tokens);
  replacements.__DS_SPACING__ = resolveValue(tokens.spacing.base, tokens);
  for (const scope of ["light", "dark"]) {
    for (const step of ["soft", "lift"]) {
      replacements[`__DS_ELEVATION_${scope.toUpperCase()}_${step.toUpperCase()}__`] =
        resolveValue(tokens.elevation[scope][step], tokens);
    }
  }
  replacements.__DS_TYPE_SCALE_VARS__ = buildTypeScaleVars(tokens);
  replacements.__DS_TYPE_SCALE_CLASSES__ = buildTypeScaleClasses(tokens);
  replacements.__DS_DENSITY_COMFORTABLE__ = buildDensityVars(tokens, "comfortable");
  replacements.__DS_DENSITY_COMPACT__ = buildDensityVars(tokens, "compact");
  replacements.__DS_MOTION_FAST__ = resolveValue(tokens.motion.duration.fast, tokens);
  replacements.__DS_MOTION_BASE__ = resolveValue(tokens.motion.duration.base, tokens);
  replacements.__DS_MOTION_SLOW__ = resolveValue(tokens.motion.duration.slow, tokens);
  replacements.__DS_MOTION_STANDARD__ = resolveValue(tokens.motion.easing.standard, tokens);

  for (const [token, value] of Object.entries(replacements)) {
    css = css.split(token).join(value);
  }

  const leftover = css.match(/__DS_[A-Z0-9_]+__/g);
  if (leftover) {
    throw new Error(
      `tokens.json is missing values for: ${[...new Set(leftover)].join(", ")}`,
    );
  }
  return css;
}

function buildTs(tokens) {
  const portable = {
    color: {
      light: colorEntries("light", tokens),
      dark: colorEntries("dark", tokens),
    },
    fontFamily: {
      sans: resolveValue(tokens.typography.fontFamily.sans, tokens),
      serif: resolveValue(tokens.typography.fontFamily.serif, tokens),
      mono: resolveValue(tokens.typography.fontFamily.mono, tokens),
    },
    typeScale: typeScaleEntries(tokens),
    radius: resolveValue(tokens.radius.base, tokens),
    spacing: resolveValue(tokens.spacing.base, tokens),
    density: {
      comfortable: densityEntries("comfortable", tokens),
      compact: densityEntries("compact", tokens),
    },
    elevation: {
      light: {
        soft: resolveValue(tokens.elevation.light.soft, tokens),
        lift: resolveValue(tokens.elevation.light.lift, tokens),
      },
      dark: {
        soft: resolveValue(tokens.elevation.dark.soft, tokens),
        lift: resolveValue(tokens.elevation.dark.lift, tokens),
      },
    },
    motion: {
      duration: {
        fast: resolveValue(tokens.motion.duration.fast, tokens),
        base: resolveValue(tokens.motion.duration.base, tokens),
        slow: resolveValue(tokens.motion.duration.slow, tokens),
      },
      easing: {
        standard: resolveValue(tokens.motion.easing.standard, tokens),
      },
    },
  };
  return `/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; future platform adapters can consume this object while the
// whole product shares one source of truth.
export const tokens = ${JSON.stringify(portable, null, 2)} as const;

export type Tokens = typeof tokens;
export default tokens;
`;
}

export function buildTokens() {
  const tokens = JSON.parse(readFileSync(tokensPath, "utf8"));
  writeFileSync(cssOut, buildCss(tokens));
  mkdirSync(tsOutDir, { recursive: true });
  writeFileSync(join(tsOutDir, "tokens.tsx"), buildTs(tokens));
  mkdirSync(dirname(faviconOut), { recursive: true });
  writeFileSync(faviconOut, buildFavicon(tokens));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildTokens();
  process.stdout.write(
    "Generated src/index.css, src/generated/tokens.tsx, and public/favicon.svg\n",
  );
}
