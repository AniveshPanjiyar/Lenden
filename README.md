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

- Entry routing: `src/app/page.tsx` sends every business member, including a platform administrator who owns a business, to their last active `/b/[businessSlug]`; administrators without a membership go to `/admin/businesses`.
- Business reads: `/api/businesses/[businessId]/bootstrap` and `/api/businesses/[businessId]/dashboard` validate membership/support access and include the business in every React Query cache key.
- Mutations: forms call Server Actions in `src/app/actions.ts`; those actions resolve the business from the authenticated request URL, verify membership/support access, and use an authenticated tenant client so RLS remains active.
- Auth/session refresh: `src/proxy.ts` runs the Supabase cookie refresh helper before application routes.
- Database/storage: every operational row has `business_id`; tenant files use `<business_id>/<entity>/<record_id>/...`; storage and table policies enforce the same boundary.
- Elevated client: the service role is limited to direct account provisioning/recovery, initial setup, and audited platform operations.

## Local Setup

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://zxewmhlgrjdiumoiaina.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_j7srvJgYdT9dEyqDwOW9mQ_-GSZDCfl
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

The service role key is required only on the Next.js server for first-owner setup, direct account provisioning/recovery, and platform operations. Financial mutations use the signed-in user's authenticated Supabase client and remain subject to RLS.

Run locally:

```bash
npm install
npm run dev
```

Open `http://localhost:4000`.

## Database Migration

Apply the Supabase migrations before deploying the matching application build. The multi-business rollout is additive: it creates the tenant/membership tables, backfills the “Lenden Legacy Business,” then enables tenant constraints and RLS.

```bash
supabase db push
supabase test db
```

This app no longer ships a Supabase Edge Function. Keep mutation logic in Next.js Server Actions unless a new deployment boundary is deliberately introduced.

## First Owner

With the service role key set, open `/setup` and create the first platform administrator/primary owner. Platform administrators create tenants and generate primary-owner credentials at `/admin/businesses`; primary owners manage modules, credentials, and ownership, while co-owners can manage staff and sales-agent access.

## Implemented Workflows

- Email/password login, no public signup screen
- Global platform-admin access plus per-business primary owner, co-owner, staff, and sales-agent roles
- Audited 30-minute configuration-only support sessions that reject financial mutations
- Direct temporary-password provisioning, owner-managed member password resets, and forced password replacement
- Atomic primary-ownership transfer and audited platform recovery
- Business payment forms for room booking, library subscription, course payment, and general payment
- Optional payment/expense photo upload to Supabase Storage
- Expense entry with pending approval and immediate cash balance effect
- Staff-to-staff cash transfer with receiver acceptance
- Owner settlement by amount
- Daily closing screen calculated from all previous unsettled ledger entries
- Staff permissions by collection type
- Primary-owner settings for rooms, courses, skill courses, and referral codes
- Owner-to-co-owner cash movement, including the reverse direction
- Automatic referral-code deactivation when its sales-agent membership is suspended
- Referral code linkage for sales-agent visibility
- Owner approval/rejection and cancel request review
- CSV export for owner reports

## Verification

```bash
npm run lint
npm run build
```
