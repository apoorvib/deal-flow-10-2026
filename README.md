# Dealflow Passport (frontend)

React UI that lets an LP get verified as an accredited investor once, then share a reusable passport with funds. Product research: [accredited-lp-verification-research.md](accredited-lp-verification-research.md).

## Run

```bash
npm install
npm run dev
```

Opens on http://localhost:5173. With no backend configured, the app uses a mock API that stores data in `localStorage`. Sandbox controls show up wherever there's an outcome to choose: ID check result, account balances, attorney sign-off. Use CRD numbers starting with `9` to see a license "not found" result.

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
| POST | `/verifications` | `ApplicationInput` | `Verification` |
| GET | `/verifications/:id` | | `Verification` |
| GET | `/passports/:id` | | `{ passport, active }` |
| POST | `/passports/lookup` | `{ email, letterRef }` | `{ passportId }` or `null` |
| GET | `/funds` | | `Fund[]` |
| GET | `/passports/:id/shares` | | `Share[]` |
| POST | `/passports/:id/shares` | `{ fundId }` | `Share` |
| DELETE | `/passports/:id/shares/:shareId` | | |

The backend owns every decision. `src/lib/rules.ts` mirrors the thresholds only to show early hints in forms. The UI never sends figures for a document; it references uploaded documents by id.

## Stack

Vite, React 19, TypeScript, Tailwind v4, Motion, NumberFlow, Radix primitives, Lucide, Sonner. The placeholder brand name lives in `src/lib/brand.ts`.
