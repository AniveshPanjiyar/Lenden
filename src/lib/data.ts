import { businessPermissions } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { isBusinessOwner, isBusinessSalesAgent, profileForBusiness } from "@/lib/tenancy";
import { rangeForPreset, type AppViewState } from "@/lib/view-state";
import type {
  AppData,
  AgentSettlement,
  AppNotification,
  ApprovalStatus,
  BootstrapPayload,
  BusinessType,
  BusinessContext,
  BusinessMembership,
  BusinessRole,
  ChangeRequest,
  ClosingSummary,
  Course,
  CourseStudent,
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

function isMissingCourseStudentSchemaError(error: { code?: string; message?: string } | null | undefined) {
  return isMissingDbSchemaError(error, ["course_students", "course_student_id"]);
}

function storageObjectPath(value: string, bucket: string) {
  if (!/^https?:\/\//i.test(value)) return value;
  try {
    const pathname = decodeURIComponent(new URL(value).pathname);
    const markers = [`/storage/v1/object/public/${bucket}/`, `/storage/v1/object/sign/${bucket}/`];
    const marker = markers.find((item) => pathname.includes(item));
    return marker ? pathname.split(marker)[1] ?? value : value;
  } catch {
    return value;
  }
}

async function signedStorageUrl(supabase: SupabaseServerClient, bucket: string, value: string | null) {
  if (!value || value.startsWith("data:")) return value;
  const path = storageObjectPath(value, bucket);
  if (/^https?:\/\//i.test(path)) return value;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

function visibleData<T>(data: T[] | null, predicate: (item: T) => boolean) {
  return (data ?? []).filter(predicate);
}

function mergeById<T extends { id: string }>(...groups: T[][]) {
  const rows = new Map<string, T>();
  groups.flat().forEach((item) => rows.set(item.id, item));
  return [...rows.values()];
}

function accessibleBusinessTypes(role: BusinessRole | null | undefined, permissions: string[]) {
  if (isBusinessSalesAgent(role)) return new Set<BusinessType>();
  if (isBusinessOwner(role)) return new Set(Object.keys(businessPermissions) as BusinessType[]);

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
  businessContext: BusinessContext,
): Promise<BootstrapPayload> {
  const [membershipsResult, profilesResult, memberPermissionsResult, roomsResult, coursesResult, referralsResult] = await Promise.all([
    supabase.from("business_memberships").select("id,business_id,profile_id,role,status,joined_at").eq("business_id", businessContext.business.id),
    supabase.from("profiles").select("id,email,full_name,avatar_url,platform_role,account_status,must_change_password,last_business_id,active").order("full_name"),
    supabase.from("business_member_permissions").select("membership_id,permission"),
    supabase.from("rooms").select("*").eq("business_id", businessContext.business.id).order("room_number"),
    supabase.from("courses").select("*").eq("business_id", businessContext.business.id).order("kind").order("name"),
    supabase.from("referral_codes").select("*").eq("business_id", businessContext.business.id).order("code"),
  ]);

  const memberships = (membershipsResult.data ?? []) as BusinessMembership[];
  const membershipById = new Map(memberships.map((membership) => [membership.id, membership]));
  const membershipByProfile = new Map(memberships.map((membership) => [membership.profile_id, membership]));
  const allPermissions = (memberPermissionsResult.data ?? []).flatMap((permission) => {
    const membership = membershipById.get(String(permission.membership_id));
    return membership ? [{ profile_id: membership.profile_id, permission: String(permission.permission) }] : [];
  }) satisfies StaffPermission[];
  const rawProfiles = (profilesResult.data ?? []).flatMap((identity) => {
    const membership = membershipByProfile.get(String(identity.id));
    if (!membership) return [];
    return [profileForBusiness(identity as never, membership.role, membership.status)];
  });
  const allProfiles = await Promise.all(rawProfiles.map(async (item) => ({
    ...item,
    avatar_url: await signedStorageUrl(supabase, "profile-photos", item.avatar_url),
  })));
  const signedProfile = {
    ...profile,
    avatar_url: await signedStorageUrl(supabase, "profile-photos", profile.avatar_url),
  };
  const allReferrals = (referralsResult.data ?? []) as ReferralCode[];
  const salesAgent = isBusinessSalesAgent(businessContext.membership?.role);
  const owner = businessContext.accessMode === "support" || isBusinessOwner(businessContext.membership?.role);

  return {
    businessContext,
    profile: signedProfile,
    permissions:
      allPermissions
        .filter((permission) => permission.profile_id === userId && !salesAgent)
        .map((permission) => permission.permission) ?? [],
    allPermissions: salesAgent ? [] : allPermissions,
    profiles: salesAgent
      ? allProfiles.filter((item) => item.id === userId || isBusinessOwner(item.membership_role))
      : allProfiles,
    rooms: salesAgent ? [] : (roomsResult.data ?? []) as Room[],
    courses: salesAgent ? [] : (coursesResult.data ?? []) as Course[],
    referrals: owner
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
  const ownerish = bootstrap.businessContext.accessMode === "support" || isBusinessOwner(bootstrap.businessContext.membership?.role);
  const salesAgent = isBusinessSalesAgent(bootstrap.businessContext.membership?.role);
  const viewerBusinessRole = bootstrap.businessContext.membership?.role;
  const accessibleBusinesses = accessibleBusinessTypes(bootstrap.businessContext.membership?.role, bootstrap.permissions);
  const canViewLibraryStudents = !salesAgent && (ownerish || accessibleBusinesses.has("library"));
  const canViewCourseStudents = !salesAgent && (ownerish || accessibleBusinesses.has("course"));
  const range = viewState?.dateRange ?? rangeForPreset("today");
  const dateFilterKey = viewState?.dateFilterKey ?? "approval";
  const closingDate = range.to;

  const paymentsQueryBase = supabase
    .from("payments")
    .select("*")
    .eq("business_id", bootstrap.businessContext.business.id);
  const paymentsQuery = (dateFilterKey === "transaction"
    ? paymentsQueryBase.gte("payment_date", range.from).lte("payment_date", range.to)
    : paymentsQueryBase.or(
        `and(cash_posted_on.gte.${range.from},cash_posted_on.lte.${range.to}),and(online_posted_on.gte.${range.from},online_posted_on.lte.${range.to})`,
      ))
    .order("created_at", { ascending: false })
    .limit(1000);
  const expensesQueryBase = supabase
    .from("expenses")
    .select("*")
    .eq("business_id", bootstrap.businessContext.business.id);
  const expensesQuery = (dateFilterKey === "transaction"
    ? expensesQueryBase.gte("expense_date", range.from).lte("expense_date", range.to)
    : expensesQueryBase.gte("posted_on", range.from).lte("posted_on", range.to))
    .order("created_at", { ascending: false })
    .limit(1000);
  const pendingPaymentsQuery = supabase
    .from("payments")
    .select("*")
    .eq("business_id", bootstrap.businessContext.business.id)
    .eq("record_status", "active")
    .in("approval_status", pendingReviewStatuses)
    .lte("payment_date", closingDate)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  const pendingExpensesQuery = supabase
    .from("expenses")
    .select("*")
    .eq("business_id", bootstrap.businessContext.business.id)
    .eq("record_status", "active")
    .in("approval_status", pendingReviewStatuses)
    .lte("expense_date", closingDate)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  const ledgerQuery = supabase
    .from("ledger_entries")
    .select("*")
    .eq("business_id", bootstrap.businessContext.business.id)
    .order("entry_date", { ascending: false })
    .limit(5000);
  const closingLedgerQuery = () =>
    supabase
      .from("ledger_entries")
      .select("*")
      .eq("business_id", bootstrap.businessContext.business.id)
      .lte("entry_date", closingDate)
      .order("entry_date", { ascending: false })
      .limit(5000);

  const [
    libraryStudentsResult,
    courseStudentsResult,
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
          .eq("business_id", bootstrap.businessContext.business.id)
          .order("active", { ascending: false })
          .order("roll_number")
          .limit(1200)
      : Promise.resolve({ data: [], error: null }),
    canViewCourseStudents
      ? supabase
          .from("course_students")
          .select("*")
          .eq("business_id", bootstrap.businessContext.business.id)
          .order("active", { ascending: false })
          .order("subscription_end_date", { ascending: false })
          .limit(2400)
      : Promise.resolve({ data: [], error: null }),
    paymentsQuery,
    expensesQuery,
    pendingPaymentsQuery,
    pendingExpensesQuery,
    supabase.from("money_movements").select("*").eq("business_id", bootstrap.businessContext.business.id).order("created_at", { ascending: false }).limit(1000),
    ledgerQuery,
    supabase.rpc("lenden_closing_summaries", { p_closing_date: closingDate }),
    closingSummariesRpcAvailable ? Promise.resolve({ data: null, error: null }) : closingLedgerQuery(),
    supabase.from("record_change_requests").select("*").eq("business_id", bootstrap.businessContext.business.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("agent_settlements").select("*").eq("business_id", bootstrap.businessContext.business.id).order("created_at", { ascending: false }).limit(300),
    supabase.from("app_notifications").select("*").eq("business_id", bootstrap.businessContext.business.id).order("created_at", { ascending: false }).limit(80),
  ]);

  if (paymentsResult.error) throw new Error(paymentsResult.error.message);
  if (expensesResult.error) throw new Error(expensesResult.error.message);
  if (ledgerResult.error) throw new Error(ledgerResult.error.message);

  const movementRows = (movementsResult.data ?? []) as MoneyMovement[];
  const visibleMovementPaymentIds = new Set(
    movementRows
      .filter((movement) => movement.status === "pending" && movement.to_profile_id === userId)
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
  const libraryStudents = canViewLibraryStudents ? libraryStudentRows : [];
  const signedLibraryStudents = await Promise.all(libraryStudents.map(async (student) => ({
    ...student,
    photo_url: await signedStorageUrl(supabase, "library-student-photos", student.photo_url),
    aadhar_photo_url: await signedStorageUrl(supabase, "library-student-photos", student.aadhar_photo_url),
    aadhar_back_photo_url: await signedStorageUrl(supabase, "library-student-photos", student.aadhar_back_photo_url),
  })));
  const courseStudentRows = isMissingCourseStudentSchemaError(courseStudentsResult.error)
    ? []
    : (courseStudentsResult.data ?? []) as CourseStudent[];
  const signedCourseStudents = await Promise.all(courseStudentRows.map(async (student) => ({
    ...student,
    photo_url: await signedStorageUrl(supabase, "library-student-photos", student.photo_url),
    aadhar_photo_url: await signedStorageUrl(supabase, "library-student-photos", student.aadhar_photo_url),
    aadhar_back_photo_url: await signedStorageUrl(supabase, "library-student-photos", student.aadhar_back_photo_url),
  })));
  const paymentRows = mergeById((paymentsResult.data ?? []) as Payment[], (pendingPaymentsResult.data ?? []) as Payment[]);
  const expenseRows = mergeById((expensesResult.data ?? []) as Expense[], (pendingExpensesResult.data ?? []) as Expense[]);
  const visiblePayments = visibleData(paymentRows, (payment) =>
    salesAgent
      ? payment.referral_agent_id === userId || (payment.referral_code_id ? agentReferralIds.has(payment.referral_code_id) : false)
      : ownerish ||
        accessibleBusinesses.has(payment.business_type) ||
        payment.assigned_profile_id === userId ||
        visibleMovementPaymentIds.has(payment.id),
  );
  const visibleExpenses = salesAgent
    ? []
    : visibleData(expenseRows, (expense) =>
        ownerish || expense.spent_by === userId || (expense.business_type ? accessibleBusinesses.has(expense.business_type) : false),
      );
  const [signedPayments, signedExpenses] = await Promise.all([
    Promise.all(visiblePayments.map(async (payment) => ({ ...payment, photo_path: await signedStorageUrl(supabase, "receipts", payment.photo_path) }))),
    Promise.all(visibleExpenses.map(async (expense) => ({ ...expense, photo_path: await signedStorageUrl(supabase, "receipts", expense.photo_path) }))),
  ]);
  const closingVisibleProfileIds = new Set(
    bootstrap.profiles
      .filter((item) => {
        if (!item.active || item.membership_role === "sales_agent") return false;
        if (bootstrap.businessContext.accessMode === "support" || viewerBusinessRole === "primary_owner") return true;
        if (viewerBusinessRole === "co_owner") {
          return item.membership_role === "co_owner" || item.membership_role === "staff";
        }
        return item.id === userId;
      })
      .map((item) => item.id),
  );

  return {
    libraryStudents: signedLibraryStudents,
    courseStudents: signedCourseStudents,
    studentPayments: [],
    payments: signedPayments,
    expenses: signedExpenses,
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
          closingVisibleProfileIds.has(summary.profile_id),
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

export async function getBootstrapData(
  businessContext: BusinessContext,
  identity: Omit<Profile, "membership_role" | "membership_status" | "role">,
): Promise<BootstrapPayload> {
  const supabase = await createClient({ businessId: businessContext.business.id });
  const role = businessContext.membership?.role ?? "co_owner";
  const profile = profileForBusiness(identity, role);
  return loadBootstrap(supabase, identity.id, profile, businessContext);
}

export async function getDashboardData(
  businessContext: BusinessContext,
  identity: Omit<Profile, "membership_role" | "membership_status" | "role">,
  viewState?: AppViewState,
): Promise<DashboardPayload> {
  const supabase = await createClient({ businessId: businessContext.business.id });
  const role = businessContext.membership?.role ?? "co_owner";
  const profile = profileForBusiness(identity, role);
  const bootstrap = await loadBootstrap(supabase, identity.id, profile, businessContext);
  return loadDashboard(supabase, identity.id, bootstrap, viewState);
}

export async function getAppData(
  businessContext: BusinessContext,
  identity: Omit<Profile, "membership_role" | "membership_status" | "role">,
  viewState?: AppViewState,
): Promise<AppData> {
  const supabase = await createClient({ businessId: businessContext.business.id });
  const role = businessContext.membership?.role ?? "co_owner";
  const profile = profileForBusiness(identity, role);
  const bootstrap = await loadBootstrap(supabase, identity.id, profile, businessContext);
  const dashboard = await loadDashboard(supabase, identity.id, bootstrap, viewState);

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
