import { useEffect, useMemo, useRef } from 'react'
import { cn } from '../lib/cn'
import { shortDate } from '../lib/format'
import { INVESTOR_TYPE_LABEL, PATHWAY_LABEL, type InvestorType, type Pathway } from '../lib/types'
import { BRAND } from '../lib/brand'

export interface PassportCardData {
  holderName: string
  investorType: InvestorType
  pathway: Pathway
  letterRef: string
  issuedAt: string
  expiresAt: string
  status: 'active' | 'expired' | 'specimen'
}

/** Hypotrochoid rosette, the classic banknote guilloche. */
function guilloche(R: number, r: number, d: number, cx: number, cy: number, steps = 1400) {
  let p = ''
  const turns = r / gcd(R, r)
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2 * turns
    const x = cx + (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t)
    const y = cy + (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t)
    p += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
  }
  return p
}
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)

function mrz(name: string, ref: string) {
  const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '<')
  const parts = name.trim().split(/\s+/)
  const last = clean(parts.pop() ?? '')
  const first = clean(parts.join(' '))
  const l1 = `P<${BRAND.code}<${last}<<${first}`.padEnd(44, '<').slice(0, 44)
  const l2 = `${clean(ref)}<<506C<ACCREDITED`.padEnd(44, '<').slice(0, 44)
  return [l1, l2]
}

// 3D build, after the Align identity card (align-calendar/src/views/identityCard.js):
// - the STAGE owns `perspective`; the CARD keeps `preserve-3d` and must not clip (overflow:hidden on it
//   flattens the stack), so clipping lives on the face layer instead
// - layers ride translateZ so the tilt has something to parallax: edge slab < foil rim < face < content < sheen
// - one rAF driver writes --rx/--ry (rotation) and --gx/--gy (where the light sits). A CSS keyframe idle
//   would outrank inline rotation while it runs, so the idle sway is computed in the same loop instead.
const SWAY_MS = 7000
const SWAY_X = 2.2
const SWAY_Y = 3
const POINTER_MAX = 8

function useCardTilt(interactive: boolean) {
  const stage = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const el = card.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    let raf = 0
    let visible = true
    const now = { x: 0, y: 0 }
    const t0 = performance.now()
    const frame = (t: number) => {
      const phase = ((t - t0) / SWAY_MS) * Math.PI * 2
      const target = pointer.current
        ? { x: pointer.current.y * -POINTER_MAX, y: pointer.current.x * POINTER_MAX }
        : { x: SWAY_X * Math.cos(phase), y: SWAY_Y * Math.sin(phase) }
      const k = pointer.current ? 0.14 : 0.06
      now.x += (target.x - now.x) * k
      now.y += (target.y - now.y) * k
      el.style.setProperty('--rx', `${now.x.toFixed(2)}deg`)
      el.style.setProperty('--ry', `${now.y.toFixed(2)}deg`)
      el.style.setProperty('--gx', `${(50 + now.y * 2.2).toFixed(1)}%`)
      el.style.setProperty('--gy', `${(40 - now.x * 2.2).toFixed(1)}%`)
      if (visible) raf = requestAnimationFrame(frame)
    }
    // Don't spend frames on a card nobody can see.
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      cancelAnimationFrame(raf)
      if (visible) raf = requestAnimationFrame(frame)
    })
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [])

  const handlers = interactive
    ? {
        onPointerMove: (e: React.PointerEvent) => {
          const b = stage.current?.getBoundingClientRect()
          if (!b) return
          pointer.current = { x: (e.clientX - b.left) / b.width - 0.5, y: (e.clientY - b.top) / b.height - 0.5 }
        },
        onPointerLeave: () => {
          pointer.current = null
        },
      }
    : {}
  return { stage, card, handlers }
}

const z = (n: number): React.CSSProperties => ({ transform: `translateZ(${n}px)` })

/** Gold foil, matched to the seal: light pools where --gx/--gy put it, falling off to antique gold. */
const FOIL =
  'radial-gradient(circle at var(--gx, 50%) var(--gy, 40%), #fff6dc 0%, #f1dfb5 14%, #d9b97c 32%, #b8935b 55%, #8c6c3d 78%, #5e4625 100%)'

