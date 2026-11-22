# Transactions: collect, approve, edit, cancel

Code: handlers in `src/lib/lenden-actions.ts`; UI in `src/components/app-shell.tsx` (`PaymentForm`,
`ExpenseForm`, transaction cards, the pending-approvals page, `ClosingReviewDetail`); reads in
`src/lib/data.ts` and the `lenden_financial_activity` RPC.

"Owner" below means `primary_owner`. "Manager" means `co_owner`. `requireBusinessOwner` allows both
unless the text says Owner only.

## Collect a payment (`createPayment`)

- Opened with the **+** button. You choose the unit (Library, Course, Guest House, General) and the mode: **Cash, Online or Mixed**. Mixed takes a cash part and an online part, and the amount is their sum.
- **Library and course payments** are subscriptions:
  - Choose a new or existing student (the picker also finds inactive students).
  - Fill dates, time slot and hours, fee, paid, dues and advance.
  - An admission fee applies to new students, and to inactive students whose 45-day pause has run out. See `features/students.md`.
  - The overstay-dues panel (merge, settle or waive) appears when the student has due days.
- Staff need the unit permission (`collect_library` and so on) and must be assigned to that unit.
- New records start as `pending`. The cash part is held by the collector (`current_holder_id`).
- Idempotent: the form sends `_action_idempotency_key`, so retries do not create duplicates.

## Expenses (`createExpense`)

The **−** button. It needs the `add_expense` permission for the unit, an amount and a description of
at least 3 characters. An expense can be approved or rejected.

## Approval (`approveRecord`), from the pending-approvals page

- Collections can only be **approved**. They are never rejected; to remove one, use Delete (cancel).
- **Online money must be verified by the Owner** (or by support). A Manager may approve the cash part of a mixed payment (`payment_component=cash`).
- Mixed payments are approved per part: `cash_approval_status` and `online_approval_status`.
- Managers review Staff records and their own; Staff cannot approve.
- A payment with a pending transfer must have the transfer resolved first.
- Approval posts `ledger_entries` on the approval date (`cash_posted_on` / `online_posted_on`). The Closing tab and the "Approval" date basis use those dates.
- UX: an approved or rejected card stays on the pending page, marked done, until the user leaves the page.

## Edit (`updateRecord`, `updatePaymentDate`)

- Before approval: the creator, or a Manager for Staff records, can edit the amount, mode (including the cash/online split), and for student payments the fee and paid amount. Subscription amounts are then recalculated (`resyncSubscriptionAmounts`).
- No edit once any part is approved, or when the record has transfer history.
- **Payment date:** only the Owner can change it, even after approval.
- After approval, staff send a change or cancel request (`requestCancel` → `record_change_requests`), and the Owner or a Manager reviews it (`reviewChangeRequest`).

## Delete (`cancelRecord`)

Owner or Manager, with a reason required. This sets `record_status = cancelled`. A cancelled student
payment no longer defines the student's dates and amounts: the student snapshot is rebuilt from what
is still valid.

## Transfers between people

- **Cash handover** (`settleCash`): "Received from" or "Sent to" another member, dated (not in the future), per unit.
- **Unit cash transfer** (`requestTransfer` → `respondTransfer`): the receiver must accept.
- **Payment-level transfer** (`requestPaymentTransfer` → `respondPaymentTransfer`): moves custody of one transaction. It is switched off for staff (`STAFF_TRANSACTION_TRANSFERS_ENABLED = false` in `constants.ts`).
- **Refund of a student's advance** (`refundStudentAdvance`).
- **Sales agents:** read-only, except for incentives. The Owner records payouts (`createAgentSettlement`), which the agent accepts (`respondAgentSettlement`). Referral codes are managed with `saveReferral`.

## Transaction details sheet

Opened from a card's **⋯ → View details**. It shows the amount and split, who made it, the payment,
approval and created dates, the note and the transaction flow. For a **library or course payment**
(`library_student_id` / `course_student_id`) it also shows:
- **Student details:** name, roll number, phone (tap to call), current status (Active, Paused,
  Inactive) and seat. Phone and status are loaded through `/api/businesses/<id>/students/<source>/<studentId>`
  (the same `student-detail` query the Students drawer uses). Staff without that unit's permission
  get the payment snapshot only: name, roll and seat, with phone shown as "-".
- **Subscription:** this payment's start and end dates, timing, slot hours, fee, paid, dues and
  advance. If the student's subscription now ends on a different date, "Subscription now ends"
  shows that date too.

## Transaction card and chain

A card shows a cash lane and an online lane, each a chain of steps: collected, then approved or
verified, then transferred. **For online money the final approved step is blue**, not green.
Mixed cards show `₹cash + ₹online = ₹total`.
