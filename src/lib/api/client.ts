// The one interface the UI talks to. `httpApi` calls the backend team's service;
// `mockApi` stands in until it's live. Selected by VITE_API_BASE_URL.

import type {
  AccountLink,
  ApplicationInput,
  Fund,
  FundingAccount,
  Integration,
  IntegrationId,
  Investment,
  Invite,
  InviteAcceptance,
  InviteRequest,
  InviteView,
  IssuerOverview,
  KycSession,
  LicenseType,
  ParsedDocument,
  Passport,
  AdminContext,
  AdminView,
  Decision,
  Role,
  Share,
  User,
  UserSettings,
  Verification,
} from '../types'
import { ApiError } from './errors'
import { mockApi } from './mock'

export type KycScenario = 'clean' | 'ofac' | 'fail'
export type AccountScenario = 'high' | 'low'

export interface Api {
  startKyc(legalName: string, scenario?: KycScenario): Promise<KycSession>
  linkAccounts(scenario?: AccountScenario): Promise<AccountLink>
  uploadDocument(file: File, holderHint: string): Promise<ParsedDocument>
  checkLicense(type: LicenseType, crd: string): Promise<{ found: boolean; name: string | null }>
  /** Looks the adviser up on the SEC's IAPD by SEC file number or CRD. */
  checkAdviser(fileNumber: string): Promise<{ found: boolean; name: string | null }>
  submitVerification(input: ApplicationInput): Promise<Verification>
  getVerification(id: string): Promise<Verification>
  /** Sandbox only: completes a case in the review queue (the backend does this itself). */
  signOff(id: string): Promise<Verification>
  getPassport(id: string): Promise<{ passport: Passport; active: boolean }>
  /** Returning-LP lookup by email + letter reference. Resolves null when nothing matches. */
  findPassport(email: string, letterRef: string): Promise<{ passportId: string } | null>
  listFunds(): Promise<Fund[]>
  listShares(passportId: string): Promise<Share[]>
  sharePassport(passportId: string, fundId: string): Promise<Share>
  revokeShare(passportId: string, shareId: string): Promise<void>

  // Email/password auth; backend owns the HttpOnly session cookie.
  register(name: string, email: string, password: string, role: Role): Promise<User>
  signIn(email: string, password: string, role: Role): Promise<User>
  me(): Promise<User | null>
  signOut(): Promise<void>
  getSettings(): Promise<UserSettings>
  updateSettings(patch: Partial<Omit<UserSettings, 'email'>>): Promise<UserSettings>
  changePassword(current: string, next: string): Promise<void>

  // Investor dashboard
  listInvestments(): Promise<Investment[]>
  listFundingAccounts(): Promise<FundingAccount[]>
  /** Links a bank through the payments processor (read + debit authorization). */
  connectFundingAccount(institution: string): Promise<FundingAccount>
  removeFundingAccount(id: string): Promise<void>
  /** Sends the commitment from a funding account; the investment moves to `funded`. */
  fundInvestment(investmentId: string, accountId: string): Promise<Investment>

  // Fund platform integrations
  listIntegrations(): Promise<Integration[]>
  connectIntegration(id: IntegrationId): Promise<Integration>
  disconnectIntegration(id: IntegrationId): Promise<Integration>
  updateIntegration(id: IntegrationId, patch: Partial<Pick<Integration, 'pushCleared' | 'importContacts'>>): Promise<Integration>

  // Receiving-party (fund) dashboard
  getIssuerOverview(): Promise<IssuerOverview>
  /** Re-sends the verification link to an investor who hasn't cleared yet. */
  nudgeInvestor(investorId: string): Promise<void>
  /** Emails each address a link to verify for this fund. The sandbox also returns each link, since no email is sent. */
  inviteInvestors(rows: InviteRequest[]): Promise<{ invites: Invite[]; devLinks?: Record<string, string> }>

  // Invite links (public; the token is the credential)
  getInvite(token: string): Promise<InviteView>
  acceptInvite(token: string): Promise<InviteAcceptance>

