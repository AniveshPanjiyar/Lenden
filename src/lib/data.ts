import { redirect } from "next/navigation";
import { businessPermissions, isOwnerish, isSalesAgent } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { rangeForPreset, type AppViewState } from "@/lib/view-state";
import type {
  AppData,
  AgentSettlement,
  AppNotification,
  BootstrapPayload,
  BusinessType,
  ChangeRequest,
  ClosingSummary,
  Course,
  DashboardPayload,
  Expense,
  LedgerEntry,
  MoneyMovement,
  Payment,
  Profile,
  ReferralCode,
  Room,
  StaffPermission,
} from "@/lib/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function requireUserAndProfile(supabase: SupabaseServerClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/setup");

  return { user, profile: profile as Profile };
}

function visibleData<T>(data: T[] | null, predicate: (item: T) => boolean) {
  return (data ?? []).filter(predicate);
}

function accessibleBusinessTypes(role: string, permissions: string[]) {
  if (isSalesAgent(role)) return new Set<BusinessType>();
  if (isOwnerish(role)) return new Set(Object.keys(businessPermissions) as BusinessType[]);

  return new Set(
    (Object.keys(businessPermissions) as BusinessType[]).filter((business) =>
      permissions.includes(businessPermissions[business]),
    ),
  );
}

async function loadBootstrap(
  supabase: SupabaseServerClient,
  userId: string,
  profile: Profile,
): Promise<BootstrapPayload> {
  const [permissionsResult, profilesResult, roomsResult, coursesResult, referralsResult] = await Promise.all([
    supabase.from("staff_permissions").select("*"),
    supabase.from("profiles").select("*").order("full_name"),
    supabase.from("rooms").select("*").order("room_number"),
    supabase.from("courses").select("*").order("kind").order("name"),
    supabase.from("referral_codes").select("*").order("code"),
  ]);

  const allPermissions = (permissionsResult.data ?? []) as StaffPermission[];
  const allProfiles = (profilesResult.data ?? []) as Profile[];
  const allReferrals = (referralsResult.data ?? []) as ReferralCode[];
  const salesAgent = isSalesAgent(profile.role);

  return {
    profile,
    permissions:
      allPermissions
        .filter((permission) => permission.profile_id === userId && !salesAgent)
        .map((permission) => permission.permission) ?? [],
    allPermissions: salesAgent ? [] : allPermissions,
    profiles: salesAgent
      ? allProfiles.filter((item) => item.id === userId || isOwnerish(item.role))
      : allProfiles,
    rooms: salesAgent ? [] : (roomsResult.data ?? []) as Room[],
    courses: salesAgent ? [] : (coursesResult.data ?? []) as Course[],
    referrals: isOwnerish(profile.role)
      ? allReferrals
      : salesAgent
        ? allReferrals.filter((referral) => referral.agent_id === userId)
        : allReferrals.filter((referral) => referral.active),
  };
}

