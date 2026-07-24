import type {
  ApprovalStatus,
  PaymentMode,
  StudentSubscriptionHistoryItem,
  StudentSubscriptionHistoryPage,
  StudentSubscriptionTransaction,
} from "@/lib/types";

export type StudentSubscriptionHistoryRow = {
  subscription_key: string;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  subscription_start_time: string | null;
  subscription_end_time: string | null;
  subscription_slot_hours: number | string | null;
  subscription_fee_amount: number | string | null;
  subscription_sort_at: string;
  transaction_count: number | string;
  total_subscriptions: number | string;
  total_transactions: number | string;
  payment_id: string;
  payment_amount: number | string;
  payment_date: string;
  payment_created_at: string;
  payment_collected_by: string;
  payment_collector_name: string | null;
  payment_mode: PaymentMode;
  payment_cash_amount: number | string;
  payment_online_amount: number | string;
  payment_approval_status: ApprovalStatus;
  payment_cash_approval_status: ApprovalStatus | null;
  payment_online_approval_status: ApprovalStatus | null;
  payment_record_status: "active" | "cancelled";
  payment_cancel_reason: string | null;
};

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function studentSubscriptionHistoryPage(
  rows: StudentSubscriptionHistoryRow[],
  page: number,
  pageSize: number,
): StudentSubscriptionHistoryPage {
  const groups = new Map<string, {
    item: Omit<StudentSubscriptionHistoryItem, "feeAmount" | "totalPaid" | "duesAmount" | "advanceAmount">;
    feeAmount: number;
  }>();

  rows.forEach((row) => {
    let group = groups.get(row.subscription_key);
    if (!group) {
      group = {
        item: {
          subscriptionKey: row.subscription_key,
          startDate: row.subscription_start_date,
          endDate: row.subscription_end_date,
          startTime: row.subscription_start_time,
          endTime: row.subscription_end_time,
          slotHours: row.subscription_slot_hours === null ? null : numberValue(row.subscription_slot_hours),
          transactionCount: numberValue(row.transaction_count),
          transactions: [],
        },
        feeAmount: numberValue(row.subscription_fee_amount),
      };
      groups.set(row.subscription_key, group);
    }

    const transaction: StudentSubscriptionTransaction = {
      id: row.payment_id,
      amount: numberValue(row.payment_amount),
      paymentDate: row.payment_date,
      createdAt: row.payment_created_at,
      collectedBy: row.payment_collected_by,
      collectorName: row.payment_collector_name?.trim() || "Unknown",
      mode: row.payment_mode,
      cashAmount: numberValue(row.payment_cash_amount),
      onlineAmount: numberValue(row.payment_online_amount),
      approvalStatus: row.payment_approval_status,
      cashApprovalStatus: row.payment_cash_approval_status,
      onlineApprovalStatus: row.payment_online_approval_status,
      recordStatus: row.payment_record_status,
      cancelReason: row.payment_cancel_reason,
    };
    group.item.transactions.push(transaction);
  });

  const items = [...groups.values()].map(({ item, feeAmount }) => {
    const totalPaid = item.transactions.reduce(
      (sum, transaction) => transaction.recordStatus === "active" ? sum + transaction.amount : sum,
      0,
    );
    const effectiveFee = feeAmount > 0 ? feeAmount : totalPaid;
    return {
      ...item,
      feeAmount: effectiveFee,
      totalPaid,
      duesAmount: Math.max(effectiveFee - totalPaid, 0),
      advanceAmount: Math.max(totalPaid - effectiveFee, 0),
    };
  });

  const totalSubscriptions = numberValue(rows[0]?.total_subscriptions);
  const totalTransactions = numberValue(rows[0]?.total_transactions);
  return {
    items,
    nextPage: (page + 1) * pageSize < totalSubscriptions ? page + 1 : null,
    totalSubscriptions,
    totalTransactions,
  };
}