/** Rim foil: two gold glints on a conic sweep whose start angle follows the tilt, so they travel around the edge. */
const RIM =
  'conic-gradient(from calc(var(--ry, 0deg) * 7 + var(--rx, 0deg) * 4 + 210deg), #5e4625 0%, #a8834c 6%, #f1dfb5 10%, #fff6dc 11.5%, #d9b97c 14%, #7a5c32 24%, #5e4625 38%, #9a7843 50%, #e8d19f 57%, #fff6dc 59%, #c9a468 63%, #6d522c 74%, #5e4625 100%)'

export function PassportCard({ data, interactive = true, className }: { data: PassportCardData; interactive?: boolean; className?: string }) {
  const { stage, card, handlers } = useCardTilt(interactive)
  const patterns = useMemo(
    () => [guilloche(150, 42, 70, 470, 120), guilloche(130, 36, 58, 470, 120), guilloche(96, 30, 40, 470, 120)],
    [],
  )
  const [l1, l2] = mrz(data.holderName || 'Investor', data.letterRef)

  return (
    <div ref={stage} {...handlers} className={cn('relative text-left select-none [perspective:1100px]', className)}>
      {/* Ground shadow: stays on the table while the card tilts above it. */}
      <div className="pointer-events-none absolute inset-x-[8%] -bottom-[6%] h-[18%] rounded-[50%] bg-[#022a21]/35 blur-2xl" aria-hidden />

      <div
        ref={card}
        className="relative aspect-[1.586/1] w-full rounded-[14px] text-[#efe9dc]"
        style={{ transformStyle: 'preserve-3d', transform: 'rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))' }}
      >
        {/* Edge slab: stacked foil sheets behind the face give the card a visible, shiny thickness when it turns. */}
        {[5, 4, 3, 2, 1].map((d) => (
          <div key={d} className="absolute inset-0 rounded-[14px]" style={{ background: FOIL, filter: `brightness(${1 - d * 0.07})`, ...z(-d) }} aria-hidden />
        ))}

        {/* Foil rim: a sheet poking 3px past the face. Glints travel round it as the card turns. */}
        <div
          className="absolute -inset-[3px] rounded-[17px]"
          style={{ background: RIM, boxShadow: '0 0 16px rgb(217 185 124 / 0.4), 0 28px 50px -24px rgb(2 30 24 / 0.55)', ...z(0) }}
          aria-hidden
        />

        {/* Face: card stock, vignette and guilloche. Clipping lives here, not on the 3D parent. */}
        <div className="absolute inset-0 overflow-hidden rounded-[14px] shadow-[inset_0_0_0_1px_rgb(241_223_181/0.3)]" style={z(1)}>
          <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_85%_20%,#0b6a52_0%,#04493a_50%,#022a21_100%)]" />
          <svg viewBox="0 0 600 378" className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
            <g fill="none" stroke="#d8c39a" strokeWidth="0.45">
              <path d={patterns[0]} opacity="0.16" />
              <path d={patterns[1]} opacity="0.14" />
              <path d={patterns[2]} opacity="0.2" />
            </g>
            <g stroke="#d8c39a" strokeWidth="0.4" opacity="0.1">
              {Array.from({ length: 48 }, (_, i) => (
                <line key={i} x1={-40 + i * 14} y1={378} x2={60 + i * 14} y2={0} />
              ))}
            </g>
          </svg>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_95%_80%_at_50%_40%,transparent_55%,rgb(0_0_0/0.35)_100%)]" />
        </div>

        {/* Content sits flush with the stock: one rigid plate, no layers sliding against each other. */}
        <div className="absolute inset-0 flex flex-col justify-between p-[6%]" style={z(2)}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-sans text-[clamp(8px,1.5vw,11px)] font-semibold tracking-[0.2em] text-[#d8c39a]/80 uppercase">{BRAND.name}</div>
              <div className="display mt-1 text-[clamp(17px,3.4vw,25px)] leading-none">Accredited Investor</div>
            </div>
            <FoilSeal />
          </div>

          <div className="grid grid-cols-[1fr_auto] items-end gap-4">
            <div className="min-w-0">
              <div className="font-mono text-[clamp(7.5px,1.3vw,9.5px)] tracking-[0.18em] text-[#efe9dc]/55 uppercase">Holder</div>
              <div className="display truncate text-[clamp(18px,3.8vw,28px)] leading-tight">{data.holderName || 'Your name'}</div>
              <div className="mt-[3%] grid grid-cols-3 gap-3 text-[clamp(9px,1.6vw,12px)]">
                <Meta k="Basis" v={PATHWAY_LABEL[data.pathway]} />
                <Meta k="Issued" v={shortDate(data.issuedAt)} />
                <Meta k="Valid to" v={shortDate(data.expiresAt)} />
              </div>
            </div>
            <StatusStamp status={data.status} type={INVESTOR_TYPE_LABEL[data.investorType]} />
          </div>

          <div className="font-mono text-[clamp(7px,1.35vw,10px)] leading-[1.5] tracking-[0.12em] text-[#efe9dc]/45">
            <div className="truncate">{l1}</div>
            <div className="truncate">{l2}</div>
          </div>
        </div>

        {/* Gloss, always the top layer: a soft pool and a broad band that drift only slightly, like light on a rigid plate. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[14px]" style={z(3)} aria-hidden>
          <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at var(--gx, 50%) var(--gy, 40%), rgb(241 223 181 / 0.14), rgb(217 185 124 / 0.04) 40%, transparent 65%)' }} />
          <div
            className="absolute -inset-1/2 mix-blend-screen"
            style={{
              background: 'linear-gradient(115deg, transparent 30%, rgb(232 209 159 / 0.12) 46%, rgb(241 223 181 / 0.18) 50%, rgb(232 209 159 / 0.12) 54%, transparent 70%)',
              transform: 'translateX(calc((var(--gx, 50%) - 50%) * 0.7))',
            }}
          />
        </div>
      </div>
    </div>
  )
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[0.78em] tracking-[0.16em] text-[#efe9dc]/50 uppercase">{k}</div>
      <div className="truncate font-medium text-[#efe9dc]/92">{v}</div>
    </div>
  )
}

function StatusStamp({ status, type }: { status: PassportCardData['status']; type: string }) {
  const label = status === 'active' ? 'Verified' : status === 'expired' ? 'Expired' : 'Specimen'
  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <span
        className={cn(
          'rounded-md border px-2 py-0.5 font-mono text-[clamp(8px,1.4vw,10.5px)] tracking-[0.18em] uppercase',
          status === 'active' ? 'border-[#9fd2b4]/40 text-[#bfe3cd]' : status === 'expired' ? 'border-[#e8a596]/40 text-[#f0bcb0]' : 'border-[#d8c39a]/40 text-[#d8c39a]',
        )}
      >
        {label}
      </span>
      <span className="text-[clamp(8.5px,1.4vw,11px)] text-[#efe9dc]/55">{type}</span>
    </div>
  )
}

function FoilSeal() {
  return (
    <svg viewBox="0 0 64 64" className="size-[clamp(36px,8vw,56px)] shrink-0 drop-shadow-[0_1px_0_rgb(0_0_0/0.3)]" aria-hidden>
      <defs>
        <linearGradient id="foil" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f1dfb5" />
          <stop offset="0.45" stopColor="#b8935b" />
          <stop offset="0.7" stopColor="#e8d19f" />
          <stop offset="1" stopColor="#8c6c3d" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#foil)">
        {Array.from({ length: 36 }, (_, i) => {
          const a = (i / 36) * Math.PI * 2
          return <line key={i} x1={32 + Math.cos(a) * 25} y1={32 + Math.sin(a) * 25} x2={32 + Math.cos(a) * 30} y2={32 + Math.sin(a) * 30} strokeWidth="1.4" />
        })}
        <circle cx="32" cy="32" r="22" strokeWidth="1.2" />
        <circle cx="32" cy="32" r="18" strokeWidth="0.7" strokeDasharray="1.4 1.8" />
        <path d="M24 32.5l5.5 5.5 11-12" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}
