/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; future platform adapters can consume this object while the
// whole product shares one source of truth.
export const tokens = {
  "color": {
    "light": {
      "background": "#faf9fc",
      "foreground": "#211a2e",
      "border": "#e4dcf2",
      "card": "#ffffff",
      "cardForeground": "#211a2e",
      "popover": "#ffffff",
      "popoverForeground": "#211a2e",
      "primary": "#6d28d9",
      "primaryForeground": "#ffffff",
      "secondary": "#f1ecfa",
      "secondaryForeground": "#3b1f6b",
      "muted": "#f4f1f9",
      "mutedForeground": "#5c5368",
      "accent": "#ede9fe",
      "accentForeground": "#4c1d95",
      "destructive": "#b42318",
      "destructiveForeground": "#ffffff",
      "input": "#d9d0ea",
      "ring": "#6d28d9",
      "chart1": "#6d28d9",
      "chart2": "#2878c8",
      "chart3": "#c2410c",
      "chart4": "#a86b00",
      "chart5": "#c34e55",
      "sidebar": "#f6f2fc",
      "sidebarForeground": "#2c1a4d",
      "sidebarBorder": "#e3d9f2",
      "sidebarPrimary": "#6d28d9",
      "sidebarPrimaryForeground": "#ffffff",
      "sidebarAccent": "#e9defa",
      "sidebarAccentForeground": "#3b1f6b",
      "sidebarRing": "#6d28d9"
    },
    "dark": {
      "background": "#0a0812",
      "foreground": "#f4f2f8",
      "border": "#241f30",
      "card": "#120f1c",
      "cardForeground": "#f4f2f8",
      "popover": "#150f22",
      "popoverForeground": "#f4f2f8",
      "primary": "#c4b5fd",
      "primaryForeground": "#1e1533",
      "secondary": "#1c1728",
      "secondaryForeground": "#e8e3f5",
      "muted": "#171220",
      "mutedForeground": "#a79fc0",
      "accent": "#2a2140",
      "accentForeground": "#ddd4f5",
      "destructive": "#f47772",
      "destructiveForeground": "#260b0a",
      "input": "#2a2438",
      "ring": "#c4b5fd",
      "chart1": "#c4b5fd",
      "chart2": "#72baff",
      "chart3": "#f2c46d",
      "chart4": "#ff9291",
      "chart5": "#6fe5b3",
      "sidebar": "#0a0812",
      "sidebarForeground": "#f4f2f8",
      "sidebarBorder": "#241f30",
      "sidebarPrimary": "#c4b5fd",
      "sidebarPrimaryForeground": "#1e1533",
      "sidebarAccent": "#2a2140",
      "sidebarAccentForeground": "#ddd4f5",
      "sidebarRing": "#c4b5fd"
    }
  },
  "fontFamily": {
    "sans": [
      "DM Sans",
      "sans-serif"
    ],
    "serif": [
      "Sora",
      "sans-serif"
    ],
    "mono": [
      "DM Mono",
      "monospace"
    ]
  },
  "typeScale": {
    "display": {
      "font": "serif",
      "size": "3rem",
      "lineHeight": "1.05",
      "weight": "700",
      "tracking": "-0.03em"
    },
    "heading1": {
      "font": "serif",
      "size": "1.75rem",
      "lineHeight": "1.2",
      "weight": "600",
      "tracking": "-0.02em"
    },
    "heading2": {
      "font": "serif",
      "size": "1.375rem",
      "lineHeight": "1.25",
      "weight": "600",
      "tracking": "-0.015em"
    },
    "heading3": {
      "font": "serif",
      "size": "1.0625rem",
      "lineHeight": "1.35",
      "weight": "600",
      "tracking": "-0.01em"
    },
    "body": {
      "font": "sans",
      "size": "0.9375rem",
      "lineHeight": "1.55",
      "weight": "400",
      "tracking": "0em"
    },
    "bodyLong": {
      "font": "sans",
      "size": "1.0625rem",
      "lineHeight": "1.75",
      "weight": "400",
      "tracking": "0.003em"
    },
    "label": {
      "font": "sans",
      "size": "0.8125rem",
      "lineHeight": "1.4",
      "weight": "600",
      "tracking": "0.005em"
    },
    "meta": {
      "font": "mono",
      "size": "0.75rem",
      "lineHeight": "1.45",
      "weight": "400",
      "tracking": "0.02em"
    }
  },
  "radius": "0.75rem",
  "spacing": "0.25rem",
  "density": {
    "comfortable": {
      "gutter": "1.5rem",
      "sectionGap": "1.75rem",
      "blockGap": "0.75rem",
      "rowPaddingY": "0.625rem",
      "rowPaddingX": "0.875rem",
      "cardPaddingY": "0.875rem",
      "cardPaddingX": "1.125rem",
      "controlHeight": "2.25rem"
    },
    "compact": {
      "gutter": "0.75rem",
      "sectionGap": "1rem",
      "blockGap": "0.5rem",
      "rowPaddingY": "0.375rem",
      "rowPaddingX": "0.625rem",
      "cardPaddingY": "0.625rem",
      "cardPaddingX": "0.875rem",
      "controlHeight": "1.75rem"
    }
  },
  "elevation": {
    "light": {
      "soft": "0 4px 12px rgba(33, 26, 46, 0.08)",
      "lift": "0 16px 48px rgba(33, 26, 46, 0.16)"
    },
    "dark": {
      "soft": "0 4px 12px rgba(0, 0, 0, 0.4)",
      "lift": "inset 0 1px 0 0 rgba(255, 255, 255, 0.06), 0 24px 60px rgba(0, 0, 0, 0.62)"
    }
  },
  "motion": {
    "duration": {
      "fast": "160ms",
      "base": "240ms",
      "slow": "400ms"
    },
    "easing": {
      "standard": "cubic-bezier(0.2, 0.8, 0.2, 1)"
    }
  }
} as const;

export type Tokens = typeof tokens;
export default tokens;
