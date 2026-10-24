/** Savy Tailwind preset — import tokens.css first so the CSS variables exist. */
module.exports = {
  "theme": {
    "extend": {
      "colors": {
        "forest": "var(--forest)",
        "forest-deep": "var(--forest-deep)",
        "mint": "var(--mint)",
        "mint-bright": "var(--mint-bright)",
        "surface": "var(--surface)",
        "surface-raised": "var(--surface-raised)",
        "surface-sunken": "var(--surface-sunken)",
        "ink": "var(--ink)",
        "ink-muted": "var(--ink-muted)",
        "line": "var(--line)",
        "line-strong": "var(--line-strong)",
        "brand": "var(--brand)",
        "on-brand": "var(--on-brand)",
        "brand-hover": "var(--brand-hover)",
        "brand-ink": "var(--brand-ink)",
        "accent": "var(--accent)",
        "on-accent": "var(--on-accent)",
        "verified-soft": "var(--verified-soft)",
        "verified-ink": "var(--verified-ink)",
        "warning-soft": "var(--warning-soft)",
        "warning-ink": "var(--warning-ink)",
        "danger-soft": "var(--danger-soft)",
        "danger-ink": "var(--danger-ink)",
        "neutral-soft": "var(--neutral-soft)",
        "focus": "var(--focus)"
      },
      "fontFamily": {
        "display": [
          "Sora",
          "Manrope",
          "system-ui",
          "sans-serif"
        ],
        "sans": [
          "Manrope",
          "system-ui",
          "sans-serif"
        ],
        "mono": [
          "JetBrains Mono",
          "ui-monospace",
          "monospace"
        ]
      },
      "spacing": {
        "s1": "4px",
        "s2": "8px",
        "s3": "12px",
        "s4": "16px",
        "s5": "24px",
        "s6": "32px",
        "s7": "48px",
        "s8": "64px"
      },
      "borderRadius": {
        "sm": "4px",
        "md": "8px",
        "lg": "12px",
        "pill": "999px"
      },
      "boxShadow": {
        "sm": "var(--shadow-sm)",
        "md": "var(--shadow-md)"
      }
    }
  }
};
