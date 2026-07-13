import { redirect } from "next/navigation";
import { businessPermissions, isOwnerish, isSalesAgent } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { rangeForPreset, type AppViewState } from "@/lib/view-state";
import type {
  AppData,
  AgentSettlement,
  AppNotification,
  ApprovalStatus,
  BootstrapPayload,
  BusinessType,
  ChangeRequest,
  ClosingSummary,
  Course,
  DashboardPayload,
  Expense,
  LedgerEntry,
  LibraryStudent,
  MoneyMovement,
  Payment,
  Profile,
  ReferralCode,
  Room,
  StaffPermission,
} from "@/lib/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

let closingSummariesRpcAvailable = false;

const virtualLibraryStudentPrefix = "roll:";
const pendingReviewStatuses = ["pending", "reapproval_required", "cancel_requested"] satisfies ApprovalStatus[];

function isMissingDbSchemaError(error: { code?: string; message?: string } | null | undefined, identifiers: string[]) {
  const message = error?.message?.toLowerCase() ?? "";
  const mentionsIdentifier = identifiers.some((identifier) => message.includes(identifier));
  const hasMissingSchemaCode = error?.code === "PGRST204" || error?.code === "PGRST205" || error?.code === "42703" || error?.code === "42P01";

  return (
    mentionsIdentifier &&
    (hasMissingSchemaCode ||
      message.includes("schema cache") ||
      message.includes("could not find") ||
      message.includes("does not exist"))
  );
}

function isMissingLibraryStudentSchemaError(error: { code?: string; message?: string } | null | undefined) {
  return isMissingDbSchemaError(error, ["aadhar_number", "aadhar_photo_url", "aadhar_back_photo_url", "library_students", "library_student_id", "library_student_subscription_events"]);
}

function normalizeLibraryRollNumber(value: string | null | undefined) {
  const normalized = value?.trim().replace(/\.0+$/, "");
  return normalized || null;
}

function virtualLibraryStudentId(rollNumber: string) {
  return `${virtualLibraryStudentPrefix}${encodeURIComponent(rollNumber)}`;
}

function libraryPaymentSubscriptionSortKey(payment: Payment) {
  return [
    payment.end_date ?? "",
    payment.start_date ?? "",
    payment.payment_date,
    payment.created_at,
    payment.id,
  ].join("|");
}

function libraryStudentSubscriptionSortKey(student: LibraryStudent) {
  return [
    student.subscription_end_date ?? "",
    student.subscription_start_date ?? "",
    student.last_payment_date ?? "",
  ].join("|");
}

function libraryStudentWithPaymentSnapshot(student: LibraryStudent, payment: Payment): LibraryStudent {
  if (libraryStudentSubscriptionSortKey(student) > libraryPaymentSubscriptionSortKey(payment)) return student;

  return {
    ...student,
    student_name: payment.customer_name ?? student.student_name,
    roll_number: normalizeLibraryRollNumber(payment.roll_number) ?? student.roll_number,
    aadhar_photo_url: payment.aadhar_photo_url ?? student.aadhar_photo_url,
    aadhar_back_photo_url: payment.aadhar_back_photo_url ?? student.aadhar_back_photo_url,
    seat_number: payment.seat_number ?? student.seat_number,
    start_time: payment.start_time ?? student.start_time,
    end_time: payment.end_time ?? student.end_time,
    slot_hours: payment.slot_hours ?? student.slot_hours,
    subscription_start_date: payment.start_date ?? student.subscription_start_date,
    subscription_end_date: payment.end_date ?? student.subscription_end_date,
    fee_amount: payment.fee_amount ?? student.fee_amount,
    paid_amount: payment.paid_amount ?? student.paid_amount,
    dues_amount: payment.dues_amount ?? student.dues_amount,
    advance_amount: payment.advance_amount ?? student.advance_amount,
    active: true,
    placeholder: false,
    last_payment_id: payment.id,
    last_payment_date: payment.payment_date,
    updated_at: payment.created_at,
  };
}

function mergeLibraryStudentsFromPayments(students: LibraryStudent[], payments: Payment[]) {
  const rows = new Map<string, LibraryStudent>();
  const rollKeys = new Set<string>();
  const latestPaymentsByRoll = new Map<string, Payment>();

  payments
    .filter((payment) => payment.business_type === "library" && payment.record_status === "active")
    .forEach((payment) => {
      const rollNumber = normalizeLibraryRollNumber(payment.roll_number);
      if (!rollNumber) return;

      const current = latestPaymentsByRoll.get(rollNumber);
      if (!current || libraryPaymentSubscriptionSortKey(payment) > libraryPaymentSubscriptionSortKey(current)) {
        latestPaymentsByRoll.set(rollNumber, payment);
      }
    });

  students.forEach((student) => {
    const rollNumber = normalizeLibraryRollNumber(student.roll_number);
    const latestPayment = rollNumber ? latestPaymentsByRoll.get(rollNumber) : null;
    rows.set(student.id, latestPayment ? libraryStudentWithPaymentSnapshot(student, latestPayment) : student);
    if (rollNumber) rollKeys.add(rollNumber);
  });

  latestPaymentsByRoll.forEach((payment, rollNumber) => {
    if (rollKeys.has(rollNumber)) return;

    rollKeys.add(rollNumber);
    rows.set(virtualLibraryStudentId(rollNumber), {
      id: virtualLibraryStudentId(rollNumber),
      roll_number: rollNumber,
      phone_number: null,
      address: null,
      photo_url: null,
      aadhar_number: null,
      aadhar_photo_url: payment.aadhar_photo_url,
      aadhar_back_photo_url: payment.aadhar_back_photo_url,
      student_name: payment.customer_name,
      seat_number: payment.seat_number,
      locker_number: null,
      start_time: payment.start_time,
      end_time: payment.end_time,
      slot_hours: payment.slot_hours,
      subscription_start_date: payment.start_date,
      subscription_end_date: payment.end_date,
      fee_amount: payment.fee_amount,
      paid_amount: payment.paid_amount,
      dues_amount: payment.dues_amount,
      advance_amount: payment.advance_amount,
      active: true,
      placeholder: false,
      status_note: null,
      last_payment_id: payment.id,
      last_payment_date: payment.payment_date,
      metadata: { source: "payment" },
      created_at: payment.created_at,
      updated_at: payment.created_at,
    });
  });

  return [...rows.values()];
}

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

