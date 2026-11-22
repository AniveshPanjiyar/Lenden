# Students: library and courses

Code: `app-shell.tsx` (the Students tab, the student drawer, `PaymentForm` for subscriptions,
`SubscriptionHistoryTimeline`); `lenden-actions.ts` (`saveLibraryStudent`, `saveCourseStudent`,
`setStudentStatus`, `waiveStudentDues`, `updateSubscription`, `refundStudentAdvance`,
`saveStudentPhoto`, and the overstay part of `createPayment`); `data.ts` (roster and detail);
`student-subscription-history.ts`.

## Roster (`tab=library_students`)

- Source picker: Library, or one course. Tabs: **Active**, **Live** (in the slot now), **Inactive** (paused first, then inactive).
- Search: roll number matches first. Sort by expiry, roll, name or seat, with ↑/↓ for direction.
- Filters: expired, or days remaining.
- Each card shows timing, roll and seat badges, an expiry badge (red or green), and WhatsApp and Call buttons.
- **Tools** menu: Save contacts and Send SMS (see `messaging-and-contacts.md`).
- **Library slots:** a full-time slot, or start and end times. Extra slots may not overlap (`extra_time_slots`). Hours are calculated.
- Photos (student, Aadhaar front and back) can be cropped and rotated, and save at once. A new student's photos are kept as drafts on the device.

## Subscriptions

- A student payment creates or extends a subscription (`subscription_key`) with start and end dates, fee, paid, dues and advance. The student row keeps a snapshot of the current subscription.
- Subscription history lives in the drawer's history tab (`lenden_student_subscription_history`, paged), together with the **Status history** (`student_status_events`).
- `updateSubscription` edits dates, slot and fee. Editing an amount resyncs paid, dues and advance across the subscription's payments.
- Returning an advance uses `refundStudentAdvance`.

## Pause, inactive, reactivate, and overstay dues

Rules come from `planStudentStatusChange` in `lenden-actions.ts`. These are owner decisions; see
`decisions.md`.

| Situation | Result |
|---|---|
| **Pause while the subscription still runs** | Scheduled. `pause_scheduled_on = end_date + 1`. The student stays active until then, and the 45-day window starts on that day. ⋯ → "Cancel scheduled pause" undoes it. Renewing also drops the schedule. |
| **Pause after the subscription ended** | Takes effect today (`paused_at`). The days from `end_date + 1` to today become **overstay dues**: `overstay_days`, `overstay_from`, `overstay_to`. |
| **Inactive** | Takes effect today (`inactive_at`). Same dues rule if the subscription had already ended. Only an active student creates new dues. |
| **Paused 45 days** | `lenden_expire_paused_students()` (runs when the roster loads) moves the student to inactive. An admission fee then applies when they return. |
| **Reactivate** | Blocked while `overstay_days > 0`. The dues must first be settled through **Add subscription**, or **waived**. |
| **Return after pause or inactive** | Add subscription: the new subscription starts on the day they return. No admission fee within 45 days of the pause; after that, the admission fee applies. |

**Settling dues** happens in `PaymentForm` (`overstay-dues-panel`, field `overstay_resolution`):
- **Merge:** the new subscription's start moves back by the due days, so they are paid for inside it.
- **Settle:** collect an amount (`overstay_amount`). The suggested amount is the fee per day × the due days; it is added to the fee.
- **Waive:** Owner or Manager only, with a reason required.
- After the payment: the dues are cleared, a `dues_merged`, `dues_settled` or `dues_waived` event is logged, and if the student was inactive and the new end date is today or later, a `reactivated` event too.

`waiveStudentDues` waives dues on their own, from the drawer (Owner or Manager, reason required).

**Drawer UI:**
- Chips: "Paused · N days remaining" (calendar days), "Pause from <date>", "N due days".
- ⋯ → Mark inactive or Reactivate opens a confirmation box at the top of the drawer. The box scrolls into view, with a reason input.
- Reactivate with dues shows "Add subscription" and the Waive form instead.
- After pause or inactive, a sheet offers to **notify the student on WhatsApp** with a prefilled message (`studentStatusWhatsAppMessage`).

**History events** (`student_status_events`): `pause_scheduled`, `pause_cancelled`, `paused`,
`inactive`, `reactivated`, `dues_recorded`, `dues_merged`, `dues_settled`, `dues_waived`. A failed
history insert is logged and does not fail the action (`recordStudentStatusEvents`).

## Late fine

Messages say ₹100 late fine after `end_date + 10` days (`{fine_date}`,
`studentLateFineGraceDays = 10`). This is **only text for now**: it is not added to the fee
automatically.
