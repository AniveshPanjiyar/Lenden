# Lenden Collections

Payment collection, transfer, settlement, and daily closing app for Guest House, Margdarshak Library, and Margdarshak Shikshan Sansthan.

## Stack

- Next.js App Router
- Supabase Auth, Postgres, Storage, and RLS
- TypeScript
- React Query client cache with view-only persistence
- PWA manifest and service worker for browser install/add-to-home-screen support

## Runtime Architecture

Lenden runs as a Next.js backend-for-frontend over Supabase. There is no active Supabase Edge Function in the request path.

- Initial page render: `src/app/page.tsx` loads authenticated data on the server and renders `AppShell`.
- Client refreshes: `src/app/api/app/bootstrap/route.ts` and `src/app/api/app/dashboard/route.ts` expose focused GET payloads for React Query.
- Mutations: forms call Server Actions in `src/app/actions.ts`; those actions validate the signed-in profile and execute business logic in `src/lib/lenden-actions.ts`.
- Auth/session refresh: `src/proxy.ts` runs the Supabase cookie refresh helper before application routes.
- Database/storage: Supabase owns Auth, Postgres tables, RLS policies, the private `receipts` bucket, and the `lenden_closing_summaries(date)` RPC.

## Local Setup

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://zxewmhlgrjdiumoiaina.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_j7srvJgYdT9dEyqDwOW9mQ_-GSZDCfl
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

The service role key is required only on the Next.js server for the first-owner setup flow and direct server action execution. Transaction, ledger, approval, settlement, staff, room, course, and referral mutations run directly from the Next.js server to Supabase.

Run locally:

```bash
npm install
npm run dev
```

Open `http://localhost:4000`.

## Database Migration

Apply the Supabase migrations before deploying a fresh environment. The latest performance migration adds dashboard indexes and the `public.lenden_closing_summaries(date)` RPC used by the fast dashboard path.

```bash
supabase db push
```

This app no longer ships a Supabase Edge Function. Keep mutation logic in Next.js Server Actions unless a new deployment boundary is deliberately introduced.

## First Owner

With the service role key set, open `/setup` and create the first admin/owner. After that, use the Settings tab to add staff, owners, and sales agents.

## Implemented Workflows

- Email/password login, no public signup screen
- Role-aware dashboard for admin, owner, staff, and sales agent
- Business payment forms for room booking, library subscription, course payment, and general payment
- Optional payment/expense photo upload to Supabase Storage
- Expense entry with pending approval and immediate cash balance effect
- Staff-to-staff cash transfer with receiver acceptance
- Owner settlement by amount
- Daily closing screen calculated from all previous unsettled ledger entries
- Staff permissions by collection type
- Settings for rooms, courses, skill courses, and referral codes
- Referral code linkage for sales-agent visibility
- Owner approval/rejection and cancel request review
- CSV export for owner reports

## Verification

```bash
npm run lint
npm run build
```
