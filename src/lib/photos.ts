// The Savy image pack (design/images/manifest.json), served as WebP from public/img at two widths each.
// 06, 07 and 08 are left out: their screens and signage carry AI-garbled text.

export interface PhotoSource {
  base: string
  widths: readonly [number, number]
  alt: string
}

export const PHOTOS = {
  img01: { base: '01-office-skyline-relaxed', widths: [700, 1400], alt: "Fund manager leaning back in corner office, Manhattan skyline" },
  img02: { base: '02-handshake-boardroom', widths: [700, 1400], alt: "Handshake across walnut boardroom table" },
  img03: { base: '03-exec-signing-pen', widths: [700, 1400], alt: "Woman exec signing with fountain pen" },
  img04: { base: '04-champagne-toast-dusk', widths: [700, 1400], alt: "Investors toasting champagne at dusk" },
  img05: { base: '05-espresso-coastal-terrace', widths: [700, 1400], alt: "Espresso on luxury hotel terrace, coast view" },
  img09: { base: '09-club-library-partners', widths: [700, 1400], alt: "Partners talking in wood-paneled club library" },
  img10: { base: '10-yacht-golden-hour', widths: [700, 1400], alt: "Man on yacht deck at golden hour" },
  img11: { base: '11-hero-window-skyline', widths: [1280, 2400], alt: "fund manager at window, skyline" },
  img12: { base: '12-hero-boardroom-handshake', widths: [1280, 2400], alt: "boardroom handshake" },
  img13: { base: '13-hero-lounge-relaxed', widths: [1280, 2400], alt: "exec relaxing in lounge chair" },
  img14: { base: '14-pen-term-sheet', widths: [700, 1400], alt: "Pen set down on signed term sheet" },
  img15: { base: '15-sidewalk-phone-call', widths: [700, 1400], alt: "Investor laughing on call, city sidewalk" },
  img16: { base: '16-team-celebrating', widths: [700, 1400], alt: "Team celebrating around laptop" },
  img17: { base: '17-private-jet', widths: [700, 1400], alt: "Businessman relaxing in private jet seat" },
  img18: { base: '18-espresso-toast-cafe', widths: [700, 1400], alt: "Partners toasting espresso, European cafe" },
  img19: { base: '19-home-office-relief', widths: [700, 1400], alt: "GP leaning back in relief, home office" },
  img20: { base: '20-dock-sailboat', widths: [700, 1400], alt: "Couple walking to sailboat at golden hour" },
} as const satisfies Record<string, PhotoSource>

export type PhotoKey = keyof typeof PHOTOS
