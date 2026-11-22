# Architecture

## Stack

- **Next.js 16.2 App Router** with React 19. This Next version has breaking changes: read
  `node_modules/next/dist/docs/` before writing routing, caching or server-action code. The
  middleware file is `src/proxy.ts`, not `middleware.ts`.
- **Supabase** for Auth, Postgres, Storage and RLS. There are no Edge Functions in the request path.
- **TanStack React Query** on the client, with view-only persistence to local storage.
- Tailwind 4 is installed, but most styling is hand-written CSS in `src/app/globals.css`.
- PWA: `src/app/manifest.ts` and `src/components/pwa-client.tsx` (service worker registration).
- Hosting: Vercel, functions in `bom1`. A push to `main` deploys.

## Request flow

```
Browser (app-shell.tsx, React Query)
  │  reads:  fetch /api/businesses/[businessId]/...   (header x-lenden-business-id)
  │  writes: Server Actions in src/app/actions.ts
  ▼
src/proxy.ts ── refreshes the Supabase session cookie; local JWT check (getClaims)
  ▼
Route handler / Server Action
  │  requireIdentity / requireUserProfile (src/lib/tenancy.ts)
  │  createClient({ businessId }) → Supabase client signed in AS THE USER,
  │  with x-lenden-business-id so RLS knows the tenant
  ▼
Postgres with RLS (private.requested_business_id(), can_read_business, ...)
```

Every read and write goes through the **user's own client**, so RLS is the real permission check.
The service-role client (`createAdminClient`, named `authAdmin` in actions) is limited to identity
lookups, invitations, setup and audited platform operations.

> In `src/lib/lenden-actions.ts` the user-scoped client is named `admin`. Despite the name it is
> **not** service role. A new table that actions write to needs INSERT/UPDATE policies for
> `authenticated`, or writes fail with 403. This happened with `student_status_events`.

## Where code lives

| Path | What |
|---|---|
| `src/components/app-shell.tsx` (~15k lines) | Almost the whole signed-in UI: tabs, dashboard, transactions, closing, students, drawers, forms, i18n dictionaries (English + Hindi), submit helpers |
| `src/app/globals.css` (~11k lines) | All styles. Colours are CSS variables on `:root` |
| `src/app/actions.ts` | Server Action wrappers (`xxxAction`) → `invokeLendenAction(name, formData)`. Sets `financialActions` and `workActions` (blocked in support mode) and `salesAgentAllowedActions` |
| `src/lib/lenden-actions.ts` | Server action handlers: `executeLendenAction`, one `withErrors("…", async (formData, { admin, authAdmin, profile, idempotencyKey }) => …)` per action, and the business rules |
| `src/lib/data.ts` | Read side: `loadOperational…` for dashboard, transactions and closing; student roster and detail; calls `lenden_*` RPCs |
| `src/lib/view-state.ts` | URL ⇄ filter state (`tab`, `tx*`, `dash*`, `closing*`, `student*` params) and the default filters |
| `src/lib/types.ts` | Shared row and DTO types |
| `src/lib/tenancy.ts` | `requireIdentity({ fullUser? })`, business context, membership and support resolution |
| `src/lib/transaction-postings.ts` | Cash and online value of a record, and the daily posting events behind closing |
| `src/lib/student-subscription-history.ts` | Subscription history grouping, `loadStudentStatusEvents` |
| `src/lib/message-templates.ts` | Default Hindi WhatsApp texts |
| `src/lib/contact-names.ts` | vCard building, phone normalisation, `sms:` links |
| `src/lib/constants.ts` | Unit labels, staff permissions, India timezone date helpers (`todayIso`, `dateIsoInTimeZone`) |
| `src/lib/supabase/{server,client,proxy}.ts` | Supabase clients |
| `src/app/api/businesses/[businessId]/…` | JSON read endpoints: `bootstrap`, `operational/[page]`, `dashboard`, `pending-approvals`, `library-students/[id]/payments`, `course-students/[id]/payments`, `students/[source]/[studentId]`, `student-collection`, `work`, `export`, record `attachment` |
| `src/app/b/[businessSlug]/page.tsx` | Business workspace (renders the app shell) |
| `src/app/b/[businessSlug]/manage/…` | Business settings: users, units, courses, rooms, message templates, ownership transfer |
| `src/app/settings`, `account`, `invitations`, `setup` | Profile, business list and requests, invitation accept, first-time setup |
| `src/app/admin/businesses/…` | Platform admin: approve business requests, users, support sessions, ownership recovery |
| `src/app/login`, `signup`, `auth/*`, `forgot-password`, `reset-password`, `change-password` | Auth flows (email and password, Google) |
| `supabase/migrations/` | SQL migrations; file names carry the applied version |

## Client patterns (app-shell.tsx)

- **Tabs** (`?tab=`): `home` (Dashboard), `payments` (Transactions), `closing`, `library_students` (Students), `work`, `settings`, `notifications`.
- **Forms** call `submitWith(event, action, setNotice, startTransition, reset, onSuccess)` or `submitAndClose(...)`. Both:
  - lock the form and put a spinner on the tapped button (`setFormSubmitting`, `data-loading` attribute),
  - add an idempotency key (`_action_idempotency_key`),
  - show the global saving overlay; its text comes from `actionSavingMessageKey(action, formData)`, otherwise from `mutationRefreshScope`,
  - send a toast through `setNotice`, and on success fire `mutationCommittedEvent` to refresh the matching React Query data.
- **Layers (z-index):** `.modal-layer` 100, `.action-lock` (saving overlay) 170, `.toast-stack` 175, `.student-drawer-layer` 160, `.image-crop-layer` 400. Toasts and the overlay must stay above every sheet or drawer, or the user sees "nothing happened".
- **React Query keys** all start with a kind and `cacheScope` (business and user): `["bootstrap"]`, `["operational", scope, page, params]`, `["pending-approvals"]`, `["student-roster", …]`, `["student-detail", …]` (staleTime 5 min), `["library-student-history" | "course-student-history", …]`, `["student-picker", …]`.
- **i18n:** `t("key")`. Dictionaries are near the top of `app-shell.tsx` (English block, then Hindi). Add both; check that the key is not already defined.
- Dates are India time: use `todayIso()` and `dateIsoInTimeZone()`, never `new Date().toISOString().slice(0, 10)`.

## Auth

- Email and password plus Google (Supabase Auth). The session lives in cookies, refreshed in `src/proxy.ts`.
- `supabase.auth.getClaims()` verifies the JWT locally (ES256) in the proxy and in `requireIdentity`; it is fast. Use `requireIdentity({ fullUser: true })` (calls `getUser`) only where fresh user data is needed (Settings).
- Business context comes from the URL slug or id, then membership (`business_memberships`), or a platform-admin **support session** (`business_support_sessions`). In support mode financial and work actions are blocked.

## RLS conventions

- Every tenant row has `business_id`. Policies check `business_id = (select private.requested_business_id())`, where the business id comes from the `x-lenden-business-id` request header.
- Read access uses `private.can_read_business` plus `private.has_business_unit_access(business, unit)`; writes use `private.can_collect_business(business, unit)` and similar.
- **Performance:** wrap these function calls in `(select …)` so Postgres runs them once per query instead of once per row. This took the students list from 1.26 s to 0.36 s. Most non-student tables still use the per-row form.

## Performance notes

- The operational API sends a `Server-Timing` header; read it in the browser's network panel.
- Closing and Transactions are prefetched in the background after the dashboard loads.
- The students roster runs its count queries in parallel, and only on page 0.