function mergeById<T extends { id: string }>(...groups: T[][]) {
  const rows = new Map<string, T>();
  groups.flat().forEach((item) => rows.set(item.id, item));
  return [...rows.values()];
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
  const canViewLibraryStudents = !salesAgent && (ownerish || accessibleBusinesses.has("library"));
  const canViewStudentPayments = !salesAgent && (ownerish || accessibleBusinesses.has("library") || accessibleBusinesses.has("course"));
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
  const pendingPaymentsQuery = supabase
    .from("payments")
    .select("*")
    .eq("record_status", "active")
    .in("approval_status", pendingReviewStatuses)
    .lte("payment_date", closingDate)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  const pendingExpensesQuery = supabase
    .from("expenses")
    .select("*")
    .eq("record_status", "active")
    .in("approval_status", pendingReviewStatuses)
    .lte("expense_date", closingDate)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  const ledgerQuery = supabase
    .from("ledger_entries")
    .select("*")
    .gte("entry_date", range.from)
    .lte("entry_date", closingDate)
    .order("entry_date", { ascending: false })
    .limit(1000);
  const closingLedgerQuery = () =>
    supabase
      .from("ledger_entries")
      .select("*")
      .lte("entry_date", closingDate)
      .order("entry_date", { ascending: false })
      .limit(5000);

  const [
    libraryStudentsResult,
    studentPaymentsResult,
    paymentsResult,
    expensesResult,
    pendingPaymentsResult,
    pendingExpensesResult,
    movementsResult,
    ledgerResult,
    closingSummariesResult,
    closingLedgerFallbackResult,
    changesResult,
    agentSettlementsResult,
    notificationsResult,
  ] = await Promise.all([
    canViewLibraryStudents
      ? supabase
          .from("library_students")
          .select("*")
          .order("active", { ascending: false })
          .order("roll_number")
          .limit(1200)
      : Promise.resolve({ data: [], error: null }),
    canViewStudentPayments
      ? supabase
          .from("payments")
          .select("*")
          .in("business_type", ["library", "course"])
          .eq("record_status", "active")
          .order("end_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(5000)
      : Promise.resolve({ data: [], error: null }),
    paymentsQuery,
    expensesQuery,
    pendingPaymentsQuery,
    pendingExpensesQuery,
    supabase.from("money_movements").select("*").order("created_at", { ascending: false }).limit(300),
    ledgerQuery,
    supabase.rpc("lenden_closing_summaries", { p_closing_date: closingDate }),
    closingSummariesRpcAvailable ? Promise.resolve({ data: null, error: null }) : closingLedgerQuery(),
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
  if (!closingSummariesResult.error) {
    closingSummariesRpcAvailable = true;
  }
  const ledgerRows = closingSummariesResult.error
    ? closingLedgerFallbackResult.data ?? (await closingLedgerQuery()).data
    : ledgerResult.data;

  const libraryStudentRows = isMissingLibraryStudentSchemaError(libraryStudentsResult.error)
    ? []
    : (libraryStudentsResult.data ?? []) as LibraryStudent[];
  const studentPaymentRows = (studentPaymentsResult.data ?? []) as Payment[];
  const visibleStudentPayments = visibleData(studentPaymentRows, (payment) =>
    ownerish || accessibleBusinesses.has(payment.business_type) || payment.collected_by === userId,
  );

  const libraryStudents = canViewLibraryStudents
    ? mergeLibraryStudentsFromPayments(
        libraryStudentRows,
        visibleStudentPayments,
      )
    : [];
  const paymentRows = mergeById((paymentsResult.data ?? []) as Payment[], (pendingPaymentsResult.data ?? []) as Payment[]);
  const expenseRows = mergeById((expensesResult.data ?? []) as Expense[], (pendingExpensesResult.data ?? []) as Expense[]);

  return {
    libraryStudents,
    studentPayments: visibleStudentPayments,
    payments: visibleData(paymentRows, (payment) =>
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
      : visibleData(expenseRows, (expense) =>
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
