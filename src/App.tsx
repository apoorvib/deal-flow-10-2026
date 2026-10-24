import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { CircleHelp, ShieldCheck, UserRound } from 'lucide-react'
import logoReversed from './assets/savy-logo-reversed.png'
import logo from './assets/savy-logo.png'
import { isMock } from './lib/api/client'
import { BRAND } from './lib/brand'
import { motionEase } from './lib/format'
import { getSession } from './lib/session'
import Deals from './pages/Deals'
import Landing from './pages/Landing'
import NotFound from './pages/NotFound'
import PassportPage from './pages/PassportPage'
import Status from './pages/Status'
import Verify from './pages/Verify'

function useSession() {
  const [s, set] = useState(getSession)
  useEffect(() => {
    const on = () => set(getSession())
    window.addEventListener('lp-session', on)
    window.addEventListener('storage', on)
    return () => {
      window.removeEventListener('lp-session', on)
      window.removeEventListener('storage', on)
    }
  }, [])
  return s
}

const NAV = [
  { to: '/verify', label: 'Get verified' },
  { to: '/#qualify', label: 'Ways to qualify' },
  { to: '/#how', label: 'How it works' },
  { to: '/#privacy', label: 'Privacy & security' },
  { to: '/#funds', label: 'For funds' },
]

function Wordmark({ className }: { className?: string }) {
  return (
    <Link to="/" className="shrink-0" aria-label={`${BRAND.name} home`}>
      <picture>
        <source srcSet={logoReversed} media="(prefers-color-scheme: dark)" />
        <img src={logo} alt={BRAND.name} className={className ?? 'h-10 w-auto'} />
      </picture>
    </Link>
  )
}

function Header() {
  const { passportId } = useSession()
  return (
    <header className="relative z-30">
      {/* Trust bar */}
      <div className="border-b border-line bg-paper">
        <p className="mx-auto flex h-11 max-w-6xl items-center justify-center gap-2 px-5 text-center text-[13px] text-ink-2 italic sm:px-8">
          <ShieldCheck className="size-4 shrink-0 text-accent not-italic" strokeWidth={2} />
          SEC Rule 506(c) verification · Every letter signed by a licensed attorney
        </p>
      </div>
      <div className="border-b border-line bg-paper">
        <div className="mx-auto flex h-[76px] max-w-6xl items-center gap-10 px-5 sm:px-8">
          <Wordmark />
          <nav className="hidden flex-1 items-center gap-7 lg:flex" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.label} to={n.to} className="text-[17px] text-ink transition-colors hover:text-accent">
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-5 lg:ml-0">
            <Link to="/#how" className="text-ink transition-colors hover:text-accent" aria-label="Help">
              <CircleHelp className="size-[21px]" strokeWidth={1.75} />
            </Link>
            <Link
              to={passportId ? `/passport/${passportId}` : '/#find'}
              className="flex items-center gap-1.5 text-[17px] text-ink transition-colors hover:text-accent"
            >
              <UserRound className="size-[21px]" strokeWidth={1.75} />
              <span className="hidden sm:inline">{passportId ? 'My passport' : 'Find passport'}</span>
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}

const FOOTER_COLS = [
  { title: 'Investors', links: [['Get verified', '/verify'], ['Ways to qualify', '/#qualify'], ['Find your passport', '/#find']] },
  { title: 'Funds & GPs', links: [['Accept passports', '/#funds'], ['Verification letters', '/#how'], ['API access', '/#funds']] },
  { title: 'Trust', links: [['Privacy & security', '/#privacy'], ['How we verify', '/#how'], ['Rule 506(c) overview', '/#qualify']] },
]

function Footer() {
  return (
    <footer className="relative z-10 mt-20 border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Wordmark className="h-8 w-auto" />
            <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-ink-3">One reusable accredited investor verification for every fund you invest in.</p>
          </div>
          {FOOTER_COLS.map((c) => (
            <div key={c.title}>
              <p className="text-[15px] font-semibold text-ink">{c.title}</p>
              <ul className="mt-3 space-y-2.5">
                {c.links.map(([label, to]) => (
                  <li key={label}>
                    <Link to={to} className="link text-[15px]">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col justify-between gap-3 border-t border-line pt-6 text-[13px] leading-relaxed text-ink-3 sm:flex-row">
          <p className="max-w-2xl">
            Verification under SEC Rule 506(c). Letters are signed by licensed attorneys. Your financial documents are never shared with funds, only your verification status. Not investment advice.
          </p>
          <p className="shrink-0 font-semibold tracking-wide uppercase">{isMock ? 'Sandbox · demo data' : `© ${new Date().getFullYear()} ${BRAND.name}`}</p>
        </div>
      </div>
    </footer>
  )
}

export default function App() {
  const location = useLocation()
  useEffect(() => {
    if (location.hash) {
      // Wait for the page transition to mount the target section.
      const t = setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 350)
      return () => clearTimeout(t)
    }
    window.scrollTo({ top: 0 })
  }, [location.pathname, location.hash])

  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.45, ease: motionEase }}>
      <div className="relative flex min-h-dvh flex-col">
        <Header />
        <main className="relative z-10 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4, transition: { duration: 0.18 } }}
            >
              <Routes location={location}>
                <Route path="/" element={<Landing />} />
                <Route path="/verify" element={<Verify />} />
                <Route path="/status/:id" element={<Status />} />
                <Route path="/passport/:id" element={<PassportPage />} />
                <Route path="/passport/:id/deals" element={<Deals />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </main>
        <Footer />
      </div>
      <Toaster
        position="bottom-center"
        toastOptions={{
          className: '!rounded-xl !border-line !bg-raised !text-ink !shadow-lift !font-sans',
        }}
      />
    </MotionConfig>
  )
}
