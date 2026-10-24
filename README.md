# Savy (frontend)

React UI that lets an LP get verified as an accredited investor once, then share a reusable passport with funds. Product research: [plan.md](plan.md).

## Run

```bash
npm install
npm run dev
```

Opens on http://localhost:5173. With no backend configured, the app uses a mock API that stores data in `localStorage`. **Showcase mode:** open `/admin` (also linked in the footer) and click **Enter showcase**; with a real backend, admins sign in at `/signin?as=admin`. A bar at the bottom of every page then switches between Console, Investor (Jane), Fund (Meridian) and Visitor, and the console jumps to any screen, including each verification outcome. Sandbox controls show up wherever there's an outcome to choose: ID check result, account balances, attorney sign-off. Use CRD numbers starting with `9` to see a license "not found" result.

## Backend contract

- **Types:** `src/lib/types.ts` defines every entity the UI sends or receives. Treat it as the API contract.
- **Endpoints:** `src/lib/api/client.ts` lists each call (`Api` interface) and its HTTP route (`httpApi`).
- **Switching to a real backend:** set `VITE_API_BASE_URL` (for example `https://api.example.com/v1`) in `.env.local`. Requests send cookies (`credentials: 'include'`), and errors are expected as `{ "error": "message" }`.

| Method | Route | Body | Returns |
|---|---|---|---|
| POST | `/kyc` | `{ legalName }` | `KycSession` |
| POST | `/account-links` | `{}` | `AccountLink` |
| POST | `/documents` | multipart `file` | `ParsedDocument` |
| POST | `/licenses/check` | `{ type, crd }` | `{ found, name }` |
| POST | `/advisers/check` | `{ fileNumber }` | `{ found, name }` |
| POST | `/verifications` | `ApplicationInput` | `Verification` |
| GET | `/verifications/:id` | | `Verification` |
| GET | `/passports/:id` | | `{ passport, active }` |
| POST | `/passports/lookup` | `{ email, letterRef }` | `{ passportId }` or `null` |
| GET | `/funds` | | `Fund[]` |
| GET | `/passports/:id/shares` | | `Share[]` |
| POST | `/passports/:id/shares` | `{ fundId }` | `Share` |
| DELETE | `/passports/:id/shares/:shareId` | | |
| POST | `/auth/login` | `{ email, password, role }` | `User` (sets session cookie; email is confirmed during onboarding) |
| POST | `/auth/register` | `{ name, email, password, role }` | `User` (sets session cookie) |
| GET | `/me` | | `User`, or 401 when signed out |
| POST | `/auth/signout` | | |
| GET | `/me/investments` | | `Investment[]` |
| GET / POST | `/me/funding-accounts` | `{ institution }` | `FundingAccount[]` / `FundingAccount` (bank link via the payments processor) |
| DELETE | `/me/funding-accounts/:id` | | |
| POST | `/me/investments/:id/fund` | `{ accountId }` | `Investment` (status `funded`) |
| GET | `/issuer/integrations` | | `Integration[]` (Carta, AngelList, Affinity, Juniper Square) |
| POST | `/issuer/integrations/:id/connect` · `/disconnect` | | `Integration` (OAuth with the platform) |
| PATCH | `/issuer/integrations/:id` | `{ pushCleared?, importContacts? }` | `Integration` |
| GET / PATCH | `/me/settings` | `Partial<UserSettings>` | `UserSettings` |
| POST | `/me/password` | `{ current, next }` | |
| GET | `/issuer/overview` | | `IssuerOverview` (fund, invite link, `IncomingInvestor[]`) |
| POST | `/issuer/investors/:id/nudge` | | |
| POST | `/sales/quote` | `QuoteRequest` | (Enterprise enquiry, public) |
| POST | `/issuer/invites` | `{ invites: InviteRequest[] }` | `{ invites: Invite[] }` (emails each LP a link) |
| GET | `/invites/:token` | | `InviteView` (public; marks opened) |
| POST | `/invites/:token/accept` | | `InviteAcceptance` (signs the LP in, creating the account if needed) |

**Invite flow.** The emailed link is the LP's credential: following it signs them in (or creates their account). If they already hold a valid passport, the backend shares it with the inviting fund right away (`outcome: 'shared'`). Otherwise (`outcome: 'verify'`) they go through onboarding, and the application carries `inviteToken`; on approval the backend shares the new passport with that fund. The client never shares on its own.
| GET | `/admin/context` | | `AdminContext`, or 401/403 |
| POST | `/admin/switch` | `{ as: 'admin' \| 'investor' \| 'issuer' \| 'visitor' }` | `AdminContext` |
| POST | `/admin/cases` | `{ decision }` | `Verification` (demo case) |
| POST | `/admin/reset` | | `AdminContext` |

`IncomingInvestor` is what a fund sees about an investor: status, basis, dates, letter reference and check outcomes (`pass`/`warn`/`fail`). It must never carry balances, income or net worth.

The backend routes are implemented in `api/main.py`. KYC, account linking, adviser lookup,
funding account linking, and platform integrations currently use deterministic sandbox/state
adapters. Move `DEMO_MODE=live`, provide production provider credentials, set `APP_ORIGIN`,
`APP_ORIGINS`, `COOKIE_SECURE=1`, and deploy the API behind HTTPS before accepting real traffic.

Authentication uses Supabase PostgreSQL. Install backend packages from `requirements.txt`, configure the server-only `DATABASE_URL` in `.env` (never a `VITE_` variable), set `COOKIE_SECURE=1` behind HTTPS, apply `api/migrations/001_auth.sql`, and run FastAPI. Use the URI from Supabase Connect → Direct → Session pooler. The backend requires SSL. Marketplace listing does not host the DB. Password reset, email verification, and MFA are not in this MVP.

The backend owns every decision. `src/lib/rules.ts` mirrors the thresholds only to show early hints in forms. The UI never sends figures for a document; it references uploaded documents by id.

## Stack

Vite, React 19, TypeScript, Tailwind v4, Motion, NumberFlow, Radix primitives, Lucide, Sonner. Brand name lives in `src/lib/brand.ts`; logo files (transparent PNGs, plus a reversed version for dark backgrounds) are in `src/assets/`.
