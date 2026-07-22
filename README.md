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

- Entry routing: `src/app/page.tsx` sends members to their last active `/b/[businessSlug]`; users without active access go to the global `/account` hub, and platform administrators without a membership go to `/admin/businesses`.
- Business reads: `/api/businesses/[businessId]/bootstrap` and `/api/businesses/[businessId]/dashboard` validate membership/support access and include the business in every React Query cache key.
- Mutations: forms call Server Actions in `src/app/actions.ts`; those actions resolve the business from the authenticated request URL, verify membership/support access, and use an authenticated tenant client so RLS remains active.
- Auth/session refresh: `src/proxy.ts` runs the Supabase cookie refresh helper before application routes.
- Database/storage: every operational row has `business_id`; tenant files use `<business_id>/<entity>/<record_id>/...`; storage and table policies enforce the same boundary.
- Elevated client: the service role is limited to exact-email identity resolution, invitation delivery metadata, initial setup, and audited platform operations. Business Owners never create or reset another user&apos;s credentials.

## Local Setup

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://zxewmhlgrjdiumoiaina.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_j7srvJgYdT9dEyqDwOW9mQ_-GSZDCfl
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
APP_BASE_URL=http://localhost:4000
RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL=Lenden <access@your-verified-domain.example>
```

The service role key and Resend key are server-only. Configure Google in Supabase Auth and allow `/auth/callback` for local and production URLs. Financial mutations use the signed-in user&apos;s authenticated Supabase client and remain subject to RLS.

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

With the service role key set, `/setup` remains a deployment-only bootstrap for the first platform administrator. After bootstrap, every user signs up with email/password or Google. Platform administrators approve business requests or assign a registered account as the initial Owner; Owners and Managers grant business-scoped access by email without managing credentials.

## Implemented Workflows

- Email/password and Google signup/login, email confirmation, and self-service password recovery
- Global Account hub for personal security, cross-business access, invitations, and business requests
- Global platform-admin access plus per-business Owner, Manager, Staff, and Sales Agent roles
- Audited 30-minute configuration-only support sessions that reject financial mutations
- Exact-email access grants for registered users and 30-day Resend invitations for unregistered emails
- User-owned passwords; legacy forced-password replacement remains only for already provisioned accounts
- Atomic ownership transfer and audited platform recovery
- Business payment forms for room booking, library subscription, course payment, and general payment
- Optional payment/expense photo upload to Supabase Storage
- Expense entry with pending approval and immediate cash balance effect
- Staff-to-staff cash transfer with receiver acceptance
- Owner settlement by amount
- Daily closing screen calculated from all previous unsettled ledger entries
- Staff permissions by collection type
- Owner-only settings for rooms, courses, skill courses, and referral codes
- Cash settlement chain from Staff to Manager to Owner, with Owner funding transfers to Managers or Staff
- Automatic referral-code deactivation when its sales-agent membership is suspended
- Referral code linkage for sales-agent visibility
- Owner approval/rejection and cancel request review
- CSV export for owner reports

## Verification

```bash
npm run lint
npm run build
```
