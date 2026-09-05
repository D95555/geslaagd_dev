/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; future platform adapters can consume this object while the
// whole product shares one source of truth.
export const tokens = {
  "color": {
    "light": {
      "background": "#f9fbf8",
      "foreground": "#182420",
      "border": "#dbe7dd",
      "card": "#ffffff",
      "cardForeground": "#182420",
      "popover": "#ffffff",
      "popoverForeground": "#182420",
      "primary": "#15803d",
      "primaryForeground": "#ffffff",
      "secondary": "#e9f6ec",
      "secondaryForeground": "#14532d",
      "muted": "#f3f7f3",
      "mutedForeground": "#57635c",
      "accent": "#dcfce7",
      "accentForeground": "#166534",
      "destructive": "#b42318",
      "destructiveForeground": "#ffffff",
      "input": "#cfe4d4",
      "ring": "#15803d",
      "chart1": "#15803d",
      "chart2": "#2878c8",
      "chart3": "#c2410c",
      "chart4": "#a86b00",
      "chart5": "#c34e55",
      "sidebar": "#eff8f1",
      "sidebarForeground": "#163a24",
      "sidebarBorder": "#d7e9db",
      "sidebarPrimary": "#15803d",
      "sidebarPrimaryForeground": "#ffffff",
      "sidebarAccent": "#dcf5e3",
      "sidebarAccentForeground": "#14532d",
      "sidebarRing": "#15803d"
    },
    "dark": {
      "background": "#08120c",
      "foreground": "#f2f7f3",
      "border": "#1c2b21",
      "card": "#0f1c14",
      "cardForeground": "#f2f7f3",
      "popover": "#112016",
      "popoverForeground": "#f2f7f3",
      "primary": "#86efac",
      "primaryForeground": "#0f2417",
      "secondary": "#15241b",
      "secondaryForeground": "#e3f5e8",
      "muted": "#101c14",
      "mutedForeground": "#9db8a6",
      "accent": "#1c3324",
      "accentForeground": "#d7f5df",
      "destructive": "#f47772",
      "destructiveForeground": "#260b0a",
      "input": "#1e3024",
      "ring": "#86efac",
      "chart1": "#86efac",
      "chart2": "#72baff",
      "chart3": "#f2c46d",
      "chart4": "#ff9291",
      "chart5": "#6fe5b3",
      "sidebar": "#08120c",
      "sidebarForeground": "#f2f7f3",
      "sidebarBorder": "#1c2b21",
      "sidebarPrimary": "#86efac",
      "sidebarPrimaryForeground": "#0f2417",
      "sidebarAccent": "#1c3324",
      "sidebarAccentForeground": "#d7f5df",
      "sidebarRing": "#86efac"
    }
  },
  "fontFamily": {
    "sans": [
      "Plus Jakarta Sans",
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
