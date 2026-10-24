import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { useEffect } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { ChevronDown, CircleHelp, LayoutDashboard, LogOut, Settings as SettingsIcon, ShieldCheck, UserRound, WalletCards } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import logo from './assets/savy-logo.png'
import { isMock } from './lib/api/client'
import { BRAND } from './lib/brand'
import { motionEase } from './lib/format'
import { RequireRole, homeFor, useAuth } from './lib/auth'
import { AdminBar } from './components/AdminBar'
import AdminConsole from './pages/AdminConsole'
import Deals from './pages/Deals'
import FindPassport from './pages/FindPassport'
import FundDashboard from './pages/FundDashboard'
import GetStarted from './pages/GetStarted'
import InviteLanding from './pages/InviteLanding'
import InvestorDashboard from './pages/InvestorDashboard'
import Landing from './pages/Landing'
import NotFound from './pages/NotFound'
import PassportPage from './pages/PassportPage'
import Settings from './pages/Settings'
import SignIn from './pages/SignIn'
import Status from './pages/Status'
import Verify from './pages/Verify'

const NAV = [
  { to: '/get-started', label: 'Get verified' },
  { to: '/#qualify', label: 'Ways to qualify' },
  { to: '/#how', label: 'How it works' },
  { to: '/#funds', label: 'For funds' },
  { to: '/#investors', label: 'For investors' },
]

function Wordmark({ className }: { className?: string }) {
  return (
    <Link to="/" className="shrink-0" aria-label={`${BRAND.name} home`}>
      <img src={logo} alt={BRAND.name} className={className ?? 'h-10 w-auto'} />
    </Link>
  )
}

function AccountMenu() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  if (!user) {
    return (
      <Link to="/signin" className="flex items-center gap-1.5 text-[17px] text-ink transition-colors hover:text-accent">
        <UserRound className="size-[21px]" strokeWidth={1.75} />
        <span className="hidden sm:inline">Sign in</span>
      </Link>
    )
  }
  const item = 'flex cursor-pointer items-center gap-2.5 rounded-[4px] px-3 py-2.5 text-[15px] text-ink outline-none data-[highlighted]:bg-surface'
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex items-center gap-1.5 rounded-[4px] text-[17px] text-ink transition-colors outline-none hover:text-accent">
        <span className="grid size-8 place-items-center rounded-full bg-accent text-[14px] font-semibold text-on-accent">{user.name[0]}</span>
        <span className="hidden sm:inline">{user.name.split(' ')[0]}</span>
        <ChevronDown className="size-4 text-ink-3" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={10} className="z-50 min-w-56 border border-line bg-raised p-1.5 shadow-lift">
          <DropdownMenu.Label className="px-3 pt-2 pb-2.5">
            <p className="text-[15px] font-semibold text-ink">{user.name}</p>
            <p className="text-[13px] text-ink-3">{user.email}</p>
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item className={item} onSelect={() => navigate(homeFor(user.role))}>
            <LayoutDashboard className="size-4 text-ink-3" /> Dashboard
          </DropdownMenu.Item>
          {user.role === 'investor' && user.passportId && (
            <DropdownMenu.Item className={item} onSelect={() => navigate(`/passport/${user.passportId}`)}>
              <WalletCards className="size-4 text-ink-3" /> My passport
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item className={item} onSelect={() => navigate('/settings')}>
            <SettingsIcon className="size-4 text-ink-3" /> Settings
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item className={item} onSelect={() => signOut().then(() => navigate('/'))}>
            <LogOut className="size-4 text-ink-3" /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function Header() {
  const { user } = useAuth()
  return (
    <header className="relative z-30">
      {/* Trust bar */}
      <div className="border-b border-line bg-paper">
        <p className="mx-auto flex h-11 max-w-6xl items-center justify-center gap-2 px-5 text-center text-[13px] text-ink-2 italic sm:px-8">
          <ShieldCheck className="size-4 shrink-0 text-accent not-italic" strokeWidth={2} />
          We take on the verification liability · Built for Rule 506(c)
        </p>
      </div>
      <div className="border-b border-line bg-paper">
        <div className="mx-auto flex h-[76px] max-w-6xl items-center gap-10 px-5 sm:px-8">
          <Wordmark />
          {/* Marketing links are for prospects; signed-in users get Dashboard and their account menu instead. */}
          <nav className={user ? 'flex-1' : 'hidden flex-1 items-center gap-7 lg:flex'} aria-label="Main">
            {!user && NAV.map((n) => (
              <NavLink key={n.label} to={n.to} className="text-[17px] text-ink transition-colors hover:text-accent">
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-5 lg:ml-0">
            <Link to="/#how" className="text-ink transition-colors hover:text-accent" aria-label="Help">
              <CircleHelp className="size-[21px]" strokeWidth={1.75} />
            </Link>
            {user && (
              <NavLink to={homeFor(user.role)} className="hidden text-[17px] text-ink transition-colors hover:text-accent md:inline">
                Dashboard
              </NavLink>
            )}
            <AccountMenu />
          </div>
        </div>
      </div>
    </header>
  )
}

const FOOTER_COLS = [
  { title: 'Investors', links: [['Get verified', '/get-started'], ['Ways to qualify', '/#qualify'], ['Sign in', '/signin'], ['Find your passport', '/find']] },
  { title: 'Funds & GPs', links: [['Fund dashboard', '/signin?as=issuer'], ['Accept passports', '/#funds'], ['Verification letters', '/#how'], ['API access', '/#funds']] },
  { title: 'Trust', links: [['Privacy & security', '/#privacy'], ['How we verify', '/#how'], ['Rule 506(c) overview', '/#qualify'], ['Admin console', '/admin']] },
]

function Footer() {
  return (
    <footer className="relative z-10 mt-20 border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Wordmark className="h-8 w-auto" />
            <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-ink-3">Proof without the paperwork. Accredited investor verification that gets 506(c) raises to close.</p>
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
            Savy does not provide legal, tax or investment advice. Consult counsel on how Rule 506(c) applies to your offering. Carta, AngelList, Affinity and Juniper Square are trademarks of their respective owners; Savy is not affiliated with or endorsed by them.
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
                <Route path="/get-started" element={<GetStarted />} />
                <Route path="/signin" element={<SignIn />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/invite/:token" element={<InviteLanding />} />
                <Route path="/admin" element={<AdminConsole />} />
                <Route
                  path="/dashboard"
                  element={
                    <RequireRole role="investor">
                      <InvestorDashboard />
                    </RequireRole>
                  }
                />
                <Route
                  path="/fund"
                  element={
                    <RequireRole role="issuer">
                      <FundDashboard />
                    </RequireRole>
                  }
                />
                <Route path="/find" element={<FindPassport />} />
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
        <AdminBar />
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
