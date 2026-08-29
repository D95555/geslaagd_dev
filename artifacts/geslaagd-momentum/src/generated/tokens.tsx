/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; future platform adapters can consume this object while the
// whole product shares one source of truth.
export const tokens = {
  "color": {
    "light": {
      "background": "#f5f8f3",
      "foreground": "#13211c",
      "border": "#d5e0d9",
      "card": "#ffffff",
      "cardForeground": "#13211c",
      "popover": "#ffffff",
      "popoverForeground": "#13211c",
      "primary": "#087a5b",
      "primaryForeground": "#f4fff8",
      "secondary": "#e5f0e9",
      "secondaryForeground": "#174638",
      "muted": "#edf3ee",
      "mutedForeground": "#52655b",
      "accent": "#5d43c7",
      "accentForeground": "#ffffff",
      "destructive": "#b42318",
      "destructiveForeground": "#ffffff",
      "input": "#c5d4cc",
      "ring": "#087a5b",
      "chart1": "#087a5b",
      "chart2": "#2878c8",
      "chart3": "#5d43c7",
      "chart4": "#a86b00",
      "chart5": "#c34e55",
      "sidebar": "#eaf2ec",
      "sidebarForeground": "#234437",
      "sidebarBorder": "#cfddd4",
      "sidebarPrimary": "#087a5b",
      "sidebarPrimaryForeground": "#f4fff8",
      "sidebarAccent": "#dbe9e0",
      "sidebarAccentForeground": "#174638",
      "sidebarRing": "#087a5b"
    },
    "dark": {
      "background": "#081712",
      "foreground": "#f7f3e8",
      "border": "#29443a",
      "card": "#0e211a",
      "cardForeground": "#f7f3e8",
      "popover": "#10271f",
      "popoverForeground": "#f7f3e8",
      "primary": "#6fe5b3",
      "primaryForeground": "#062218",
      "secondary": "#17352b",
      "secondaryForeground": "#e9fff1",
      "muted": "#142c23",
      "mutedForeground": "#a9c2b5",
      "accent": "#bcaeff",
      "accentForeground": "#20134f",
      "destructive": "#f47772",
      "destructiveForeground": "#260b0a",
      "input": "#38584b",
      "ring": "#6fe5b3",
      "chart1": "#6fe5b3",
      "chart2": "#72baff",
      "chart3": "#bcaeff",
      "chart4": "#f2c46d",
      "chart5": "#ff9291",
      "sidebar": "#06110d",
      "sidebarForeground": "#e5f2e9",
      "sidebarBorder": "#20382f",
      "sidebarPrimary": "#6fe5b3",
      "sidebarPrimaryForeground": "#062218",
      "sidebarAccent": "#123127",
      "sidebarAccentForeground": "#e9fff1",
      "sidebarRing": "#6fe5b3"
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
      "soft": "0 4px 12px rgba(3, 18, 13, 0.08)",
      "lift": "0 16px 48px rgba(3, 18, 13, 0.16)"
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
