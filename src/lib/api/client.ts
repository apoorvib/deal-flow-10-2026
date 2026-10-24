// The one interface the UI talks to. `httpApi` calls the backend team's service;
// `mockApi` stands in until it's live. Selected by VITE_API_BASE_URL.

import type {
  AccountLink,
  ApplicationInput,
  Fund,
  KycSession,
  LicenseType,
  ParsedDocument,
  Passport,
  Share,
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
  submitVerification(input: ApplicationInput): Promise<Verification>
  getVerification(id: string): Promise<Verification>
  /** Sandbox only: stands in for the attorney review queue. */
  signOff(id: string): Promise<Verification>
  getPassport(id: string): Promise<{ passport: Passport; active: boolean }>
  /** Returning-LP lookup by email + letter reference. Resolves null when nothing matches. */
  findPassport(email: string, letterRef: string): Promise<{ passportId: string } | null>
  listFunds(): Promise<Fund[]>
  listShares(passportId: string): Promise<Share[]>
  sharePassport(passportId: string, fundId: string): Promise<Share>
  revokeShare(passportId: string, shareId: string): Promise<void>
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
}

export const isMock = !BASE
export const api: Api = BASE ? httpApi : mockApi