  // Admin showcase. The backend must restrict these to staff accounts.
  /** The admin session behind the current view, or null when no admin is signed in. */
  adminContext(): Promise<AdminContext | null>
  /** Switch the current view to a demo persona (or signed-out visitor) without ending the admin session. */
  adminSwitch(as: AdminView): Promise<AdminContext>
  /** Creates a fresh demo verification that lands in `decision`, for showing each outcome screen. */
  adminCreateCase(decision: Decision): Promise<Verification>
  /** Wipes demo data and re-seeds the personas. */
  adminReset(): Promise<AdminContext>
}

export { ApiError }

const BASE = import.meta.env.VITE_API_BASE_URL as string | undefined

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { 'Content-Type': 'application/json', ...init?.headers },
    credentials: 'include',
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string }).error ?? res.statusText)
  return body as T
}

const post = <T>(path: string, data?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(data ?? {}) })

const httpApi: Api = {
  startKyc: (legalName, scenario) => post('/kyc', { legalName, scenario }),
  linkAccounts: (scenario) => post('/account-links', { scenario }),
  uploadDocument: (file) => {
    const form = new FormData()
    form.append('file', file)
    return request('/documents', { method: 'POST', body: form })
  },
  checkLicense: (type, crd) => post('/licenses/check', { type, crd }),
  checkAdviser: (fileNumber) => post('/advisers/check', { fileNumber }),
  submitVerification: (input) => post('/verifications', input),
  getVerification: (id) => request(`/verifications/${id}`),
  signOff: (id) => post(`/verifications/${id}/sign-off`),
  getPassport: (id) => request(`/passports/${id}`),
  findPassport: (email, letterRef) => post('/passports/lookup', { email, letterRef }),
  listFunds: () => request('/funds'),
  listShares: (pid) => request(`/passports/${pid}/shares`),
  sharePassport: (pid, fundId) => post(`/passports/${pid}/shares`, { fundId }),
  revokeShare: async (pid, sid) => {
    await request(`/passports/${pid}/shares/${sid}`, { method: 'DELETE' })
  },
  register: (name, email, password, role) => post('/auth/register', { name, email, password, role }),
  signIn: (email, password, role) => post('/auth/login', { email, password, role }),
  me: () => request<User | null>('/me').catch((e) => (e instanceof ApiError && e.status === 401 ? null : Promise.reject(e))),
  signOut: async () => {
    await post('/auth/logout')
  },
  getSettings: () => request('/me/settings'),
  updateSettings: (patch) => request('/me/settings', { method: 'PATCH', body: JSON.stringify(patch) }),
  changePassword: async (current, next) => {
    await post('/me/password', { current, next })
  },
  listInvestments: () => request('/me/investments'),
  listFundingAccounts: () => request('/me/funding-accounts'),
  connectFundingAccount: (institution) => post('/me/funding-accounts', { institution }),
  removeFundingAccount: async (id) => {
    await request(`/me/funding-accounts/${id}`, { method: 'DELETE' })
  },
  fundInvestment: (investmentId, accountId) => post(`/me/investments/${investmentId}/fund`, { accountId }),
  listIntegrations: () => request('/issuer/integrations'),
  connectIntegration: (id) => post(`/issuer/integrations/${id}/connect`),
  disconnectIntegration: (id) => post(`/issuer/integrations/${id}/disconnect`),
  updateIntegration: (id, patch) => request(`/issuer/integrations/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  getIssuerOverview: () => request('/issuer/overview'),
  nudgeInvestor: async (id) => {
    await post(`/issuer/investors/${id}/nudge`)
  },
  inviteInvestors: (rows) => post('/issuer/invites', { invites: rows }),
  getInvite: (token) => request(`/invites/${token}`),
  acceptInvite: (token) => post(`/invites/${token}/accept`),
  adminContext: () => request<AdminContext | null>('/admin/context').catch((e) => (e instanceof ApiError && (e.status === 401 || e.status === 403) ? null : Promise.reject(e))),
  adminSwitch: (as) => post('/admin/switch', { as }),
  adminCreateCase: (decision) => post('/admin/cases', { decision }),
  adminReset: () => post('/admin/reset'),
}

export const isMock = !BASE
export const api: Api = BASE ? httpApi : mockApi
