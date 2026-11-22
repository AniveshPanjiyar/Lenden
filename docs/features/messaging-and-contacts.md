# Messaging and phone contacts

Nothing here sends messages from a server. Every message opens the user's own WhatsApp or SMS app
with the text filled in, so it is free and works from the user's own number.

## WhatsApp templates

- Library: `businesses.message_templates.student_expired` and `student_active`. Course: `courses.expired_message_template`. Edit them in Business settings → Business setup.
- Defaults (used when nothing is saved) are in `src/lib/message-templates.ts`: detailed Hindi text covering expiry, the choice of Renew, Pause (45 days with no admission fee) or Inactive, the dues rule, and the ₹100 late fine after `{fine_date}`.
- Placeholders, filled by `fillStudentMessageTemplate` in `app-shell.tsx`: `{name} {roll} {end_date} {fine_date} {days} {business} {course}`.
- **Active students get a blank message:** `student_active` is empty on purpose.
- Pause and inactive notices are built in code (`studentStatusWhatsAppMessage`): the 45-day window end date, the admission-fee rule and any dues.
- Links: `studentWhatsAppHref` (wa.me with `+91`).

## SMS (Students → Tools → Send SMS)

- One by one, or "Send to all" in batches of 50 through `sms:` links (`bulkSmsHref` in `src/lib/contact-names.ts`).
- iPhone uses `sms:/open?addresses=…&body=`. Samsung separates numbers with `;`, other phones with `,`.
- With the phone's "mass text" setting on, each student gets a separate SMS, so numbers stay private.
- "Send to all" is disabled when the text has personal placeholders (`{name}`, `{roll}` and so on), because one shared text cannot be personalised.

## Save to phone contacts (Students → Tools → Save contacts)

- Builds one `.vcf` file (`studentContactsVCard`). The name is `<prefix> <roll padded to 3> <Name>` (for example `Lb. 001 Aakash Mishra`), the company is the business, and the phone is `+91…`.
- The file is shared through `navigator.share`, or downloaded where sharing is not available; the phone's Contacts app imports it.
- Already-saved students are tracked per device in localStorage (`lenden-saved-contacts:<businessId>`) and skipped. "Mark as saved" covers contacts that already exist on the phone.
- Google Contacts sync was considered and dropped (`decisions.md`).
