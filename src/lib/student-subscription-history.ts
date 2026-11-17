import type { createClient } from "@/lib/supabase/server";
import type {
  ApprovalStatus,
  PaymentMode,
  StudentStatusEvent,
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

/**
 * Pause / reactivation / dues events for one student, newest first, with who did each. A missing
 * table (before the migration) reads as no events.
 */
export async function loadStudentStatusEvents(
  client: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  studentType: "library" | "course",
  studentId: string,
): Promise<StudentStatusEvent[]> {
  const result = await client
    .from("student_status_events")
    .select("id,event_type,event_date,effective_date,days,from_date,to_date,amount,note,created_by,created_at,creator:profiles!student_status_events_created_by_fkey(full_name)")
    .eq("business_id", businessId)
    .eq("student_type", studentType)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (result.error) return [];
  type Creator = { full_name: string | null };
  return ((result.data ?? []) as unknown as Array<StudentStatusEvent & { creator?: Creator | Creator[] | null }>).map(({ creator, ...event }) => ({
    ...event,
    amount: event.amount === null ? null : Number(event.amount),
    created_by_name: (Array.isArray(creator) ? creator[0] : creator)?.full_name ?? null,
  }));
}
