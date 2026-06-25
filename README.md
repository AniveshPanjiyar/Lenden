# Lenden Collections

Payment collection, transfer, settlement, and daily closing app for Guest House, Margdarshak Library, and Margdarshak Shikshan Sansthan.

## Stack

- Next.js App Router
- Supabase Auth, Postgres, Storage, and RLS
- TypeScript
- PWA manifest for browser install/add-to-home-screen support

## Local Setup

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://zxewmhlgrjdiumoiaina.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_j7srvJgYdT9dEyqDwOW9mQ_-GSZDCfl
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

The service role key is required only on the Next.js server for the first-owner setup flow. The transaction, ledger, approval, settlement, staff, room, course, and referral mutations now run through the Supabase Edge Function at `supabase/functions/lenden-actions`.

Run locally:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Edge Function

Deploy the backend mutation function after linking the Supabase project:

```bash
supabase functions deploy lenden-actions --use-api
```

The app calls `https://<project-ref>.supabase.co/functions/v1/lenden-actions` with the signed-in user's JWT. Keep the function's JWT verification enabled. During local development, the Next.js server falls back to the same backend action logic if Supabase returns `404` because the function has not been deployed yet.

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
