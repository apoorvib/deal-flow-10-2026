export const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export const compactUsd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })

// Date-only strings ("2026-12-15") parse as UTC midnight and would render a day early west of UTC.
const toDate = (iso: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso)

export const longDate = (iso: string) =>
  toDate(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

export const shortDate = (iso: string) =>
  toDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export const daysUntil = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000))

/** Parses "1,250,000", "$1.2m", "250k" into a number; returns null when empty. */
export function parseMoney(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/[$,\s]/g, '')
  if (!s) return null
  const m = s.match(/^(\d*\.?\d+)([km])?$/)
  if (!m) return null
  const mult = m[2] === 'm' ? 1_000_000 : m[2] === 'k' ? 1_000 : 1
  return Math.round(Number(m[1]) * mult)
}

export const motionEase = [0.22, 1, 0.36, 1] as const
