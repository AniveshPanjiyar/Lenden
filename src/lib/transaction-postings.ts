import { dateIsoInTimeZone } from "@/lib/constants";
import type {
  AgentSettlement,
  DailyPostingEvent,
  Expense,
  FinancialActivity,
  LedgerEntry,
  MoneyMovement,
  Payment,
  Profile,
} from "@/lib/types";
import type { DateFilterKey } from "@/lib/view-state";

function numberValue(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

export function financialActivityPostingEvents(
  activity: FinancialActivity[],
  lens: FinancialActivity["lens"],
): DailyPostingEvent[] {
  return activity
    .filter((item) =>
      item.lens === lens
      && item.category !== "pending"
      && item.approval_date,
    )
    .map((item) => {
      const direction = item.category === "collection" || item.category === "in" ? "in" as const : "out" as const;
      const component = numberValue(item.cash_amount) > 0 && numberValue(item.online_amount) === 0
        ? "cash" as const
        : numberValue(item.online_amount) > 0 && numberValue(item.cash_amount) === 0
          ? "online" as const
          : null;
      return {
        id: item.activity_id,
        source_type: item.source_type,
        source_id: item.source_id,
        business_type: item.business_type,
        component,
        profile_id: (lens === "personal" ? item.flow_profile_id : item.actor_profile_id) ?? item.actor_profile_id,
        counterparty_profile_id: item.counterparty_profile_id,
        direction,
        amount: numberValue(item.amount),
        cash_amount: numberValue(item.cash_amount),
        online_amount: numberValue(item.online_amount),
        transaction_date: item.transaction_date,
        approval_date: item.approval_date ?? item.transaction_date,
        approved_at: item.created_at,
        approved_by: null,
      };
    });
}

export function paymentCashValue(payment: Payment) {
  return payment.mode === "mixed" ? numberValue(payment.cash_collection) : payment.mode === "cash" ? numberValue(payment.amount) : 0;
}

export function paymentOnlineValue(payment: Payment) {
  return payment.mode === "mixed" ? numberValue(payment.online_collection) : payment.mode === "online" ? numberValue(payment.amount) : 0;
}

export function paymentValueApproved(payment: Payment, component: "cash" | "online", ownerProfileIds: Set<string>) {
  const componentStatus = component === "cash" ? payment.cash_approval_status : payment.online_approval_status;
  return ownerProfileIds.has(payment.collected_by) || (componentStatus ?? payment.approval_status) === "approved";
}

function expenseApproved(expense: Expense, ownerProfileIds: Set<string>) {
  return ownerProfileIds.has(expense.spent_by) || expense.approval_status === "approved";
}

function recordLedgerEntry(
  ledger: LedgerEntry[],
  sourceType: LedgerEntry["source_type"],
  sourceId: string,
  direction: "in" | "out",
) {
  return ledger.find((entry) =>
    entry.source_type === sourceType &&
    entry.source_id === sourceId &&
    (direction === "in" ? numberValue(entry.amount) > 0 : numberValue(entry.amount) < 0),
  );
}

export function buildDailyPostingEvents({
  payments,
  expenses,
  movements,
  agentSettlements,
  ledger,
  profiles,
  timezone,
}: {
  payments: Payment[];
  expenses: Expense[];
  movements: MoneyMovement[];
  agentSettlements: AgentSettlement[];
  ledger: LedgerEntry[];
  profiles: Profile[];
  timezone?: string;
}) {
  const ownerProfiles = profiles.filter((profile) => profile.membership_role === "primary_owner" || profile.membership_role === "co_owner");
  const ownerProfileIds = new Set(ownerProfiles.map((profile) => profile.id));
  const events: DailyPostingEvent[] = [];

  payments.forEach((payment) => {
    if (payment.record_status !== "active") return;
    const cashAmount = paymentCashValue(payment);
    const onlineAmount = paymentOnlineValue(payment);

    if (cashAmount > 0 && paymentValueApproved(payment, "cash", ownerProfileIds)) {
      const ledgerEntry = recordLedgerEntry(ledger, "payment", payment.id, "in");
      events.push({
        id: `payment:${payment.id}:cash`,
        source_type: "payment",
        source_id: payment.id,
        business_type: payment.business_type,
        component: "cash",
        profile_id: payment.collected_by,
        counterparty_profile_id: null,
        direction: "in",
        amount: cashAmount,
        cash_amount: cashAmount,
        online_amount: 0,
        transaction_date: payment.payment_date,
        approval_date: payment.cash_posted_on ?? ledgerEntry?.entry_date ?? payment.payment_date,
        approved_at: payment.cash_approved_at ?? payment.approved_at,
        approved_by: payment.cash_approved_by ?? payment.approved_by,
      });
    }

    if (onlineAmount > 0 && paymentValueApproved(payment, "online", ownerProfileIds)) {
      events.push({
        id: `payment:${payment.id}:online`,
        source_type: "payment",
        source_id: payment.id,
        business_type: payment.business_type,
        component: "online",
        profile_id: payment.collected_by,
        counterparty_profile_id: null,
        direction: "in",
        amount: onlineAmount,
        cash_amount: 0,
        online_amount: onlineAmount,
        transaction_date: payment.payment_date,
        approval_date: payment.online_posted_on ?? payment.payment_date,
        approved_at: payment.online_approved_at ?? payment.approved_at,
        approved_by: payment.online_approved_by ?? payment.approved_by,
      });
    }
  });

  expenses.forEach((expense) => {
    if (expense.record_status !== "active" || !expenseApproved(expense, ownerProfileIds)) return;
    const amount = numberValue(expense.amount);
    const online = expense.mode === "online";
    const ledgerEntry = recordLedgerEntry(ledger, "expense", expense.id, "out");
    events.push({
      id: `expense:${expense.id}`,
      source_type: "expense",
      source_id: expense.id,
      business_type: expense.business_type ?? "general",
      component: online ? "online" : "cash",
      profile_id: ledgerEntry?.account_profile_id ?? expense.spent_by,
      counterparty_profile_id: null,
      direction: "out",
      amount,
      cash_amount: online ? 0 : amount,
      online_amount: online ? amount : 0,
      transaction_date: expense.expense_date,
      approval_date: expense.posted_on ?? ledgerEntry?.entry_date ?? expense.expense_date,
      approved_at: expense.approved_at,
      approved_by: expense.approved_by,
    });
  });

  movements.forEach((movement) => {
    if (movement.status !== "accepted" || !movement.to_profile_id) return;
    const payment = movement.payment_id
      ? payments.find((candidate) => candidate.id === movement.payment_id)
      : null;
    const paymentCashAmount = payment ? paymentCashValue(payment) : 0;
    if (payment && (
      paymentCashAmount <= 0 ||
      !paymentValueApproved(payment, "cash", ownerProfileIds)
    )) return;
    const amount = payment ? paymentCashAmount : numberValue(movement.amount);
    const transactionDate = dateIsoInTimeZone(movement.created_at, timezone);
    const outgoingLedger = recordLedgerEntry(ledger, movement.type, movement.id, "out");
    const incomingLedger = recordLedgerEntry(ledger, movement.type, movement.id, "in");
    const movementPostedOn = outgoingLedger?.entry_date ?? incomingLedger?.entry_date ?? dateIsoInTimeZone(movement.responded_at ?? movement.created_at, timezone);
    const approvalDate = payment
      ? [payment.cash_posted_on ?? payment.payment_date, movementPostedOn].sort().at(-1) ?? movementPostedOn
      : movementPostedOn;
    const sourceType = movement.type;
    events.push({
      id: `${sourceType}:${movement.id}:out`,
      source_type: sourceType,
      source_id: movement.id,
      business_type: movement.business_type ?? payment?.business_type ?? null,
      component: "cash",
      profile_id: movement.from_profile_id,
      counterparty_profile_id: movement.to_profile_id,
      direction: "out",
      amount,
      cash_amount: amount,
      online_amount: 0,
      transaction_date: transactionDate,
      approval_date: approvalDate,
      approved_at: movement.responded_at,
      approved_by: movement.responded_by,
    });
    events.push({
      id: `${sourceType}:${movement.id}:in`,
      source_type: sourceType,
      source_id: movement.id,
      business_type: movement.business_type ?? payment?.business_type ?? null,
      component: "cash",
      profile_id: movement.to_profile_id,
      counterparty_profile_id: movement.from_profile_id,
      direction: "in",
      amount,
      cash_amount: amount,
      online_amount: 0,
      transaction_date: transactionDate,
      approval_date: approvalDate,
      approved_at: movement.responded_at,
      approved_by: movement.responded_by,
    });
  });

  agentSettlements.forEach((settlement) => {
    if (settlement.status !== "accepted") return;
    const amount = numberValue(settlement.amount);
    const transactionDate = dateIsoInTimeZone(settlement.created_at, timezone);
    const outgoingLedger = recordLedgerEntry(ledger, "settlement", settlement.id, "out");
    const incomingLedger = recordLedgerEntry(ledger, "settlement", settlement.id, "in");
    const approvalDate = outgoingLedger?.entry_date ?? incomingLedger?.entry_date ?? dateIsoInTimeZone(settlement.responded_at ?? settlement.created_at, timezone);
    events.push({
      id: `agent-settlement:${settlement.id}:out`,
      source_type: "agent_settlement",
      source_id: settlement.id,
      business_type: null,
      component: "cash",
      profile_id: settlement.paid_by,
      counterparty_profile_id: settlement.agent_id,
      direction: "out",
      amount,
      cash_amount: amount,
      online_amount: 0,
      transaction_date: transactionDate,
      approval_date: approvalDate,
      approved_at: settlement.responded_at,
      approved_by: settlement.responded_by,
    });
    events.push({
      id: `agent-settlement:${settlement.id}:in`,
      source_type: "agent_settlement",
      source_id: settlement.id,
      business_type: null,
      component: "cash",
      profile_id: settlement.agent_id,
      counterparty_profile_id: settlement.paid_by,
      direction: "in",
      amount,
      cash_amount: amount,
      online_amount: 0,
      transaction_date: transactionDate,
      approval_date: approvalDate,
      approved_at: settlement.responded_at,
      approved_by: settlement.responded_by,
    });
  });

  return events;
}

export function postingEventDate(event: DailyPostingEvent, dateKey: DateFilterKey) {
  return dateKey === "transaction" ? event.transaction_date : event.approval_date;
}

export function postingEventsForProfileDate(
  events: DailyPostingEvent[],
  profileId: string,
  date: string,
  dateKey: DateFilterKey,
) {
  return events.filter((event) => event.profile_id === profileId && postingEventDate(event, dateKey) === date);
}

export function postingFlowTotals(events: DailyPostingEvent[]) {
  return events.reduce(
    (totals, event) => {
      const prefix = event.direction === "in" ? "in" : "out";
      totals[`${prefix}Cash` as "inCash" | "outCash"] += event.cash_amount;
      totals[`${prefix}Online` as "inOnline" | "outOnline"] += event.online_amount;
      return totals;
    },
    { inCash: 0, inOnline: 0, outCash: 0, outOnline: 0 },
  );
}
