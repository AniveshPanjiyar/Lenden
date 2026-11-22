# Product decisions

Rules the owner chose. Do not change one without asking. Newest first.

| Date | Decision |
|---|---|
| 2026-11-22 | Dashboard **Cash in hand** is always the current cash in hand, whatever the date filter. |
| 2026-11-19 | Filter **Reset** resets filters only: date, person, type, payment mode and unit. Business / My activity, the direction tabs and the Approval / Payment date basis are **views**; they are not filters and are never reset. |
| 2026-11-19 | The Cash and Online mode filters include **mixed** payments. Mixed shows mixed only. |
| 2026-11-17 | Expired-student WhatsApp messages are detailed (Hindi): expiry date; inform us to Pause (45 days, no admission fee) or Inactive; days until the pause or inactive become dues; ₹100 late fine after end date + 10 days, with that date written out. Active students' message stays **blank**. |
| 2026-11-17 | Offer a WhatsApp notice to the student after a pause or inactive. |
| 2026-11-17 | Pause before expiry starts the **day after the subscription ends**, and the 45-day window starts then. A pause or inactive after expiry turns `end+1 … today` into **dues**. Reactivation needs the dues settled or waived. |
| 2026-11-17 | Dues are settled while adding a subscription: **merge** into the new subscription, or **settle** by entering an amount. No separate Renew flow: renewal is Add Subscription. **Waive** is allowed for the Owner and Managers, with a reason. |
| 2026-11-17 | Pause and reactivation events appear in the student's history. |
| 2026-11-11 | The Dashboard defaults to the **Payment** date basis. Transactions and Closing default to Approval. |
| 2026-10-30 | Bulk SMS must be free and keep numbers private: it goes through the phone's SMS app, not a paid gateway. |
| 2026-10-30 | Approved or rejected cards stay on the pending page until the user leaves it. |
| 2026-10-29 | **No Google Contacts sync** ("less complexity"). Save students to the device with a vCard: `<prefix> <roll> <Name>` with the business as company; skip contacts already saved. |
| 2026-10-27 | Staff can edit a payment's fee and paid amount **before** approval. |
| 2026-10-10 | Online collections are verified by the Owner only. Collections are never rejected, only deleted with a reason. The Owner can change a payment date even after approval. |
| 2026-10-10 | The Owner opens Transactions on Business; staff open on My activity. |
