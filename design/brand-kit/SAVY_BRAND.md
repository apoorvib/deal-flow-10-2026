# Savy Brand System — implementation spec

> For Claude Code and engineers. Follow this file when building any Savy UI, page, email or asset.
> Source of truth for values: `tokens/tokens.json`. Ready-to-use CSS: `tokens/tokens.css`.
> If this file and the code disagree, this file wins; update the code.

## 0. Kit contents

```
SAVY_BRAND.md                     ← this spec
tokens/tokens.json                ← all tokens (colors per theme, type, spacing, radius, shadow)
tokens/tokens.css                 ← CSS custom properties + type classes, light/dark
tokens/tailwind.preset.js         ← Tailwind preset mapped to the CSS variables
components/savy-components.js     ← React 18 reference components (window.Savy)
components/savy-components.css    ← their styles (also loads Google Fonts)
components/savy-components.d.ts   ← props / types
assets/logos/savy-logo.png            ← full lockup, light grounds
assets/logos/savy-logo-reversed.png   ← full lockup, dark grounds
assets/logos/savy-mark.png            ← shield only, light grounds
assets/logos/savy-mark-reversed.png   ← shield only, dark grounds
assets/logos/savy-app-icon.png        ← 1024×1024 app icon / favicon source
```

## 1. Product context

Savy verifies accredited investors once and issues a reusable **accreditation passport** that investors share with any issuer (VC fund, syndicate, SPV, startup, real-estate sponsor). Two audiences:

- **Investors** handing over sensitive financial data → need calm, clear, private.
- **Issuers** relying on Savy for a legal record → need precise, auditable, credible.

Brand feel: a well-run compliance desk that happens to be fast. Precise, calm, quietly confident. Never playful, never hype.

## 2. Hard rules (do not break)

1. Never use raw hex in components. Use CSS variables from `tokens.css` (or Tailwind classes from the preset).
2. Never set text in `--mint` on light surfaces (2.2:1 contrast). Mint is a fill/accent only.
3. Text on a `--brand` fill is `--on-brand`; text on a `--mint`/`--accent` fill is `--on-accent`. Never hard-code white.
4. Status is always a word **plus** colour (use `StatusBadge`). Never colour alone.
5. One primary button per screen.
6. Every interactive element shows a 2px solid `--focus` outline at 2px offset on `:focus-visible`.
7. Input borders use `--line-strong` (meets 3:1). `--line` is decorative only.
8. Cards use a 1px `--line` border, not shadows. `--shadow-md` only for menus, popovers, dialogs.
9. `--radius-pill` only on status badges. Buttons `--radius-md`, inputs `--radius-sm`, cards `--radius-lg`.
10. Use logo PNGs as supplied. Never retype the wordmark in a font, recolour, stretch, add effects, or use the shield as a UI "verified" icon.
11. Support light and dark themes from day one (`data-theme` on `<html>`, falling back to `prefers-color-scheme`).
12. Issuers see verification **status**, never investor financial figures, anywhere in the UI.

## 3. Setup

```html
<!-- in <head> -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/tokens/tokens.css">
```

```css
/* global base */
html { color-scheme: light dark; }
body { margin: 0; background: var(--surface); color: var(--ink); font-family: var(--font-sans); font-size: 15px; line-height: 24px; -webkit-font-smoothing: antialiased; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
```

**Next.js:** load fonts with `next/font/google` (Sora, Manrope, JetBrains_Mono) and map them to `--font-display`, `--font-sans`, `--font-mono`; import `tokens.css` in the root layout.

**Tailwind:** `presets: [require('./tokens/tailwind.preset.js')]`, then use `bg-surface text-ink border-line rounded-lg p-s5 font-display`, etc. Colors resolve to CSS variables, so dark mode works by toggling `data-theme`.

## 4. Color tokens

### Brand palette (fixed, same in both themes)

| Token | Hex | Use |
|---|---|---|
| `--forest` | #034839 | Logo forest. Anchor colour: primary buttons (light), brand text |
| `--forest-deep` | #022E25 | Hover/pressed forest; deep marketing bands |
| `--mint` | #26C48C | Logo mint. Accent fills only: verified dot, progress, chart highlight; primary in dark |
| `--mint-bright` | #5BE0AE | Mint for text/accents on dark grounds |

