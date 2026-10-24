// Remembers this browser's latest passport / verification so the header can link back to them.
// Per-viewer convenience only; the backend is the record.

const KEY = 'lp-passport.session.v1'

interface Session {
  passportId: string | null
  verificationId: string | null
}

export function getSession(): Session {
  try {
    return { passportId: null, verificationId: null, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { passportId: null, verificationId: null }
  }
}

export function setSession(patch: Partial<Session>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...getSession(), ...patch }))
    window.dispatchEvent(new Event('lp-session'))
  } catch {
    /* storage unavailable */
  }
}
