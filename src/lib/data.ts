import { businessPermissions } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { isBusinessOwner, isBusinessSalesAgent, profileForBusiness } from "@/lib/tenancy";
import { rangeForPreset, type AppTab, type AppViewState } from "@/lib/view-state";
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
  CashBalanceSummary,
  ChangeRequest,
  ClosingSummary,
  Course,
  CourseStudent,
  DashboardPayload,
  Expense,
  LedgerEntry,
  LibraryStudent,
  MoneyMovement,
  OperationalPagePayload,
  Payment,
  Profile,
  ReferralCode,
  Room,
  StaffPermission,
  StudentCollectionPage,
  StudentDetailPayload,
  StudentRosterPayload,
} from "@/lib/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

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

async function signedStorageUrlMap(
  supabase: SupabaseServerClient,
  bucket: string,
  values: Array<string | null | undefined>,
) {
  const result = new Map<string, string>();
  const paths = [...new Set(values.flatMap((value) => {
    if (!value || value.startsWith("data:")) return [];
    const path = storageObjectPath(value, bucket);
    if (/^https?:\/\//i.test(path)) {
      result.set(value, value);
      return [];
    }
    return [path];
  }))];
  if (paths.length === 0) return result;

  const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 60 * 60);
  (data ?? []).forEach((item) => {
    if (item.path && item.signedUrl) result.set(item.path, item.signedUrl);
  });
  values.forEach((value) => {
    if (!value || result.has(value)) return;
    const path = storageObjectPath(value, bucket);
    const signed = result.get(path);
    if (signed) result.set(value, signed);
  });
  return result;
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
  const [membershipsResult, profilesResult, memberPermissionsResult, roomsResult, coursesResult, referralsResult, notificationsResult] = await Promise.all([
    supabase.from("business_memberships").select("id,business_id,profile_id,role,status,joined_at").eq("business_id", businessContext.business.id),
    supabase.from("profiles").select("id,email,full_name,avatar_url,platform_role,account_status,must_change_password,last_business_id,active").order("full_name"),
    supabase.from("business_member_permissions").select("membership_id,permission"),
    supabase.from("rooms").select("*").eq("business_id", businessContext.business.id).order("room_number"),
    supabase.from("courses").select("*").eq("business_id", businessContext.business.id).order("kind").order("name"),
    supabase.from("referral_codes").select("*").eq("business_id", businessContext.business.id).order("code"),
    supabase.from("app_notifications").select("*").eq("business_id", businessContext.business.id).eq("recipient_id", userId).order("created_at", { ascending: false }).limit(80),
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
  const avatarUrls = await signedStorageUrlMap(
    supabase,
    "profile-photos",
    [...rawProfiles.map((item) => item.avatar_url), profile.avatar_url],
  );
  const allProfiles = rawProfiles.map((item) => ({
    ...item,
    avatar_url: item.avatar_url ? avatarUrls.get(item.avatar_url) ?? item.avatar_url : null,
  }));
  const signedProfile = {
    ...profile,
    avatar_url: profile.avatar_url ? avatarUrls.get(profile.avatar_url) ?? profile.avatar_url : null,
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
    notifications: (notificationsResult.data ?? []) as AppNotification[],
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
  const defaultRange = rangeForPreset("today");
  const activeTab = viewState?.tab ?? "home";
  const needsDashboard = activeTab === "home";
  const needsTransactions = activeTab === "payments";
  const needsClosing = activeTab === "closing";
  const needsStudents = activeTab === "library_students";
  const needsSettings = activeTab === "settings";
  const needsFinanceRows = needsDashboard || needsTransactions || needsClosing;
  const studentSourceId = viewState?.studentFilters.sourceId ?? "library";
  const studentStatus = viewState?.studentFilters.status ?? "active";
  const studentActive = studentStatus !== "inactive";
  const studentCourseId = studentSourceId === "library" ? null : studentSourceId.split(":", 2)[1] ?? null;
  const range = activeTab === "payments"
    ? viewState?.transactionFilters.dateRange ?? defaultRange
    : activeTab === "closing"
      ? {
          preset: "custom" as const,
          from: viewState?.closingFilters.date ?? defaultRange.from,
          to: viewState?.closingFilters.date ?? defaultRange.to,
        }
      : viewState?.dashboardFilters.dateRange ?? defaultRange;
  const dateFilterKey = activeTab === "payments"
    ? viewState?.transactionFilters.dateFilterKey ?? "approval"
    : activeTab === "closing"
      ? viewState?.closingFilters.dateFilterKey ?? "approval"
      : viewState?.dashboardFilters.dateFilterKey ?? "approval";
  const businessTypeFilter = activeTab === "payments"
    ? viewState?.transactionFilters.businessType ?? "all"
    : activeTab === "home"
      ? viewState?.dashboardFilters.businessType ?? "all"
      : "all";
  const modeFilter = activeTab === "payments" ? viewState?.transactionFilters.mode ?? "all" : "all";
  const closingDate = range.to;

  let paymentsQueryBase = supabase
    .from("payments")
    .select("*")
    .eq("business_id", bootstrap.businessContext.business.id);
  if (businessTypeFilter !== "all") paymentsQueryBase = paymentsQueryBase.eq("business_type", businessTypeFilter);
  if (modeFilter !== "all") paymentsQueryBase = paymentsQueryBase.eq("mode", modeFilter);
  const paymentsQuery = (dateFilterKey === "transaction"
    ? paymentsQueryBase.gte("payment_date", range.from).lte("payment_date", range.to)
    : paymentsQueryBase.or(
        `and(cash_posted_on.gte.${range.from},cash_posted_on.lte.${range.to}),and(online_posted_on.gte.${range.from},online_posted_on.lte.${range.to})`,
      ))
    .order("created_at", { ascending: false })
    .limit(1000);
  let expensesQueryBase = supabase
    .from("expenses")
    .select("*")
    .eq("business_id", bootstrap.businessContext.business.id);
  if (businessTypeFilter !== "all") expensesQueryBase = expensesQueryBase.eq("business_type", businessTypeFilter);
  if (modeFilter !== "all") expensesQueryBase = expensesQueryBase.eq("mode", modeFilter);
  const expensesQuery = (dateFilterKey === "transaction"
    ? expensesQueryBase.gte("expense_date", range.from).lte("expense_date", range.to)
    : expensesQueryBase.gte("posted_on", range.from).lte("posted_on", range.to))
    .order("created_at", { ascending: false })
    .limit(1000);
  let pendingPaymentsQuery = supabase
    .from("payments")
    .select("*")
    .eq("business_id", bootstrap.businessContext.business.id)
    .eq("record_status", "active")
    .in("approval_status", pendingReviewStatuses)
    .lte("payment_date", closingDate)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (businessTypeFilter !== "all") pendingPaymentsQuery = pendingPaymentsQuery.eq("business_type", businessTypeFilter);
  if (modeFilter !== "all") pendingPaymentsQuery = pendingPaymentsQuery.eq("mode", modeFilter);
  let pendingExpensesQuery = supabase
    .from("expenses")
    .select("*")
    .eq("business_id", bootstrap.businessContext.business.id)
    .eq("record_status", "active")
    .in("approval_status", pendingReviewStatuses)
    .lte("expense_date", closingDate)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (businessTypeFilter !== "all") pendingExpensesQuery = pendingExpensesQuery.eq("business_type", businessTypeFilter);
  if (modeFilter !== "all") pendingExpensesQuery = pendingExpensesQuery.eq("mode", modeFilter);
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
    cashBalancesResult,
    changesResult,
    agentSettlementsResult,
    closingMembershipsResult,
    agentReferralsResult,
  ] = await Promise.all([
    needsStudents && canViewLibraryStudents && studentSourceId === "library"
      ? supabase
          .from("library_students")
          .select("id,business_id,roll_number,phone_number,address,aadhar_number,student_name,seat_number,locker_number,start_time,end_time,slot_hours,subscription_start_date,subscription_end_date,fee_amount,paid_amount,dues_amount,advance_amount,active,placeholder,last_payment_id,last_payment_date,created_at,updated_at")
          .eq("business_id", bootstrap.businessContext.business.id)
          .eq("active", studentActive)
          .eq("placeholder", false)
          .order("active", { ascending: false })
          .order("roll_number")
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
    needsStudents && canViewCourseStudents && Boolean(studentCourseId)
      ? supabase
          .from("course_students")
          .select("id,business_id,source_course_id,identity_key,roll_number,student_name,phone_number,address,aadhar_number,subscription_start_date,subscription_end_date,start_time,end_time,slot_hours,fee_amount,paid_amount,dues_amount,advance_amount,active,last_payment_id,created_at,updated_at")
          .eq("business_id", bootstrap.businessContext.business.id)
          .eq("source_course_id", studentCourseId ?? "")
          .eq("active", studentActive)
          .order("active", { ascending: false })
          .order("subscription_end_date", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
    needsFinanceRows ? paymentsQuery : Promise.resolve({ data: [], error: null }),
    needsFinanceRows ? expensesQuery : Promise.resolve({ data: [], error: null }),
    needsFinanceRows ? pendingPaymentsQuery : Promise.resolve({ data: [], error: null }),
    needsFinanceRows ? pendingExpensesQuery : Promise.resolve({ data: [], error: null }),
    needsFinanceRows
      ? supabase.from("money_movements").select("*").eq("business_id", bootstrap.businessContext.business.id).order("created_at", { ascending: false }).limit(1000)
      : Promise.resolve({ data: [], error: null }),
    needsClosing
      ? supabase
          .from("ledger_entries")
          .select("*")
          .eq("business_id", bootstrap.businessContext.business.id)
          .eq("entry_date", closingDate)
          .order("created_at", { ascending: false })
          .limit(1500)
      : needsTransactions
        ? supabase
            .from("ledger_entries")
            .select("*")
            .eq("business_id", bootstrap.businessContext.business.id)
            .gte("entry_date", range.from)
            .lte("entry_date", range.to)
            .order("created_at", { ascending: false })
            .limit(2000)
        : Promise.resolve({ data: [], error: null }),
    needsClosing
      ? supabase.rpc("lenden_closing_summaries", { p_closing_date: closingDate })
      : Promise.resolve({ data: [], error: null }),
    needsDashboard
      ? supabase.rpc("lenden_current_cash_balances")
      : Promise.resolve({ data: [], error: null }),
    needsDashboard || needsTransactions || needsSettings
      ? supabase.from("record_change_requests").select("*").eq("business_id", bootstrap.businessContext.business.id).order("created_at", { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
    needsFinanceRows
      ? supabase.from("agent_settlements").select("*").eq("business_id", bootstrap.businessContext.business.id).order("created_at", { ascending: false }).limit(300)
      : Promise.resolve({ data: [], error: null }),
    needsClosing
      ? supabase
          .from("business_memberships")
          .select("profile_id,role,status")
          .eq("business_id", bootstrap.businessContext.business.id)
          .eq("status", "active")
      : Promise.resolve({ data: [], error: null }),
    salesAgent && needsFinanceRows
      ? supabase
          .from("referral_codes")
          .select("id")
          .eq("business_id", bootstrap.businessContext.business.id)
          .eq("agent_id", userId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (paymentsResult.error) throw new Error(paymentsResult.error.message);
  if (expensesResult.error) throw new Error(expensesResult.error.message);
  if (ledgerResult.error) throw new Error(ledgerResult.error.message);
  if (movementsResult.error) throw new Error(movementsResult.error.message);
  if (closingMembershipsResult.error) throw new Error(closingMembershipsResult.error.message);

  const movementRows = (movementsResult.data ?? []) as MoneyMovement[];
  const visibleMovementPaymentIds = new Set(
    movementRows
      .filter((movement) => movement.status === "pending" && movement.to_profile_id === userId)
      .map((movement) => movement.payment_id)
      .filter((paymentId): paymentId is string => Boolean(paymentId)),
  );
  const agentReferralIds = new Set(
    [
      ...bootstrap.referrals.filter((referral) => referral.agent_id === userId).map((referral) => referral.id),
      ...(agentReferralsResult.data ?? []).map((referral) => String(referral.id)),
    ],
  );
  let ledgerRows = ledgerResult.data ?? [];
  if (needsClosing && closingSummariesResult.error) {
    const fallbackResult = await closingLedgerQuery();
    if (fallbackResult.error) throw new Error(fallbackResult.error.message);
    ledgerRows = fallbackResult.data ?? ledgerRows;
  }

  const libraryStudentRows = isMissingLibraryStudentSchemaError(libraryStudentsResult.error)
    ? []
    : (libraryStudentsResult.data ?? []) as LibraryStudent[];
  const libraryStudents = canViewLibraryStudents ? libraryStudentRows : [];
  const courseStudentRows = isMissingCourseStudentSchemaError(courseStudentsResult.error)
    ? []
    : (courseStudentsResult.data ?? []) as CourseStudent[];
  const rosterLibraryStudents = libraryStudents.map((student) => ({
    ...student,
    photo_url: null,
    aadhar_photo_url: null,
    aadhar_back_photo_url: null,
    status_note: null,
    metadata: {},
  }));
  const rosterCourseStudents = courseStudentRows.map((student) => ({
    ...student,
    photo_url: null,
    aadhar_photo_url: null,
    aadhar_back_photo_url: null,
  }));
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
  const closingVisibleProfileIds = new Set(
    (closingMembershipsResult.data ?? [])
      .filter((item) => {
        if (item.role === "sales_agent") return false;
        if (bootstrap.businessContext.accessMode === "support" || viewerBusinessRole === "primary_owner") return true;
        if (viewerBusinessRole === "co_owner") {
          return item.role === "co_owner" || item.role === "staff";
        }
        return item.profile_id === userId;
      })
      .map((item) => String(item.profile_id)),
  );

  return {
    libraryStudents: rosterLibraryStudents,
    courseStudents: rosterCourseStudents,
    studentPayments: [],
    payments: visiblePayments,
    expenses: visibleExpenses,
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
    cashBalances: salesAgent
      ? []
      : ((cashBalancesResult.data ?? []) as CashBalanceSummary[]).map((summary) => ({
          profile_id: String(summary.profile_id),
          balance: Number(summary.balance ?? 0),
        })),
    changeRequests: visibleData((changesResult.data ?? []) as ChangeRequest[], (request) =>
      !salesAgent && (ownerish || request.requested_by === userId),
    ),
    agentSettlements: visibleData((agentSettlementsResult.data ?? []) as AgentSettlement[], (settlement) =>
      ownerish || settlement.agent_id === userId,
    ),
    notifications: [],
  };
}

function operationalReadBootstrap(
  businessContext: BusinessContext,
  identity: Omit<Profile, "membership_role" | "membership_status" | "role">,
): BootstrapPayload {
  const role = businessContext.membership?.role ?? "co_owner";
  return {
    businessContext,
    profile: profileForBusiness(identity, role),
    permissions: businessContext.permissions,
    allPermissions: [],
    profiles: [],
    rooms: [],
    courses: [],
    referrals: [],
    notifications: [],
  };
}

export function operationalPagePayload(tab: AppTab, dashboard: DashboardPayload): OperationalPagePayload {
  if (tab === "payments") {
    return {
      page: "transactions",
      payments: dashboard.payments,
      expenses: dashboard.expenses,
      movements: dashboard.movements,
      ledger: dashboard.ledger,
      changeRequests: dashboard.changeRequests,
      agentSettlements: dashboard.agentSettlements,
      notifications: dashboard.notifications,
    };
  }
  if (tab === "closing") {
    return {
      page: "closing",
      payments: dashboard.payments,
      expenses: dashboard.expenses,
      movements: dashboard.movements,
      ledger: dashboard.ledger,
      closingSummaries: dashboard.closingSummaries,
      notifications: dashboard.notifications,
    };
  }
  if (tab === "library_students") {
    return {
      page: "students",
      sourceId: "library",
      status: "active",
      result: {
        items: dashboard.libraryStudents,
        nextCursor: null,
        total: dashboard.libraryStudents.length,
      },
      libraryStudents: dashboard.libraryStudents,
      courseStudents: dashboard.courseStudents,
      payments: dashboard.payments,
      notifications: dashboard.notifications,
    };
  }
  if (tab === "settings") {
    return {
      page: "settings",
      changeRequests: dashboard.changeRequests,
      notifications: dashboard.notifications,
    };
  }
  return {
    page: "dashboard",
    payments: dashboard.payments,
    expenses: dashboard.expenses,
    movements: dashboard.movements,
    ledger: dashboard.ledger,
    closingSummaries: dashboard.closingSummaries,
    cashBalances: dashboard.cashBalances,
    changeRequests: dashboard.changeRequests,
    agentSettlements: dashboard.agentSettlements,
    notifications: dashboard.notifications,
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
  return loadDashboard(supabase, identity.id, operationalReadBootstrap(businessContext, identity), viewState);
}

export async function getStudentDetail(
  businessContext: BusinessContext,
  source: "library" | "course",
  studentId: string,
): Promise<StudentDetailPayload> {
  const supabase = await createClient({ businessId: businessContext.business.id });
  const table = source === "library" ? "library_students" : "course_students";
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("business_id", businessContext.business.id)
    .eq("id", studentId)
    .single();
  if (error) throw new Error(error.message);

  const student = data as LibraryStudent | CourseStudent;
  const assetUrls = await signedStorageUrlMap(supabase, "library-student-photos", [
    student.photo_url,
    student.aadhar_photo_url,
    student.aadhar_back_photo_url,
  ]);
  const signedStudent = {
    ...student,
    photo_url: student.photo_url ? assetUrls.get(student.photo_url) ?? student.photo_url : null,
    aadhar_photo_url: student.aadhar_photo_url ? assetUrls.get(student.aadhar_photo_url) ?? student.aadhar_photo_url : null,
    aadhar_back_photo_url: student.aadhar_back_photo_url ? assetUrls.get(student.aadhar_back_photo_url) ?? student.aadhar_back_photo_url : null,
  };

  return source === "library"
    ? { source, student: signedStudent as LibraryStudent }
    : { source, student: signedStudent as CourseStudent };
}

function rosterSearchTerm(value: string | null) {
  return value?.trim().replace(/[%_,().]/g, " ").replace(/\s+/g, " ").slice(0, 80) ?? "";
}

function collectionDisplayRollNumber(student: Pick<LibraryStudent, "roll_number" | "student_name">) {
  const rollNumber = student.roll_number?.trim().replace(/\.0+$/, "") ?? "";
  const studentName = student.student_name?.trim().replace(/\.0+$/, "") ?? "";
  if (rollNumber && studentName && !/^\d+$/.test(rollNumber) && /^\d+$/.test(studentName) && /[a-z]/i.test(rollNumber)) {
    return studentName;
  }
  return rollNumber;
}

function nextCollectionRollNumber(values: Array<string | null | undefined>) {
  let largestValue = -1;
  let largestWidth = 0;
  values.forEach((value) => {
    const normalized = value?.trim().replace(/\.0+$/, "") ?? "";
    if (!/^\d+$/.test(normalized)) return;
    const numericValue = Number(normalized);
    if (!Number.isSafeInteger(numericValue)) return;
    if (numericValue > largestValue || (numericValue === largestValue && normalized.length > largestWidth)) {
      largestValue = numericValue;
      largestWidth = normalized.length;
    }
  });
  if (largestValue < 0) return "1";
  return String(largestValue + 1).padStart(largestWidth, "0");
}

export async function getStudentCollectionPage(
  businessContext: BusinessContext,
  options: {
    sourceId: string;
    intent: "existing" | "new_defaults";
    cursor?: string | null;
    search?: string | null;
  },
): Promise<StudentCollectionPage> {
  const role = businessContext.membership?.role;
  const ownerish = businessContext.accessMode === "support" || isBusinessOwner(role);
  const accessible = accessibleBusinessTypes(role, businessContext.permissions);
  const canUseLibrary = !isBusinessSalesAgent(role)
    && businessContext.enabledModules.includes("library")
    && (ownerish || accessible.has("library"));
  const canUseCourse = !isBusinessSalesAgent(role)
    && businessContext.enabledModules.includes("course")
    && (ownerish || accessible.has("course"));
  const sourceId = options.sourceId;
  const isLibrary = sourceId === "library";
  const [, sourceCourseId] = sourceId.split(":", 2);
  if ((isLibrary && !canUseLibrary) || (!isLibrary && (!canUseCourse || !sourceCourseId))) {
    return { items: [], nextCursor: null, total: 0, nextRollNumber: null };
  }

  const supabase = await createClient({ businessId: businessContext.business.id });
  if (options.intent === "new_defaults") {
    if (isLibrary) {
      const result = await supabase
        .from("library_students")
        .select("roll_number,student_name")
        .eq("business_id", businessContext.business.id)
        .eq("placeholder", false);
      if (result.error && !isMissingLibraryStudentSchemaError(result.error)) throw new Error(result.error.message);
      const rolls = ((result.data ?? []) as Array<Pick<LibraryStudent, "roll_number" | "student_name">>)
        .map(collectionDisplayRollNumber);
      return { items: [], nextCursor: null, total: 0, nextRollNumber: nextCollectionRollNumber(rolls) };
    }

    const result = await supabase
      .from("course_students")
      .select("roll_number")
      .eq("business_id", businessContext.business.id)
      .eq("source_course_id", sourceCourseId);
    if (result.error && !isMissingCourseStudentSchemaError(result.error)) throw new Error(result.error.message);
    return {
      items: [],
      nextCursor: null,
      total: 0,
      nextRollNumber: nextCollectionRollNumber((result.data ?? []).map((student) => student.roll_number)),
    };
  }

  const offset = Math.max(Number.parseInt(options.cursor ?? "0", 10) || 0, 0);
  const limit = 15;
  const search = rosterSearchTerm(options.search ?? null);
  if (isLibrary) {
    let query = supabase
      .from("library_students")
      .select("id,business_id,roll_number,phone_number,address,aadhar_number,student_name,seat_number,locker_number,start_time,end_time,slot_hours,subscription_start_date,subscription_end_date,fee_amount,paid_amount,dues_amount,advance_amount,active,placeholder,last_payment_id,last_payment_date,created_at,updated_at", { count: "exact" })
      .eq("business_id", businessContext.business.id)
      .eq("active", true)
      .eq("placeholder", false);
    if (search) query = query.or(`student_name.ilike.%${search}%,roll_number.ilike.%${search}%,phone_number.ilike.%${search}%`);
    const result = await query
      .order("subscription_end_date", { ascending: true, nullsFirst: false })
      .order("roll_number")
      .order("id")
      .range(offset, offset + limit - 1);
    if (result.error && !isMissingLibraryStudentSchemaError(result.error)) throw new Error(result.error.message);
    const students = ((result.data ?? []) as LibraryStudent[]).map((student) => ({
      ...student,
      photo_url: null,
      aadhar_photo_url: null,
      aadhar_back_photo_url: null,
      status_note: null,
      metadata: {},
    }));
    const total = result.count ?? students.length;
    return {
      items: students.map((student) => ({ source: "library" as const, student })),
      nextCursor: offset + students.length < total ? String(offset + students.length) : null,
      total,
      nextRollNumber: null,
    };
  }

  let query = supabase
    .from("course_students")
    .select("id,business_id,source_course_id,identity_key,roll_number,student_name,phone_number,address,aadhar_number,subscription_start_date,subscription_end_date,start_time,end_time,slot_hours,fee_amount,paid_amount,dues_amount,advance_amount,active,last_payment_id,created_at,updated_at", { count: "exact" })
    .eq("business_id", businessContext.business.id)
    .eq("source_course_id", sourceCourseId)
    .eq("active", true);
  if (search) query = query.or(`student_name.ilike.%${search}%,roll_number.ilike.%${search}%,phone_number.ilike.%${search}%`);
  const result = await query
    .order("subscription_end_date", { ascending: true, nullsFirst: false })
    .order("roll_number")
    .order("id")
    .range(offset, offset + limit - 1);
  if (result.error && !isMissingCourseStudentSchemaError(result.error)) throw new Error(result.error.message);
  const students = ((result.data ?? []) as CourseStudent[]).map((student) => ({
    ...student,
    photo_url: null,
    aadhar_photo_url: null,
    aadhar_back_photo_url: null,
  }));
  const total = result.count ?? students.length;
  return {
    items: students.map((student) => ({ source: "course" as const, student })),
    nextCursor: offset + students.length < total ? String(offset + students.length) : null,
    total,
    nextRollNumber: null,
  };
}

export async function getStudentRosterPage(
  businessContext: BusinessContext,
  viewState: AppViewState,
  options: { cursor?: string | null; search?: string | null; limit?: number } = {},
): Promise<StudentRosterPayload> {
  const sourceId = viewState.studentFilters.sourceId;
  const status = viewState.studentFilters.status;
  const role = businessContext.membership?.role;
  const ownerish = businessContext.accessMode === "support" || isBusinessOwner(role);
  const accessible = accessibleBusinessTypes(role, businessContext.permissions);
  const offset = Math.max(Number.parseInt(options.cursor ?? "0", 10) || 0, 0);
  const limit = Math.min(Math.max(options.limit ?? 100, 15), 200);
  const search = rosterSearchTerm(options.search ?? null);
  const active = status !== "inactive";
  const supabase = await createClient({ businessId: businessContext.business.id });

  if (sourceId === "library") {
    if (isBusinessSalesAgent(role) || (!ownerish && !accessible.has("library")) || !businessContext.enabledModules.includes("library")) {
      return { page: "students", sourceId, status, result: { items: [], nextCursor: null, total: 0 }, libraryStudents: [], courseStudents: [], payments: [], notifications: [] };
    }
    let query = supabase
      .from("library_students")
      .select("id,business_id,roll_number,phone_number,address,aadhar_number,student_name,seat_number,locker_number,start_time,end_time,slot_hours,subscription_start_date,subscription_end_date,fee_amount,paid_amount,dues_amount,advance_amount,active,placeholder,last_payment_id,last_payment_date,created_at,updated_at", { count: "exact" })
      .eq("business_id", businessContext.business.id)
      .eq("active", active)
      .eq("placeholder", false);
    if (search) query = query.or(`student_name.ilike.%${search}%,roll_number.ilike.%${search}%,phone_number.ilike.%${search}%`);
    const result = await query.order("subscription_end_date").order("roll_number").range(offset, offset + limit - 1);
    if (result.error && !isMissingLibraryStudentSchemaError(result.error)) throw new Error(result.error.message);
    const items = ((result.data ?? []) as LibraryStudent[]).map((student) => ({
      ...student,
      photo_url: null,
      aadhar_photo_url: null,
      aadhar_back_photo_url: null,
      status_note: null,
      metadata: {},
    }));
    const total = result.count ?? items.length;
    const nextCursor = offset + items.length < total ? String(offset + items.length) : null;
    return { page: "students", sourceId, status, result: { items, nextCursor, total }, libraryStudents: items, courseStudents: [], payments: [], notifications: [] };
  }

  const [, sourceCourseId] = sourceId.split(":", 2);
  if (!sourceCourseId || isBusinessSalesAgent(role) || (!ownerish && !accessible.has("course")) || !businessContext.enabledModules.includes("course")) {
    return { page: "students", sourceId, status, result: { items: [], nextCursor: null, total: 0 }, libraryStudents: [], courseStudents: [], payments: [], notifications: [] };
  }
  let query = supabase
    .from("course_students")
    .select("id,business_id,source_course_id,identity_key,roll_number,student_name,phone_number,address,aadhar_number,subscription_start_date,subscription_end_date,start_time,end_time,slot_hours,fee_amount,paid_amount,dues_amount,advance_amount,active,last_payment_id,created_at,updated_at", { count: "exact" })
    .eq("business_id", businessContext.business.id)
    .eq("source_course_id", sourceCourseId)
    .eq("active", active);
  if (search) query = query.or(`student_name.ilike.%${search}%,roll_number.ilike.%${search}%,phone_number.ilike.%${search}%`);
  const result = await query.order("subscription_end_date").order("roll_number").range(offset, offset + limit - 1);
  if (result.error && !isMissingCourseStudentSchemaError(result.error)) throw new Error(result.error.message);
  const items = ((result.data ?? []) as CourseStudent[]).map((student) => ({
    ...student,
    photo_url: null,
    aadhar_photo_url: null,
    aadhar_back_photo_url: null,
  }));
  const total = result.count ?? items.length;
  const nextCursor = offset + items.length < total ? String(offset + items.length) : null;
  return { page: "students", sourceId, status, result: { items, nextCursor, total }, libraryStudents: [], courseStudents: items, payments: [], notifications: [] };
}

export async function getAppData(
  businessContext: BusinessContext,
  identity: Omit<Profile, "membership_role" | "membership_status" | "role">,
  viewState?: AppViewState,
): Promise<AppData> {
  const supabase = await createClient({ businessId: businessContext.business.id });
  const role = businessContext.membership?.role ?? "co_owner";
  const profile = profileForBusiness(identity, role);
  const [bootstrap, dashboard] = await Promise.all([
    loadBootstrap(supabase, identity.id, profile, businessContext),
    loadDashboard(supabase, identity.id, operationalReadBootstrap(businessContext, identity), viewState),
  ]);

  return {
    ...bootstrap,
    ...dashboard,
    notifications: bootstrap.notifications ?? [],
  };
}

export function mergeAppData(bootstrap: BootstrapPayload, dashboard: DashboardPayload): AppData {
  return {
    ...bootstrap,
    ...dashboard,
    notifications: bootstrap.notifications ?? [],
  };
}

export function emptyDashboardData(): DashboardPayload {
  return {
    libraryStudents: [],
    courseStudents: [],
    studentPayments: [],
    payments: [],
    expenses: [],
    movements: [],
    ledger: [],
    closingSummaries: [],
    cashBalances: [],
    changeRequests: [],
    agentSettlements: [],
    notifications: [],
  };
}
