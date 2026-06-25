import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  AppData,
  AgentSettlement,
  AppNotification,
  ChangeRequest,
  Course,
  Expense,
  LedgerEntry,
  MoneyMovement,
  Payment,
  Profile,
  ReferralCode,
  Room,
  StaffPermission,
} from "@/lib/types";

export async function getAppData(): Promise<AppData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/setup");

  const [
    permissionsResult,
    profilesResult,
    roomsResult,
    coursesResult,
    referralsResult,
    paymentsResult,
    expensesResult,
    movementsResult,
    ledgerResult,
    changesResult,
    agentSettlementsResult,
    notificationsResult,
  ] = await Promise.all([
    supabase.from("staff_permissions").select("*"),
    supabase.from("profiles").select("*").order("full_name"),
    supabase.from("rooms").select("*").order("room_number"),
    supabase.from("courses").select("*").order("kind").order("name"),
    supabase.from("referral_codes").select("*").order("code"),
    supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(300),
    supabase.from("expenses").select("*").order("created_at", { ascending: false }).limit(300),
    supabase.from("money_movements").select("*").order("created_at", { ascending: false }).limit(300),
    supabase.from("ledger_entries").select("*").order("entry_date", { ascending: false }).limit(1000),
    supabase.from("record_change_requests").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("agent_settlements").select("*").order("created_at", { ascending: false }).limit(300),
    supabase.from("app_notifications").select("*").order("created_at", { ascending: false }).limit(80),
  ]);

  const currentProfile = profile as Profile;
  const ownerish = currentProfile.role === "admin" || currentProfile.role === "owner";
  const referrals = (referralsResult.data ?? []) as ReferralCode[];
  const agentReferralIds = new Set(
    referrals.filter((referral) => referral.agent_id === user.id).map((referral) => referral.id),
  );
  const payments = ((paymentsResult.data ?? []) as Payment[]).filter(
    (payment) =>
      ownerish ||
      payment.collected_by === user.id ||
      payment.current_holder_id === user.id ||
      payment.referral_agent_id === user.id ||
      (payment.referral_code_id ? agentReferralIds.has(payment.referral_code_id) : false),
  );
  const expenses = ((expensesResult.data ?? []) as Expense[]).filter(
    (expense) => ownerish || expense.spent_by === user.id,
  );
  const movements = ((movementsResult.data ?? []) as MoneyMovement[]).filter(
    (movement) => ownerish || movement.from_profile_id === user.id || movement.to_profile_id === user.id,
  );
  const ledger = ((ledgerResult.data ?? []) as LedgerEntry[]).filter(
    (entry) => ownerish || entry.account_profile_id === user.id,
  );
  const changeRequests = ((changesResult.data ?? []) as ChangeRequest[]).filter(
    (request) => ownerish || request.requested_by === user.id,
  );
  const agentSettlements = ((agentSettlementsResult.data ?? []) as AgentSettlement[]).filter(
    (settlement) => ownerish || settlement.agent_id === user.id,
  );
  const notifications = ((notificationsResult.data ?? []) as AppNotification[]).filter(
    (notification) => notification.recipient_id === user.id,
  );

  return {
    profile: currentProfile,
    permissions:
      (permissionsResult.data as StaffPermission[] | null)
        ?.filter((permission) => permission.profile_id === user.id)
        .map((permission) => permission.permission) ?? [],
    allPermissions: (permissionsResult.data ?? []) as StaffPermission[],
    profiles: (profilesResult.data ?? []) as Profile[],
    rooms: (roomsResult.data ?? []) as Room[],
    courses: (coursesResult.data ?? []) as Course[],
    referrals,
    payments,
    expenses,
    movements,
    ledger,
    changeRequests,
    agentSettlements,
    notifications,
  };
}
