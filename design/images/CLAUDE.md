# Savy website — image pack

20 AI-generated stock images (Higgsfield: Soul 2.0 for 01–10, GPT Image 2.5 for 11–20) showing the *outcome* of using Savy: relief, relaxation, deal closing, status.

## Setup
Run `./download.sh` (or `python3` equivalent) to pull every image into `hero/` and `img/`. URLs + metadata live in `manifest.json`.

## Usage rules
- **Hero banners:** `hero/11–13` — 21:9, 4K. Subject sits on the right third; left ~50% is clean negative space for headline + CTA. Use `object-fit: cover; object-position: right center` so the subject stays visible on narrow screens. On mobile (<768px), consider stacking headline above the image or using a darker gradient overlay on the left for text contrast.
- **Section / card imagery:** `img/01–10, 14–20` — 3:2, ~2K.
- Use `alt` from `manifest.json` for every `<img>`.
- Convert to WebP/AVIF and generate responsive `srcset` sizes (e.g. 640/1280/1920, heroes also 2560/3840) before shipping; originals are large PNGs.
- Lazy-load everything except the active hero (`loading="eager"` + `fetchpriority="high"` on hero).
- Themes (`relief`, `relaxation`, `deal-closing`, `status`) can be used to pick images per section, e.g. "How it works" → relief, testimonials/social proof → deal-closing, pricing/CTA → status.
- No text or logos are baked into the images; overlay all copy in HTML.