async function loadDashboard(
  supabase: SupabaseServerClient,
  userId: string,
  bootstrap: BootstrapPayload,
  viewState?: AppViewState,
): Promise<DashboardPayload> {
  const ownerish = isOwnerish(bootstrap.profile.role);
  const salesAgent = isSalesAgent(bootstrap.profile.role);
  const accessibleBusinesses = accessibleBusinessTypes(bootstrap.profile.role, bootstrap.permissions);
  const range = viewState?.dateRange ?? rangeForPreset("today");
  const closingDate = range.to;

  const paymentsQuery = supabase
    .from("payments")
    .select("*")
    .gte("payment_date", range.from)
    .lte("payment_date", range.to)
    .order("created_at", { ascending: false })
    .limit(300);
  const expensesQuery = supabase
    .from("expenses")
    .select("*")
    .gte("expense_date", range.from)
    .lte("expense_date", range.to)
    .order("created_at", { ascending: false })
    .limit(300);
  const ledgerQuery = supabase
    .from("ledger_entries")
    .select("*")
    .gte("entry_date", range.from)
    .lte("entry_date", closingDate)
    .order("entry_date", { ascending: false })
    .limit(1000);

  const [
    paymentsResult,
    expensesResult,
    movementsResult,
    ledgerResult,
    closingSummariesResult,
    changesResult,
    agentSettlementsResult,
    notificationsResult,
  ] = await Promise.all([
    paymentsQuery,
    expensesQuery,
    supabase.from("money_movements").select("*").order("created_at", { ascending: false }).limit(300),
    ledgerQuery,
    supabase.rpc("lenden_closing_summaries", { p_closing_date: closingDate }),
    supabase.from("record_change_requests").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("agent_settlements").select("*").order("created_at", { ascending: false }).limit(300),
    supabase.from("app_notifications").select("*").order("created_at", { ascending: false }).limit(80),
  ]);

  const movementRows = (movementsResult.data ?? []) as MoneyMovement[];
  const visibleMovementPaymentIds = new Set(
    movementRows
      .filter((movement) => ownerish || movement.from_profile_id === userId || movement.to_profile_id === userId)
      .map((movement) => movement.payment_id)
      .filter((paymentId): paymentId is string => Boolean(paymentId)),
  );
  const agentReferralIds = new Set(
    bootstrap.referrals.filter((referral) => referral.agent_id === userId).map((referral) => referral.id),
  );
  const ledgerRows = closingSummariesResult.error
    ? (
        await supabase
          .from("ledger_entries")
          .select("*")
          .lte("entry_date", closingDate)
          .order("entry_date", { ascending: false })
          .limit(5000)
      ).data
    : ledgerResult.data;

  return {
    payments: visibleData((paymentsResult.data ?? []) as Payment[], (payment) =>
      salesAgent
        ? payment.referral_agent_id === userId || (payment.referral_code_id ? agentReferralIds.has(payment.referral_code_id) : false)
        : ownerish ||
          accessibleBusinesses.has(payment.business_type) ||
          payment.collected_by === userId ||
          payment.current_holder_id === userId ||
          visibleMovementPaymentIds.has(payment.id),
    ),
    expenses: salesAgent
      ? []
      : visibleData((expensesResult.data ?? []) as Expense[], (expense) =>
          ownerish || expense.spent_by === userId || (expense.business_type ? accessibleBusinesses.has(expense.business_type) : false),
        ),
    movements: salesAgent
      ? []
      : visibleData(movementRows, (movement) =>
          ownerish || movement.from_profile_id === userId || movement.to_profile_id === userId,
        ),
    ledger: salesAgent
      ? []
      : visibleData((ledgerRows ?? []) as LedgerEntry[], (entry) =>
          ownerish || entry.account_profile_id === userId,
        ),
    closingSummaries: salesAgent
      ? []
      : visibleData((closingSummariesResult.data ?? []) as ClosingSummary[], (summary) =>
          ownerish || summary.profile_id === userId,
        ),
    changeRequests: visibleData((changesResult.data ?? []) as ChangeRequest[], (request) =>
      !salesAgent && (ownerish || request.requested_by === userId),
    ),
    agentSettlements: visibleData((agentSettlementsResult.data ?? []) as AgentSettlement[], (settlement) =>
      ownerish || settlement.agent_id === userId,
    ),
    notifications: visibleData((notificationsResult.data ?? []) as AppNotification[], (notification) =>
      notification.recipient_id === userId,
    ),
  };
}

export async function getBootstrapData(): Promise<BootstrapPayload> {
  const supabase = await createClient();
  const { user, profile } = await requireUserAndProfile(supabase);
  return loadBootstrap(supabase, user.id, profile);
}

export async function getDashboardData(viewState?: AppViewState): Promise<DashboardPayload> {
  const supabase = await createClient();
  const { user, profile } = await requireUserAndProfile(supabase);
  const bootstrap = await loadBootstrap(supabase, user.id, profile);
  return loadDashboard(supabase, user.id, bootstrap, viewState);
}

export async function getAppData(viewState?: AppViewState): Promise<AppData> {
  const supabase = await createClient();
  const { user, profile } = await requireUserAndProfile(supabase);
  const bootstrap = await loadBootstrap(supabase, user.id, profile);
  const dashboard = await loadDashboard(supabase, user.id, bootstrap, viewState);

  return {
    ...bootstrap,
    ...dashboard,
  };
}

export function mergeAppData(bootstrap: BootstrapPayload, dashboard: DashboardPayload): AppData {
  return {
    ...bootstrap,
    ...dashboard,
  };
}
