# Handoff

Current state of Lenden. Keep this short and current. Last updated: 2026-11-22.

## What Lenden is

A mobile-first PWA for one owner (Anivesh) and staff to collect money, approve it, track who holds
the cash, and close each day, across business units: **Library** (Margdarshak Library),
**Courses** (Margdarshak Shikshan Sansthan), **Guest House** and **General**. It also keeps the
student rosters for the Library and Courses: subscriptions, pause and dues, reminders, and contacts.

- Production: https://lenden.margdarshakss.com (Vercel, functions in `bom1` Mumbai)
- Database: Supabase project `zxewmhlgrjdiumoiaina` (ap-south-1)
- Main business: "Margdarshakss production", id `4cb89f9f-0b0f-4ea6-8622-37f2b4d25b67`, slug `margdarshakssproduction-123`
- Owner profile: `7dbaec71-088e-4a3d-a7fe-160ffc6d4f0d`
- Repo: `main` branch; a push to `main` deploys to production.

## Standing rules

- **Language:** the owner writes in English, Hindi or Hinglish. Reply in the same language. App text has English and Hindi keys (see `i18n` in `src/components/app-shell.tsx`), so add both.
- **Production is live money data.** Ask before any write to production rows (payments, expenses, ledger, students), any migration, or any delete. Read-only SQL is fine.
- **When testing the UI on localhost against production data,** block server-action POSTs in the page (see `runbook.md`) so clicks do not change real records.
- **Secrets:** never print `SUPABASE_SERVICE_ROLE_KEY` or Resend keys in chat; open `.env.local` in the editor instead. `.env.local` is gitignored and must stay so. Never ask the owner to paste keys into chat.
- **Workflow:** implement → `tsc` + `eslint` → check at 390×844 on localhost:4000 (or test the function directly) → commit with the `Co-Authored-By` line → push `main` → wait for the Vercel status to be `success` (see `runbook.md`).
- Keep explanations simple; the owner is learning deployment. Show what was verified and what was not.

## Recent changes (newest first)

- 2026-11-25 Tap a profile photo to see it full size, with a cross button (also backdrop tap or Escape) to close it: student summary card, student drawer and the sidebar user profile. Component: `ZoomablePhoto` / `PhotoLightbox` in `app-shell.tsx`. Only shows when a real photo exists (not the initials fallback).
- 2026-11-23 Fee of a student subscription can be edited while any of its payments is still pending (transaction edit and subscription edit). Before, an earlier approved payment of the same subscription locked it ("The fee is locked once a payment…"). It now locks only when every payment is approved.
- 2026-11-23 New subscription default end date is one day before the same date next month (23 Nov → 22 Dec), via `subscriptionMonthEndIso` in `constants.ts`. It was 23 Dec before.
- 2026-11-22 Transaction details show the student (name, roll, phone, status, seat) and the payment's subscription for library and course payments.
- 2026-11-22 Dashboard **Cash in hand** always shows the current balance, whatever the date filter.
- 2026-11-22 Added `docs/` (this handoff system).
- 2026-11-19 Filter **Reset** clears filters only; views (Business / My activity, All / Collections / Expenses / Pending, Approval / Payment date) stay. The filter sheet no longer repeats the views.
- 2026-11-19 Cash / Online transaction filters include **mixed** payments.
- 2026-11-18 Student drawer actions now show progress and results: toasts and the saving overlay sit above the drawer. Per-action overlay text. Calendar-day pause countdown.
- 2026-11-18 Migration `20261117184213`: INSERT policy on `student_status_events` (it was missing, so history inserts returned 403).
- 2026-11-17 Detailed Hindi WhatsApp templates for expired, paused and inactive students; `{fine_date}` placeholder (end date + 10 days, ₹100 late fine).
- 2026-11-17 WhatsApp "notify student" sheet after pause or inactive.
- 2026-11-17 Pause rules, overstay dues (merge, settle or waive) and status history (migration `20261117173106`).
- 2026-11-11 Dashboard defaults to the Payment date basis.
- 2026-10-30 Performance: local JWT check (`getClaims`), student RLS evaluated once per query, parallel roster reads, background prefetch of Closing and Transactions, `Server-Timing` headers.
- 2026-10-30 Students Tools menu: save phone contacts (vCard) and free bulk SMS through the phone's SMS app.
- 2026-10-30 Button spinners and action overlay messages; approved cards stay until the pending page is left.
- 2026-10-27 Staff can edit a payment's fee and paid amount before approval.

## Open items and ideas (not started)

- The ₹100 late fine appears only in messages; it is not added to Add Subscription automatically.
- Apply the "RLS checks once per query" rewrite to the other ~19 tables (payments, expenses, ledger…). Needs owner approval.
- A keep-warm ping for cold starts was offered, not built.
- Google Contacts sync was planned and then dropped by the owner in favour of device vCard save (see `decisions.md`).
- `README.md` at the repo root is older; where it differs, these docs and the code win.
