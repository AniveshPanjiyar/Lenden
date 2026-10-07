import { dateIsoInTimeZone, staffPermissionValues } from "@/lib/constants";
import { actionWarning, normalizeActionError } from "@/lib/action-errors";
import type {
  ActionResult,
  CourseStudent,
  LedgerEntry,
  LibraryStudent,
  MoneyMovement,
  MutationPatch,
  Payment,
} from "@/lib/types";

type AppRole = "admin" | "owner" | "staff" | "sales_agent";
type BusinessRole = "primary_owner" | "co_owner" | "staff" | "sales_agent";
type BusinessType = "guest_house" | "library" | "course" | "general";
type PaymentMode = "cash" | "online" | "mixed";
type SettlementDirection = "received_from_user" | "sent_to_user";
type Decision = "accepted" | "rejected";
type ApprovalDecision = "approved" | "rejected";
type PaymentComponent = "cash" | "online";

export type LendenActionProfile = {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string | null;
  role: AppRole;
  businessId: string;
  businessTimezone: string;
  businessRole: BusinessRole;
  accessMode: "member" | "support";
  active: boolean;
};

type ActionContext = {
  admin: SupabaseAdminClient;
  authAdmin: SupabaseAdminClient;
  profile: LendenActionProfile;
  idempotencyKey?: string | null;
};

type SupabaseAdminClient = {
  auth: {
    admin: {
      createUser: (args: {
        email: string;
        password: string;
        email_confirm: boolean;
        user_metadata: Record<string, unknown>;
      }) => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
      updateUserById: (
        id: string,
        attributes: { password?: string; ban_duration?: string },
      ) => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
      deleteUser: (
        id: string,
        shouldSoftDelete?: boolean,
      ) => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
    };
  };
  from: (table: string) => QueryBuilder;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<QueryResponse<unknown>>;
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        file: File,
        options: { contentType: string; upsert: boolean },
      ) => Promise<{ error: { message: string } | null }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
      createSignedUrl: (path: string, expiresIn: number) => Promise<{
        data: { signedUrl: string } | null;
        error: { message: string } | null;
      }>;
      remove: (paths: string[]) => Promise<{ error: { message: string } | null }>;
    };
  };
};

export type LendenActionAdminClient = SupabaseAdminClient;