### Semantic (use these in components)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--surface` | #FFFFFF | #0B1714 | Page background |
| `--surface-raised` | #FFFFFF | #12211C | Cards, menus, dialogs |
| `--surface-sunken` | #F4F7F5 | #081310 | Wells, table headers, read-only fields |
| `--ink` | #0F1F1A | #E8F0EC | Primary text |
| `--ink-muted` | #52625C | #9AAEA6 | Secondary text, labels, metadata |
| `--line` | #DCE4E0 | #22352E | Dividers, card borders (decorative) |
| `--line-strong` | #76867F | #61786F | Input/checkbox borders (≥3:1) |
| `--brand` | forest | mint | Primary action fill, selected state |
| `--on-brand` | #FFFFFF | #03241C | Text/icons on `--brand` |
| `--brand-hover` | forest-deep | mint-bright | Hover/pressed primary |
| `--brand-ink` | forest | mint-bright | Links, brand-coloured text |
| `--accent` | mint | mint | Accent fill |
| `--on-accent` | #03241C | #03241C | Text on accent fill |
| `--verified-soft` / `--verified-ink` | #E6F7F0 / forest | #0F3428 / mint-bright | Verified badge, success callout |
| `--warning-soft` / `--warning-ink` | #FFF3DC / #8A4B00 | #3A2A0C / #F3C26B | In review, needs info |
| `--danger-soft` / `--danger-ink` | #FDECEA / #A61B14 | #3D1512 / #FF9C93 | Not verified, errors, destructive |
| `--neutral-soft` | #EEF1EF | #1A2C26 | Expired / neutral badge background |
| `--focus` | #147A58 | #26C48C | Focus ring |

All text/ground pairs above meet WCAG AA (4.5:1) in both themes.

**Proportion:** ~75% neutrals, ~20% forest, ~5% mint.

## 5. Typography

| Class | Family | Size / line | Weight | Use |
|---|---|---|---|---|
| `.display-xl` | Sora | 56 / 60, −0.02em | 600 | Marketing hero, one per page |
| `.display` | Sora | 40 / 46, −0.015em | 600 | Section heroes, big numbers |
| `.heading-1` | Sora | 30 / 36, −0.01em | 600 | Product page titles |
| `.heading-2` | Sora | 22 / 28 | 600 | Section and dialog titles |
| `.heading-3` | Manrope | 17 / 24 | 700 | Card titles, sub-sections |
| `.body` | Manrope | 15 / 24 | 400 | Default text |
| `.body-sm` | Manrope | 14 / 20 | 400 | Helper text, tables, dense UI |
| `.label` | Manrope | 13 / 16 | 600 | Form labels, badges, small buttons |
| `.caption` | Manrope | 12 / 16, +0.02em | 500 | Metadata, timestamps |
| `.overline` | Manrope | 11 / 16, +0.08em, UPPERCASE | 700 | Eyebrows only (the only uppercase text) |
| `.mono` | JetBrains Mono | 13 / 20 | 500 | Passport IDs, API keys, hashes, webhook names |

- Sora only at 22px+. Everything smaller is Manrope.
- Numbers in tables, amounts and dates: `font-variant-numeric: tabular-nums`.

## 6. Spacing, radius, elevation

| Token | Value | Use |
|---|---|---|
| `--space-1` | 4px | Icon–text gap |
| `--space-2` | 8px | Compact groups, badge padding |
| `--space-3` | 12px | Label→field gap, button groups |
| `--space-4` | 16px | Button padding, mobile card padding |
| `--space-5` | 24px | Desktop card padding, between form fields |
| `--space-6` | 32px | Between sections in a page |
| `--space-7` | 48px | Between page regions |
| `--space-8` | 64px | Marketing sections |
| `--radius-sm` | 4px | Inputs, checkboxes, tags |
| `--radius-md` | 8px | Buttons, menus |
| `--radius-lg` | 12px | Cards, dialogs, passport card |
| `--radius-pill` | 999px | Status badges only |
| `--shadow-sm` | — | Button hover only |
| `--shadow-md` | — | Menus, popovers, dialogs only |

Layout: left-aligned, generous margins, max content width ~1120px for app pages, ~720px for forms and reading. Mobile-first; 16px side gutter on phones.

## 7. Components (reference implementations in `components/`)

Rebuild these in the app's framework with the same props, states and styles. Class names in `savy-components.css` are `sv-*`.

### Button
- Variants: `primary` (`--brand` fill, `--on-brand` text), `secondary` (default; `--surface-raised`, 1px `--line-strong` border), `ghost` (`--brand-ink` text, `--verified-soft` hover), `danger` (`--danger-ink` fill, `--surface` text; destructive only, always confirm).
- Sizes: `sm` 32px, `md` 40px (default), `lg` 48px. Font Manrope 600. Radius `--radius-md`.
- Disabled: `--neutral-soft` fill, `--ink-muted` text; explain nearby why.
- Copy: verb first, sentence case, 2–3 words. "Start verification", "Share passport", "Revoke access".

### StatusBadge
| status | Label | Background / text | Dot |
|---|---|---|---|
| `verified` | Verified | verified-soft / verified-ink | solid `--accent` |
| `pending` | In review | warning-soft / warning-ink | solid warning-ink |
| `needs_info` | Needs info | warning-soft / warning-ink | hollow ring |
| `expired` | Expired | neutral-soft / ink-muted | hollow ring |
| `denied` | Not verified | danger-soft / danger-ink | solid danger-ink |

24px tall, pill radius, 13px/600, 8px dot with 4px gap. Never "Rejected" or "Failed".

