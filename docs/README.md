# Lenden docs

Context for anyone (person or AI agent) picking up work on Lenden. `AGENTS.md` points here, so an
agent reads this file at the start of every session.

## Read order

| When | Read |
|---|---|
| Every session | [HANDOFF.md](HANDOFF.md): what changed lately, what is open, standing rules |
| Before touching code | [architecture.md](architecture.md): request flow, where code lives, auth, RLS |
| Before a DB change | [data-model.md](data-model.md): tables, enums, RPCs, migration workflow |
| Before working on a feature | the matching file in [features/](features/) |
| Before running, testing or shipping | [runbook.md](runbook.md) |
| Before changing a product rule | [decisions.md](decisions.md): rules the owner chose, and why |

Feature files:

- [features/transactions.md](features/transactions.md): collect payment, expenses, approval, edit, cancel, transfers
- [features/cash-and-closing.md](features/cash-and-closing.md): cash custody, handovers, dashboard, closing, filters
- [features/students.md](features/students.md): library and course students, subscriptions, pause, dues, history
- [features/messaging-and-contacts.md](features/messaging-and-contacts.md): WhatsApp templates, SMS, phone contacts
- [features/team-and-access.md](features/team-and-access.md): roles, permissions, units, invitations, admin, support
- [features/work.md](features/work.md): attendance, tasks, daily updates

## Keeping docs true

Docs that drift are worse than none. When a change alters behaviour described here:

1. Update the matching feature file in the same commit as the code.
2. Add a line to the **Recent changes** list in `HANDOFF.md`, and trim it to about the last 15 items.
3. If the owner made a product choice, add it to `decisions.md` with the date.
4. A new table, enum value, RPC or migration goes into `data-model.md`.

Write what the code does and why, not how it looked before. Name files and functions so they can be
found with grep. Avoid line numbers: they go stale.