type QueryBuilder = {
  select: (columns?: string, options?: Record<string, unknown>) => QueryBuilder;
  insert: (values: unknown) => QueryBuilder;
  update: (values: unknown) => QueryBuilder;
  upsert: (values: unknown, options?: Record<string, unknown>) => QueryBuilder;
  delete: () => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  in: (column: string, values: unknown[]) => QueryBuilder;
  ilike: (column: string, pattern: string) => QueryBuilder;
  is: (column: string, value: unknown) => QueryBuilder;
  lte: (column: string, value: unknown) => QueryBuilder;
  maybeSingle: () => Promise<QueryResponse<unknown>>;
  single: () => Promise<QueryResponse<unknown>>;
  then: <TResult1 = QueryResponse<unknown>, TResult2 = never>(
    onfulfilled?: ((value: QueryResponse<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => PromiseLike<TResult1 | TResult2>;
};

type QueryResponse<T> = {
  data: T | null;
  error: { code?: string; message: string } | null;
  count?: number | null;
};

type AppNotificationCategory = "payment" | "expense" | "transfer" | "approval" | "agent" | "settings" | "system" | "task";
type AppNotificationTone = "success" | "error" | "warning" | "info";
const notificationFailureCollectors = new WeakMap<SupabaseAdminClient, unknown[]>();

const businessPermissions: Record<BusinessType, string> = {
  guest_house: "collect_guest_house",
  library: "collect_library",
  course: "collect_course",
  general: "collect_general",
};
const idempotencyField = "_action_idempotency_key";
const actionsWithoutIdempotency = new Set<string>(["markNotificationsRead"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(formData: FormData, key: string) {
  const value = asString(formData, key);
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asBool(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function normalizeLibraryRollNumber(value: string | null) {
  if (!value) return null;
  const normalized = value.trim().replace(/\.0+$/, "");
  return normalized || null;
}

function normalizeLibraryStudentId(value: string | null) {
  return value && uuidPattern.test(value) ? value : null;
}

function normalizePhoneNumber(value: string | null) {
  if (!value) return null;
  const normalized = value.replace(/[^\d+]/g, "");
  return normalized || null;
}

function normalizeClockTime(value: string | null) {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function slotHoursBetween(startTime: string | null, endTime: string | null) {
  if (!startTime || !endTime) return null;
  const startMinutes = minutesFromTime(startTime);
  const endMinutes = minutesFromTime(endTime);
  if (endMinutes <= startMinutes) return null;
  return (endMinutes - startMinutes) / 60;
}

function calculateConfiguredAmount(type: string | null | undefined, value: number | null | undefined, base: number) {
  const safeValue = Number(value ?? 0);
  if (!Number.isFinite(safeValue) || safeValue <= 0) return 0;
  if (type === "percentage") return Math.max((base * safeValue) / 100, 0);
  return safeValue;
}

function moneyToCents(value: number) {
  return Math.round(value * 100);
}

function paymentCashCollection(record: {
  mode?: string | null;
  amount?: number | string | null;
  cash_collection?: number | string | null;
}) {
  if (record.mode === "cash") return Number(record.amount ?? 0);
  if (record.mode === "mixed") return Number(record.cash_collection ?? 0);
  return 0;
}

function paymentOnlineCollection(record: {
  mode?: string | null;
  amount?: number | string | null;
  online_collection?: number | string | null;
}) {
  if (record.mode === "online") return Number(record.amount ?? 0);
  if (record.mode === "mixed") return Number(record.online_collection ?? 0);
  return 0;
}

function paymentComponentDecision(
  record: Record<string, string | number | null>,
  component: PaymentComponent,
) {
  const field = component === "cash" ? "cash_approval_status" : "online_approval_status";
  return String(record[field] ?? record.approval_status ?? "pending");
}

function paymentHasApprovedComponent(record: Record<string, string | number | null>) {
  return (paymentCashCollection(record) > 0 && paymentComponentDecision(record, "cash") === "approved") ||
    (paymentOnlineCollection(record) > 0 && paymentComponentDecision(record, "online") === "approved");
}

function canTransferPaymentStatus(status: string | null | undefined) {
  return status !== "rejected" && status !== "cancelled";
}

function errorCodeAndMessage(error: unknown) {
  const errorLike = error && typeof error === "object" && !(error instanceof Error)
    ? (error as { code?: string; message?: string })
    : null;
  return {
    code: errorLike?.code,
    message: (error instanceof Error ? error.message : errorLike?.message ?? "").toLowerCase(),
  };
}

function isMissingDbSchemaError(error: unknown, identifiers: string[]) {
  const { code, message } = errorCodeAndMessage(error);
  const mentionsIdentifier = identifiers.some((identifier) => message.includes(identifier));
  const hasMissingSchemaCode = code === "PGRST204" || code === "PGRST205" || code === "42703" || code === "42P01";

  return (
    mentionsIdentifier &&
    (hasMissingSchemaCode ||
      message.includes("schema cache") ||
      message.includes("could not find") ||
      message.includes("does not exist"))
  );
}

function isMissingPaymentSplitSchemaError(error: unknown) {
  return isMissingDbSchemaError(error, ["cash_collection", "online_collection"]);
}

function isMissingPaymentComponentApprovalSchemaError(error: unknown) {
  return isMissingDbSchemaError(error, [
    "cash_approval_status",
    "online_approval_status",
    "cash_approved_at",
    "online_approved_at",
  ]);
}

function isMissingPaymentApprovalPostingSchemaError(error: unknown) {
  return isMissingDbSchemaError(error, [
    "cash_posted_on",
    "online_posted_on",
    "cash_approved_by",
    "online_approved_by",
  ]);
}

function isMissingExpenseApprovalPostingSchemaError(error: unknown) {
  return isMissingDbSchemaError(error, ["posted_on", "approved_at", "approved_by"]);
}

function isMissingPaymentApprovalJourneySchemaError(error: unknown) {
  return isMissingDbSchemaError(error, ["approved_by", "approved_at"]);
}

function isMissingStudentSubscriptionCycleSchemaError(error: unknown) {
  return isMissingDbSchemaError(error, [
    "student_subscription_key",
    "current_subscription_key",
    "lenden_student_subscription_history",
  ]);
}

async function updatePaymentApprovalFields(
  admin: SupabaseAdminClient,
  paymentId: string,
  updates: Record<string, unknown>,
) {
  let updateResult = await admin.from("payments").update(updates).eq("id", paymentId);
  if (updateResult.error && isMissingPaymentApprovalJourneySchemaError(updateResult.error)) {
    const fallbackUpdates = { ...updates };
    delete fallbackUpdates.approved_by;
    delete fallbackUpdates.approved_at;
    updateResult = await admin.from("payments").update(fallbackUpdates).eq("id", paymentId);
  }
  return updateResult;
}

function approvalPostingDate(profile: LendenActionProfile, approvedAt: string) {
  return dateIsoInTimeZone(approvedAt, profile.businessTimezone || undefined);
}

function isMissingStudentAadharSidesSchemaError(error: unknown) {
  return isMissingDbSchemaError(error, ["aadhar_photo_url", "aadhar_back_photo_url"]);
}

function isMissingLibraryStudentSchemaError(error: unknown) {
  const { message } = errorCodeAndMessage(error);
  if (message.includes("library student migration")) return true;
  return isMissingDbSchemaError(error, [
    "address",
    "aadhar_number",
    "aadhar_photo_url",
    "aadhar_back_photo_url",
    "library_student_id",
    "library_students",
    "library_student_subscription_events",
    "photo_url",
  ]);
}

function isMissingCourseStudentSchemaError(error: unknown) {
  return isMissingDbSchemaError(error, ["course_students", "course_student_id", "assigned_profile_id"]);
}

function isMissingActionRequestSchemaError(error: unknown) {
  return isMissingDbSchemaError(error, ["app_action_requests"]);
}

function isMissingClientRequestSchemaError(error: unknown) {
  return isMissingDbSchemaError(error, ["client_request_id"]);
}

function isMissingNotificationEventKeySchemaError(error: unknown) {
  return isMissingDbSchemaError(error, ["event_key"]);
}

function permissionsFromForm(formData: FormData) {
  return formData.getAll("permissions").filter(
    (value): value is string => typeof value === "string" && staffPermissionValues.has(value),
  );
}

function isIsoDate(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isBusinessOwner(role: BusinessRole) {
  return role === "primary_owner" || role === "co_owner";
}

function isBusinessSalesAgent(role: BusinessRole) {
  return role === "sales_agent";
}

function requireBusinessOwner(role: BusinessRole) {
  if (!isBusinessOwner(role)) throw new Error("Only a business owner can do this.");
}

function requireBusinessSettingsManager(profile: LendenActionProfile) {
  if (profile.businessRole !== "primary_owner" && profile.accessMode !== "support") {
    throw new Error("Only the Owner can change business settings.");
  }
}

function recordOwnerProfileId(recordType: "payment" | "expense", record: Record<string, string | number | null>) {
  return String(recordType === "expense" ? record.spent_by : record.assigned_profile_id ?? record.collected_by);
}

async function profileIsOwnerish(admin: SupabaseAdminClient, businessId: string, profileId: string) {
  const response = await admin
    .from("business_memberships")
    .select("role")
    .eq("business_id", businessId)
    .eq("profile_id", profileId)
    .eq("status", "active")
    .single();
  const membership = typedData<{ role: BusinessRole }>(response);
  if (response.error || !membership) throw new Error(response.error?.message ?? "Business membership not found.");
  return isBusinessOwner(membership.role);
}

async function recordIsEffectivelyApproved(
  admin: SupabaseAdminClient,
  recordType: "payment" | "expense",
  record: Record<string, string | number | null>,
) {
  if (String(record.approval_status ?? "") === "approved") return true;
  const businessId = String(record.business_id ?? "");
  if (!businessId) throw new Error("Transaction business is missing.");
  return profileIsOwnerish(admin, businessId, recordOwnerProfileId(recordType, record));
}

async function userPermissions(admin: SupabaseAdminClient, businessId: string, profileId: string) {
  const membershipResponse = await admin
    .from("business_memberships")
    .select("id")
    .eq("business_id", businessId)
    .eq("profile_id", profileId)
    .eq("status", "active")
    .single();
  const membership = typedData<{ id: string }>(membershipResponse);
  if (membershipResponse.error || !membership) return [];
  const permissionsResponse = await admin.from("business_member_permissions").select("permission").eq("membership_id", membership.id);
  return typedDataArray<{ permission: string }>(permissionsResponse).map((item) => item.permission);
}

async function businessMember(admin: SupabaseAdminClient, businessId: string, profileId: string) {
  const [membershipResponse, profileResponse] = await Promise.all([
    admin
      .from("business_memberships")
      .select("id,role,status")
      .eq("business_id", businessId)
      .eq("profile_id", profileId)
      .maybeSingle(),
    admin.from("profiles").select("id,active,full_name").eq("id", profileId).maybeSingle(),
  ]);
  if (membershipResponse.error) throw new Error(membershipResponse.error.message);
  if (profileResponse.error) throw new Error(profileResponse.error.message);
  const membership = typedData<{ id: string; role: BusinessRole; status: string }>(membershipResponse);
  const identity = typedData<{ id: string; active: boolean; full_name: string }>(profileResponse);
  return membership && identity ? { ...identity, ...membership } : null;
}

async function profileHasBusinessUnitAccess(
  admin: SupabaseAdminClient,
  businessId: string,
  profileId: string,
  role: BusinessRole,
  businessType: BusinessType,
) {
  const moduleResponse = await admin
    .from("business_modules")
    .select("enabled")
    .eq("business_id", businessId)
    .eq("module", businessType)
    .maybeSingle();
  if (moduleResponse.error) throw new Error(moduleResponse.error.message);
  const enabledModule = typedData<{ enabled: boolean }>(moduleResponse);
  if (!enabledModule?.enabled) return false;
  if (role === "primary_owner") return true;
  if (role === "co_owner") {
    const response = await admin
      .from("business_manager_unit_scopes")
      .select("business_type")
      .eq("business_id", businessId)
      .eq("manager_profile_id", profileId)
      .eq("business_type", businessType)
      .maybeSingle();
    if (response.error) throw new Error(response.error.message);
    return Boolean(response.data);
  }
  if (role === "staff") {
    const response = await admin
      .from("business_staff_unit_assignments")
      .select("business_type")
      .eq("business_id", businessId)
      .eq("staff_profile_id", profileId)
      .eq("business_type", businessType)
      .maybeSingle();
    if (response.error) throw new Error(response.error.message);
    return Boolean(response.data);
  }
  return false;
}

async function staffManagerForBusinessUnit(
  admin: SupabaseAdminClient,
  businessId: string,
  staffProfileId: string,
  businessType: BusinessType,
) {
  const response = await admin
    .from("business_staff_unit_assignments")
    .select("manager_profile_id")
    .eq("business_id", businessId)
    .eq("staff_profile_id", staffProfileId)
    .eq("business_type", businessType)
    .maybeSingle();
  if (response.error) throw new Error(response.error.message);
  const assignment = typedData<{ manager_profile_id: string | null }>(response);
  return assignment ? { assigned: true, managerId: assignment.manager_profile_id } : { assigned: false, managerId: null };
}

async function canManageBusinessRecord(
  admin: SupabaseAdminClient,
  profile: LendenActionProfile,
  businessType: BusinessType,
  actorProfileId: string,
) {
  if (profile.accessMode === "support" || profile.businessRole === "primary_owner") return true;
  if (profile.businessRole === "staff") {
    return actorProfileId === profile.id && await profileHasBusinessUnitAccess(
      admin,
      profile.businessId,
      profile.id,
      profile.businessRole,
      businessType,
    );
  }
  if (profile.businessRole !== "co_owner") return false;
  if (actorProfileId === profile.id) {
    return profileHasBusinessUnitAccess(
      admin,
      profile.businessId,
      profile.id,
      profile.businessRole,
      businessType,
    );
  }
  const actor = await businessMember(admin, profile.businessId, actorProfileId);
  if (!actor || actor.role !== "staff" || actor.status !== "active" || !actor.active) return false;
  const [managerHasAccess, staffHasAccess] = await Promise.all([
    profileHasBusinessUnitAccess(
      admin,
      profile.businessId,
      profile.id,
      profile.businessRole,
      businessType,
    ),
    profileHasBusinessUnitAccess(
      admin,
      profile.businessId,
      actor.id,
      actor.role,
      businessType,
    ),
  ]);
  return managerHasAccess && staffHasAccess;
}

async function hasBusinessCollectionAccess(admin: SupabaseAdminClient, profile: LendenActionProfile, business: BusinessType) {
  if (profile.accessMode === "support" || profile.businessRole === "primary_owner") return true;
  if (isBusinessSalesAgent(profile.businessRole)) return false;
  if (!(await profileHasBusinessUnitAccess(admin, profile.businessId, profile.id, profile.businessRole, business))) {
    return false;
  }
  if (profile.businessRole === "co_owner") return true;
  const permissions = await userPermissions(admin, profile.businessId, profile.id);
  return permissions.includes(businessPermissions[business]);
}

async function requireLibraryCollectionAccess(admin: SupabaseAdminClient, profile: LendenActionProfile) {
  if (!(await hasBusinessCollectionAccess(admin, profile, "library"))) {
    throw new Error("You do not have access to library students.");
  }
}

function typedData<T>(response: QueryResponse<unknown>) {
  return response.data as T | null;
}

function typedDataArray<T>(response: QueryResponse<unknown>) {
  return (response.data ?? []) as T[];
}

function ok(message?: string, patch?: MutationPatch): ActionResult {
  return {
    ok: true,
    ...(message ? { message } : {}),
    ...(patch ? { patch } : {}),
  };
}

function fail(message: string, fieldErrors?: Record<string, string>): ActionResult {
  return {
    ok: false,
    message,
    ...(fieldErrors ? { fieldErrors } : {}),
  };
}

function isDuplicateError(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "23505" || message.includes("duplicate key") || message.includes("already exists");
}

function isStorageDuplicateError(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return message.includes("already exists") || message.includes("duplicate") || message.includes("resource already exists");
}

async function signedStudentAsset(admin: SupabaseAdminClient, value: string | null) {
  if (!value || /^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  const { data, error } = await admin.storage.from("library-student-photos").createSignedUrl(value, 3600);
  if (error) return value;
  return data?.signedUrl ?? value;
}

async function signedLibraryStudentPatch(admin: SupabaseAdminClient, student: LibraryStudent): Promise<LibraryStudent> {
  const [photoUrl, aadharFront, aadharBack] = await Promise.all([
    signedStudentAsset(admin, student.photo_url),
    signedStudentAsset(admin, student.aadhar_photo_url),
    signedStudentAsset(admin, student.aadhar_back_photo_url),
  ]);
  return { ...student, photo_url: photoUrl, aadhar_photo_url: aadharFront, aadhar_back_photo_url: aadharBack };
}

async function signedCourseStudentPatch(admin: SupabaseAdminClient, student: CourseStudent): Promise<CourseStudent> {
  const [photoUrl, aadharFront, aadharBack] = await Promise.all([
    signedStudentAsset(admin, student.photo_url),
    signedStudentAsset(admin, student.aadhar_photo_url),
    signedStudentAsset(admin, student.aadhar_back_photo_url),
  ]);
  return { ...student, photo_url: photoUrl, aadhar_photo_url: aadharFront, aadhar_back_photo_url: aadharBack };
}

function normalizeRequestKey(value: string | null) {
  if (!value) return null;
  const key = value.trim();
  if (!key || key.length > 160 || !/^[a-zA-Z0-9._:-]+$/.test(key)) return null;
  return key;
}

function fileFingerprint(file: File) {
  return {
    kind: "file",
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
  };
}

async function actionFingerprint(formData: FormData) {
  const entries: { key: string; value: unknown }[] = [];
  for (const [key, value] of formData.entries()) {
    if (key === idempotencyField) continue;
    entries.push({
      key,
      value: value instanceof File ? fileFingerprint(value) : String(value),
    });
  }
  entries.sort((a, b) => {
    const keyCompare = a.key.localeCompare(b.key);
    if (keyCompare !== 0) return keyCompare;
    return JSON.stringify(a.value).localeCompare(JSON.stringify(b.value));
  });

  const payload = JSON.stringify(entries);
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function asActionResult(value: unknown): ActionResult | null {
  if (!value || typeof value !== "object" || !("ok" in value)) return null;
  const result = value as {
    ok: unknown;
    message?: unknown;
    warning?: unknown;
    errorId?: unknown;
    fieldErrors?: unknown;
    patch?: unknown;
  };
  if (result.ok === true) {
    if (result.message !== undefined && typeof result.message !== "string") return null;
    if (result.warning !== undefined && typeof result.warning !== "string") return null;
    if (result.errorId !== undefined && typeof result.errorId !== "string") return null;
    return result as ActionResult;
  }
  if (result.ok === false && typeof result.message === "string") {
    if (result.errorId !== undefined && typeof result.errorId !== "string") return null;
    if (result.fieldErrors !== undefined && (!result.fieldErrors || typeof result.fieldErrors !== "object")) return null;
    return result as ActionResult;
  }
  return null;
}

async function beginIdempotentAction(
  admin: SupabaseAdminClient,
  profile: LendenActionProfile,
  action: string,
  formData: FormData,
) {
  if (actionsWithoutIdempotency.has(action)) {
    return { kind: "new" as const, requestId: null, requestKey: null };
  }

  const submittedRequestKey = normalizeRequestKey(asString(formData, idempotencyField));
  const requestKey = submittedRequestKey ?? crypto.randomUUID();
  if (!submittedRequestKey) {
    console.warn("[lenden-action-idempotency]", {
      action,
      userId: profile.id,
      businessId: profile.businessId,
      message: "Client omitted the action request key; a server key was generated.",
    });
  }

  const requestFingerprint = await actionFingerprint(formData);
  const insertResponse = await admin
    .from("app_action_requests")
    .insert({
      user_id: profile.id,
      action_name: action,
      request_key: requestKey,
      request_fingerprint: requestFingerprint,
      status: "processing",
    })
    .select("id")
    .single();

  if (!insertResponse.error && insertResponse.data) {
    const row = insertResponse.data as { id: string };
    return { kind: "new" as const, requestId: row.id, requestKey };
  }

  if (isMissingActionRequestSchemaError(insertResponse.error)) {
    return { kind: "new" as const, requestId: null, requestKey };
  }

  if (!isDuplicateError(insertResponse.error)) {
    throw new Error(insertResponse.error?.message ?? "Could not start action.");
  }

  const existingResponse = await admin
    .from("app_action_requests")
    .select("id, request_fingerprint, status, result")
    .eq("user_id", profile.id)
    .eq("action_name", action)
    .eq("request_key", requestKey)
    .single();
  const existing = typedData<{
    id: string;
    request_fingerprint: string;
    status: string;
    result: unknown;
  }>(existingResponse);
  if (existingResponse.error || !existing) {
    throw new Error(existingResponse.error?.message ?? "Could not read action request.");
  }
  if (existing.request_fingerprint !== requestFingerprint) {
    return { kind: "result" as const, result: fail("This request key was already used for a different action payload.") };
  }
  if (existing.status === "completed") {
    return { kind: "result" as const, result: asActionResult(existing.result) ?? ok("Action already completed.") };
  }
  return { kind: "result" as const, result: fail("This action is already processing. Please wait.") };
}

async function finishIdempotentAction(
  admin: SupabaseAdminClient,
  requestId: string | null,
  result: ActionResult,
) {
  if (!requestId) return;
  const { error } = await admin
    .from("app_action_requests")
    .update({
      status: "completed",
      result,
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (isMissingActionRequestSchemaError(error)) return;
  if (error) throw new Error(error.message);
}

async function uploadReceipt(admin: SupabaseAdminClient, businessId: string, file: FormDataEntryValue | null, folder: string, requestKey: string) {
  if (!(file instanceof File) || file.size === 0) return null;

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${businessId}/${folder}/${requestKey}/${safeName}`;
  const { error } = await admin.storage.from("receipts").upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (error) {
    if (isStorageDuplicateError(error)) return path;
    throw new Error(error.message);
  }

  return path;
}

async function uploadProfilePhoto(
  admin: SupabaseAdminClient,
  businessId: string,
  profileId: string,
  file: FormDataEntryValue | null,
  requestKey: string,
) {
  if (!(file instanceof File) || file.size === 0) return null;
  if (!file.type.startsWith("image/")) return fail("Choose an image file for your profile photo.");
  if (file.size > 3 * 1024 * 1024) return fail("Profile photo must be 3 MB or smaller.");

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${businessId}/profiles/${profileId}/${requestKey}-${safeName}`;
  const bucket = admin.storage.from("profile-photos");
  const { error } = await bucket.upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });

  if (error) {
    if (isStorageDuplicateError(error)) return path;
    throw new Error(error.message);
  }

  return path;
}

const workPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const workVoiceTypes = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac"]);

async function uploadWorkMedia(
  admin: SupabaseAdminClient,
  businessId: string,
  file: FormDataEntryValue | null,
  kind: "photo" | "voice",
  requestKey: string,
) {
  if (!(file instanceof File) || file.size === 0) return null;
  // Browsers report recordings as e.g. "audio/webm;codecs=opus"; the bucket allow-list matches the bare type.
  const contentType = file.type.split(";")[0].trim().toLowerCase();
  const allowed = kind === "photo" ? workPhotoTypes : workVoiceTypes;
  if (!allowed.has(contentType)) {
    return fail(kind === "photo" ? "Choose a JPG, PNG or WebP photo." : "This voice note format is not supported.");
  }
  if (file.size > 5 * 1024 * 1024) {
    return fail(kind === "photo" ? "Photo must be 5 MB or smaller." : "Voice note must be 5 MB or smaller.");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${businessId}/work/${requestKey}/${kind}-${safeName}`;
  const { error } = await admin.storage.from("work-media").upload(path, file, { contentType, upsert: false });
  if (error) {
    if (isStorageDuplicateError(error)) return path;
    throw new Error(error.message);
  }
  return path;
}

async function uploadLibraryStudentPhoto(
  admin: SupabaseAdminClient,
  businessId: string,
  profileId: string,
  file: FormDataEntryValue | null,
  requestKey: string,
) {
  if (!(file instanceof File) || file.size === 0) return null;
  if (!file.type.startsWith("image/")) return fail("Choose an image file for the student photo.");
  if (file.size > 3 * 1024 * 1024) return fail("Student photo must be 3 MB or smaller.");

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${businessId}/library-students/${requestKey}/profile-${profileId}-${safeName}`;
  const bucket = admin.storage.from("library-student-photos");
  const { error } = await bucket.upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });

  if (error) {
    if (isStorageDuplicateError(error)) return path;
    throw new Error(error.message);
  }

  return path;
}

async function uploadLibraryStudentAadharPhoto(
  admin: SupabaseAdminClient,
  businessId: string,
  profileId: string,
  file: FormDataEntryValue | null,
  requestKey: string,
  side: "front" | "back",
) {
  if (!(file instanceof File) || file.size === 0) return null;
  if (!file.type.startsWith("image/")) return fail(`Choose an image file for the Aadhar ${side}.`);
  if (file.size > 3 * 1024 * 1024) return fail(`Aadhar ${side} photo must be 3 MB or smaller.`);

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${businessId}/library-students/${requestKey}/aadhar-${side}-${profileId}-${safeName}`;
  const bucket = admin.storage.from("library-student-photos");
  const { error } = await bucket.upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });

  if (error) {
    if (isStorageDuplicateError(error)) return path;
    throw new Error(error.message);
  }

  return path;
}

async function ensureLedgerEntry(
  admin: SupabaseAdminClient,
  params: {
    businessId?: string;
    accountProfileId: string | null | undefined;
    businessType: BusinessType | null;
    amount: number;
    entryDate: string;
    sourceType: "payment" | "expense" | "transfer" | "settlement" | "adjustment";
    sourceId: string;
    description: string;
    createdBy: string;
  },
) {
  if (!params.accountProfileId) return;
  const payload: Record<string, unknown> = {
    account_profile_id: params.accountProfileId,
    business_type: params.businessType,
    amount: params.amount,
    entry_date: params.entryDate,
    source_type: params.sourceType,
    source_id: params.sourceId,
    description: params.description,
    created_by: params.createdBy,
  };
  if (params.businessId) payload.business_id = params.businessId;
  const { error } = await admin.from("ledger_entries").insert(payload);
  if (isDuplicateError(error)) return;
  if (error) throw new Error(error.message);
}

async function removeRecordLedgerEntries(admin: SupabaseAdminClient, recordType: "payment" | "expense", recordId: string) {
  const { error } = await admin
    .from("ledger_entries")
    .delete()
    .eq("source_id", recordId)
    .in("source_type", [recordType, "adjustment"]);
  if (error) throw new Error(error.message);

  if (recordType === "payment") {
    const transferResponse = await admin
      .from("money_movements")
      .select("id")
      .eq("payment_id", recordId)
      .eq("type", "transfer");
    if (transferResponse.error) throw new Error(transferResponse.error.message);
    const transferIds = typedDataArray<{ id: string }>(transferResponse).map((movement) => movement.id);
    if (transferIds.length > 0) {
      const transferLedgerDelete = await admin
        .from("ledger_entries")
        .delete()
        .eq("source_type", "transfer")
        .in("source_id", transferIds);
      if (transferLedgerDelete.error) throw new Error(transferLedgerDelete.error.message);
    }
  }
}

async function hasRecordLedgerEntry(admin: SupabaseAdminClient, recordType: "payment" | "expense", recordId: string) {
  const response = await admin
    .from("ledger_entries")
    .select("id")
    .eq("source_type", recordType)
    .eq("source_id", recordId)
    .maybeSingle();
  if (response.error) throw new Error(response.error.message);
  return Boolean(response.data);
}

async function ownerRecipientIds(
  admin: SupabaseAdminClient,
  businessId: string,
  excludeId?: string,
  businessType?: BusinessType,
  actorProfileId?: string,
) {
  const response = await admin
    .from("business_memberships")
    .select("profile_id,role")
    .eq("business_id", businessId)
    .in("role", ["primary_owner", "co_owner"])
    .eq("status", "active");
  if (response.error) throw new Error(response.error.message);
  const memberships = typedDataArray<{ profile_id: string; role: BusinessRole }>(response);
  const recipients = new Set(
    memberships
      .filter((membership) => membership.role === "primary_owner")
      .map((membership) => membership.profile_id),
  );
  if (businessType) {
    const managerIds = memberships
      .filter((membership) => membership.role === "co_owner")
      .map((membership) => membership.profile_id);
    let allowedManagerIds = new Set<string>();
    if (managerIds.length > 0) {
      const scopeResponse = await admin
        .from("business_manager_unit_scopes")
        .select("manager_profile_id")
        .eq("business_id", businessId)
        .eq("business_type", businessType)
        .in("manager_profile_id", managerIds);
      if (scopeResponse.error) throw new Error(scopeResponse.error.message);
      allowedManagerIds = new Set(
        typedDataArray<{ manager_profile_id: string }>(scopeResponse).map((scope) => scope.manager_profile_id),
      );
    }
    if (actorProfileId) {
      const actor = await businessMember(admin, businessId, actorProfileId);
      if (actor?.role === "staff") {
        const assignment = await staffManagerForBusinessUnit(admin, businessId, actorProfileId, businessType);
        allowedManagerIds = assignment.managerId && allowedManagerIds.has(assignment.managerId)
          ? new Set([assignment.managerId])
          : new Set();
      } else if (actor?.role === "co_owner") {
        allowedManagerIds = allowedManagerIds.has(actorProfileId) ? new Set([actorProfileId]) : new Set();
      }
    }
    allowedManagerIds.forEach((id) => recipients.add(id));
  }
  if (excludeId) recipients.delete(excludeId);
  return [...recipients];
}

async function createNotifications(
  admin: SupabaseAdminClient,
  params: {
    recipientIds: (string | null | undefined)[];
    actorId?: string | null;
    title: string;
    body: string;
    category: AppNotificationCategory;
    tone?: AppNotificationTone;
    eventKey?: string | null;
    metadata?: Record<string, string | number | boolean | null>;
  },
) {
  const recipientIds = [...new Set(params.recipientIds.filter((id): id is string => Boolean(id)))];
  if (recipientIds.length === 0) return;

  for (const recipientId of recipientIds) {
    const notificationPayload: Record<string, unknown> = {
      recipient_id: recipientId,
      actor_id: params.actorId ?? null,
      title: params.title,
      body: params.body,
      category: params.category,
      tone: params.tone ?? "info",
      event_key: params.eventKey ?? null,
      metadata: params.metadata ?? {},
    };
    let { error } = await admin.from("app_notifications").insert(notificationPayload);
    if (error && isMissingNotificationEventKeySchemaError(error)) {
      delete notificationPayload.event_key;
      const retry = await admin.from("app_notifications").insert(notificationPayload);
      error = retry.error;
    }
    if (isDuplicateError(error)) continue;
    if (error) {
      const failures = notificationFailureCollectors.get(admin);
      if (!failures) throw new Error(error.message);
      failures.push(error);
    }
  }
}

async function existingByClientRequest<T>(
  admin: SupabaseAdminClient,
  table: string,
  actorColumn: string,
  actorId: string,
  requestKey: string,
  columns = "*",
  businessId?: string,
) {
  let query = admin
    .from(table)
    .select(columns)
    .eq(actorColumn, actorId)
    .eq("client_request_id", requestKey);
  if (businessId) query = query.eq("business_id", businessId);
  const response = await query.maybeSingle();
  if (isMissingClientRequestSchemaError(response.error)) return null;
  if (response.error) throw new Error(response.error.message);
  return typedData<T>(response);
}

async function referencedRowCount(
  admin: SupabaseAdminClient,
  table: string,
  column: string,
  id: string,
) {
  const response = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, id);
  if (response.error) throw new Error(response.error.message);
  return response.count ?? 0;
}

type LibraryStudentFormFields = {
  rollNumber: string;
  studentName: string;
  phoneNumber: string | null;
  address: string | null;
  aadharNumber: string | null;
  seatNumber: string | null;
  lockerNumber: string | null;
  startTime: string | null;
  endTime: string | null;
  slotHours: number | null;
  subscriptionStartDate: string | null;
  subscriptionEndDate: string | null;
  feeAmount: number | null;
  paidAmount: number | null;
  duesAmount: number | null;
  advanceAmount: number | null;
};

function readLibraryStudentFields(
  formData: FormData,
  options: { requireSubscription: boolean; requirePayment: boolean },
): { ok: true; fields: LibraryStudentFormFields } | { ok: false; result: ActionResult } {
  const rollNumber = normalizeLibraryRollNumber(asString(formData, "roll_number"));
  const studentName = asString(formData, "customer_name") ?? asString(formData, "student_name");
  const phoneNumber = normalizePhoneNumber(asString(formData, "phone_number"));
  const address = asString(formData, "address");
  const aadharNumber = asString(formData, "aadhar_number");
  const startDate = asString(formData, "start_date");
  const endDate = asString(formData, "end_date");
  const startTime = normalizeClockTime(asString(formData, "start_time"));
  const endTime = normalizeClockTime(asString(formData, "end_time"));
  const feeAmount = asNumber(formData, "fee_amount");
  const paidAmount = asNumber(formData, "paid_amount") ?? asNumber(formData, "amount");
  const slotHours = slotHoursBetween(startTime, endTime);
  const hasSubscriptionDetails = Boolean(startDate || endDate || startTime || endTime || feeAmount !== null || paidAmount !== null);

  if (!rollNumber || !studentName) {
    return { ok: false, result: fail("Roll number and student name are required.") };
  }
  if (options.requireSubscription && (!startDate || !endDate || !isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate)) {
    return { ok: false, result: fail("Enter a valid subscription date range.") };
  }
  if ((startDate && !isIsoDate(startDate)) || (endDate && !isIsoDate(endDate)) || (startDate && endDate && endDate < startDate)) {
    return { ok: false, result: fail("Enter a valid subscription date range.") };
  }
  if ((options.requireSubscription || hasSubscriptionDetails) && (!startTime || !endTime || slotHours === null)) {
    return { ok: false, result: fail("Enter a valid library time slot.") };
  }
  if (options.requirePayment && (!paidAmount || paidAmount <= 0)) {
    return { ok: false, result: fail("Paid amount is required for library collection.") };
  }

  const duesAmount = feeAmount !== null && paidAmount !== null ? Math.max(feeAmount - paidAmount, 0) : null;
  const advanceAmount = feeAmount !== null && paidAmount !== null ? Math.max(paidAmount - feeAmount, 0) : null;

  return {
    ok: true,
    fields: {
      rollNumber,
      studentName,
      phoneNumber,
      address,
      aadharNumber,
      seatNumber: asString(formData, "seat_number"),
      lockerNumber: asString(formData, "locker_number"),
      startTime,
      endTime,
      slotHours,
      subscriptionStartDate: startDate,
      subscriptionEndDate: endDate,
      feeAmount,
      paidAmount,
      duesAmount,
      advanceAmount,
    },
  };
}

function libraryStudentPayload(
  fields: LibraryStudentFormFields,
  active: boolean,
  photoUrl?: string | null,
  aadharPhotoUrl?: string | null,
  aadharBackPhotoUrl?: string | null,
) {
  const payload: Record<string, unknown> = {
    roll_number: fields.rollNumber,
    phone_number: fields.phoneNumber,
    address: fields.address,
    aadhar_number: fields.aadharNumber,
    student_name: fields.studentName,
    seat_number: fields.seatNumber,
    locker_number: fields.lockerNumber,
    start_time: fields.startTime,
    end_time: fields.endTime,
    slot_hours: fields.slotHours,
    subscription_start_date: fields.subscriptionStartDate,
    subscription_end_date: fields.subscriptionEndDate,
    fee_amount: fields.feeAmount,
    paid_amount: fields.paidAmount,
    dues_amount: fields.duesAmount,
    advance_amount: fields.advanceAmount,
    active,
    placeholder: false,
  };
  if (photoUrl) payload.photo_url = photoUrl;
  if (aadharPhotoUrl) payload.aadhar_photo_url = aadharPhotoUrl;
  if (aadharBackPhotoUrl) payload.aadhar_back_photo_url = aadharBackPhotoUrl;
  return payload;
}

function libraryStudentIdentityPayload(
  fields: LibraryStudentFormFields,
  active: boolean,
  photoUrl?: string | null,
  aadharPhotoUrl?: string | null,
  aadharBackPhotoUrl?: string | null,
) {
  const payload: Record<string, unknown> = {
    roll_number: fields.rollNumber,
    phone_number: fields.phoneNumber,
    address: fields.address,
    aadhar_number: fields.aadharNumber,
    student_name: fields.studentName,
    seat_number: fields.seatNumber,
    locker_number: fields.lockerNumber,
    active,
    placeholder: false,
  };
  if (photoUrl) payload.photo_url = photoUrl;
  if (aadharPhotoUrl) payload.aadhar_photo_url = aadharPhotoUrl;
  if (aadharBackPhotoUrl) payload.aadhar_back_photo_url = aadharBackPhotoUrl;
  return payload;
}

async function upsertLibraryStudentEvent(
  admin: SupabaseAdminClient,
  params: {
    studentId: string;
    paymentId?: string | null;
    eventKey: string;
    eventType: "payment_renewal" | "manual_update" | "status_change";
    eventDate: string;
    source: string;
    fields: LibraryStudentFormFields;
    active: boolean;
    createdBy: string;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await admin.from("library_student_subscription_events").upsert(
    {
      library_student_id: params.studentId,
      payment_id: params.paymentId ?? null,
      event_key: params.eventKey,
      event_type: params.eventType,
      event_date: params.eventDate,
      source: params.source,
      subscription_start_date: params.fields.subscriptionStartDate,
      subscription_end_date: params.fields.subscriptionEndDate,
      fee_amount: params.fields.feeAmount,
      paid_amount: params.fields.paidAmount,
      dues_amount: params.fields.duesAmount,
      advance_amount: params.fields.advanceAmount,
      seat_number: params.fields.seatNumber,
      locker_number: params.fields.lockerNumber,
      start_time: params.fields.startTime,
      end_time: params.fields.endTime,
      active: params.active,
      created_by: params.createdBy,
      metadata: params.metadata ?? {},
    },
    { onConflict: "business_id,event_key" },
  );
  if (isMissingLibraryStudentSchemaError(error)) return;
  if (error) throw new Error(error.message);
}

async function saveLibraryStudentRecord(
  admin: SupabaseAdminClient,
  params: {
    id: string | null;
    fields: LibraryStudentFormFields;
    active: boolean;
    lastPaymentId?: string | null;
    lastPaymentDate?: string | null;
    currentSubscriptionKey?: string | null;
    photoUrl?: string | null;
    aadharPhotoUrl?: string | null;
    aadharBackPhotoUrl?: string | null;
    /** A saved payment that adds a subscription brings an inactive student back. */
    reactivate?: boolean;
  },
) {
  const payload: Record<string, unknown> = {
    ...libraryStudentPayload(params.fields, params.active, params.photoUrl, params.aadharPhotoUrl, params.aadharBackPhotoUrl),
  };
  if (params.lastPaymentId) payload.last_payment_id = params.lastPaymentId;
  if (params.lastPaymentDate) payload.last_payment_date = params.lastPaymentDate;
  if (params.currentSubscriptionKey) payload.current_subscription_key = params.currentSubscriptionKey;

  const studentId = normalizeLibraryStudentId(params.id);
  if (studentId) {
    const currentResponse = await admin
      .from("library_students")
      .select("subscription_start_date, subscription_end_date, last_payment_date, active")
      .eq("id", studentId)
      .single();
    const current = typedData<{
      subscription_start_date: string | null;
      subscription_end_date: string | null;
      last_payment_date: string | null;
      active: boolean;
    }>(currentResponse);
    if (currentResponse.error || !current) {
      if (isMissingLibraryStudentSchemaError(currentResponse.error)) {
        throw new Error("Apply the library student migration before saving student records.");
      }
      throw new Error(currentResponse.error?.message ?? "Could not load library student.");
    }

    const currentSubscriptionKey = [
      current.subscription_end_date ?? "",
      current.subscription_start_date ?? "",
      current.last_payment_date ?? "",
    ].join("|");
    const nextSubscriptionKey = [
      params.fields.subscriptionEndDate ?? "",
      params.fields.subscriptionStartDate ?? "",
      params.lastPaymentDate ?? "",
    ].join("|");
    if (currentSubscriptionKey > nextSubscriptionKey) {
      if (params.reactivate && !current.active) {
        const reactivated = await admin.from("library_students").update({ active: true }).eq("id", studentId);
        if (reactivated.error) throw new Error(reactivated.error.message);
      }
      return studentId;
    }
    // A payment refreshes the subscription snapshot; status changes only when a new subscription reactivates it.
    payload.active = current.active || Boolean(params.reactivate);
  }

  const query = studentId
    ? admin.from("library_students").update(payload).eq("id", studentId)
    : admin.from("library_students").insert(payload);
  const response = await query.select("id").single();
  const student = typedData<{ id: string }>(response);
  if (response.error || !student) {
    if (isMissingStudentSubscriptionCycleSchemaError(response.error)) {
      throw new Error("Apply the student subscription cycle migration before saving student payments.");
    }
    if (isMissingLibraryStudentSchemaError(response.error)) {
      throw new Error("Apply the library student migration before saving student records.");
    }
    if (isDuplicateError(response.error)) {
      throw new Error("roll number already exist.");
    }
    throw new Error(response.error?.message ?? "Could not save library student.");
  }
  return student.id;
}

async function saveLibraryStudentIdentityRecord(
  admin: SupabaseAdminClient,
  params: {
    id: string | null;
    fields: LibraryStudentFormFields;
    active: boolean;
    photoUrl?: string | null;
    aadharPhotoUrl?: string | null;
    aadharBackPhotoUrl?: string | null;
  },
) {
  const payload: Record<string, unknown> = {
    ...libraryStudentIdentityPayload(params.fields, params.active, params.photoUrl, params.aadharPhotoUrl, params.aadharBackPhotoUrl),
  };

  const studentId = normalizeLibraryStudentId(params.id);
  // Status is changed only through setStudentStatus; identity edits preserve it.
  if (studentId) delete payload.active;
  const query = studentId
    ? admin.from("library_students").update(payload).eq("id", studentId)
    : admin.from("library_students").insert(payload);
  const response = await query.select("id").single();
  const student = typedData<{ id: string }>(response);
  if (response.error || !student) {
    if (isMissingLibraryStudentSchemaError(response.error)) {
      throw new Error("Apply the library student migration before saving student records.");
    }
    if (isDuplicateError(response.error)) {
      throw new Error("roll number already exist.");
    }
    throw new Error(response.error?.message ?? "Could not save library student.");
  }
  return student.id;
}

function courseStudentIdentityKey(rollNumber: string | null, studentName: string | null, paymentId?: string | null) {
  if (rollNumber) return `roll:${rollNumber.toLowerCase()}`;
  if (studentName) return `name:${studentName.trim().replace(/\s+/g, " ").toLowerCase()}`;
  return paymentId ? `payment:${paymentId}` : null;
}

async function upsertCourseStudentRecord(
  admin: SupabaseAdminClient,
  params: {
    businessId: string;
    sourceCourseId: string;
    rollNumber: string | null;
    studentName: string | null;
    paymentId?: string | null;
    currentSubscriptionKey?: string | null;
    photoUrl?: string | null;
    phoneNumber?: string | null;
    address?: string | null;
    aadharNumber?: string | null;
    aadharPhotoUrl?: string | null;
    aadharBackPhotoUrl?: string | null;
    subscriptionStartDate?: string | null;
    subscriptionEndDate?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    slotHours?: number | null;
    feeAmount?: number | null;
    paidAmount?: number | null;
    duesAmount?: number | null;
    advanceAmount?: number | null;
    /** A saved payment that adds a subscription brings an inactive student back. */
    reactivate?: boolean;
  },
) {
  const identityKey = courseStudentIdentityKey(params.rollNumber, params.studentName, params.paymentId);
  if (!identityKey) throw new Error("Course student name or roll number is required.");
  const currentResponse = await admin
    .from("course_students")
    .select("*")
    .eq("business_id", params.businessId)
    .eq("source_course_id", params.sourceCourseId)
    .eq("identity_key", identityKey)
    .maybeSingle();
  if (isMissingCourseStudentSchemaError(currentResponse.error)) {
    throw new Error("Apply the transaction assignee and course student migration before saving course students.");
  }
  if (currentResponse.error) throw new Error(currentResponse.error.message);
  const current = typedData<CourseStudent>(currentResponse);
  const payload: Record<string, unknown> = {
    business_id: params.businessId,
    source_course_id: params.sourceCourseId,
    identity_key: identityKey,
    roll_number: params.rollNumber,
    student_name: params.studentName,
    subscription_start_date: params.subscriptionStartDate ?? null,
    subscription_end_date: params.subscriptionEndDate ?? null,
    start_time: params.startTime ?? null,
    end_time: params.endTime ?? null,
    slot_hours: params.slotHours ?? null,
    fee_amount: params.feeAmount ?? null,
    paid_amount: params.paidAmount ?? null,
    dues_amount: params.duesAmount ?? null,
    advance_amount: params.advanceAmount ?? null,
  };
  if (params.phoneNumber !== undefined) payload.phone_number = params.phoneNumber;
  if (params.address !== undefined) payload.address = params.address;
  if (params.aadharNumber !== undefined) payload.aadhar_number = params.aadharNumber;
  if (params.photoUrl) payload.photo_url = params.photoUrl;
  if (params.aadharPhotoUrl) payload.aadhar_photo_url = params.aadharPhotoUrl;
  if (params.aadharBackPhotoUrl) payload.aadhar_back_photo_url = params.aadharBackPhotoUrl;
  if (params.paymentId) payload.last_payment_id = params.paymentId;
  if (params.currentSubscriptionKey) payload.current_subscription_key = params.currentSubscriptionKey;
  if (!current || params.reactivate) payload.active = true;

  const result = current
    ? await admin.from("course_students").update(payload).eq("id", current.id).select("*").single()
    : await admin.from("course_students").insert(payload).select("*").single();
  if (result.error) {
    if (isMissingStudentSubscriptionCycleSchemaError(result.error)) {
      throw new Error("Apply the student subscription cycle migration before saving student payments.");
    }
    throw new Error(result.error.message);
  }
  const student = typedData<CourseStudent>(result);
  if (!student) throw new Error("Could not save course student.");
  return student;
}

function fieldsFromLibraryStudentRecord(record: Record<string, string | number | boolean | null>): LibraryStudentFormFields {
  return {
    rollNumber: String(record.roll_number ?? ""),
    studentName: String(record.student_name ?? ""),
    phoneNumber: typeof record.phone_number === "string" ? record.phone_number : null,
    address: typeof record.address === "string" ? record.address : null,
    aadharNumber: typeof record.aadhar_number === "string" ? record.aadhar_number : null,
    seatNumber: typeof record.seat_number === "string" ? record.seat_number : null,
    lockerNumber: typeof record.locker_number === "string" ? record.locker_number : null,
    startTime: typeof record.start_time === "string" ? normalizeClockTime(record.start_time) : null,
    endTime: typeof record.end_time === "string" ? normalizeClockTime(record.end_time) : null,
    slotHours: typeof record.slot_hours === "number" ? record.slot_hours : record.slot_hours ? Number(record.slot_hours) : null,
    subscriptionStartDate: typeof record.subscription_start_date === "string" ? record.subscription_start_date : null,
    subscriptionEndDate: typeof record.subscription_end_date === "string" ? record.subscription_end_date : null,
    feeAmount: typeof record.fee_amount === "number" ? record.fee_amount : record.fee_amount ? Number(record.fee_amount) : null,
    paidAmount: typeof record.paid_amount === "number" ? record.paid_amount : record.paid_amount ? Number(record.paid_amount) : null,
    duesAmount: typeof record.dues_amount === "number" ? record.dues_amount : record.dues_amount ? Number(record.dues_amount) : null,
    advanceAmount: typeof record.advance_amount === "number" ? record.advance_amount : record.advance_amount ? Number(record.advance_amount) : null,
  };
}

function valueMatches(current: unknown, next: unknown) {
  if (typeof next === "number") {
    return moneyToCents(Number(current ?? 0)) === moneyToCents(next);
  }
  return String(current ?? "") === String(next ?? "");
}

function allUpdatesMatch(record: Record<string, unknown>, updates: Record<string, unknown>) {
  return Object.entries(updates).every(([key, value]) => valueMatches(record[key], value));
}

function withErrors(
  fallbackMessage: string,
  handler: (formData: FormData, context: ActionContext) => Promise<ActionResult>,
) {
  return async (formData: FormData, context: ActionContext): Promise<ActionResult> => {
    try {
      return await handler(formData, context);
    } catch (error) {
      return {
        ok: false,
        ...normalizeActionError(error, {
          action: fallbackMessage,
          fallback: fallbackMessage,
          businessId: context.profile.businessId,
          userId: context.profile.id,
        }),
      };
    }
  };
}

const handlers = {
  markNotificationsRead: withErrors("Could not update notifications.", async (_formData, { admin, profile }) => {
    const { error } = await admin
      .from("app_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", profile.id)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return ok("Notifications marked as read.");
  }),

  updateProfile: withErrors("Could not update profile.", async (formData, { admin, profile, idempotencyKey }) => {
    const fullName = asString(formData, "full_name");
    const updates: Record<string, string> = {};
    const requestKey = idempotencyKey ?? crypto.randomUUID();

    if (fullName && fullName !== profile.full_name) {
      updates.full_name = fullName;
    }

    const uploadedPhoto = await uploadProfilePhoto(admin, profile.businessId, profile.id, formData.get("photo"), requestKey);
    if (uploadedPhoto && typeof uploadedPhoto === "object" && "ok" in uploadedPhoto && !uploadedPhoto.ok) return uploadedPhoto;
    if (typeof uploadedPhoto === "string") {
      updates.avatar_url = uploadedPhoto;
    }

    if (Object.keys(updates).length === 0) return ok("No profile changes to save.");

    const { error } = await admin.from("profiles").update(updates).eq("id", profile.id);
    if (error) throw new Error(error.message);

    return ok("Profile updated.");
  }),

  saveStaffPermissions: withErrors("Could not save permissions.", async (formData, { admin, profile, idempotencyKey }) => {
    requireBusinessOwner(profile.businessRole);

    const profileId = asString(formData, "profile_id");
    if (!profileId) return fail("Missing staff profile.");

    const targetMembershipResponse = await admin
      .from("business_memberships")
      .select("id,role")
      .eq("business_id", profile.businessId)
      .eq("profile_id", profileId)
      .single();
    const targetMembership = typedData<{ id: string; role: BusinessRole }>(targetMembershipResponse);
    if (targetMembershipResponse.error || !targetMembership) {
      throw new Error(targetMembershipResponse.error?.message ?? "Staff membership not found.");
    }

    if (targetMembership.role !== "staff") return fail("Granular permissions apply only to staff memberships.");
    const permissions = permissionsFromForm(formData);
    const { error } = await admin.rpc("replace_staff_permissions", {
      target_business_id: profile.businessId,
      target_membership_id: targetMembership.id,
      target_permissions: permissions,
    });
    if (error) throw new Error(error.message);

    await createNotifications(admin, {
      recipientIds: profileId === profile.id ? [] : [profileId],
      actorId: profile.id,
      title: "Permissions updated",
      body: `${profile.full_name} updated your staff permissions.`,
      category: "settings",
      tone: "info",
      eventKey: `staff-permissions:${profileId}:${idempotencyKey ?? permissions.sort().join(",")}`,
      metadata: { permission_count: permissions.length },
    });
    return ok("Permissions saved.");
  }),

  deleteUser: withErrors("Could not remove user.", async (formData, { admin, authAdmin, profile }) => {
    requireBusinessOwner(profile.businessRole);

    const profileId = asString(formData, "profile_id");
    if (!profileId) return fail("Choose a user.");
    if (profileId === profile.id) return fail("You cannot delete your own account while logged in.");

    const targetMembershipResponse = await admin
      .from("business_memberships")
      .select("id,role,status")
      .eq("business_id", profile.businessId)
      .eq("profile_id", profileId)
      .single();
    const targetMembership = typedData<{ id: string; role: BusinessRole; status: string }>(targetMembershipResponse);
    if (targetMembershipResponse.error || !targetMembership) throw new Error(targetMembershipResponse.error?.message ?? "Membership not found.");
    if (targetMembership.role === "primary_owner") return fail("Transfer ownership before removing the Owner.");
    if (profile.businessRole === "co_owner" && targetMembership.role === "co_owner") return fail("Managers cannot remove other Managers.");

    const { error } = await admin.from("business_memberships").update({ status: "suspended", suspended_at: new Date().toISOString() }).eq("id", targetMembership.id);
    if (error) throw new Error(error.message);
    if (targetMembership.role === "sales_agent") {
      const { error: referralError } = await authAdmin
        .from("referral_codes")
        .update({ active: false })
        .eq("business_id", profile.businessId)
        .eq("agent_id", profileId);
      if (referralError) throw new Error(referralError.message);
    }
    await admin.from("audit_events").insert({
      business_id: profile.businessId,
      actor_profile_id: profile.id,
      event_type: "membership_suspended",
      entity_type: "business_membership",
      entity_id: targetMembership.id,
      before_data: { status: targetMembership.status },
      after_data: { status: "suspended" },
    });

    return ok("Business access suspended. Historical records were preserved.");
  }),

  createPayment: withErrors("Could not save payment.", async (formData, { admin, profile, idempotencyKey }) => {
    if (isBusinessSalesAgent(profile.businessRole)) {
      return fail("Sales agents have read-only incentive access.");
    }

    const business = asString(formData, "business_type") as BusinessType | null;
    const mode = (asString(formData, "mode") ?? "cash") as PaymentMode;
    const amount = asNumber(formData, "amount") ?? asNumber(formData, "paid_amount") ?? 0;
    const paymentDate = asString(formData, "payment_date") ?? dateIsoInTimeZone(new Date(), profile.businessTimezone || undefined);
    const requestKey = idempotencyKey ?? crypto.randomUUID();
    const ownerCreated = isBusinessOwner(profile.businessRole);

    if (!business || amount <= 0) return fail("Business type and amount are required.");
    const hasAccess = await hasBusinessCollectionAccess(admin, profile, business);
    if (!hasAccess) return fail("You do not have access to this collection type.");

    const existingPayment = await existingByClientRequest<{ id: string }>(
      admin,
      "payments",
      "collected_by",
      profile.id,
      requestKey,
      "id",
    );
    if (existingPayment) return ok("Payment saved.");

    let fee = asNumber(formData, "fee_amount");
    let paid = asNumber(formData, "paid_amount") ?? amount;
    let due = fee !== null ? Math.max(fee - paid, 0) : null;
    let advance = fee !== null ? Math.max(paid - fee, 0) : null;
    let cashCollection = mode === "cash" ? amount : 0;
    let onlineCollection = mode === "online" ? amount : 0;
    if (mode === "mixed") {
      cashCollection = asNumber(formData, "cash_collection") ?? 0;
      onlineCollection = asNumber(formData, "online_collection") ?? 0;
      if (
        cashCollection <= 0 ||
        onlineCollection <= 0 ||
        moneyToCents(cashCollection) + moneyToCents(onlineCollection) !== moneyToCents(amount)
      ) {
        return fail("Cash and online collections must add up to the paid amount.");
      }
    }

    const roomId = asString(formData, "room_id");
    const courseId = asString(formData, "course_id");
    const requestedCourseStudentId = asString(formData, "course_student_id");
    const libraryPaymentKind = asString(formData, "library_payment_kind") === "dues" ? "dues" : "renewal";
    const coursePaymentKind = asString(formData, "course_payment_kind") === "dues" ? "dues" : "renewal";
    const referralCodeText = asString(formData, "referral_code");
    let libraryStudentId: string | null = null;
    let libraryStudentFields: LibraryStudentFormFields | null = null;
    let libraryStudentPhotoUrl: string | null = null;
    let libraryStudentSyncSkipped = false;
    let libraryPaymentEventKeyPrefix = "library-payment-renewal";
    let libraryPaymentEventSource = "library_payment";
    let aadharPhotoUrl: string | null = null;
    let aadharBackPhotoUrl: string | null = null;
    let courseStudentPhotoUrl: string | null = null;
    let courseStudent: CourseStudent | null = null;
    let savedLibraryStudent: LibraryStudent | null = null;
    let studentSubscriptionKey: string | null = null;

    if (business === "library" || business === "course") {
      const [uploadedAadharPhoto, uploadedAadharBackPhoto] = await Promise.all([
        uploadLibraryStudentAadharPhoto(admin, profile.businessId, profile.id, formData.get("aadhar_photo"), requestKey, "front"),
        uploadLibraryStudentAadharPhoto(admin, profile.businessId, profile.id, formData.get("aadhar_back_photo"), requestKey, "back"),
      ]);
      if (uploadedAadharPhoto && typeof uploadedAadharPhoto === "object" && "ok" in uploadedAadharPhoto && !uploadedAadharPhoto.ok) {
        return uploadedAadharPhoto;
      }
      if (uploadedAadharBackPhoto && typeof uploadedAadharBackPhoto === "object" && "ok" in uploadedAadharBackPhoto && !uploadedAadharBackPhoto.ok) {
        return uploadedAadharBackPhoto;
      }
      aadharPhotoUrl = typeof uploadedAadharPhoto === "string" ? uploadedAadharPhoto : null;
      aadharBackPhotoUrl = typeof uploadedAadharBackPhoto === "string" ? uploadedAadharBackPhoto : null;
    }

    if (business === "course") {
      const uploadedStudentPhoto = await uploadLibraryStudentPhoto(
        admin,
        profile.businessId,
        profile.id,
        formData.get("student_photo"),
        requestKey,
      );
      if (uploadedStudentPhoto && typeof uploadedStudentPhoto === "object" && "ok" in uploadedStudentPhoto && !uploadedStudentPhoto.ok) {
        return uploadedStudentPhoto;
      }
      courseStudentPhotoUrl = typeof uploadedStudentPhoto === "string" ? uploadedStudentPhoto : null;
    }

    if (business === "library") {
      if (libraryPaymentKind === "dues") {
        libraryPaymentEventKeyPrefix = "library-due-payment";
        libraryPaymentEventSource = "library_due_payment";
        libraryStudentId = normalizeLibraryStudentId(asString(formData, "library_student_id"));
        if (!libraryStudentId) return fail("Select a library student before collecting dues.");

        const studentResponse = await admin.from("library_students").select("*").eq("id", libraryStudentId).single();
        const studentRecord = typedData<Record<string, string | number | boolean | null>>(studentResponse);
        if (studentResponse.error || !studentRecord) {
          if (isMissingLibraryStudentSchemaError(studentResponse.error)) {
            return fail("Apply the library student migration before collecting dues.");
          }
          throw new Error(studentResponse.error?.message ?? "Could not load library student.");
        }

        const currentFields = fieldsFromLibraryStudentRecord(studentRecord);
        const previousDue = asNumber(formData, "previous_due_amount") ?? currentFields.duesAmount ?? 0;
        if (previousDue <= 0) return fail("No dues are pending for this student.");

        const previousPaid = asNumber(formData, "previous_paid_amount") ?? currentFields.paidAmount ?? 0;
        const nextDue = Math.max(previousDue - amount, 0);
        const nextAdvance = Math.max(amount - previousDue, 0);
        fee = currentFields.feeAmount;
        paid = previousPaid + amount;
        due = nextDue;
        advance = nextAdvance;
        libraryStudentFields = {
          ...currentFields,
          paidAmount: paid,
          duesAmount: nextDue,
          advanceAmount: nextAdvance,
        };
        studentSubscriptionKey = typeof studentRecord.current_subscription_key === "string"
          ? studentRecord.current_subscription_key
          : crypto.randomUUID();
      } else {
        studentSubscriptionKey = crypto.randomUUID();
        const parsedStudent = readLibraryStudentFields(formData, { requireSubscription: true, requirePayment: true });
        if (!parsedStudent.ok) return parsedStudent.result;
        libraryStudentFields = parsedStudent.fields;
        libraryStudentId = normalizeLibraryStudentId(asString(formData, "library_student_id"));
        if (libraryStudentId) {
          const existingStudentResponse = await admin
            .from("library_students")
            .select("id,active")
            .eq("business_id", profile.businessId)
            .eq("id", libraryStudentId)
            .maybeSingle();
          if (existingStudentResponse.error && !isMissingLibraryStudentSchemaError(existingStudentResponse.error)) {
            throw new Error(existingStudentResponse.error.message);
          }
          const existingStudent = typedData<{ id: string; active: boolean }>(existingStudentResponse);
          if (!existingStudent) return fail("The selected library student was not found.");
        }
        const uploadedStudentPhoto = await uploadLibraryStudentPhoto(admin, profile.businessId, profile.id, formData.get("student_photo"), requestKey);
        if (uploadedStudentPhoto && typeof uploadedStudentPhoto === "object" && "ok" in uploadedStudentPhoto && !uploadedStudentPhoto.ok) {
          return uploadedStudentPhoto;
        }
        libraryStudentPhotoUrl = typeof uploadedStudentPhoto === "string" ? uploadedStudentPhoto : null;
        try {
          libraryStudentId = await saveLibraryStudentRecord(admin, {
            id: libraryStudentId,
            fields: libraryStudentFields,
            active: true,
            currentSubscriptionKey: studentSubscriptionKey,
            photoUrl: libraryStudentPhotoUrl,
            aadharPhotoUrl,
            aadharBackPhotoUrl,
          });
        } catch (error) {
          if (!isMissingLibraryStudentSchemaError(error)) throw error;
          libraryStudentSyncSkipped = true;
          libraryStudentId = null;
        }
      }
    }

    const [photoPath, roomResponse, referralResponse] = await Promise.all([
      uploadReceipt(admin, profile.businessId, formData.get("photo"), "payments", requestKey),
      roomId
        ? admin.from("rooms").select("room_number").eq("id", roomId).single()
        : Promise.resolve({ data: null, error: null } satisfies QueryResponse<unknown>),
      referralCodeText
        ? admin
            .from("referral_codes")
            .select("id, agent_id, discount_type, discount_value, incentive_type, incentive_value")
            .ilike("code", referralCodeText)
            .eq("active", true)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null } satisfies QueryResponse<unknown>),
    ]);

    const room = typedData<{ room_number: string }>(roomResponse);
    const roomSnapshot = room?.room_number ?? null;
    let referralCodeId = null;
    let referralAgentId = null;
    let discountAmountApplied = 0;
    let incentiveAmount = 0;
    if (referralCodeText) {
      const referral = typedData<{
        id: string;
        agent_id: string | null;
        discount_type: string | null;
        discount_value: number | null;
        incentive_type: string | null;
        incentive_value: number | null;
      }>(referralResponse);
      if (!referral) return fail("Referral code was not found or is inactive.");
      referralCodeId = referral.id;
      referralAgentId = referral.agent_id;
      const referralBase = fee ?? paid ?? amount;
      discountAmountApplied = calculateConfiguredAmount(referral.discount_type, referral.discount_value, referralBase);
      incentiveAmount = calculateConfiguredAmount(referral.incentive_type, referral.incentive_value, paid ?? amount);
    }

    if (business === "course") {
      const sourceCourseId = courseId;
      if (!sourceCourseId) return fail("Choose a course.");
      let existingCourseStudent: CourseStudent | null = null;
      if (requestedCourseStudentId) {
        const existingStudentResponse = await admin
          .from("course_students")
          .select("*")
          .eq("business_id", profile.businessId)
          .eq("id", requestedCourseStudentId)
          .maybeSingle();
        if (existingStudentResponse.error && !isMissingCourseStudentSchemaError(existingStudentResponse.error)) {
          throw new Error(existingStudentResponse.error.message);
        }
        existingCourseStudent = typedData<CourseStudent>(existingStudentResponse);
        if (!existingCourseStudent || existingCourseStudent.source_course_id !== sourceCourseId) {
          return fail("The selected course student was not found.");
        }
      }

      if (coursePaymentKind === "dues") {
        if (!existingCourseStudent) return fail("Select a course student before collecting dues.");
        const previousDue = Math.max(Number(existingCourseStudent.dues_amount ?? 0), 0);
        if (previousDue <= 0) return fail("No dues are pending for this student.");
        const previousPaid = Math.max(Number(existingCourseStudent.paid_amount ?? 0), 0);
        fee = existingCourseStudent.fee_amount;
        paid = previousPaid + amount;
        due = Math.max(previousDue - amount, 0);
        advance = Math.max(amount - previousDue, 0);
        studentSubscriptionKey = existingCourseStudent.current_subscription_key ?? crypto.randomUUID();
      } else {
        studentSubscriptionKey = crypto.randomUUID();
      }

      courseStudent = await upsertCourseStudentRecord(admin, {
        businessId: profile.businessId,
        sourceCourseId,
        rollNumber: existingCourseStudent?.roll_number ?? normalizeLibraryRollNumber(asString(formData, "roll_number")),
        studentName: existingCourseStudent?.student_name ?? asString(formData, "customer_name"),
        currentSubscriptionKey: studentSubscriptionKey,
        photoUrl: courseStudentPhotoUrl,
        phoneNumber: existingCourseStudent?.phone_number ?? asString(formData, "phone_number"),
        address: existingCourseStudent?.address ?? asString(formData, "address"),
        aadharNumber: existingCourseStudent?.aadhar_number ?? asString(formData, "aadhar_number"),
        aadharPhotoUrl,
        aadharBackPhotoUrl,
        subscriptionStartDate: coursePaymentKind === "dues"
          ? existingCourseStudent?.subscription_start_date
          : asString(formData, "start_date"),
        subscriptionEndDate: coursePaymentKind === "dues"
          ? existingCourseStudent?.subscription_end_date
          : asString(formData, "end_date"),
        startTime: coursePaymentKind === "dues"
          ? existingCourseStudent?.start_time
          : normalizeClockTime(asString(formData, "start_time")),
        endTime: coursePaymentKind === "dues"
          ? existingCourseStudent?.end_time
          : normalizeClockTime(asString(formData, "end_time")),
        slotHours: coursePaymentKind === "dues"
          ? existingCourseStudent?.slot_hours
          : asNumber(formData, "slot_hours"),
        feeAmount: fee,
        paidAmount: paid,
        duesAmount: due,
        advanceAmount: advance,
      });
    }

    const createdAt = new Date().toISOString();
    const paymentPayload: Record<string, unknown> = {
      business_type: business,
      mode,
      amount,
      cash_collection: cashCollection,
      online_collection: onlineCollection,
      fee_amount: fee,
      paid_amount: paid,
      dues_amount: due,
      advance_amount: advance,
      payment_date: paymentDate,
      start_date: libraryStudentFields?.subscriptionStartDate
        ?? (business === "course" && coursePaymentKind === "dues" ? courseStudent?.subscription_start_date : asString(formData, "start_date")),
      end_date: libraryStudentFields?.subscriptionEndDate
        ?? (business === "course" && coursePaymentKind === "dues" ? courseStudent?.subscription_end_date : asString(formData, "end_date")),
      customer_name: libraryStudentFields?.studentName
        ?? (business === "course" && coursePaymentKind === "dues" ? courseStudent?.student_name : asString(formData, "customer_name")),
      roll_number: libraryStudentFields?.rollNumber
        ?? (business === "course" && coursePaymentKind === "dues" ? courseStudent?.roll_number : asString(formData, "roll_number")),
      room_id: roomId,
      room_number_snapshot: roomSnapshot,
      seat_number: libraryStudentFields?.seatNumber ?? asString(formData, "seat_number"),
      start_time: libraryStudentFields?.startTime
        ?? (business === "course" && coursePaymentKind === "dues" ? courseStudent?.start_time : asString(formData, "start_time")),
      end_time: libraryStudentFields?.endTime
        ?? (business === "course" && coursePaymentKind === "dues" ? courseStudent?.end_time : asString(formData, "end_time")),
      slot_hours: libraryStudentFields?.slotHours
        ?? (business === "course" && coursePaymentKind === "dues" ? courseStudent?.slot_hours : asNumber(formData, "slot_hours")),
      course_id: courseId,
      course_student_id: courseStudent?.id ?? null,
      student_subscription_key: studentSubscriptionKey,
      referral_code_id: referralCodeId,
      referral_code_snapshot: referralCodeText,
      referral_agent_id: referralAgentId,
      discount_amount_applied: discountAmountApplied,
      incentive_amount: incentiveAmount,
      description: asString(formData, "description"),
      remark: asString(formData, "remark"),
      photo_path: photoPath,
      collected_by: profile.id,
      assigned_profile_id: profile.id,
      current_holder_id: cashCollection > 0 ? profile.id : null,
      approval_status: ownerCreated ? "approved" : "pending",
      cash_approval_status: cashCollection > 0 ? (ownerCreated ? "approved" : "pending") : null,
      online_approval_status: onlineCollection > 0 ? (ownerCreated ? "approved" : "pending") : null,
      cash_approved_at: ownerCreated && cashCollection > 0 ? createdAt : null,
      online_approved_at: ownerCreated && onlineCollection > 0 ? createdAt : null,
      cash_posted_on: ownerCreated && cashCollection > 0 ? paymentDate : null,
      online_posted_on: ownerCreated && onlineCollection > 0 ? paymentDate : null,
      cash_approved_by: ownerCreated && cashCollection > 0 ? profile.id : null,
      online_approved_by: ownerCreated && onlineCollection > 0 ? profile.id : null,
      approved_by: ownerCreated ? profile.id : null,
      approved_at: ownerCreated ? createdAt : null,
      client_request_id: requestKey,
    };
    if (libraryStudentId) {
      paymentPayload.library_student_id = libraryStudentId;
    }
    if (aadharPhotoUrl) paymentPayload.aadhar_photo_url = aadharPhotoUrl;
    if (aadharBackPhotoUrl) paymentPayload.aadhar_back_photo_url = aadharBackPhotoUrl;

    const paymentPayloadForInsert = { ...paymentPayload };
    let paymentResult: QueryResponse<unknown>;
    while (true) {
      paymentResult = await admin
        .from("payments")
        .insert(paymentPayloadForInsert)
        .select("*")
        .single();

      if (!paymentResult.error) break;

      if (
        isMissingStudentAadharSidesSchemaError(paymentResult.error) &&
        ("aadhar_photo_url" in paymentPayloadForInsert || "aadhar_back_photo_url" in paymentPayloadForInsert)
      ) {
        return fail("Apply the student Aadhar sides migration before saving Aadhar images.");
      }

      if (isMissingStudentSubscriptionCycleSchemaError(paymentResult.error)) {
        return fail("Apply the student subscription cycle migration before saving student payments.");
      }

      if (
        isMissingPaymentApprovalJourneySchemaError(paymentResult.error) &&
        "approved_by" in paymentPayloadForInsert
      ) {
        delete paymentPayloadForInsert.approved_by;
        delete paymentPayloadForInsert.approved_at;
        continue;
      }

      if (
        isMissingPaymentApprovalPostingSchemaError(paymentResult.error) &&
        ("cash_posted_on" in paymentPayloadForInsert || "online_posted_on" in paymentPayloadForInsert)
      ) {
        return fail("Apply the approval-date posting migration before saving payments.");
      }

      if (
        isMissingPaymentComponentApprovalSchemaError(paymentResult.error) &&
        "cash_approval_status" in paymentPayloadForInsert
      ) {
        if (mode === "mixed") {
          return fail("Apply the mixed payment approval migration before saving mixed payments.");
        }
        delete paymentPayloadForInsert.cash_approval_status;
        delete paymentPayloadForInsert.online_approval_status;
        delete paymentPayloadForInsert.cash_approved_at;
        delete paymentPayloadForInsert.online_approved_at;
        continue;
      }

      if (isMissingPaymentSplitSchemaError(paymentResult.error) && "cash_collection" in paymentPayloadForInsert) {
        if (mode === "mixed") {
          return fail("Mixed payments need the latest database migration before they can be saved.");
        }
        delete paymentPayloadForInsert.cash_collection;
        delete paymentPayloadForInsert.online_collection;
        continue;
      }

      if (isMissingLibraryStudentSchemaError(paymentResult.error) && "library_student_id" in paymentPayloadForInsert) {
        delete paymentPayloadForInsert.library_student_id;
        libraryStudentSyncSkipped = true;
        libraryStudentId = null;
        continue;
      }

      if (isMissingClientRequestSchemaError(paymentResult.error) && "client_request_id" in paymentPayloadForInsert) {
        delete paymentPayloadForInsert.client_request_id;
        continue;
      }

      break;
    }

    const payment = typedData<Payment>(paymentResult);
    if (paymentResult.error || !payment) {
      if (isDuplicateError(paymentResult.error)) {
        const duplicatePayment = await existingByClientRequest<{ id: string }>(
          admin,
          "payments",
          "collected_by",
          profile.id,
          requestKey,
          "id",
        );
        if (duplicatePayment) return ok("Payment saved.");
      }
      throw new Error(paymentResult.error?.message ?? "Could not save payment.");
    }

    if (libraryStudentId && libraryStudentFields && !libraryStudentSyncSkipped) {
      try {
        await saveLibraryStudentRecord(admin, {
          id: libraryStudentId,
          fields: libraryStudentFields,
          active: true,
          lastPaymentId: payment.id,
          lastPaymentDate: paymentDate,
          currentSubscriptionKey: studentSubscriptionKey,
          // A subscription still running today (or starting later) brings an inactive student back.
          reactivate: libraryPaymentKind !== "dues"
            && (libraryStudentFields.subscriptionEndDate ?? "") >= dateIsoInTimeZone(new Date(), profile.businessTimezone || undefined),
          photoUrl: libraryStudentPhotoUrl,
          aadharPhotoUrl,
          aadharBackPhotoUrl,
        });
        const savedStudentResponse = await admin.from("library_students").select("*").eq("id", libraryStudentId).single();
        savedLibraryStudent = typedData<LibraryStudent>(savedStudentResponse);
        if (savedStudentResponse.error || !savedLibraryStudent) {
          throw new Error(savedStudentResponse.error?.message ?? "Could not load updated library student.");
        }
        savedLibraryStudent = await signedLibraryStudentPatch(admin, savedLibraryStudent);
        await upsertLibraryStudentEvent(admin, {
          studentId: libraryStudentId,
          paymentId: payment.id,
          eventKey: `${libraryPaymentEventKeyPrefix}:${payment.id}`,
          eventType: "payment_renewal",
          eventDate: paymentDate,
          source: libraryPaymentEventSource,
          fields: libraryStudentFields,
          active: savedLibraryStudent.active,
          createdBy: profile.id,
          metadata: { amount, mode, payment_kind: libraryPaymentEventSource },
        });
      } catch (error) {
        if (!isMissingLibraryStudentSchemaError(error)) throw error;
        libraryStudentSyncSkipped = true;
      }
    }

    if (courseStudent) {
      courseStudent = await upsertCourseStudentRecord(admin, {
        businessId: profile.businessId,
        sourceCourseId: courseStudent.source_course_id,
        rollNumber: courseStudent.roll_number,
        studentName: courseStudent.student_name,
        paymentId: payment.id,
        reactivate: coursePaymentKind !== "dues"
          && String(payment.end_date ?? "") >= dateIsoInTimeZone(new Date(), profile.businessTimezone || undefined),
        currentSubscriptionKey: studentSubscriptionKey,
        aadharPhotoUrl,
        aadharBackPhotoUrl,
        subscriptionStartDate: payment.start_date,
        subscriptionEndDate: payment.end_date,
        startTime: payment.start_time,
        endTime: payment.end_time,
        slotHours: payment.slot_hours,
        feeAmount: payment.fee_amount,
        paidAmount: payment.paid_amount,
        duesAmount: payment.dues_amount,
        advanceAmount: payment.advance_amount,
      });
      courseStudent = await signedCourseStudentPatch(admin, courseStudent);
    }

    if (ownerCreated && cashCollection > 0) {
      await ensureLedgerEntry(admin, {
        accountProfileId: profile.id,
        businessType: business,
        amount: cashCollection,
        entryDate: paymentDate,
        sourceType: "payment",
        sourceId: payment.id,
        description: `Cash collected for ${business.replace("_", " ")}`,
        createdBy: profile.id,
      });
    }

    await createNotifications(admin, {
      recipientIds: await ownerRecipientIds(admin, profile.businessId, profile.id, business, profile.id),
      actorId: profile.id,
      title: "New payment entry",
      body: `${profile.full_name} saved a ${business.replace("_", " ")} payment of ${amount}.`,
      category: "payment",
      tone: "info",
      eventKey: `payment-created:${payment.id}`,
      metadata: { payment_id: payment.id, business_type: business, amount },
    });

    if (referralAgentId) {
      await createNotifications(admin, {
        recipientIds: [referralAgentId],
        actorId: profile.id,
        title: "Agent coupon used",
        body: `${referralCodeText} was tagged on a payment. Incentive: ${incentiveAmount}.`,
        category: "agent",
        tone: "success",
        eventKey: `payment-referral:${payment.id}`,
        metadata: { payment_id: payment.id, referral_code: referralCodeText, incentive_amount: incentiveAmount },
      });
    }

    const message = libraryStudentSyncSkipped
      ? "Payment saved. Apply the library student migration to update student records automatically."
      : "Payment saved.";
    if (savedLibraryStudent) {
      return ok(message, {
        type: "student",
        studentType: "library",
        student: savedLibraryStudent,
        payment,
      });
    }
    if (courseStudent) {
      return ok(message, {
        type: "student",
        studentType: "course",
        student: courseStudent,
        payment,
      });
    }
    return ok(message);
  }),

  saveLibraryStudent: withErrors("Could not save library student.", async (formData, { admin, profile, idempotencyKey }) => {
    await requireLibraryCollectionAccess(admin, profile);
    const parsedStudent = readLibraryStudentFields(formData, { requireSubscription: false, requirePayment: false });
    if (!parsedStudent.ok) return parsedStudent.result;
    const requestKey = idempotencyKey ?? crypto.randomUUID();

    const [uploadedStudentPhoto, uploadedAadharPhoto, uploadedAadharBackPhoto] = await Promise.all([
      uploadLibraryStudentPhoto(admin, profile.businessId, profile.id, formData.get("student_photo"), requestKey),
      uploadLibraryStudentAadharPhoto(admin, profile.businessId, profile.id, formData.get("aadhar_photo"), requestKey, "front"),
      uploadLibraryStudentAadharPhoto(admin, profile.businessId, profile.id, formData.get("aadhar_back_photo"), requestKey, "back"),
    ]);
    if (uploadedStudentPhoto && typeof uploadedStudentPhoto === "object" && "ok" in uploadedStudentPhoto && !uploadedStudentPhoto.ok) {
      return uploadedStudentPhoto;
    }
    if (uploadedAadharPhoto && typeof uploadedAadharPhoto === "object" && "ok" in uploadedAadharPhoto && !uploadedAadharPhoto.ok) {
      return uploadedAadharPhoto;
    }
    if (uploadedAadharBackPhoto && typeof uploadedAadharBackPhoto === "object" && "ok" in uploadedAadharBackPhoto && !uploadedAadharBackPhoto.ok) {
      return uploadedAadharBackPhoto;
    }

    const studentId = await saveLibraryStudentIdentityRecord(admin, {
      id: asString(formData, "id"),
      fields: parsedStudent.fields,
      active: true,
      photoUrl: typeof uploadedStudentPhoto === "string" ? uploadedStudentPhoto : null,
      aadharPhotoUrl: typeof uploadedAadharPhoto === "string" ? uploadedAadharPhoto : null,
      aadharBackPhotoUrl: typeof uploadedAadharBackPhoto === "string" ? uploadedAadharBackPhoto : null,
    });
    const savedResponse = await admin.from("library_students").select("*").eq("id", studentId).single();
    const saved = typedData<LibraryStudent>(savedResponse);
    if (savedResponse.error || !saved) throw new Error(savedResponse.error?.message ?? "Could not load saved student.");
    const signedSaved = await signedLibraryStudentPatch(admin, saved);

    return ok("Library student saved.", {
      type: "student",
      studentType: "library",
      student: signedSaved,
    });
  }),

  setStudentStatus: withErrors("Could not update student status.", async (formData, { admin, profile, idempotencyKey }) => {
    const studentType = asString(formData, "student_type") === "course" ? "course" : "library";
    let id = asString(formData, "id");
    const active = asBool(formData, "active");
    const previousId = id;
    if (!id) return fail("Choose a student.");

    if (studentType === "course") {
      if (!(await hasBusinessCollectionAccess(admin, profile, "course"))) {
        return fail("You do not have access to course students.");
      }
      const courseResponse = await admin.from("course_students").select("*").eq("id", id).single();
      if (isMissingCourseStudentSchemaError(courseResponse.error)) {
        return fail("Apply the transaction assignee and course student migration before updating course students.");
      }
      const existing = typedData<CourseStudent>(courseResponse);
      if (courseResponse.error || !existing) throw new Error(courseResponse.error?.message ?? "Course student not found.");
      const updateResponse = await admin
        .from("course_students")
        .update({ active })
        .eq("id", id)
        .select("*")
        .single();
      const updated = typedData<CourseStudent>(updateResponse);
      if (updateResponse.error || !updated) throw new Error(updateResponse.error?.message ?? "Could not update student status.");
      const signedUpdated = await signedCourseStudentPatch(admin, updated);
      return ok(active ? "Course student reactivated." : "Course student moved to inactive.", {
        type: "student",
        studentType: "course",
        student: signedUpdated,
      });
    }

    await requireLibraryCollectionAccess(admin, profile);
    if (!normalizeLibraryStudentId(id)) {
      const paymentId = asString(formData, "payment_id");
      if (!paymentId) return fail("This payment-derived student must be opened again before changing status.");
      const paymentResponse = await admin.from("payments").select("*").eq("id", paymentId).single();
      const payment = typedData<Payment>(paymentResponse);
      if (paymentResponse.error || !payment || payment.business_type !== "library") {
        return fail("Library student payment was not found.");
      }
      id = await saveLibraryStudentRecord(admin, {
        id: null,
        fields: {
          rollNumber: normalizeLibraryRollNumber(payment.roll_number) ?? "",
          studentName: payment.customer_name ?? "",
          phoneNumber: null,
          address: null,
          aadharNumber: null,
          seatNumber: payment.seat_number,
          lockerNumber: null,
          startTime: payment.start_time,
          endTime: payment.end_time,
          slotHours: payment.slot_hours,
          subscriptionStartDate: payment.start_date,
          subscriptionEndDate: payment.end_date,
          feeAmount: payment.fee_amount,
          paidAmount: payment.paid_amount,
          duesAmount: payment.dues_amount,
          advanceAmount: payment.advance_amount,
        },
        active: true,
        lastPaymentId: payment.id,
        lastPaymentDate: payment.payment_date,
        aadharPhotoUrl: payment.aadhar_photo_url,
        aadharBackPhotoUrl: payment.aadhar_back_photo_url,
      });
    }

    const response = await admin.from("library_students").select("*").eq("id", id).single();
    const student = typedData<LibraryStudent>(response);
    if (isMissingLibraryStudentSchemaError(response.error)) {
      return fail("Apply the library student migration before updating student status.");
    }
    if (response.error || !student) throw new Error(response.error?.message ?? "Library student not found.");

    const updateResponse = await admin
      .from("library_students")
      .update({ active, placeholder: active ? false : Boolean(student.placeholder) })
      .eq("id", id)
      .select("*")
      .single();
    const updated = typedData<LibraryStudent>(updateResponse);
    if (isMissingLibraryStudentSchemaError(updateResponse.error)) {
      return fail("Apply the library student migration before updating student status.");
    }
    if (updateResponse.error || !updated) throw new Error(updateResponse.error?.message ?? "Could not update student status.");

    await upsertLibraryStudentEvent(admin, {
      studentId: id,
      eventKey: `library-student-status:${id}:${idempotencyKey ?? crypto.randomUUID()}`,
      eventType: "status_change",
      eventDate: dateIsoInTimeZone(new Date(), profile.businessTimezone || undefined),
      source: "student_status",
      fields: fieldsFromLibraryStudentRecord(updated as unknown as Record<string, string | number | boolean | null>),
      active,
      createdBy: profile.id,
    });

    const signedUpdated = await signedLibraryStudentPatch(admin, updated);
    return ok(active ? "Library student reactivated." : "Library student moved to inactive.", {
      type: "student",
      studentType: "library",
      student: signedUpdated,
      previousId: previousId !== id ? previousId : null,
    });
  }),

  updateSubscription: withErrors("Could not update subscription.", async (formData, { admin, profile }) => {
    if (isBusinessSalesAgent(profile.businessRole)) {
      return fail("Sales agents have read-only incentive access.");
    }
    const studentType: "library" | "course" = asString(formData, "student_type") === "course" ? "course" : "library";
    const studentId = asString(formData, "student_id");
    const subscriptionKey = asString(formData, "subscription_key");
    if (!studentId || !subscriptionKey) return fail("Choose a subscription.");
    if (studentType === "library") {
      await requireLibraryCollectionAccess(admin, profile);
    } else if (!(await hasBusinessCollectionAccess(admin, profile, "course"))) {
      return fail("You do not have access to course students.");
    }

    const startDate = asString(formData, "start_date");
    const endDate = asString(formData, "end_date");
    if (!startDate || !endDate || !isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate) {
      return fail("Enter a valid subscription period.");
    }
    const startTime = normalizeClockTime(asString(formData, "start_time"));
    const endTime = normalizeClockTime(asString(formData, "end_time"));
    const slotHours = slotHoursBetween(startTime, endTime);
    if (!startTime || !endTime || slotHours === null) return fail("Enter a valid time slot.");

    // A subscription is every payment that shares its key ("payment:<id>" when the key was never set).
    let paymentsQuery = admin
      .from("payments")
      .select("*")
      .eq("business_id", profile.businessId)
      .eq("business_type", studentType);
    paymentsQuery = subscriptionKey.startsWith("payment:")
      ? paymentsQuery.eq("id", subscriptionKey.slice("payment:".length))
      : paymentsQuery.eq("student_subscription_key", subscriptionKey);
    const paymentsResponse = await paymentsQuery;
    if (paymentsResponse.error) throw new Error(paymentsResponse.error.message);
    const payments = typedDataArray<Record<string, string | number | null>>(paymentsResponse)
      .sort((a, b) =>
        String(a.payment_date).localeCompare(String(b.payment_date))
        || String(a.created_at).localeCompare(String(b.created_at))
        || String(a.id).localeCompare(String(b.id)));
    const studentColumn = studentType === "library" ? "library_student_id" : "course_student_id";
    if (payments.length === 0 || payments.some((payment) => payment[studentColumn] && payment[studentColumn] !== studentId)) {
      return fail("Subscription was not found for this student.");
    }

    const updatesById = new Map<string, Record<string, unknown>>();
    const updatesFor = (id: string) => {
      const current = updatesById.get(id) ?? {};
      updatesById.set(id, current);
      return current;
    };
    payments.forEach((payment) => {
      Object.assign(updatesFor(String(payment.id)), {
        start_date: startDate,
        end_date: endDate,
        start_time: startTime,
        end_time: endTime,
        slot_hours: slotHours,
      });
    });

    // Amount and transaction date stay editable only until the transaction is approved.
    const nextAmounts = new Map<string, number>();
    for (const payment of payments) {
      const id = String(payment.id);
      const currentAmount = Number(payment.amount ?? 0);
      nextAmounts.set(id, payment.record_status === "active" ? currentAmount : 0);
      if (payment.record_status !== "active") continue;
      const requestedAmount = asNumber(formData, `amount_${id}`);
      const requestedDate = asString(formData, `date_${id}`);
      const amountChanged = requestedAmount !== null && moneyToCents(requestedAmount) !== moneyToCents(currentAmount);
      const dateChanged = requestedDate !== null && requestedDate !== String(payment.payment_date).slice(0, 10);
      if (!amountChanged && !dateChanged) continue;

      const locked = (await recordIsEffectivelyApproved(admin, "payment", payment)) || paymentHasApprovedComponent(payment);
      if (locked) return fail("Approved transactions keep their amount and transaction date.");
      if (!(await canManageBusinessRecord(admin, profile, studentType, recordOwnerProfileId("payment", payment)))) {
        return fail("You can edit your own transactions, or Staff transactions when you are a Manager.");
      }
      const transferResponse = await admin
        .from("money_movements")
        .select("id")
        .eq("payment_id", id)
        .eq("type", "transfer")
        .in("status", ["pending", "accepted"]);
      if (transferResponse.error) throw new Error(transferResponse.error.message);
      if (typedDataArray<{ id: string }>(transferResponse).length > 0) {
        return fail("Transactions with transfer history cannot be edited.");
      }

      const updates = updatesFor(id);
      if (dateChanged) {
        if (!isIsoDate(requestedDate)) return fail("Enter a valid transaction date.");
        updates.payment_date = requestedDate;
      }
      if (amountChanged) {
        if (requestedAmount === null || requestedAmount <= 0) return fail("Enter a valid amount.");
        if (payment.mode === "mixed") {
          return fail("Change a mixed cash + online amount from the transaction itself.");
        }
        updates.amount = requestedAmount;
        updates.cash_collection = payment.mode === "cash" ? requestedAmount : 0;
        updates.online_collection = payment.mode === "online" ? requestedAmount : 0;
        nextAmounts.set(id, requestedAmount);
      }
    }

    // Keep each payment's paid / dues / advance snapshot in step with the amounts.
    const fee = Math.max(...payments.map((payment) => Number(payment.fee_amount ?? 0)), 0);
    let cumulativePaid = 0;
    let latestSnapshot = { paid: 0, dues: 0, advance: 0 };
    payments.forEach((payment) => {
      cumulativePaid += nextAmounts.get(String(payment.id)) ?? 0;
      const effectiveFee = fee > 0 ? fee : cumulativePaid;
      latestSnapshot = {
        paid: cumulativePaid,
        dues: Math.max(effectiveFee - cumulativePaid, 0),
        advance: Math.max(cumulativePaid - effectiveFee, 0),
      };
      if (payment.record_status !== "active") return;
      Object.assign(updatesFor(String(payment.id)), {
        paid_amount: latestSnapshot.paid,
        dues_amount: latestSnapshot.dues,
        advance_amount: latestSnapshot.advance,
      });
    });

    let changed = false;
    for (const payment of payments) {
      const updates = updatesById.get(String(payment.id)) ?? {};
      if (allUpdatesMatch(payment, updates)) continue;
      const { error } = await admin.from("payments").update(updates).eq("id", payment.id);
      if (error) throw new Error(error.message);
      changed = true;
    }

    // Refresh the student's current snapshot when this is their current subscription.
    const studentTable = studentType === "library" ? "library_students" : "course_students";
    // Payment-derived library students have no stored record (and no uuid) to refresh.
    const storedStudentId = studentType === "library" ? normalizeLibraryStudentId(studentId) : studentId;
    const studentResponse = storedStudentId
      ? await admin
        .from(studentTable)
        .select("id,current_subscription_key,last_payment_id")
        .eq("id", storedStudentId)
        .maybeSingle()
      : null;
    if (studentResponse?.error) throw new Error(studentResponse.error.message);
    const student = studentResponse
      ? typedData<{ id: string; current_subscription_key: string | null; last_payment_id: string | null }>(studentResponse)
      : null;
    const isCurrentSubscription = Boolean(student) && (
      student?.current_subscription_key === subscriptionKey
      || payments.some((payment) => payment.id === student?.last_payment_id)
    );
    if (student && isCurrentSubscription) {
      const studentUpdates = {
        subscription_start_date: startDate,
        subscription_end_date: endDate,
        start_time: startTime,
        end_time: endTime,
        slot_hours: slotHours,
        paid_amount: latestSnapshot.paid,
        dues_amount: latestSnapshot.dues,
        advance_amount: latestSnapshot.advance,
      };
      const { error } = await admin.from(studentTable).update(studentUpdates).eq("id", student.id);
      if (error) throw new Error(error.message);
      changed = true;
    }

    return ok(changed ? "Subscription updated." : "No changes to save.");
  }),

  saveCourseStudent: withErrors("Could not save course student.", async (formData, { admin, profile, idempotencyKey }) => {
    if (!(await hasBusinessCollectionAccess(admin, profile, "course"))) {
      return fail("You do not have access to course students.");
    }

    const paymentId = asString(formData, "payment_id");
    const customerName = asString(formData, "customer_name");
    const rollNumber = normalizeLibraryRollNumber(asString(formData, "roll_number"));
    const phoneNumber = asString(formData, "phone_number");
    const address = asString(formData, "address");
    const aadharNumber = asString(formData, "aadhar_number");
    const startDate = asString(formData, "start_date");
    const endDate = asString(formData, "end_date");
    const startTime = normalizeClockTime(asString(formData, "start_time"));
    const endTime = normalizeClockTime(asString(formData, "end_time"));
    const slotHours = slotHoursBetween(startTime, endTime);

    if (!paymentId || !customerName || !rollNumber) {
      return fail("Student name and roll number are required.");
    }
    if (!startDate || !endDate || !isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate) {
      return fail("Enter a valid subscription date range.");
    }
    if (!startTime || !endTime || slotHours === null) {
      return fail("Enter a valid course time slot.");
    }

    const paymentResponse = await admin.from("payments").select("*").eq("id", paymentId).single();
    const payment = typedData<Record<string, string | number | null>>(paymentResponse);
    if (paymentResponse.error || !payment || payment.business_type !== "course" || payment.record_status !== "active") {
      return fail("Course student was not found.");
    }

    const requestKey = idempotencyKey ?? crypto.randomUUID();
    const [uploadedStudentPhoto, uploadedAadharPhoto, uploadedAadharBackPhoto] = await Promise.all([
      uploadLibraryStudentPhoto(admin, profile.businessId, profile.id, formData.get("student_photo"), requestKey),
      uploadLibraryStudentAadharPhoto(admin, profile.businessId, profile.id, formData.get("aadhar_photo"), requestKey, "front"),
      uploadLibraryStudentAadharPhoto(admin, profile.businessId, profile.id, formData.get("aadhar_back_photo"), requestKey, "back"),
    ]);
    if (uploadedStudentPhoto && typeof uploadedStudentPhoto === "object" && "ok" in uploadedStudentPhoto && !uploadedStudentPhoto.ok) {
      return uploadedStudentPhoto;
    }
    if (uploadedAadharPhoto && typeof uploadedAadharPhoto === "object" && "ok" in uploadedAadharPhoto && !uploadedAadharPhoto.ok) {
      return uploadedAadharPhoto;
    }
    if (uploadedAadharBackPhoto && typeof uploadedAadharBackPhoto === "object" && "ok" in uploadedAadharBackPhoto && !uploadedAadharBackPhoto.ok) {
      return uploadedAadharBackPhoto;
    }

    const identityUpdates: Record<string, string> = {
      customer_name: customerName,
      roll_number: rollNumber,
    };
    if (typeof uploadedAadharPhoto === "string") identityUpdates.aadhar_photo_url = uploadedAadharPhoto;
    if (typeof uploadedAadharBackPhoto === "string") identityUpdates.aadhar_back_photo_url = uploadedAadharBackPhoto;
    let identityQuery = admin
      .from("payments")
      .update(identityUpdates)
      .eq("business_type", "course")
      .eq("record_status", "active");
    if (typeof payment.course_id === "string" && payment.course_id) {
      identityQuery = identityQuery.eq("course_id", payment.course_id);
    } else {
      identityQuery = identityQuery.eq("id", paymentId);
    }
    identityQuery = typeof payment.roll_number === "string" && payment.roll_number.trim()
      ? identityQuery.eq("roll_number", payment.roll_number)
      : identityQuery.eq("id", paymentId);
    const identityResult = await identityQuery;
    if (isMissingStudentAadharSidesSchemaError(identityResult.error)) {
      return fail("Apply the student Aadhar sides migration before saving Aadhar images.");
    }
    if (identityResult.error) throw new Error(identityResult.error.message);

    const { error } = await admin
      .from("payments")
      .update({
        ...identityUpdates,
        start_date: startDate,
        end_date: endDate,
        start_time: startTime,
        end_time: endTime,
        slot_hours: slotHours,
      })
      .eq("id", paymentId);
    if (error) throw new Error(error.message);

    const sourceCourseId = String(payment.course_id ?? "");
    if (!sourceCourseId) return fail("Course source was not found.");
    const identityKey = courseStudentIdentityKey(rollNumber, customerName, paymentId);
    if (!identityKey) return fail("Student name and roll number are required.");
    const courseStudentId = typeof payment.course_student_id === "string" ? payment.course_student_id : null;
    let savedStudent: CourseStudent;
    if (courseStudentId) {
      const courseUpdates: Record<string, unknown> = {
        identity_key: identityKey,
        roll_number: rollNumber,
        student_name: customerName,
        phone_number: phoneNumber,
        address,
        aadhar_number: aadharNumber,
        subscription_start_date: startDate,
        subscription_end_date: endDate,
        start_time: startTime,
        end_time: endTime,
        slot_hours: slotHours,
      };
      if (typeof uploadedStudentPhoto === "string") courseUpdates.photo_url = uploadedStudentPhoto;
      if (typeof uploadedAadharPhoto === "string") courseUpdates.aadhar_photo_url = uploadedAadharPhoto;
      if (typeof uploadedAadharBackPhoto === "string") courseUpdates.aadhar_back_photo_url = uploadedAadharBackPhoto;
      const courseUpdate = await admin
        .from("course_students")
        .update(courseUpdates)
        .eq("id", courseStudentId)
        .select("*")
        .single();
      const updated = typedData<CourseStudent>(courseUpdate);
      if (courseUpdate.error || !updated) throw new Error(courseUpdate.error?.message ?? "Could not update course student.");
      savedStudent = updated;
    } else {
      savedStudent = await upsertCourseStudentRecord(admin, {
        businessId: profile.businessId,
        sourceCourseId,
        rollNumber,
        studentName: customerName,
        paymentId,
        photoUrl: typeof uploadedStudentPhoto === "string" ? uploadedStudentPhoto : null,
        phoneNumber,
        address,
        aadharNumber,
        aadharPhotoUrl: typeof uploadedAadharPhoto === "string" ? uploadedAadharPhoto : null,
        aadharBackPhotoUrl: typeof uploadedAadharBackPhoto === "string" ? uploadedAadharBackPhoto : null,
        subscriptionStartDate: startDate,
        subscriptionEndDate: endDate,
        startTime,
        endTime,
        slotHours,
        feeAmount: typeof payment.fee_amount === "number" ? payment.fee_amount : Number(payment.fee_amount ?? 0),
        paidAmount: typeof payment.paid_amount === "number" ? payment.paid_amount : Number(payment.paid_amount ?? 0),
        duesAmount: typeof payment.dues_amount === "number" ? payment.dues_amount : Number(payment.dues_amount ?? 0),
        advanceAmount: typeof payment.advance_amount === "number" ? payment.advance_amount : Number(payment.advance_amount ?? 0),
      });
      const linkResult = await admin.from("payments").update({ course_student_id: savedStudent.id }).eq("id", paymentId);
      if (linkResult.error) throw new Error(linkResult.error.message);
    }

    const signedSavedStudent = await signedCourseStudentPatch(admin, savedStudent);
    return ok("Course student saved.", {
      type: "student",
      studentType: "course",
      student: signedSavedStudent,
    });
  }),

  createExpense: withErrors("Could not save expense.", async (formData, { admin, profile, idempotencyKey }) => {
    if (isBusinessSalesAgent(profile.businessRole)) {
      return fail("Sales agents have read-only incentive access.");
    }

    const permissions = await userPermissions(admin, profile.businessId, profile.id);

    if (!isBusinessOwner(profile.businessRole) && !permissions.includes("add_expense")) {
      return fail("You do not have access to add expenses.");
    }

    const amount = asNumber(formData, "amount") ?? 0;
    const businessType = asString(formData, "business_type") as BusinessType | null;
    const description = asString(formData, "description");
    const expenseDate = asString(formData, "expense_date") ?? dateIsoInTimeZone(new Date(), profile.businessTimezone || undefined);
    const mode = (asString(formData, "mode") ?? "cash") as PaymentMode;
    const requestKey = idempotencyKey ?? crypto.randomUUID();
    const ownerCreated = isBusinessOwner(profile.businessRole);
    if (!businessType || !businessPermissions[businessType]) {
      return fail("Choose a valid business unit.", { business_type: "Choose a business unit." });
    }
    if (!(await profileHasBusinessUnitAccess(
      admin,
      profile.businessId,
      profile.id,
      profile.businessRole,
      businessType,
    ))) {
      return fail("You do not have access to add expenses in this business unit.");
    }
    if (amount <= 0 || !description || description.length < 3) {
      return fail("Expense amount and a 3-character description are required.");
    }

    const existingExpense = await existingByClientRequest<{ id: string }>(
      admin,
      "expenses",
      "spent_by",
      profile.id,
      requestKey,
      "id",
    );
    if (existingExpense) return ok(ownerCreated ? "Expense saved." : "Expense saved as pending approval.");

    const photoPath = await uploadReceipt(admin, profile.businessId, formData.get("photo"), "expenses", requestKey);
    const expenseResult = await admin
      .from("expenses")
      .insert({
        business_type: businessType,
        mode,
        amount,
        expense_date: expenseDate,
        description,
        remark: asString(formData, "remark"),
        photo_path: photoPath,
        spent_by: profile.id,
        approval_status: ownerCreated ? "approved" : "pending",
        posted_on: ownerCreated ? expenseDate : null,
        approved_at: ownerCreated ? new Date().toISOString() : null,
        approved_by: ownerCreated ? profile.id : null,
        client_request_id: requestKey,
      })
      .select("id")
      .single();

    if (expenseResult.error && isMissingExpenseApprovalPostingSchemaError(expenseResult.error)) {
      return fail("Apply the approval-date posting migration before saving expenses.");
    }
    const expense = typedData<{ id: string }>(expenseResult);
    if (expenseResult.error || !expense) {
      if (isDuplicateError(expenseResult.error)) {
        const duplicateExpense = await existingByClientRequest<{ id: string }>(
          admin,
          "expenses",
          "spent_by",
          profile.id,
          requestKey,
          "id",
        );
        if (duplicateExpense) return ok(ownerCreated ? "Expense saved." : "Expense saved as pending approval.");
      }
      throw new Error(expenseResult.error?.message ?? "Could not save expense.");
    }

    if (ownerCreated && mode === "cash") {
      await ensureLedgerEntry(admin, {
        accountProfileId: profile.id,
        businessType,
        amount: -amount,
        entryDate: expenseDate,
        sourceType: "expense",
        sourceId: expense.id,
        description: `Expense: ${description}`,
        createdBy: profile.id,
      });
    }

    await createNotifications(admin, {
      recipientIds: await ownerRecipientIds(admin, profile.businessId, profile.id, businessType, profile.id),
      actorId: profile.id,
      title: "New expense entry",
      body: `${profile.full_name} added an expense of ${amount}: ${description}.`,
      category: "expense",
      tone: "warning",
      eventKey: `expense-created:${expense.id}`,
      metadata: { expense_id: expense.id, amount },
    });

    return ok(ownerCreated ? "Expense saved." : "Expense saved as pending approval.");
  }),

  refundStudentAdvance: withErrors("Could not return the advance.", async (formData, { admin, profile, idempotencyKey }) => {
    if (isBusinessSalesAgent(profile.businessRole)) {
      return fail("Sales agents have read-only incentive access.");
    }
    const studentType: "library" | "course" = asString(formData, "student_type") === "course" ? "course" : "library";
    const studentId = studentType === "library"
      ? normalizeLibraryStudentId(asString(formData, "student_id"))
      : asString(formData, "student_id");
    const amount = asNumber(formData, "amount") ?? 0;
    const mode: PaymentMode = asString(formData, "mode") === "online" ? "online" : "cash";
    const refundDate = asString(formData, "refund_date") ?? dateIsoInTimeZone(new Date(), profile.businessTimezone || undefined);
    const requestKey = idempotencyKey ?? crypto.randomUUID();
    const ownerCreated = isBusinessOwner(profile.businessRole);
    if (!studentId) return fail("Open the student again before returning the advance.");
    if (amount <= 0) return fail("Enter the amount to return.");
    if (!isIsoDate(refundDate)) return fail("Choose a valid date.");
    if (refundDate > dateIsoInTimeZone(new Date(), profile.businessTimezone || undefined)) {
      return fail("A return cannot be dated in the future.");
    }
    if (studentType === "library") {
      await requireLibraryCollectionAccess(admin, profile);
    } else if (!(await hasBusinessCollectionAccess(admin, profile, "course"))) {
      return fail("You do not have access to course students.");
    }

    const studentTable = studentType === "library" ? "library_students" : "course_students";
    const studentResponse = await admin
      .from(studentTable)
      .select("id,roll_number,student_name,advance_amount,paid_amount")
      .eq("id", studentId)
      .eq("business_id", profile.businessId)
      .maybeSingle();
    if (studentResponse.error) throw new Error(studentResponse.error.message);
    const student = typedData<{
      id: string;
      roll_number: string | null;
      student_name: string | null;
      advance_amount: number | string | null;
      paid_amount: number | string | null;
    }>(studentResponse);
    if (!student) return fail("Student was not found.");

    const existingExpense = await existingByClientRequest<{ id: string }>(
      admin,
      "expenses",
      "spent_by",
      profile.id,
      requestKey,
      "id",
    );
    if (existingExpense) return ok(ownerCreated ? "Advance returned." : "Advance return saved as pending approval.");

    const advance = Math.max(Number(student.advance_amount ?? 0), 0);
    if (moneyToCents(amount) > moneyToCents(advance)) {
      return fail(`You can return at most ${advance}.`);
    }

    // The refund is money going out of the unit: record it as an expense for the usual approval / custody flow.
    const description = `Advance returned · Roll ${student.roll_number ?? "-"} · ${student.student_name ?? ""}`.trim();
    const expenseResult = await admin
      .from("expenses")
      .insert({
        business_type: studentType,
        mode,
        amount,
        expense_date: refundDate,
        description,
        remark: asString(formData, "note"),
        spent_by: profile.id,
        approval_status: ownerCreated ? "approved" : "pending",
        posted_on: ownerCreated ? refundDate : null,
        approved_at: ownerCreated ? new Date().toISOString() : null,
        approved_by: ownerCreated ? profile.id : null,
        client_request_id: requestKey,
      })
      .select("id")
      .single();
    const expense = typedData<{ id: string }>(expenseResult);
    if (expenseResult.error || !expense) {
      throw new Error(expenseResult.error?.message ?? "Could not record the returned advance.");
    }

    if (ownerCreated && mode === "cash") {
      await ensureLedgerEntry(admin, {
        accountProfileId: profile.id,
        businessType: studentType,
        amount: -amount,
        entryDate: refundDate,
        sourceType: "expense",
        sourceId: expense.id,
        description: `Expense: ${description}`,
        createdBy: profile.id,
      });
    }

    const studentUpdate = await admin
      .from(studentTable)
      .update({
        advance_amount: Math.max(advance - amount, 0),
        paid_amount: Math.max(Number(student.paid_amount ?? 0) - amount, 0),
      })
      .eq("id", student.id);
    if (studentUpdate.error) throw new Error(studentUpdate.error.message);

    if (!ownerCreated) {
      await createNotifications(admin, {
        recipientIds: await ownerRecipientIds(admin, profile.businessId, profile.id, studentType, profile.id),
        actorId: profile.id,
        title: "Advance returned",
        body: `${profile.full_name} returned ${amount} advance: ${description}.`,
        category: "expense",
        tone: "warning",
        eventKey: `advance-returned:${expense.id}`,
        metadata: { expense_id: expense.id, amount },
      });
    }

    return ok(ownerCreated ? "Advance returned." : "Advance return saved as pending approval.");
  }),

  approveRecord: withErrors("Approval failed.", async (formData, { admin, profile }) => {
    requireBusinessOwner(profile.businessRole);
    const recordType = asString(formData, "record_type");
    const id = asString(formData, "id");
    const decision = asString(formData, "decision") as ApprovalDecision;
    const paymentComponentText = asString(formData, "payment_component");
    const paymentComponent = paymentComponentText === "cash" || paymentComponentText === "online"
      ? paymentComponentText as PaymentComponent
      : null;
    if (!id || !recordType || !decision) return fail("Missing approval details.");
    if (recordType !== "payment" && recordType !== "expense") return fail("Invalid record type.");
    if (decision !== "approved" && decision !== "rejected") return fail("Invalid approval decision.");
    if (paymentComponentText && !paymentComponent) return fail("Invalid payment component.");
    if (paymentComponent && recordType !== "payment") return fail("Only payments support component approval.");
    if (recordType === "payment" && decision !== "approved") {
      return fail("Collections can only be approved. Use Delete transaction when the collection must be removed.");
    }

    const table = recordType === "expense" ? "expenses" : "payments";
    const existingResponse = await admin.from(table).select("*").eq("id", id).single();
    const existing = typedData<Record<string, string | number | null>>(existingResponse);
    if (existingResponse.error || !existing) throw new Error(existingResponse.error?.message ?? "Record not found.");
    const recordBusinessType = String(
      existing.business_type ?? (recordType === "expense" ? "general" : ""),
    ) as BusinessType;
    const actorProfileId = String(
      recordType === "expense"
        ? existing.spent_by ?? ""
        : existing.collected_by ?? "",
    );
    if (!businessPermissions[recordBusinessType]) return fail("This record has no valid business unit.");
    if (!(await canManageBusinessRecord(admin, profile, recordBusinessType, actorProfileId))) {
      return fail("Managers can review Staff records and their own records.");
    }
    const currentDecision = String(existing.approval_status ?? "pending");
    const canVerifyOnlineCollection = profile.accessMode === "support" || profile.businessRole === "primary_owner";
    const collectionHasOnlineValue = recordType === "payment" && paymentOnlineCollection(existing) > 0;
    if (
      recordType === "payment" &&
      decision === "approved" &&
      collectionHasOnlineValue &&
      !canVerifyOnlineCollection &&
      paymentComponent !== "cash"
    ) {
      return fail("Online Collections must be verified by the Owner.");
    }

    if (recordType === "payment" && decision === "approved") {
      const pendingTransferResponse = await admin
        .from("money_movements")
        .select("id")
        .eq("payment_id", id)
        .eq("type", "transfer")
        .eq("status", "pending")
        .maybeSingle();
      if (pendingTransferResponse.error) throw new Error(pendingTransferResponse.error.message);
      if (pendingTransferResponse.data) {
        return fail("Resolve the pending transaction transfer before approval.");
      }
    }

    if (paymentComponent) {
      const componentAmount = paymentComponent === "cash"
        ? paymentCashCollection(existing)
        : paymentOnlineCollection(existing);
      if (componentAmount <= 0) return fail(`This payment has no ${paymentComponent} value to approve.`);

      const currentComponentDecision = paymentComponentDecision(existing, paymentComponent);
      if (currentComponentDecision === "approved") {
        if (paymentComponent === "cash" && String(existing.record_status ?? "active") === "active") {
          const alreadyPosted = await hasRecordLedgerEntry(admin, "payment", id);
          if (!alreadyPosted) {
            await ensureLedgerEntry(admin, {
              accountProfileId: String(existing.current_holder_id ?? existing.collected_by),
              businessType: String(existing.business_type) as BusinessType,
              amount: componentAmount,
              entryDate: String(existing.cash_posted_on ?? existing.payment_date),
              sourceType: "payment",
              sourceId: id,
              description: `Cash collected for ${String(existing.business_type ?? "payment").replace("_", " ")}`,
              createdBy: profile.id,
            });
          }
        }
        return ok(`${paymentComponent === "cash" ? "Cash" : "Online"} value approved.`);
      }
      if (currentComponentDecision !== "pending" && currentComponentDecision !== "reapproval_required") {
        return fail("This payment value has already been reviewed.");
      }

      const cashAmount = paymentCashCollection(existing);
      const onlineAmount = paymentOnlineCollection(existing);
      const nextCashDecision = paymentComponent === "cash" ? "approved" : paymentComponentDecision(existing, "cash");
      const nextOnlineDecision = paymentComponent === "online" ? "approved" : paymentComponentDecision(existing, "online");
      const allComponentsApproved =
        (cashAmount <= 0 || nextCashDecision === "approved") &&
        (onlineAmount <= 0 || nextOnlineDecision === "approved");
      const componentStatusField = paymentComponent === "cash" ? "cash_approval_status" : "online_approval_status";
      const componentApprovedAtField = paymentComponent === "cash" ? "cash_approved_at" : "online_approved_at";
      const componentApprovedByField = paymentComponent === "cash" ? "cash_approved_by" : "online_approved_by";
      const componentPostedOnField = paymentComponent === "cash" ? "cash_posted_on" : "online_posted_on";
      const approvedAt = new Date().toISOString();
      const postedOn = approvalPostingDate(profile, approvedAt);
      const componentUpdates: Record<string, unknown> = {
        [componentStatusField]: "approved",
        [componentApprovedAtField]: approvedAt,
        [componentApprovedByField]: profile.id,
        [componentPostedOnField]: postedOn,
        approval_status: allComponentsApproved ? "approved" : currentDecision,
      };
      if (allComponentsApproved) {
        componentUpdates.approved_by = profile.id;
        componentUpdates.approved_at = approvedAt;
      }
      const updateResult = await updatePaymentApprovalFields(admin, id, componentUpdates);
      if (updateResult.error) {
        if (isMissingPaymentApprovalPostingSchemaError(updateResult.error)) {
          return fail("Apply the approval-date posting migration before approving payment values.");
        }
        if (isMissingPaymentComponentApprovalSchemaError(updateResult.error)) {
          return fail("Apply the mixed payment approval migration before approving payment values separately.");
        }
        throw new Error(updateResult.error.message);
      }

      if (paymentComponent === "cash" && String(existing.record_status ?? "active") === "active") {
        const alreadyPosted = await hasRecordLedgerEntry(admin, "payment", id);
        if (!alreadyPosted) {
          await ensureLedgerEntry(admin, {
            accountProfileId: String(existing.current_holder_id ?? existing.collected_by),
            businessType: String(existing.business_type) as BusinessType,
            amount: cashAmount,
            entryDate: postedOn,
            sourceType: "payment",
            sourceId: id,
            description: `Cash collected for ${String(existing.business_type ?? "payment").replace("_", " ")}`,
            createdBy: profile.id,
          });
        }
      }

      const recordOwnerId = String(existing.assigned_profile_id ?? existing.collected_by);
      await createNotifications(admin, {
        recipientIds: recordOwnerId === profile.id ? [] : [recordOwnerId],
        actorId: profile.id,
        title: `${paymentComponent === "cash" ? "Cash" : "Online"} payment value approved`,
        body: `${profile.full_name} approved the ${paymentComponent} value of ${componentAmount}.`,
        category: "approval",
        tone: "success",
        eventKey: `record-component-approval:payment:${id}:${paymentComponent}`,
        metadata: { record_id: id, record_type: recordType, decision, payment_component: paymentComponent },
      });

      return ok(`${paymentComponent === "cash" ? "Cash" : "Online"} value approved.`);
    }

    const alreadySameDecision = currentDecision === decision;
    if (!alreadySameDecision && currentDecision !== "pending" && currentDecision !== "reapproval_required") {
      return fail("This record has already been reviewed.");
    }

    let reviewedPostingDate: string | null = null;
    if (!alreadySameDecision || recordType === "payment") {
      const reviewedAt = new Date().toISOString();
      const updates: Record<string, unknown> = { approval_status: decision };
      if (recordType === "payment" && decision === "approved") {
        reviewedPostingDate = approvalPostingDate(profile, reviewedAt);
        if (paymentCashCollection(existing) > 0) {
          updates.cash_approval_status = "approved";
          updates.cash_approved_at = reviewedAt;
          updates.cash_approved_by = profile.id;
          updates.cash_posted_on = reviewedPostingDate;
        }
        if (paymentOnlineCollection(existing) > 0) {
          updates.online_approval_status = "approved";
          updates.online_approved_at = reviewedAt;
          updates.online_approved_by = profile.id;
          updates.online_posted_on = reviewedPostingDate;
        }
        updates.approved_by = profile.id;
        updates.approved_at = reviewedAt;
      } else if (recordType === "expense" && decision === "approved") {
        reviewedPostingDate = approvalPostingDate(profile, reviewedAt);
        updates.posted_on = reviewedPostingDate;
        updates.approved_at = reviewedAt;
        updates.approved_by = profile.id;
      }
      const { error } = recordType === "payment"
        ? await updatePaymentApprovalFields(admin, id, updates)
        : await admin.from(table).update(updates).eq("id", id);
      if (error) {
        if (recordType === "payment" && isMissingPaymentApprovalPostingSchemaError(error)) {
          return fail("Apply the approval-date posting migration before approving payments.");
        }
        if (recordType === "expense" && isMissingExpenseApprovalPostingSchemaError(error)) {
          return fail("Apply the approval-date posting migration before approving expenses.");
        }
        if (recordType === "payment" && isMissingPaymentComponentApprovalSchemaError(error)) {
          if (String(existing.mode) === "mixed") {
            return fail("Apply the mixed payment approval migration before approving mixed payments.");
          }
          const fallback = await admin.from(table).update({ approval_status: decision }).eq("id", id);
          if (fallback.error) throw new Error(fallback.error.message);
        } else {
          throw new Error(error.message);
        }
      }
    }

    const existingCashCollection = recordType === "expense" && existing.mode === "cash"
      ? Number(existing.amount)
      : paymentCashCollection(existing);
    if (decision === "approved" && String(existing.record_status ?? "active") === "active" && existingCashCollection > 0) {
      const accountId = recordType === "expense" ? existing.spent_by : existing.current_holder_id ?? existing.collected_by;
      const alreadyPosted = await hasRecordLedgerEntry(admin, recordType, id);
      if (!alreadyPosted) {
        await ensureLedgerEntry(admin, {
          accountProfileId: String(accountId),
          businessType: (recordType === "expense"
            ? String(existing.business_type ?? "general")
            : String(existing.business_type)) as BusinessType,
          amount: recordType === "expense" ? -existingCashCollection : existingCashCollection,
          entryDate: String(
            reviewedPostingDate ??
            (recordType === "expense"
              ? existing.posted_on ?? existing.expense_date
              : existing.cash_posted_on ?? existing.payment_date),
          ),
          sourceType: recordType,
          sourceId: id,
          description: recordType === "expense"
            ? `Expense: ${String(existing.description ?? "Expense")}`
            : `Cash collected for ${String(existing.business_type ?? "payment").replace("_", " ")}`,
          createdBy: profile.id,
        });
      }
    }

    if (decision === "rejected") {
      await removeRecordLedgerEntries(admin, recordType, id);
    }

    if (alreadySameDecision) return ok(`Record ${decision}.`);

    const recordOwnerId = String(recordType === "expense" ? existing.spent_by : existing.assigned_profile_id ?? existing.collected_by);
    await createNotifications(admin, {
      recipientIds: recordOwnerId === profile.id ? [] : [recordOwnerId],
      actorId: profile.id,
      title: `${recordType === "expense" ? "Expense" : "Payment"} ${decision}`,
      body: `${profile.full_name} ${decision} your ${recordType} entry of ${existing.amount}.`,
      category: "approval",
      tone: decision === "approved" ? "success" : "warning",
      eventKey: `record-approval:${recordType}:${id}:${decision}`,
      metadata: { record_id: id, record_type: recordType, decision },
    });

    return ok(`Record ${decision}.`);
  }),

  cancelRecord: withErrors("Could not cancel record.", async (formData, { admin, profile }) => {
    requireBusinessOwner(profile.businessRole);
    const recordType = asString(formData, "record_type");
    const id = asString(formData, "id");
    if (!id || !recordType) return fail("Missing cancel details.");
    if (recordType !== "payment" && recordType !== "expense") return fail("Invalid record type.");

    const table = recordType === "expense" ? "expenses" : "payments";
    const recordResponse = await admin.from(table).select("*").eq("id", id).single();
    const record = typedData<Record<string, string | number | null>>(recordResponse);
    if (recordResponse.error || !record) throw new Error(recordResponse.error?.message ?? "Record not found.");
    const recordBusinessType = String(record.business_type ?? (recordType === "expense" ? "general" : "")) as BusinessType;
    const recordOwnerId = recordOwnerProfileId(recordType, record);
    if (!businessPermissions[recordBusinessType]
      || !(await canManageBusinessRecord(admin, profile, recordBusinessType, recordOwnerId))) {
      return fail("Managers can cancel Staff records and their own records.");
    }
    if (String(record.record_status ?? "active") === "cancelled") {
      await removeRecordLedgerEntries(admin, recordType, id);
      return ok("Record cancelled.");
    }
    const reason = asString(formData, "reason");
    if (!reason) return fail("Deletion reason is required.");

    const cancelUpdates: Record<string, unknown> = {
      record_status: "cancelled",
      approval_status: "cancelled",
      cancel_reason: reason,
    };
    if (recordType === "payment") {
      if (paymentCashCollection(record) > 0) cancelUpdates.cash_approval_status = "cancelled";
      if (paymentOnlineCollection(record) > 0) cancelUpdates.online_approval_status = "cancelled";
    }
    const { error } = await admin
      .from(table)
      .update(cancelUpdates)
      .eq("id", id);
    if (error) throw new Error(error.message);

    await removeRecordLedgerEntries(admin, recordType, id);

    await createNotifications(admin, {
      recipientIds: recordOwnerId === profile.id ? [] : [recordOwnerId],
      actorId: profile.id,
      title: `${recordType === "expense" ? "Expense" : "Payment"} cancelled`,
      body: `${profile.full_name} cancelled your ${recordType} entry of ${record.amount}.`,
      category: "approval",
      tone: "warning",
      eventKey: `record-cancelled:${recordType}:${id}`,
      metadata: { record_id: id, record_type: recordType },
    });

    return ok("Record cancelled.");
  }),

  updateRecord: withErrors("Could not update record.", async (formData, { admin, profile, idempotencyKey }) => {
    if (isBusinessSalesAgent(profile.businessRole)) {
      return fail("Sales agents have read-only incentive access.");
    }

    const recordType = asString(formData, "record_type");
    const id = asString(formData, "id");
    if (!id || !recordType) return fail("Missing record details.");
    if (recordType !== "payment" && recordType !== "expense") return fail("Invalid record type.");

    const table = recordType === "expense" ? "expenses" : "payments";
    const recordResponse = await admin.from(table).select("*").eq("id", id).single();
    const record = typedData<Record<string, string | number | null>>(recordResponse);
    if (recordResponse.error || !record) throw new Error(recordResponse.error?.message ?? "Record not found.");

    const recordOwnerId = recordOwnerProfileId(recordType, record);
    const recordBusinessType = String(record.business_type ?? (recordType === "expense" ? "general" : "")) as BusinessType;
    if (!businessPermissions[recordBusinessType]
      || !(await canManageBusinessRecord(admin, profile, recordBusinessType, recordOwnerId))) {
      return fail("You can edit your own records, or Staff records when you are a Manager.");
    }
    const effectivelyApproved = await recordIsEffectivelyApproved(admin, recordType, record);
    if (String(record.record_status ?? "active") !== "active") {
      return fail("Only active transactions can be edited.");
    }
    if (effectivelyApproved) {
      return fail("Approved transactions cannot be edited.");
    }
    if (recordType === "payment") {
      if (!effectivelyApproved && paymentHasApprovedComponent(record)) {
        return fail("A transaction cannot be edited after one of its payment values is approved.");
      }
      const transferResponse = await admin
        .from("money_movements")
        .select("id")
        .eq("payment_id", id)
        .eq("type", "transfer")
        .in("status", ["pending", "accepted"]);
      if (transferResponse.error) throw new Error(transferResponse.error.message);
      if (typedDataArray<{ id: string }>(transferResponse).length > 0) {
        return fail("Transactions with transfer history cannot be edited.");
      }
    }

    const amount = asNumber(formData, "amount") ?? 0;
    const date = asString(formData, "date");
    const description = asString(formData, "description");
    if (amount <= 0 || !date || !isIsoDate(date)) return fail("Enter a valid amount and date.");

    const updates: Record<string, unknown> = {
      amount,
      remark: asString(formData, "remark"),
    };

    if (recordType === "payment") {
      updates.payment_date = date;
      updates.description = description;
      if (record.mode === "mixed") {
        const splitTotal = Number(record.cash_collection ?? 0) + Number(record.online_collection ?? 0);
        if (moneyToCents(splitTotal) !== moneyToCents(amount)) {
          return fail("Mixed payments can be edited only when the amount matches the saved cash and online split.");
        }
      } else {
        updates.cash_collection = record.mode === "cash" ? amount : 0;
        updates.online_collection = record.mode === "online" ? amount : 0;
      }
    } else {
      if (!description || description.length < 3) return fail("Expense description must be at least 3 characters.");
      updates.expense_date = date;
      updates.description = description;
    }

    if (allUpdatesMatch(record, updates)) return ok("No changes to save.");

    const { error } = await admin.from(table).update(updates).eq("id", id);
    if (error) throw new Error(error.message);

    await createNotifications(admin, {
      recipientIds: recordOwnerId === profile.id
        ? await ownerRecipientIds(admin, profile.businessId, profile.id, recordBusinessType, profile.id)
        : [recordOwnerId],
      actorId: profile.id,
      title: `${recordType === "expense" ? "Expense" : "Payment"} updated`,
      body: `${profile.full_name} updated a ${recordType} transaction.`,
      category: "approval",
      tone: "info",
      eventKey: `record-updated:${recordType}:${id}:${idempotencyKey ?? "direct"}`,
      metadata: { record_id: id, record_type: recordType },
    });

    return ok("Transaction updated.");
  }),

  requestCancel: withErrors("Could not request cancel.", async (formData, { admin, profile, idempotencyKey }) => {
    if (isBusinessSalesAgent(profile.businessRole)) {
      return fail("Sales agents have read-only incentive access.");
    }

    const recordType = asString(formData, "record_type");
    const recordId = asString(formData, "record_id");
    const requestKey = idempotencyKey ?? crypto.randomUUID();
    if (!recordType || !recordId) return fail("Missing record.");
    if (recordType !== "payment" && recordType !== "expense") return fail("Invalid record type.");

    const recordTable = recordType === "expense" ? "expenses" : "payments";
    const recordResponse = await admin
      .from(recordTable)
      .select("*")
      .eq("id", recordId)
      .single();
    const record = typedData<Record<string, string | number | null>>(recordResponse);
    if (recordResponse.error || !record) throw new Error(recordResponse.error?.message ?? "Record not found.");
    const recordBusinessType = String(record.business_type ?? (recordType === "expense" ? "general" : "")) as BusinessType;
    const recordOwnerId = recordOwnerProfileId(recordType, record);
    if (!businessPermissions[recordBusinessType]
      || !(await canManageBusinessRecord(admin, profile, recordBusinessType, recordOwnerId))) {
      return fail("You can request changes for your own records, or Staff records when you are a Manager.");
    }
    if (await recordIsEffectivelyApproved(admin, recordType, record)) {
      return fail("Approved transactions cannot be deleted.");
    }

    const existingRequestByKey = await existingByClientRequest<{ id: string }>(
      admin,
      "record_change_requests",
      "requested_by",
      profile.id,
      requestKey,
      "id",
    );
    if (existingRequestByKey) return ok("Cancel request sent.");

    const pendingRequestResponse = await admin
      .from("record_change_requests")
      .select("id, requested_by")
      .eq("record_type", recordType)
      .eq("record_id", recordId)
      .eq("request_type", "cancel")
      .eq("status", "pending")
      .maybeSingle();
    const pendingRequest = typedData<{ id: string; requested_by: string }>(pendingRequestResponse);
    if (pendingRequestResponse.error) throw new Error(pendingRequestResponse.error.message);
    if (pendingRequest) {
      return pendingRequest.requested_by === profile.id
        ? ok("Cancel request sent.")
        : fail("This record already has a pending cancel request.");
    }

    const { error } = await admin.from("record_change_requests").insert({
      record_type: recordType,
      record_id: recordId,
      request_type: "cancel",
      requested_by: profile.id,
      reason: asString(formData, "reason"),
      client_request_id: requestKey,
    });
    if (error) throw new Error(error.message);

    await admin
      .from(recordType === "expense" ? "expenses" : "payments")
      .update({ approval_status: "cancel_requested" })
      .eq("id", recordId);

    await createNotifications(admin, {
      recipientIds: await ownerRecipientIds(admin, profile.businessId, profile.id, recordBusinessType, profile.id),
      actorId: profile.id,
      title: "Cancel request",
      body: `${profile.full_name} requested cancellation for a ${recordType}.`,
      category: "approval",
      tone: "warning",
      eventKey: `cancel-request:${recordType}:${recordId}`,
      metadata: { record_id: recordId, record_type: recordType },
    });

    return ok("Cancel request sent.");
  }),

  reviewChangeRequest: withErrors("Could not review request.", async (formData, { admin, profile }) => {
    requireBusinessOwner(profile.businessRole);
    const requestId = asString(formData, "request_id");
    const decision = asString(formData, "decision") as Decision;
    if (!requestId || !decision) return fail("Missing review details.");

    const requestResponse = await admin
      .from("record_change_requests")
      .select("*")
      .eq("id", requestId)
      .single();
    const request = typedData<{
      record_type: "payment" | "expense";
      record_id: string;
      request_type: "edit" | "cancel";
      requested_by: string;
      reason: string | null;
      status: string;
    }>(requestResponse);
    if (requestResponse.error || !request) throw new Error(requestResponse.error?.message ?? "Request not found.");
    if (request.status !== "pending") {
      return request.status === decision ? ok("Request reviewed.") : fail("This request has already been reviewed.");
    }

    const table = request.record_type === "expense" ? "expenses" : "payments";
    const recordResponse = await admin.from(table).select("*").eq("id", request.record_id).single();
    const record = typedData<Record<string, string | number | null>>(recordResponse);
    if (recordResponse.error || !record) throw new Error(recordResponse.error?.message ?? "Record not found.");
    const recordBusinessType = String(record.business_type ?? (request.record_type === "expense" ? "general" : "")) as BusinessType;
    const recordOwnerId = recordOwnerProfileId(request.record_type, record);
    if (!businessPermissions[recordBusinessType]
      || !(await canManageBusinessRecord(admin, profile, recordBusinessType, recordOwnerId))) {
      return fail("Managers can review Staff requests and their own requests.");
    }

    let acceptedCancelTarget: { table: "expenses" | "payments" } | null = null;
    if (decision === "accepted" && request.request_type === "cancel") {
      if (await recordIsEffectivelyApproved(admin, request.record_type, record)) {
        return fail("Approved transactions cannot be deleted.");
      }
      acceptedCancelTarget = { table };
    }

    await admin
      .from("record_change_requests")
      .update({ status: decision, reviewed_by: profile.id, reviewed_at: new Date().toISOString() })
      .eq("id", requestId);

    if (acceptedCancelTarget) {
      await admin
        .from(acceptedCancelTarget.table)
        .update({
          record_status: "cancelled",
          approval_status: "cancelled",
          cancel_reason: request.reason,
        })
        .eq("id", request.record_id);

      await removeRecordLedgerEntries(admin, request.record_type, request.record_id);
    }

    await createNotifications(admin, {
      recipientIds: request.requested_by === profile.id ? [] : [request.requested_by],
      actorId: profile.id,
      title: `Cancel request ${decision}`,
      body: `${profile.full_name} ${decision} your ${request.record_type} cancel request.`,
      category: "approval",
      tone: decision === "accepted" ? "success" : "warning",
      eventKey: `change-request-reviewed:${requestId}:${decision}`,
      metadata: { request_id: requestId, record_id: request.record_id, record_type: request.record_type },
    });

    return ok("Request reviewed.");
  }),

  requestPaymentTransfer: withErrors("Could not request transaction transfer.", async (formData, { admin, profile, idempotencyKey }) => {
    if (isBusinessSalesAgent(profile.businessRole)) {
      return fail("Sales agents have read-only incentive access.");
    }
    if (!isBusinessOwner(profile.businessRole)) {
      const senderPermissions = await userPermissions(admin, profile.businessId, profile.id);
      if (!senderPermissions.includes("transfer_money")) {
        return fail("You do not have permission to transfer assigned transactions. Ask the Owner to enable Transfer assigned transactions.");
      }
    }

    const paymentId = asString(formData, "payment_id");
    const toProfileId = asString(formData, "to_profile_id");
    const requestKey = idempotencyKey ?? crypto.randomUUID();
    if (!paymentId || !toProfileId) return fail("Choose a transaction and receiving staff.");
    if (toProfileId === profile.id) return fail("Choose another staff member.");

    const paymentResponse = await admin.from("payments").select("*").eq("id", paymentId).single();
    const payment = typedData<Record<string, string | number | null>>(paymentResponse);
    if (paymentResponse.error || !payment) throw new Error(paymentResponse.error?.message ?? "Payment not found.");

    const business = String(payment.business_type ?? "") as BusinessType;
    const requiredPermission = businessPermissions[business];
    if (!requiredPermission) return fail("This transaction cannot be transferred.");
    if (!(await profileHasBusinessUnitAccess(
      admin,
      profile.businessId,
      profile.id,
      profile.businessRole,
      business,
    ))) {
      return fail("You are not assigned to this transaction's business unit.");
    }
    if (String(payment.record_status ?? "active") !== "active" || !canTransferPaymentStatus(String(payment.approval_status ?? ""))) {
      return fail("Only active transactions can be transferred.");
    }
    const transactionOrComponentApproved = paymentHasApprovedComponent(payment) ||
      await recordIsEffectivelyApproved(admin, "payment", payment);
    if (transactionOrComponentApproved && profile.businessRole !== "primary_owner") {
      return fail("Only the Owner can transfer a transaction after any payment component is approved.");
    }
    const currentAssigneeId = String(payment.assigned_profile_id ?? payment.current_holder_id ?? payment.collected_by ?? "");
    if (!currentAssigneeId) return fail("This transaction does not have an assignee.");
    const currentAssignee = await businessMember(admin, profile.businessId, currentAssigneeId);
    if (!currentAssignee || currentAssignee.status !== "active" || !currentAssignee.active) {
      return fail("The assigned member is inactive. Ask the Owner to reassign this transaction.");
    }
    if (
      currentAssignee.role === "staff"
      && !(await userPermissions(admin, profile.businessId, currentAssigneeId)).includes("transfer_money")
    ) {
      return fail("The assigned Staff member cannot transfer transactions. Ask the Owner to enable Transfer assigned transactions.");
    }
    if (!isBusinessOwner(profile.businessRole) && currentAssigneeId !== profile.id) {
      return fail("Only the assigned staff member can transfer this transaction.");
    }
    if (profile.businessRole === "co_owner" && currentAssigneeId !== profile.id) {
      const currentAssignment = await staffManagerForBusinessUnit(
        admin,
        profile.businessId,
        currentAssigneeId,
        business,
      );
      if (!currentAssignment.assigned || currentAssignment.managerId !== profile.id) {
        return fail("Managers can transfer only transactions assigned to their Staff in this business unit.");
      }
    }

    const recipient = await businessMember(admin, profile.businessId, toProfileId);
    if (!recipient) throw new Error("Receiving staff not found.");
    if (!recipient.active || recipient.status !== "active" || recipient.role !== "staff") {
      return fail("Choose an active staff member.");
    }

    const recipientPermissions = await userPermissions(admin, profile.businessId, toProfileId);
    if (!recipientPermissions.includes(requiredPermission)) {
      return fail("Receiving staff does not have permission for this collection category.");
    }
    if (!(await profileHasBusinessUnitAccess(
      admin,
      profile.businessId,
      toProfileId,
      recipient.role,
      business,
    ))) {
      return fail("Receiving staff is not assigned to this transaction's business unit.");
    }
    const recipientAssignment = await staffManagerForBusinessUnit(
      admin,
      profile.businessId,
      toProfileId,
      business,
    );
    if (profile.businessRole === "co_owner" && recipientAssignment.managerId !== profile.id) {
      return fail("Choose Staff assigned to you in this business unit.");
    }
    if (profile.businessRole === "staff") {
      const senderAssignment = await staffManagerForBusinessUnit(
        admin,
        profile.businessId,
        profile.id,
        business,
      );
      if (
        !senderAssignment.assigned
        || !recipientAssignment.assigned
        || senderAssignment.managerId !== recipientAssignment.managerId
      ) {
        return fail("Choose Staff from your assigned team for this business unit.");
      }
    }

    const pendingResponse = await admin
      .from("money_movements")
      .select("*")
      .eq("payment_id", paymentId)
      .eq("type", "transfer")
      .eq("status", "pending")
      .maybeSingle();
    if (pendingResponse.error) throw new Error(pendingResponse.error.message);
    const pendingTransfer = typedData<MoneyMovement>(pendingResponse);
    if (pendingTransfer) {
      return pendingTransfer.from_profile_id === currentAssigneeId &&
        pendingTransfer.to_profile_id === toProfileId &&
        pendingTransfer.requested_by === profile.id
        ? ok("Transaction transfer requested.", {
            type: "payment-transfer",
            payment: payment as unknown as Payment,
            movement: pendingTransfer,
            ledgerEntries: [],
          })
        : fail("This transaction already has a pending transfer.");
    }

    const movementResult = await admin
      .from("money_movements")
      .insert({
        type: "transfer",
        mode: payment.mode,
        amount: Number(payment.amount ?? 0),
        payment_id: paymentId,
        business_type: business,
        from_profile_id: currentAssigneeId,
        to_profile_id: toProfileId,
        requested_by: profile.id,
        client_request_id: requestKey,
        note: asString(formData, "note"),
      })
      .select("*")
      .single();
    const movement = typedData<MoneyMovement>(movementResult);
    if (movementResult.error || !movement) throw new Error(movementResult.error?.message ?? "Could not request transfer.");

    let notificationWarning: { warning: string; errorId?: string } | null = null;
    try {
      const notificationRecipients = new Set([
        ...(await ownerRecipientIds(admin, profile.businessId, profile.id, business, currentAssigneeId)),
        currentAssigneeId,
        toProfileId,
      ]);
      notificationRecipients.delete(profile.id);
      await createNotifications(admin, {
        recipientIds: [...notificationRecipients],
        actorId: profile.id,
        title: "Transaction transfer requested",
        body: `${profile.full_name} requested to transfer the transaction of ${payment.amount} to ${recipient.full_name}.`,
        category: "transfer",
        tone: "info",
        eventKey: `payment-transfer-request:${movement.id}`,
        metadata: { payment_id: paymentId, movement_id: movement.id, amount: Number(payment.amount ?? 0) },
      });
    } catch (error) {
      notificationWarning = actionWarning(error, {
        action: "requestPaymentTransfer:notifications",
        fallback: "Could not send transfer notifications.",
        businessId: profile.businessId,
        userId: profile.id,
      }, "The transfer was requested, but one or more notifications could not be delivered.");
    }

    const result = ok("Transaction transfer requested.", {
      type: "payment-transfer",
      payment: payment as unknown as Payment,
      movement,
      ledgerEntries: [],
    });
    return notificationWarning ? { ...result, ...notificationWarning } : result;
  }),

  respondPaymentTransfer: withErrors("Could not update transaction transfer.", async (formData, { admin, profile }) => {
    if (isBusinessSalesAgent(profile.businessRole)) {
      return fail("Sales agents have read-only incentive access.");
    }

    const movementId = asString(formData, "movement_id");
    const decision = asString(formData, "decision") as Decision;
    if (!movementId || !decision) return fail("Missing transfer response.");
    if (decision !== "accepted" && decision !== "rejected") return fail("Choose a valid transfer response.");

    const rpcResponse = await admin.rpc("lenden_respond_payment_transfer", {
      p_movement_id: movementId,
      p_decision: decision,
      p_entry_date: approvalPostingDate(profile, new Date().toISOString()),
    });
    if (rpcResponse.error) {
      if (isMissingDbSchemaError(rpcResponse.error, ["lenden_respond_payment_transfer"])) {
        return fail("Apply the transaction assignee migration before responding to transfer requests.");
      }
      throw new Error(rpcResponse.error.message);
    }
    const response = typedData<{ payment: Payment; movement: MoneyMovement }>(rpcResponse);
    if (!response?.payment || !response.movement) throw new Error("Transfer response did not return updated records.");
    const { payment, movement } = response;

    const ledgerResponse = await admin
      .from("ledger_entries")
      .select("*")
      .eq("source_type", "transfer")
      .eq("source_id", movementId);
    if (ledgerResponse.error) throw new Error(ledgerResponse.error.message);
    const ledgerEntries = typedDataArray<LedgerEntry>(ledgerResponse);

    let notificationWarning: { warning: string; errorId?: string } | null = null;
    try {
      await createNotifications(admin, {
        recipientIds: [
          ...(await ownerRecipientIds(
            admin,
            profile.businessId,
            profile.id,
            movement.business_type ?? payment.business_type,
            movement.from_profile_id,
          )),
          movement.from_profile_id,
        ],
        actorId: profile.id,
        title: `Transaction transfer ${decision}`,
        body: `${profile.full_name} ${decision} a transaction transfer of ${movement.amount}.`,
        category: "transfer",
        tone: decision === "accepted" ? "success" : "warning",
        eventKey: `payment-transfer-response:${movementId}:${decision}`,
        metadata: {
          payment_id: movement.payment_id,
          movement_id: movementId,
          decision,
          assigned_profile_id: payment.assigned_profile_id,
        },
      });
    } catch (error) {
      notificationWarning = actionWarning(error, {
        action: "respondPaymentTransfer:notifications",
        fallback: "Could not send transfer notifications.",
        businessId: profile.businessId,
        userId: profile.id,
      }, `The transfer was ${decision}, but one or more notifications could not be delivered.`);
    }

    const result = ok(`Transaction transfer ${decision}.`, {
      type: "payment-transfer",
      payment,
      movement,
      ledgerEntries,
    });
    return notificationWarning ? { ...result, ...notificationWarning } : result;
  }),

  requestTransfer: withErrors("Could not request transfer.", async (formData, { admin, profile, idempotencyKey }) => {
    requireBusinessOwner(profile.businessRole);
    const toProfileId = asString(formData, "to_profile_id");
    const amount = asNumber(formData, "amount") ?? 0;
    const businessType = asString(formData, "business_type") as BusinessType | null;
    const requestKey = idempotencyKey ?? crypto.randomUUID();
    if (!toProfileId || amount <= 0 || !businessType || !businessPermissions[businessType]) {
      return fail("Choose staff, business unit, and amount.");
    }
    if (toProfileId === profile.id) return fail("Choose another staff member.");

    const recipient = await businessMember(admin, profile.businessId, toProfileId);
    if (!recipient?.active || recipient.status !== "active" || recipient.role !== "staff") {
      return fail("Choose an active staff member.");
    }
    if (!(await profileHasBusinessUnitAccess(
      admin,
      profile.businessId,
      profile.id,
      profile.businessRole,
      businessType,
    ))) {
      return fail("You do not have access to transfer cash in this business unit.");
    }
    if (!(await profileHasBusinessUnitAccess(
      admin,
      profile.businessId,
      recipient.id,
      recipient.role,
      businessType,
    ))) {
      return fail("Receiving staff is not assigned to this business unit.");
    }

    const existingMovement = await existingByClientRequest<{ id: string }>(
      admin,
      "money_movements",
      "requested_by",
      profile.id,
      requestKey,
      "id",
    );
    if (existingMovement) return ok("Transfer request sent.");

    const movementResult = await admin
      .from("money_movements")
      .insert({
        type: "transfer",
        mode: "cash",
        amount,
        business_type: businessType,
        from_profile_id: profile.id,
        to_profile_id: toProfileId,
        requested_by: profile.id,
        client_request_id: requestKey,
        note: asString(formData, "note"),
      })
      .select("id")
      .single();
    const movement = typedData<{ id: string }>(movementResult);
    if (movementResult.error || !movement) throw new Error(movementResult.error?.message ?? "Could not request transfer.");

    await createNotifications(admin, {
      recipientIds: [toProfileId],
      actorId: profile.id,
      title: "Cash transfer request",
      body: `${profile.full_name} sent you a cash transfer request of ${amount}.`,
      category: "transfer",
      tone: "info",
      eventKey: `cash-transfer-request:${movement.id}`,
      metadata: { movement_id: movement.id, amount },
    });

    return ok("Transfer request sent.");
  }),

  respondTransfer: withErrors("Could not update transfer.", async (formData, { admin, profile }) => {
    if (isBusinessSalesAgent(profile.businessRole)) {
      return fail("Sales agents have read-only incentive access.");
    }

    const movementId = asString(formData, "movement_id");
    const decision = asString(formData, "decision") as Decision;
    if (!movementId || !decision) return fail("Missing transfer response.");

    const movementResponse = await admin
      .from("money_movements")
      .select("*")
      .eq("id", movementId)
      .single();
    const movement = typedData<{
      id: string;
      amount: number | string;
      from_profile_id: string;
      to_profile_id: string | null;
      status: string;
      responded_at: string | null;
      business_type: BusinessType | null;
    }>(movementResponse);
    if (movementResponse.error || !movement) throw new Error(movementResponse.error?.message ?? "Movement not found.");
    if (!movement.business_type) return fail("This historical transfer has no business unit. Ask the Owner to reconcile it.");
    if (movement.to_profile_id !== profile.id) {
      return fail("Only the receiving staff can accept this transfer.");
    }
    if (movement.status !== "pending") {
      if (movement.status !== decision) return fail("This transfer has already been reviewed.");
      if (decision === "accepted") {
        const amount = Number(movement.amount);
        const postingDate = approvalPostingDate(profile, movement.responded_at ?? new Date().toISOString());
        await ensureLedgerEntry(admin, {
          accountProfileId: movement.from_profile_id,
          businessType: movement.business_type,
          amount: -amount,
          entryDate: postingDate,
          sourceType: "transfer",
          sourceId: movement.id,
          description: "Cash transferred out",
          createdBy: profile.id,
        });
        await ensureLedgerEntry(admin, {
          accountProfileId: movement.to_profile_id,
          businessType: movement.business_type,
          amount,
          entryDate: postingDate,
          sourceType: "transfer",
          sourceId: movement.id,
          description: "Cash transfer received",
          createdBy: profile.id,
        });
      }
      return ok("Transfer updated.");
    }

    const respondedAt = new Date().toISOString();
    const { error } = await admin
      .from("money_movements")
      .update({
        status: decision,
        responded_by: profile.id,
        responded_at: respondedAt,
      })
      .eq("id", movementId);
    if (error) throw new Error(error.message);

    if (decision === "accepted") {
      const amount = Number(movement.amount);
      const postingDate = approvalPostingDate(profile, respondedAt);
      await ensureLedgerEntry(admin, {
        accountProfileId: movement.from_profile_id,
        businessType: movement.business_type,
        amount: -amount,
        entryDate: postingDate,
        sourceType: "transfer",
        sourceId: movement.id,
        description: "Cash transferred out",
        createdBy: profile.id,
      });
      await ensureLedgerEntry(admin, {
        accountProfileId: movement.to_profile_id,
        businessType: movement.business_type,
        amount,
        entryDate: postingDate,
        sourceType: "transfer",
        sourceId: movement.id,
        description: "Cash transfer received",
        createdBy: profile.id,
      });
    }

    await createNotifications(admin, {
      recipientIds: movement.from_profile_id === profile.id ? [] : [movement.from_profile_id],
      actorId: profile.id,
      title: `Transfer ${decision}`,
      body: `${profile.full_name} ${decision} your transfer of ${movement.amount}.`,
      category: "transfer",
      tone: decision === "accepted" ? "success" : "warning",
      eventKey: `cash-transfer-response:${movementId}:${decision}`,
      metadata: { movement_id: movementId, decision },
    });

    return ok("Transfer updated.");
  }),

  settleCash: withErrors("Could not transfer cash.", async (formData, { admin, authAdmin, profile, idempotencyKey }) => {
    requireBusinessOwner(profile.businessRole);

    const direction = (asString(formData, "settlement_direction") ?? "received_from_user") as SettlementDirection;
    const counterpartyProfileId = asString(formData, "profile_id")
      ?? (direction === "sent_to_user" ? asString(formData, "to_profile_id") : asString(formData, "from_profile_id"));
    const amount = asNumber(formData, "amount") ?? 0;
    const settlementDate = asString(formData, "settlement_date") ?? dateIsoInTimeZone(new Date(), profile.businessTimezone || undefined);
    const requestKey = idempotencyKey ?? crypto.randomUUID();
    if (!counterpartyProfileId || amount <= 0) {
      return fail("Choose a user and enter an amount greater than zero.");
    }
    if (counterpartyProfileId === profile.id) return fail("Choose another user.");
    if (!isIsoDate(settlementDate)) return fail("Choose a valid settlement date.");
    if (settlementDate > dateIsoInTimeZone(new Date(), profile.businessTimezone || undefined)) {
      return fail("A cash transfer cannot be dated in the future.");
    }
    if (direction !== "received_from_user" && direction !== "sent_to_user") {
      return fail("Choose whether money was received or sent.");
    }

    const selectedProfile = await businessMember(authAdmin, profile.businessId, counterpartyProfileId);
    if (!selectedProfile?.active || selectedProfile.status !== "active") {
      return fail("Choose an active user.");
    }
    if (profile.businessRole === "co_owner") {
      if (!["staff", "sales_agent"].includes(selectedProfile.role)) {
        return fail(
          direction === "received_from_user"
            ? "A Manager can receive cash only from Staff or Sales Agents."
            : "A Manager can send cash only to Staff or Sales Agents.",
        );
      }
    } else if (profile.businessRole === "primary_owner" && !["co_owner", "staff", "sales_agent"].includes(selectedProfile.role)) {
      return fail(
        direction === "received_from_user"
          ? "The Owner can receive cash only from a Manager, Staff member, or Sales Agent."
          : "The Owner can send cash only to a Manager, Staff member, or Sales Agent.",
      );
    }

    const fromProfileId = direction === "received_from_user" ? counterpartyProfileId : profile.id;
    const toProfileId = direction === "received_from_user" ? profile.id : counterpartyProfileId;
    const existingMovement = await existingByClientRequest<{
      id: string;
      type: "transfer" | "settlement";
      amount: number | string;
      from_profile_id: string;
      to_profile_id: string | null;
      business_type: BusinessType | null;
      payment_id: string | null;
    }>(
      authAdmin,
      "money_movements",
      "requested_by",
      profile.id,
      requestKey,
      "id,type,amount,from_profile_id,to_profile_id,business_type,payment_id",
      profile.businessId,
    );
    let movementId = existingMovement?.id ?? null;
    if (existingMovement) {
      const postedAmount = Number(existingMovement.amount);
      if (
        existingMovement.payment_id
        || existingMovement.from_profile_id !== fromProfileId
        || existingMovement.to_profile_id !== toProfileId
        || moneyToCents(postedAmount) !== moneyToCents(amount)
      ) {
        return fail("This cash transfer request was already used. Please submit again.");
      }
      const normalizeMovement = await authAdmin
        .from("money_movements")
        .update({
          business_type: null,
          status: "accepted",
          responded_by: profile.id,
          responded_at: new Date().toISOString(),
        })
        .eq("id", existingMovement.id)
        .is("payment_id", null);
      if (normalizeMovement.error) throw new Error(normalizeMovement.error.message);
      await ensureLedgerEntry(authAdmin, {
        businessId: profile.businessId,
        accountProfileId: existingMovement.from_profile_id,
        businessType: null,
        amount: -postedAmount,
        entryDate: settlementDate,
        sourceType: existingMovement.type,
        sourceId: existingMovement.id,
        description: `Cash sent to ${direction === "received_from_user" ? profile.full_name : selectedProfile.full_name}`,
        createdBy: profile.id,
      });
      await ensureLedgerEntry(authAdmin, {
        businessId: profile.businessId,
        accountProfileId: existingMovement.to_profile_id,
        businessType: null,
        amount: postedAmount,
        entryDate: settlementDate,
        sourceType: existingMovement.type,
        sourceId: existingMovement.id,
        description: `Cash received from ${direction === "received_from_user" ? selectedProfile.full_name : profile.full_name}`,
        createdBy: profile.id,
      });
    } else {
      const movementResult = await authAdmin
        .from("money_movements")
        .insert({
          business_id: profile.businessId,
          type: "transfer",
          mode: "cash",
          amount,
          business_type: null,
          from_profile_id: fromProfileId,
          to_profile_id: toProfileId,
          status: "accepted",
          requested_by: profile.id,
          responded_by: profile.id,
          responded_at: new Date().toISOString(),
          client_request_id: requestKey,
          note: asString(formData, "note"),
        })
        .select("id")
        .single();
      const movement = typedData<{ id: string }>(movementResult);
      if (movementResult.error || !movement) throw new Error(movementResult.error?.message ?? "Could not transfer cash.");
      movementId = movement.id;

      await ensureLedgerEntry(authAdmin, {
        businessId: profile.businessId,
        accountProfileId: fromProfileId,
        businessType: null,
        amount: -amount,
        entryDate: settlementDate,
        sourceType: "transfer",
        sourceId: movement.id,
        description: `Cash sent to ${direction === "received_from_user" ? profile.full_name : selectedProfile.full_name}`,
        createdBy: profile.id,
      });
      await ensureLedgerEntry(authAdmin, {
        businessId: profile.businessId,
        accountProfileId: toProfileId,
        businessType: null,
        amount,
        entryDate: settlementDate,
        sourceType: "transfer",
        sourceId: movement.id,
        description: `Cash received from ${direction === "received_from_user" ? selectedProfile.full_name : profile.full_name}`,
        createdBy: profile.id,
      });
    }

    let notificationWarning: { warning: string; errorId?: string } | null = null;
    try {
      await createNotifications(admin, {
        recipientIds: [counterpartyProfileId],
        actorId: profile.id,
        title: direction === "received_from_user" ? "Cash received" : "Cash sent",
        body:
          direction === "received_from_user"
            ? `${profile.full_name} recorded ${amount} as cash received from you for ${settlementDate}.`
            : `${profile.full_name} recorded ${amount} as cash sent to you for ${settlementDate}.`,
        category: "transfer",
        tone: "success",
        eventKey: `cash-transfer:${movementId}`,
        metadata: { movement_id: movementId, amount, settlement_date: settlementDate, direction },
      });
    } catch (error) {
      notificationWarning = actionWarning(error, {
        action: "settleCash:notifications",
        fallback: "Could not send the cash transfer notification.",
        businessId: profile.businessId,
        userId: profile.id,
      }, "Cash was recorded, but the other user could not be notified.");
    }

    const result = ok(direction === "received_from_user" ? "Cash received." : "Cash sent.");
    return notificationWarning ? { ...result, ...notificationWarning } : result;
  }),

  createAgentSettlement: withErrors("Could not record incentive payout.", async (formData, { admin, profile, idempotencyKey }) => {
    if (profile.businessRole !== "primary_owner") {
      return fail("Only the Owner can record agent incentive payouts.");
    }
    const agentId = asString(formData, "agent_id");
    const amount = asNumber(formData, "amount") ?? 0;
    const requestKey = idempotencyKey ?? crypto.randomUUID();
    if (!agentId || amount <= 0) return fail("Choose sales agent and amount.");

    const existingSettlement = await existingByClientRequest<{ id: string }>(
      admin,
      "agent_settlements",
      "paid_by",
      profile.id,
      requestKey,
      "id",
    );
    if (existingSettlement) return ok("Agent incentive paid.");

    const [paymentsResponse, settlementsResponse] = await Promise.all([
      admin
        .from("payments")
        .select("incentive_amount")
        .eq("referral_agent_id", agentId)
        .eq("record_status", "active")
        .eq("approval_status", "approved"),
      admin
        .from("agent_settlements")
        .select("amount,status")
        .eq("agent_id", agentId)
        .in("status", ["pending", "accepted"]),
    ]);
    const payments = typedDataArray<{ incentive_amount: number | string | null }>(paymentsResponse);
    const settlements = typedDataArray<{ amount: number | string | null }>(settlementsResponse);
    const earned = payments.reduce((sum, payment) => sum + Number(payment.incentive_amount ?? 0), 0);
    const alreadySettled = settlements.reduce((sum, settlement) => sum + Number(settlement.amount ?? 0), 0);
    if (amount > earned - alreadySettled) {
      return fail("Payout is higher than the agent's available incentive balance.");
    }

    const respondedAt = new Date().toISOString();
    const settlementResult = await admin
      .from("agent_settlements")
      .insert({
        agent_id: agentId,
        amount,
        status: "accepted",
        paid_by: profile.id,
        responded_by: profile.id,
        responded_at: respondedAt,
        client_request_id: requestKey,
        note: asString(formData, "note"),
      })
      .select("id")
      .single();
    const settlement = typedData<{ id: string }>(settlementResult);
    if (settlementResult.error || !settlement) {
      throw new Error(settlementResult.error?.message ?? "Could not record incentive payout.");
    }

    const postingDate = approvalPostingDate(profile, respondedAt);
    await ensureLedgerEntry(admin, {
      accountProfileId: profile.id,
      businessType: "general",
      amount: -amount,
      entryDate: postingDate,
      sourceType: "settlement",
      sourceId: settlement.id,
      description: "Agent incentive paid",
      createdBy: profile.id,
    });
    await ensureLedgerEntry(admin, {
      accountProfileId: agentId,
      businessType: "general",
      amount,
      entryDate: postingDate,
      sourceType: "settlement",
      sourceId: settlement.id,
      description: "Agent incentive received",
      createdBy: profile.id,
    });

    await createNotifications(admin, {
      recipientIds: [agentId],
      actorId: profile.id,
      title: "Agent incentive paid",
      body: `${profile.full_name} marked an agent incentive payout of ${amount} as paid.`,
      category: "agent",
      tone: "success",
      eventKey: `agent-settlement-created:${settlement.id}`,
      metadata: { settlement_id: settlement.id, amount },
    });

    return ok("Agent incentive paid.");
  }),

  respondAgentSettlement: withErrors("Could not update incentive payout.", async (formData, { admin, profile }) => {
    if (isBusinessSalesAgent(profile.businessRole)) {
      return fail("Sales agents have read-only incentive access.");
    }

    const settlementId = asString(formData, "settlement_id");
    const decision = asString(formData, "decision") as Decision;
    if (!settlementId || !decision) return fail("Missing incentive payout response.");

    const settlementResponse = await admin
      .from("agent_settlements")
      .select("*")
      .eq("id", settlementId)
      .single();
    const settlement = typedData<{
      id: string;
      agent_id: string;
      paid_by: string;
      amount: number | string;
      status: string;
      responded_at: string | null;
    }>(settlementResponse);
    if (settlementResponse.error || !settlement) {
      throw new Error(settlementResponse.error?.message ?? "Incentive payout not found.");
    }
    if (settlement.agent_id !== profile.id) {
      return fail("Only the linked sales agent can confirm this incentive payout.");
    }
    if (settlement.status !== "pending") {
      if (settlement.status !== decision) return fail("This agent incentive has already been reviewed.");
      if (decision === "accepted") {
        const postingDate = approvalPostingDate(profile, settlement.responded_at ?? new Date().toISOString());
        await ensureLedgerEntry(admin, {
          accountProfileId: settlement.paid_by,
          businessType: "general",
          amount: -Number(settlement.amount),
          entryDate: postingDate,
          sourceType: "settlement",
          sourceId: settlement.id,
          description: "Agent incentive paid",
          createdBy: profile.id,
        });
        await ensureLedgerEntry(admin, {
          accountProfileId: settlement.agent_id,
          businessType: "general",
          amount: Number(settlement.amount),
          entryDate: postingDate,
          sourceType: "settlement",
          sourceId: settlement.id,
          description: "Agent incentive received",
          createdBy: profile.id,
        });
      }
      return ok("Agent incentive updated.");
    }

    const respondedAt = new Date().toISOString();
    const { error } = await admin
      .from("agent_settlements")
      .update({
        status: decision,
        responded_by: profile.id,
        responded_at: respondedAt,
      })
      .eq("id", settlementId);
    if (error) throw new Error(error.message);

    if (decision === "accepted") {
      const postingDate = approvalPostingDate(profile, respondedAt);
      await ensureLedgerEntry(admin, {
        accountProfileId: settlement.paid_by,
        businessType: "general",
        amount: -Number(settlement.amount),
        entryDate: postingDate,
        sourceType: "settlement",
        sourceId: settlement.id,
        description: "Agent incentive paid",
        createdBy: profile.id,
      });
      await ensureLedgerEntry(admin, {
        accountProfileId: settlement.agent_id,
        businessType: "general",
        amount: Number(settlement.amount),
        entryDate: postingDate,
        sourceType: "settlement",
        sourceId: settlement.id,
        description: "Agent incentive received",
        createdBy: profile.id,
      });
    }

    await createNotifications(admin, {
      recipientIds: settlement.paid_by === profile.id ? [] : [settlement.paid_by],
      actorId: profile.id,
      title: `Agent incentive ${decision}`,
      body: `${profile.full_name} ${decision} the agent incentive of ${settlement.amount}.`,
      category: "agent",
      tone: decision === "accepted" ? "success" : "warning",
      eventKey: `agent-settlement-response:${settlementId}:${decision}`,
      metadata: { settlement_id: settlementId, decision },
    });

    return ok("Agent incentive updated.");
  }),

  saveRoom: withErrors("Could not save room.", async (formData, { admin, profile }) => {
    requireBusinessSettingsManager(profile);
    const roomNumber = asString(formData, "room_number");
    if (!roomNumber) return fail("Enter a room number.", { room_number: "Room number is required." });
    if (roomNumber.length > 40) {
      return fail("Review the room number.", { room_number: "Use 40 characters or fewer." });
    }
    const existingResponse = await admin
      .from("rooms")
      .select("id,active")
      .eq("business_id", profile.businessId)
      .ilike("room_number", roomNumber)
      .maybeSingle();
    if (existingResponse.error) throw new Error(existingResponse.error.message);
    const existing = typedData<{ id: string; active: boolean }>(existingResponse);
    if (existing) {
      return fail(
        existing.active
          ? "This room already exists."
          : "This room already exists but is hidden. Restore it from the room list.",
        { room_number: "Choose another room number or restore the existing room." },
      );
    }
    const { error } = await admin.from("rooms").insert({
      business_id: profile.businessId,
      room_number: roomNumber,
      label: asString(formData, "label"),
      active: true,
    });
    if (isDuplicateError(error)) {
      return fail("This room already exists.", { room_number: "Choose another room number." });
    }
    if (error) throw new Error(error.message);
    return ok("Room saved.");
  }),

  deleteRoom: withErrors("Could not delete room.", async (formData, { admin, profile }) => {
    requireBusinessSettingsManager(profile);
    const id = asString(formData, "id");
    if (!id) return fail("Room is required.");
    const referenceCount = await referencedRowCount(admin, "payments", "room_id", id);
    if (referenceCount > 0) {
      const { error } = await admin.from("rooms").update({ active: false }).eq("id", id);
      if (error) throw new Error(error.message);
      return ok("Room hidden because transaction history uses it.");
    }
    const { error } = await admin.from("rooms").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return ok("Room deleted.");
  }),

  setRoomActive: withErrors("Could not update room.", async (formData, { admin, profile }) => {
    requireBusinessSettingsManager(profile);
    const id = asString(formData, "id");
    if (!id) return fail("Room is required.");
    const active = asBool(formData, "active");
    const { error } = await admin.from("rooms").update({ active }).eq("id", id);
    if (error) throw new Error(error.message);
    return ok(active ? "Room restored." : "Room hidden.");
  }),

  saveCourse: withErrors("Could not save course.", async (formData, { admin, profile }) => {
    requireBusinessSettingsManager(profile);
    const name = asString(formData, "name");
    if (!name) return fail("Enter a course name.", { name: "Course name is required." });
    if (name.length > 120) {
      return fail("Review the course name.", { name: "Use 120 characters or fewer." });
    }
    const duplicateMessage = "This course already exists.";
    const existingResponse = await admin
      .from("courses")
      .select("id,name,active")
      .eq("business_id", profile.businessId);
    if (existingResponse.error) throw new Error(existingResponse.error.message);
    const normalizedName = name.toLocaleLowerCase();
    const existing = typedDataArray<{ id: string; name: string; active: boolean }>(existingResponse)
      .find((course) => course.name.trim().toLocaleLowerCase() === normalizedName);
    if (existing) {
      return fail(
        existing.active
          ? duplicateMessage
          : `${duplicateMessage.slice(0, -1)} but is hidden. Restore it from the course list.`,
        { name: "Choose another name or restore the existing item." },
      );
    }
    const { error } = await admin.from("courses").insert({
      business_id: profile.businessId,
      name,
      active: true,
    });
    if (isDuplicateError(error)) {
      return fail(duplicateMessage, { name: "Choose another name." });
    }
    if (error) throw new Error(error.message);
    return ok("Course saved.");
  }),

  deleteCourse: withErrors("Could not delete course.", async (formData, { admin, profile }) => {
    requireBusinessSettingsManager(profile);
    const id = asString(formData, "id");
    if (!id) return fail("Course is required.");
    const [payments, students] = await Promise.all([
      referencedRowCount(admin, "payments", "course_id", id),
      referencedRowCount(admin, "course_students", "source_course_id", id),
    ]);
    if (payments + students > 0) {
      const { error } = await admin.from("courses").update({ active: false }).eq("id", id);
      if (error) throw new Error(error.message);
      return ok("Course hidden because student or transaction history uses it.");
    }
    const { error } = await admin.from("courses").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return ok("Course deleted.");
  }),

  setCourseActive: withErrors("Could not update course.", async (formData, { admin, profile }) => {
    requireBusinessSettingsManager(profile);
    const id = asString(formData, "id");
    if (!id) return fail("Course is required.");
    const active = asBool(formData, "active");
    const { error } = await admin.from("courses").update({ active }).eq("id", id);
    if (error) throw new Error(error.message);
    return ok(active ? "Course restored." : "Course hidden.");
  }),

  saveReferral: withErrors("Could not save referral.", async (formData, { admin, profile }) => {
    requireBusinessSettingsManager(profile);
    const code = asString(formData, "code")?.toUpperCase();
    if (!code) return fail("Enter a coupon code.", { code: "Coupon code is required." });
    const discountType = asString(formData, "discount_type") ?? "amount";
    const incentiveType = asString(formData, "incentive_type") ?? "amount";
    const discountValue = asNumber(formData, "discount_value") ?? asNumber(formData, "discount_amount");
    const incentiveValue = asNumber(formData, "incentive_value");
    const fieldErrors: Record<string, string> = {};
    if (code.length > 40) fieldErrors.code = "Use 40 characters or fewer.";
    if (discountType !== "amount" && discountType !== "percentage") {
      fieldErrors.discount_type = "Choose Amount or Percentage.";
    }
    if (incentiveType !== "amount" && incentiveType !== "percentage") {
      fieldErrors.incentive_type = "Choose Amount or Percentage.";
    }
    if (discountValue === null || discountValue < 0) {
      fieldErrors.discount_value = "Enter a value of 0 or more.";
    } else if (discountType === "percentage" && discountValue > 100) {
      fieldErrors.discount_value = "Percentage cannot exceed 100.";
    }
    if (incentiveValue === null || incentiveValue < 0) {
      fieldErrors.incentive_value = "Enter a value of 0 or more.";
    } else if (incentiveType === "percentage" && incentiveValue > 100) {
      fieldErrors.incentive_value = "Percentage cannot exceed 100.";
    }
    if (Object.keys(fieldErrors).length > 0) {
      return fail("Review the highlighted coupon details.", fieldErrors);
    }
    const existingResponse = await admin
      .from("referral_codes")
      .select("id,active")
      .eq("business_id", profile.businessId)
      .ilike("code", code)
      .maybeSingle();
    if (existingResponse.error) throw new Error(existingResponse.error.message);
    const existing = typedData<{ id: string; active: boolean }>(existingResponse);
    if (existing) {
      return fail(
        existing.active
          ? "This coupon code already exists."
          : "This coupon code already exists but is hidden. Restore it from the coupon list.",
        { code: "Choose another code or restore the existing coupon." },
      );
    }
    const { error } = await admin.from("referral_codes").insert({
      business_id: profile.businessId,
      code,
      agent_id: asString(formData, "agent_id"),
      discount_amount: discountValue ?? 0,
      discount_type: discountType,
      discount_value: discountValue ?? 0,
      incentive_type: incentiveType,
      incentive_value: incentiveValue ?? 0,
      active: true,
    });
    if (isDuplicateError(error)) {
      return fail("This coupon code already exists.", { code: "Choose another code." });
    }
    if (error) throw new Error(error.message);
    return ok("Referral code saved.");
  }),

  deleteReferral: withErrors("Could not delete referral code.", async (formData, { admin, profile }) => {
    requireBusinessSettingsManager(profile);
    const id = asString(formData, "id");
    if (!id) return fail("Referral code is required.");
    const referenceCount = await referencedRowCount(admin, "payments", "referral_code_id", id);
    if (referenceCount > 0) {
      const { error } = await admin.from("referral_codes").update({ active: false }).eq("id", id);
      if (error) throw new Error(error.message);
      return ok("Coupon hidden because transaction history uses it.");
    }
    const { error } = await admin.from("referral_codes").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return ok("Referral code deleted.");
  }),

  setReferralActive: withErrors("Could not update referral code.", async (formData, { admin, profile }) => {
    requireBusinessSettingsManager(profile);
    const id = asString(formData, "id");
    if (!id) return fail("Referral code is required.");
    const active = asBool(formData, "active");
    const { error } = await admin.from("referral_codes").update({ active }).eq("id", id);
    if (error) throw new Error(error.message);
    return ok(active ? "Coupon restored." : "Coupon hidden.");
  }),

  checkIn: withErrors("Could not check in.", async (_formData, { admin, profile }) => {
    const today = dateIsoInTimeZone(new Date(), profile.businessTimezone || undefined);
    const existing = await admin
      .from("work_attendance")
      .select("id")
      .eq("business_id", profile.businessId)
      .eq("profile_id", profile.id)
      .eq("attendance_date", today)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) return ok("You are already checked in today.");
    const { error } = await admin.from("work_attendance").insert({
      business_id: profile.businessId,
      profile_id: profile.id,
      attendance_date: today,
    });
    if (error && !isDuplicateError(error)) throw new Error(error.message);
    return ok("Checked in.");
  }),

  checkOut: withErrors("Could not check out.", async (_formData, { admin, profile }) => {
    const today = dateIsoInTimeZone(new Date(), profile.businessTimezone || undefined);
    const response = await admin
      .from("work_attendance")
      .select("id,check_out_at")
      .eq("business_id", profile.businessId)
      .eq("profile_id", profile.id)
      .eq("attendance_date", today)
      .maybeSingle();
    if (response.error) throw new Error(response.error.message);
    const row = typedData<{ id: string; check_out_at: string | null }>(response);
    if (!row) return fail("Check in first.");
    if (row.check_out_at) return ok("You are already checked out today.");
    const { error } = await admin.from("work_attendance").update({ check_out_at: new Date().toISOString() }).eq("id", row.id);
    if (error) throw new Error(error.message);
    return ok("Checked out.");
  }),

  createWorkTask: withErrors("Could not add task.", async (formData, { admin, profile, idempotencyKey }) => {
    const title = asString(formData, "title");
    const notes = asString(formData, "notes");
    const assignedTo = asString(formData, "assigned_to") ?? profile.id;
    const dueDate = asString(formData, "due_date");
    const requestKey = idempotencyKey ?? crypto.randomUUID();
    if (!title) return fail("Enter a task title.", { title: "Task title is required." });
    if (title.length > 200) return fail("Review the task title.", { title: "Use 200 characters or fewer." });
    if (notes && notes.length > 2000) return fail("Review the notes.", { notes: "Use 2000 characters or fewer." });
    if (dueDate && !isIsoDate(dueDate)) return fail("Choose a valid due date.", { due_date: "Choose a valid date." });

    const assignee = assignedTo === profile.id ? null : await businessMember(admin, profile.businessId, assignedTo);
    if (assignedTo !== profile.id && (!assignee?.active || assignee.status !== "active")) {
      return fail("Choose an active member of this business.", { assigned_to: "Choose an active member." });
    }

    const existing = await existingByClientRequest<{ id: string }>(
      admin, "work_tasks", "created_by", profile.id, requestKey, "id", profile.businessId,
    );
    if (existing) return ok("Task added.");

    const response = await admin
      .from("work_tasks")
      .insert({
        business_id: profile.businessId,
        title,
        notes,
        assigned_to: assignedTo,
        created_by: profile.id,
        due_date: dueDate,
        client_request_id: requestKey,
      })
      .select("id")
      .single();
    const task = typedData<{ id: string }>(response);
    if (response.error || !task) throw new Error(response.error?.message ?? "Could not add task.");

    if (assignee) {
      await createNotifications(admin, {
        recipientIds: [assignedTo],
        actorId: profile.id,
        title: "New task",
        body: `${profile.full_name} assigned you: ${title}`,
        category: "task",
        tone: "info",
        eventKey: `work-task:${task.id}`,
        metadata: { task_id: task.id },
      });
    }
    return ok("Task added.");
  }),

  setWorkTaskStatus: withErrors("Could not update task.", async (formData, { admin, profile }) => {
    const id = asString(formData, "id");
    const status = asString(formData, "status");
    if (!id) return fail("Task is required.");
    if (status !== "todo" && status !== "in_progress" && status !== "done") return fail("Choose a valid task stage.");
    const response = await admin
      .from("work_tasks")
      .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
      .eq("id", id)
      .eq("business_id", profile.businessId)
      .select("id")
      .maybeSingle();
    if (response.error) throw new Error(response.error.message);
    if (!response.data) return fail("Task was not found.");
    return ok(status === "done" ? "Task completed." : status === "in_progress" ? "Task started." : "Task moved to To do.");
  }),

  postWorkUpdate: withErrors("Could not post update.", async (formData, { admin, profile, idempotencyKey }) => {
    const body = asString(formData, "body");
    const taskId = asString(formData, "task_id");
    const markDone = asBool(formData, "mark_done");
    const voiceSeconds = asNumber(formData, "voice_seconds");
    const photo = formData.get("photo");
    const voice = formData.get("voice");
    const requestKey = idempotencyKey ?? crypto.randomUUID();
    const hasPhoto = photo instanceof File && photo.size > 0;
    const hasVoice = voice instanceof File && voice.size > 0;
    if (!body && !hasPhoto && !hasVoice) return fail("Add text, a photo or a voice note.");
    if (body && body.length > 4000) return fail("Review the update.", { body: "Use 4000 characters or fewer." });

    if (taskId) {
      const taskResponse = await admin.from("work_tasks").select("id").eq("id", taskId).eq("business_id", profile.businessId).maybeSingle();
      if (taskResponse.error) throw new Error(taskResponse.error.message);
      if (!taskResponse.data) return fail("The linked task was not found.");
    }

    const existing = await existingByClientRequest<{ id: string }>(
      admin, "work_updates", "author_id", profile.id, requestKey, "id", profile.businessId,
    );
    if (existing) return ok("Update posted.");

    const photoPath = await uploadWorkMedia(admin, profile.businessId, photo, "photo", requestKey);
    if (photoPath && typeof photoPath === "object") return photoPath;
    const voicePath = await uploadWorkMedia(admin, profile.businessId, voice, "voice", requestKey);
    if (voicePath && typeof voicePath === "object") return voicePath;

    const completesTask = Boolean(taskId && markDone);
    const { error } = await admin.from("work_updates").insert({
      business_id: profile.businessId,
      task_id: taskId,
      author_id: profile.id,
      entry_date: dateIsoInTimeZone(new Date(), profile.businessTimezone || undefined),
      body,
      photo_path: photoPath,
      voice_path: voicePath,
      voice_seconds: voicePath && voiceSeconds !== null ? Math.max(0, Math.min(600, Math.round(voiceSeconds))) : null,
      status_change: completesTask ? "done" : null,
      client_request_id: requestKey,
    });
    if (error && !isDuplicateError(error)) throw new Error(error.message);

    if (completesTask) {
      const taskUpdate = await admin
        .from("work_tasks")
        .update({ status: "done", completed_at: new Date().toISOString() })
        .eq("id", taskId)
        .eq("business_id", profile.businessId);
      if (taskUpdate.error) throw new Error(taskUpdate.error.message);
    }
    return ok(completesTask ? "Update posted and task completed." : "Update posted.");
  }),

  deleteWorkUpdate: withErrors("Could not delete update.", async (formData, { admin, profile }) => {
    const id = asString(formData, "id");
    if (!id) return fail("Update is required.");
    const response = await admin
      .from("work_updates")
      .select("id,author_id,photo_path,voice_path")
      .eq("id", id)
      .eq("business_id", profile.businessId)
      .maybeSingle();
    if (response.error) throw new Error(response.error.message);
    const update = typedData<{ id: string; author_id: string; photo_path: string | null; voice_path: string | null }>(response);
    if (!update) return fail("Update was not found.");
    if (update.author_id !== profile.id) return fail("You can delete only your own updates.");
    const { error } = await admin.from("work_updates").delete().eq("id", id);
    if (error) throw new Error(error.message);
    const paths = [update.photo_path, update.voice_path].filter((path): path is string => Boolean(path));
    if (paths.length) await admin.storage.from("work-media").remove(paths);
    return ok("Update deleted.");
  }),
} satisfies Record<string, (formData: FormData, context: ActionContext) => Promise<ActionResult>>;

export type LendenActionName = keyof typeof handlers;

export async function executeLendenAction(
  action: LendenActionName,
  formData: FormData,
  context: ActionContext,
) {
  const started = await beginIdempotentAction(context.admin, context.profile, action, formData);
  if (started.kind === "result") return started.result;

  const nextContext = {
    ...context,
    idempotencyKey: started.requestKey,
  };

  const notificationFailures: unknown[] = [];
  notificationFailureCollectors.set(context.admin, notificationFailures);
  let result: ActionResult;
  try {
    result = await handlers[action](formData, nextContext);
  } finally {
    notificationFailureCollectors.delete(context.admin);
  }

  if (result.ok && notificationFailures.length > 0) {
    const warning = actionWarning(notificationFailures[0], {
      action: `${action}:notifications`,
      fallback: "Could not deliver an action notification.",
      businessId: context.profile.businessId,
      userId: context.profile.id,
    }, notificationFailures.length === 1
      ? "The change was saved, but a notification could not be delivered."
      : "The change was saved, but some notifications could not be delivered.");
    result = {
      ...result,
      warning: [result.warning, warning.warning].filter(Boolean).join(" "),
      errorId: result.errorId ?? warning.errorId,
    };
  }

  try {
    await finishIdempotentAction(context.admin, started.requestId, result);
    return result;
  } catch (error) {
    const warning = actionWarning(error, {
      action: `${action}:finish-idempotency`,
      fallback: "Could not finish action bookkeeping.",
      businessId: context.profile.businessId,
      userId: context.profile.id,
    }, "The change was processed, but action bookkeeping could not be completed.");
    return result.ok
      ? {
          ...result,
          warning: [result.warning, warning.warning].filter(Boolean).join(" "),
          errorId: result.errorId ?? warning.errorId,
        }
      : result;
  }
}
