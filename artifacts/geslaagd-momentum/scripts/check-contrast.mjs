import fs from 'node:fs';

const tokens = JSON.parse(
  fs.readFileSync(new URL('../tokens.json', import.meta.url), 'utf8'),
);

const semanticPairs = [
  ['foreground', 'background'],
  ['cardForeground', 'card'],
  ['popoverForeground', 'popover'],
  ['primaryForeground', 'primary'],
  ['secondaryForeground', 'secondary'],
  ['accentForeground', 'accent'],
  ['destructiveForeground', 'destructive'],
  ['mutedForeground', 'muted'],
  ['mutedForeground', 'background'],
  ['sidebarForeground', 'sidebar'],
  ['sidebarAccentForeground', 'sidebarAccent'],
  ['sidebarPrimaryForeground', 'sidebarPrimary'],
];

function luminance(hex) {
  const channels = hex
    .replace('#', '')
    .match(/.{2}/g)
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4,
    );

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const failures = [];
for (const theme of ['light', 'dark']) {
  const palette = tokens.color[theme];
  for (const [foreground, background] of semanticPairs) {
    const ratio = contrast(
      palette[foreground].$value,
      palette[background].$value,
    );
    if (ratio < 4.5) {
      failures.push(
        `${theme}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1`,
      );
    }
  }
}

if (failures.length) {
  throw new Error(
    `Momentum semantic text pairs must meet WCAG AA (4.5:1).\n${failures.join('\n')}`,
  );
}

console.log('All Geslaagd Momentum semantic text pairs meet WCAG AA.');