### TextField
- Visible label always (`.label`); placeholder is an example, not a label.
- 40px input, `--radius-sm`, 1px `--line-strong` border, `--surface-raised` fill.
- `hint` under the field in `.body-sm` `--ink-muted`: one sentence saying why Savy asks. Every financial field has one.
- `error` replaces hint, `--danger-ink` text and border, `aria-invalid="true"`, linked with `aria-describedby`. Say how to fix: "CRD numbers are 4 to 7 digits."
- Money: `inputMode="decimal"`.

### PassportCard (signature component)
- 340px wide (fluid on mobile), `--surface-raised`, 1px `--line` border, `--radius-lg`, `--space-5` padding, no shadow.
- Header: overline "ACCREDITATION PASSPORT" + StatusBadge.
- Name in Sora 22/28 600; investor type in `.body-sm` muted.
- 2-column definition grid above a `--line` divider: Path, Verified on, Expires, Signed by, Passport ID (mono).
- Footer: "Shared with N issuers" in `--brand-ink` 13/600.
- Shows status only. Never balances, income or net worth.
- Actions (Share, Refresh, Revoke) live beside the card, not inside it.

### Patterns to build consistently
- **Verification stepper:** progress bar + "About N minutes left", save-and-resume on every step.
- **Consent screen:** list exactly what the issuer receives (status, path, dates, letter) and what it does not (statements, balances, tax data).
- **Callouts:** soft background + ink of the matching status; icon optional, title + one sentence + action.
- **Tables:** `--surface-sunken` header row, `.label` headers, `.body-sm` cells, tabular numerals, 1px `--line` row dividers.
- **Empty states:** one sentence of what goes here + one primary action. No illustrations of people.

## 8. Logo usage

| File | Use on |
|---|---|
| `savy-logo.png` | `--surface`, `--surface-sunken`, `--verified-soft` (light grounds) |
| `savy-logo-reversed.png` | `--forest`, `--forest-deep`, dark-theme `--surface` |
| `savy-mark.png` | Avatars, favicons, tight spaces on light grounds |
| `savy-mark-reversed.png` | Same, on dark grounds |
| `savy-app-icon.png` | App stores, social profiles, favicon source (generate 16/32/180/192/512) |

- Swap logo files by theme (light ↔ reversed), e.g. `<picture>` with `prefers-color-scheme` or a theme-aware component.
- Clear space: half the shield's height on all sides. Minimum: lockup 96px wide, mark 24px tall.
- Always `alt="Savy"`.
- Don't: place on mint or photos, recolour, stretch, rotate, outline, shadow, gradient, or retype the wordmark.
- The PNGs come from an AI-generated master; replace them with vector SVGs when available (keep the same filenames, `.svg`).

## 9. Voice and copy

- **Plain and exact:** name the rule, number and date. "We check your linked accounts against the $1M net-worth test, excluding your primary residence."
- **Calm:** no exclamation marks, no urgency, no emoji. Speed as fact: "Most investors finish in under 10 minutes."
- **Person:** "you" to investors, "we" for Savy.
- **Sentence case** everywhere (headings, buttons, badges, nav).
- **Say why before asking** for any data.
- **Legal precision:** "verified as an accredited investor", never "approved", "certified" or "compliant". Never promise issuers guaranteed compliance; state what was checked and who signed.
- **Vocabulary:** investor, issuer, passport, verification letter, path (net worth / income / license / minimum investment / third-party letter), reviewer.
- **Dates:** "22 Jan 2027". **Money:** "$1,000,000" in forms, "$1M" in prose; spell out thresholds in full on first mention per screen.
- **Tagline:** "Accreditation you can carry." (placeholder, pending confirmation)

Examples:
- Hero: "Accreditation you can carry." / "Verify once. Share your passport with any issuer in one click, and revoke it whenever you want."
- Expiry notice: "Your passport expires on 22 Jan 2027. We'll remind you 14 days before."
- Denied: "Not verified on the documents provided. You can add a CPA letter or link another account."

## 10. Iconography and imagery

- No brand icon set yet. Use **Lucide** (outline), 20px, 1.5px stroke, `--ink-muted` (or `currentColor`). Icons accompany words; never replace status words or button labels.
- No stock photos (handshakes, skylines, people at screens). Use product UI, the passport card, simple charts, or the shield's geometry: chevrons and a diagonal forest-over-mint split.
- Charts: neutrals for most series, `--forest` for the primary series, `--mint` for one highlight.

## 11. Accessibility checklist

- AA contrast for all text in both themes (the token pairs above already pass; don't invent new pairs).
- Visible `:focus-visible` ring on everything interactive.
- Labels on every input; errors linked via `aria-describedby`.
- Status always has text.
- Hit targets ≥ 40px (≥ 44px on touch).
- Respect `prefers-reduced-motion`; motion is limited to 120–200ms ease transitions on hover/focus/expand.
