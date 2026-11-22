# Team, roles and access

## Roles (`business_role`)

| Role | Shown as | Can |
|---|---|---|
| `primary_owner` | Owner | Everything: verify online money, change payment dates, record agent payouts, transfer ownership |
| `co_owner` | Manager | Approve, cancel and review **Staff** records and their own, within the units they manage (`business_manager_unit_scopes`). Waive student dues. Cannot verify online money |
| `staff` | Staff | Collect and add expenses in assigned units with the matching permissions. Edit their own records before approval. Request changes after approval |
| `sales_agent` | Sales Agent | Read-only, except incentives and referrals (`salesAgentAllowedActions` in `src/app/actions.ts`) |

**Staff permissions** (`constants.ts` → `permissionOptions`): `collect_guest_house`,
`collect_library`, `collect_course`, `collect_general`, `add_expense`, `transfer_money`. Staff also
need a unit assignment (`business_staff_unit_assignments`). Staff can see business activity across
their assigned units.

## Joining and businesses

- Sign up or log in with email and password, or Google (`/login`, `/signup`, `/auth/callback`). A forced password change uses `/change-password`.
- **Invitations:** the Owner invites by email (Resend), and the invitee accepts at `/invitations/[token]` or in Settings.
- **New business:** a user requests one (`business_creation_requests`), and a platform admin approves it in `/admin/businesses/requests`.
- The root page `/` sends a member to their last business `/b/[slug]`. Users with no business go to `/account`. Platform admins go to `/admin/businesses`.
- Ownership transfer happens in `/b/[slug]/manage` (`transfer_primary_ownership`). Platform recovery uses `platform_recover_primary_ownership`.

## Platform admin and support

- `profiles.platform_role = platform_admin`.
- **Support session** (`business_support_sessions`): an audited, read-mostly view of a business. Financial and work actions are blocked (`financialActions` and `workActions` in `src/app/actions.ts`).
- `audit_events` is append-only.

## Business settings (`/b/[slug]/manage`)

Users and permissions, units, courses (flat list, active flag, expired message), guest-house rooms,
library settings, WhatsApp message templates, and ownership.
