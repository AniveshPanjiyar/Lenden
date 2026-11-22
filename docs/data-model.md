# Data model

Supabase Postgres, project `zxewmhlgrjdiumoiaina`. Every tenant table has `business_id` and RLS.
To see live columns, run SQL (read-only) or list `information_schema.columns`; this file gives the
meaning, not every column.

## Enums

| Enum | Values |
|---|---|
| `business_role` | `primary_owner` (shown as Owner), `co_owner` (Manager), `staff`, `sales_agent` |
| `payment_business` (unit) | `guest_house`, `library`, `course`, `general` |
| `payment_mode` | `cash`, `online`, `mixed` (mixed = `cash_collection` + `online_collection`) |
| `approval_status` | `pending`, `approved`, `reapproval_required`, `cancel_requested`, `cancelled`, `rejected` |
| `movement_type` / `movement_status` | `transfer`, `settlement` / `pending`, `accepted`, `rejected` |
| `membership_status` | `invited`, `active`, `suspended` |
| `platform_role` | `user`, `platform_admin` |
| `app_role` | legacy (`admin`, `owner`, `staff`, `sales_agent`) |

## Tables

**Tenancy and people**
- `businesses`: name, slug, timezone, `message_templates` (jsonb: `student_expired`, `student_active`, …), library settings.
- `business_modules`: which units a business uses.
- `profiles`: one per auth user (`id = auth.uid()`), full_name, avatar.
- `business_memberships`: user ↔ business, `business_role`, status.
- `business_staff_unit_assignments`, `business_manager_unit_scopes`: which units a staff member or manager works in.
- `business_member_permissions`, `staff_permissions`: fine-grained staff permissions (`collect_library`, `add_expense`, `transfer_money`, …).
- `business_invitations`, `business_creation_requests`, `business_support_sessions` (platform-admin support access, audited).
- `audit_events`: append-only audit log (mutation blocked by a trigger).

**Money**
- `payments`: collections. Key columns:
  - `mode`, `amount`, `cash_collection`, `online_collection`
  - `approval_status`, plus per-part `cash_approval_status` and `online_approval_status`
  - `record_status` (`active` or `cancelled`)
  - `collected_by`, `current_holder_id` / `assigned_profile_id` (cash custody)
  - `payment_date`, `cash_posted_on` / `online_posted_on` (approval date per part)
  - student fields: `roll_number`, `customer_name`, `start_date`, `end_date`, `slot_hours`, `fee_amount`, `paid_amount`, `dues_amount`, `advance_amount`, `subscription_key`
  - `metadata` (jsonb; for example `overstaySettlement`)
- `expenses`: spending (`spent_by`, `mode`, `approval_status`, `posted_on`).
- `ledger_entries`: per-profile postings created on approval (`source_type`: payment, expense, transfer, settlement, adjustment).
- `money_movements`: cash handovers (`transfer`) and settlements between members, with `pending/accepted/rejected`. A payment-level transfer has `payment_id`.
- `record_change_requests`: staff requests to edit or cancel an approved record, reviewed by the owner.
- `agent_settlements`, `referral_codes`: sales-agent incentives and referral coupons.
- `documents`: attachments (Storage path `<business_id>/<entity>/<record_id>/…`).

**Students**
- `library_students`:
  - identity: roll_number, student_name, phone, address, aadhar (+ photos), photo_url, seat, locker
  - schedule: start/end time, `slot_hours`, `extra_time_slots`
  - current subscription snapshot: `subscription_start_date/end_date`, fee, paid, dues, advance, `current_subscription_key`, `last_payment_id`
  - status: `active`, `paused_at`, `inactive_at`, `placeholder`, `status_note`
  - pause and dues: `pause_scheduled_on`, `overstay_days`, `overstay_from`, `overstay_to`
- `library_student_subscription_events`: library subscription and status timeline (`status_change` and others).
- `course_students`: the same idea per course (`course_id`), with the same pause and dues columns.
- `courses`: flat list of courses, `expired_message_template`, active flag.
- `student_status_events`: pause, inactive, reactivation and dues history for both student types.
  - `event_type` values: `pause_scheduled`, `pause_cancelled`, `paused`, `inactive`, `reactivated`, `dues_recorded`, `dues_merged`, `dues_settled`, `dues_waived`.
  - Also stores `days`, `from_date`, `to_date`, `amount`, `note`, `payment_id` and `created_by`.
  - Policies allow SELECT and INSERT only, no UPDATE or DELETE.

**Other**
- `rooms` (guest house), `work_attendance`, `work_tasks`, `work_updates`, `app_notifications`, `app_action_requests`.

## RPCs used by the app (`supabase.rpc(...)`)

| RPC | Used for |
|---|---|
| `lenden_financial_activity` | Transactions list (role-scoped, personal or business lens) |
| `lenden_dashboard_summary`, `lenden_dashboard_cash_position`, `lenden_dashboard_business_status` | Dashboard cards |
| `lenden_current_cash_balances`, `lenden_profile_cash_balance_at` | Cash in hand, custody |
| `lenden_closing_summaries` | Closing tab |
| `lenden_student_subscription_history` | Student subscription history (paged) |
| `lenden_expire_paused_students` | Runs on roster load: starts scheduled pauses, expires 45-day pauses to inactive, drops schedules of renewed students; logs events |
| `lenden_auto_checkout` | Work: auto check-out at 7 PM |
| `lenden_respond_payment_transfer` | Accept or reject a payment-level transfer |
| `accept_business_invitation`, `decline_business_invitation`, `grant_business_access_scoped`, `replace_staff_permissions`, `transfer_primary_ownership`, `create_business_with_owner`, `approve/reject/cancel_business_creation_request`, `platform_recover_primary_ownership` | Membership and admin |

Permission helpers in schema `private` / `public`: `requested_business_id`, `can_read_business`,
`can_collect_business`, `has_business_unit_access`, `has_active_support_session`, `is_ownerish`,
`can_view_staff_cash`, and others.

## Migration workflow

1. Write SQL in `supabase/migrations/<timestamp>_<name>.sql`. Make it re-runnable (`if not exists`, `drop policy if exists`).
2. **Ask the owner before applying to production.**
3. Apply with the Supabase MCP `apply_migration` (or `supabase db push`).
4. Read the version it got: `select version, name from supabase_migrations.schema_migrations order by version desc limit 1;`. Rename the local file to that version so the repo matches the database.
5. If actions will write to a new table, add policies for `authenticated` (see architecture.md).
6. Test policies in a transaction that rolls back:
   ```sql
   begin;
   select set_config('request.headers', '{"x-lenden-business-id":"<business id>"}', true);
   select set_config('request.jwt.claims', '{"sub":"<profile id>","role":"authenticated"}', true);
   set local role authenticated;
   -- statements to test
   rollback;
   ```
