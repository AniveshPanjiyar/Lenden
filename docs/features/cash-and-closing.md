# Cash custody, dashboard, closing and filters

## Views and filters (keep them separate)

**Views** are page tabs. A filter **Reset** never changes them:
- **Business / My activity** (`txLens`: `business` or `personal`). The Owner opens on Business; staff open on My activity.
- Direction tabs (`txFilter`):
  - Business: All, Collections, Expenses, Pending
  - Personal: All, Cash in, Cash out, Pending
- **Approval / Payment** date basis in the header (`txDateKey`, `dashDateKey`, `closingDateKey`):
  - Approval date: when the money was approved or posted. This is the default for Transactions and Closing.
  - Payment date: the transaction date. This is the default for the Dashboard.

**Filters** (filter sheet, `OperationalFilterDrawer`). Reset clears all of these:
- date range: Today, Yesterday, This month, Custom
- person or team (business lens)
- transaction type: payments, expenses, cash transfers, agent payouts
- payment mode
- business unit

**Payment mode filter:**
- **Cash** shows cash and mixed records.
- **Online** shows online and mixed records.
- **Mixed** shows mixed records only.

Both sides apply this rule: `src/lib/data.ts` (`modeFilterValues`) and `matchesSecondaryFilters` in `app-shell.tsx`.

All of this state lives in the URL; see `src/lib/view-state.ts` (`parseAppViewState`, `applyAppViewStateToSearchParams`, `default*Filters`).

## Dashboard (`tab=home`)

- Cards: Cash in hand (cash with staff); and Total, Total cash, Cash, Online per unit, each with collections against approved or verified amounts.
- **Tapping a figure opens Transactions** with the matching lens, direction and mode. For example, Cash collections opens `txFilter=collections&txMode=cash`, which includes mixed payments.
- Business tab: staff cash positions. My activity: your own flow.
- Data comes from the `lenden_dashboard_summary`, `lenden_dashboard_cash_position` and `lenden_dashboard_business_status` RPCs.

## Cash custody

- Each cash rupee sits with a person: the collector, until it is handed over (`money_movements`).
- "Cash in hand" includes pending (not yet approved) cash.
- Cash handovers belong to no business unit, so a unit filter does not hide them.

## Closing (`tab=closing`)

- Per member and per day: opening balance, cash in and out, online in and verified, and closing balance. Data comes from `lenden_closing_summaries` and `ledger_entries`, by date basis.
- **Review** opens that member's transactions for the day, with All / In / Out / Pending chips.
- Closing and Transactions are prefetched in the background, so the tab opens instantly.
