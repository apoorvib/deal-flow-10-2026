import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import { useMemo, useRef } from 'react'
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

export function PassportCard({ data, interactive = true, className }: { data: PassportCardData; interactive?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const mx = useMotionValue(0.5)
  const my = useMotionValue(0.5)
  const sx = useSpring(mx, { stiffness: 160, damping: 22 })
  const sy = useSpring(my, { stiffness: 160, damping: 22 })
  const rotY = useTransform(sx, [0, 1], [-7, 7])
  const rotX = useTransform(sy, [0, 1], [5, -5])
  const glareX = useTransform(sx, [0, 1], ['10%', '90%'])
  const glareY = useTransform(sy, [0, 1], ['0%', '100%'])
  const glare = useMotionTemplate`radial-gradient(120% 80% at ${glareX} ${glareY}, rgb(255 255 255 / 0.13), transparent 55%)`

  const patterns = useMemo(
    () => [guilloche(150, 42, 70, 470, 120), guilloche(130, 36, 58, 470, 120), guilloche(96, 30, 40, 470, 120)],
    [],
  )
  const [l1, l2] = mrz(data.holderName || 'Investor', data.letterRef)
  const tilt = interactive && !reduce

  return (
    <div className={cn('text-left [perspective:1400px]', className)}>
      <motion.div
        ref={ref}
        onPointerMove={(e) => {
          if (!tilt || !ref.current) return
          const b = ref.current.getBoundingClientRect()
          mx.set((e.clientX - b.left) / b.width)
          my.set((e.clientY - b.top) / b.height)
        }}
        onPointerLeave={() => {
          mx.set(0.5)
          my.set(0.5)
        }}
        style={tilt ? { rotateX: rotX, rotateY: rotY, transformStyle: 'preserve-3d' } : undefined}
        className="relative aspect-[1.586/1] w-full overflow-hidden rounded-[14px] bg-[#04493a] text-[#efe9dc] shadow-[0_1px_0_rgb(255_255_255/0.08)_inset,0_30px_60px_-24px_rgb(2_30_24/0.5),0_12px_24px_-12px_rgb(2_30_24/0.3)] select-none"
      >
        {/* Base tone and vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_85%_20%,#0b6a52_0%,#04493a_50%,#022a21_100%)]" />

        {/* Guilloche */}
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

        {/* Pointer glare */}
        {tilt && <motion.div className="pointer-events-none absolute inset-0 mix-blend-soft-light" style={{ background: glare }} />}

        <div className="relative flex h-full flex-col justify-between p-[6%]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-sans font-semibold text-[clamp(8px,1.5vw,11px)] tracking-[0.2em] text-[#d8c39a]/80 uppercase">{BRAND.name}</div>
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
      </motion.div>
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
