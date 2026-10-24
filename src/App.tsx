import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { Seal } from './components/ui/misc'
import { isMock } from './lib/api/client'
import { BRAND } from './lib/brand'
import { cn } from './lib/cn'
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

function Header() {
  const { passportId } = useSession()
  const link = ({ isActive }: { isActive: boolean }) =>
    cn('rounded-md px-3 py-1.5 text-[13.5px] transition-colors', isActive ? 'text-ink' : 'text-ink-3 hover:text-ink')
  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-30 border-b border-line/70 bg-paper/80 backdrop-blur-md backdrop-saturate-150">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5 text-ink">
          <Seal className="size-7 text-accent" />
          <span className="display text-[19px] leading-none">{BRAND.name}</span>
        </Link>
        <nav className="flex items-center gap-1">
          {passportId ? (
            <>
              <NavLink to={`/passport/${passportId}`} className={link}>
                Passport
              </NavLink>
              <NavLink to={`/passport/${passportId}/deals`} className={link}>
                Deals
              </NavLink>
            </>
          ) : (
            <NavLink to="/verify" className={link}>
              Get verified
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="relative z-10 mx-auto max-w-6xl px-5 pt-16 pb-10 text-[12.5px] leading-relaxed text-ink-3 sm:px-8">
      <div className="flex flex-col justify-between gap-4 border-t border-line pt-6 sm:flex-row">
        <p className="max-w-xl">
          Verification under SEC Rule 506(c). Letters are signed by licensed attorneys. Your financial documents are never shared with funds, only your verification status.
        </p>
        <p className="font-mono text-[11px] tracking-wider uppercase">{isMock ? 'Sandbox · demo data' : 'Production'}</p>
      </div>
    </footer>
  )
}

export default function App() {
  const location = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.45, ease: motionEase }}>
      <div className="grain relative flex min-h-dvh flex-col">
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
