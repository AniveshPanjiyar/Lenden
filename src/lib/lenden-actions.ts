type ActionResult = { ok: true; message?: string } | { ok: false; message: string };
type AppRole = "admin" | "owner" | "staff" | "sales_agent";
type BusinessType = "guest_house" | "library" | "course" | "general";
type PaymentMode = "cash" | "online" | "mixed";
type SettlementDirection = "received_from_user" | "sent_to_user";
type Decision = "accepted" | "rejected";
type ApprovalDecision = "approved" | "rejected";

export type LendenActionProfile = {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string | null;
  role: AppRole;
  active: boolean;
};

type ActionContext = {
  admin: SupabaseAdminClient;
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
    };
  };
  from: (table: string) => QueryBuilder;
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        file: File,
        options: { contentType: string; upsert: boolean },
      ) => Promise<{ error: { message: string } | null }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
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

type AppNotificationCategory = "payment" | "expense" | "transfer" | "approval" | "agent" | "settings" | "system";
type AppNotificationTone = "success" | "error" | "warning" | "info";

const businessPermissions: Record<BusinessType, string> = {
  guest_house: "collect_guest_house",
  library: "collect_library",
  course: "collect_course",
  general: "collect_general",
};
const idempotencyField = "_action_idempotency_key";
const actionsWithoutIdempotency = new Set<string>(["markNotificationsRead"]);

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

function canTransferPaymentStatus(status: string | null | undefined) {
  return status !== "approved" && status !== "rejected" && status !== "cancelled";
}

function isMissingPaymentSplitSchemaError(error: { code?: string; message?: string }) {
  const message = error.message ?? "";
  return (
    (error.code === "PGRST204" || error.code === "42703") &&
    (message.includes("cash_collection") || message.includes("online_collection"))
  );
}

function permissionsFromForm(formData: FormData) {
  return formData.getAll("permissions").filter((value): value is string => typeof value === "string");
}

function isIsoDate(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isOwnerish(role: string) {
  return role === "admin" || role === "owner";
}

function isSalesAgent(role: string) {
  return role === "sales_agent";
}

function requireOwnerish(role: string) {
  if (!isOwnerish(role)) {
    throw new Error("Only admin or owner can do this.");
  }
}

function typedData<T>(response: QueryResponse<unknown>) {
  return response.data as T | null;
}

function typedDataArray<T>(response: QueryResponse<unknown>) {
  return (response.data ?? []) as T[];
}

function ok(message?: string): ActionResult {
  return message ? { ok: true, message } : { ok: true };
}

function fail(message: string): ActionResult {
  return { ok: false, message };
}

function isDuplicateError(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "23505" || message.includes("duplicate key") || message.includes("already exists");
}

function isStorageDuplicateError(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return message.includes("already exists") || message.includes("duplicate") || message.includes("resource already exists");
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
  const result = value as { ok: unknown; message?: unknown };
  if (result.ok === true) {
    return typeof result.message === "string" ? ok(result.message) : ok();
  }
  if (result.ok === false && typeof result.message === "string") {
    return fail(result.message);
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

  const requestKey = normalizeRequestKey(asString(formData, idempotencyField));
  if (!requestKey) {
    return { kind: "result" as const, result: fail("Please retry the action. Missing request key.") };
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
  if (error) throw new Error(error.message);
}

async function uploadReceipt(admin: SupabaseAdminClient, file: FormDataEntryValue | null, folder: string, requestKey: string) {
  if (!(file instanceof File) || file.size === 0) return null;

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${folder}/${requestKey}-${safeName}`;
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
  profileId: string,
  file: FormDataEntryValue | null,
  requestKey: string,
) {
  if (!(file instanceof File) || file.size === 0) return null;
  if (!file.type.startsWith("image/")) return fail("Choose an image file for your profile photo.");
  if (file.size > 3 * 1024 * 1024) return fail("Profile photo must be 3 MB or smaller.");

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${profileId}/${requestKey}-${safeName}`;
  const bucket = admin.storage.from("profile-photos");
  const { error } = await bucket.upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });

  if (error) {
    if (isStorageDuplicateError(error)) return bucket.getPublicUrl(path).data.publicUrl;
    throw new Error(error.message);
  }

  return bucket.getPublicUrl(path).data.publicUrl;
}

async function ensureLedgerEntry(
  admin: SupabaseAdminClient,
  params: {
    accountProfileId: string | null | undefined;
    amount: number;
    entryDate: string;
    sourceType: "payment" | "expense" | "transfer" | "settlement" | "adjustment";
    sourceId: string;
    description: string;
    createdBy: string;
  },
) {
  if (!params.accountProfileId) return;
  const { error } = await admin.from("ledger_entries").insert({
    account_profile_id: params.accountProfileId,
    amount: params.amount,
    entry_date: params.entryDate,
    source_type: params.sourceType,
    source_id: params.sourceId,
    description: params.description,
    created_by: params.createdBy,
  });
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

async function ownerRecipientIds(admin: SupabaseAdminClient, excludeId?: string) {
  const response = await admin
    .from("profiles")
    .select("id")
    .in("role", ["admin", "owner"])
    .eq("active", true);

  return typedDataArray<{ id: string }>(response)
    .map((profile) => profile.id)
    .filter((id) => id !== excludeId);
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
    const { error } = await admin.from("app_notifications").insert({
      recipient_id: recipientId,
      actor_id: params.actorId ?? null,
      title: params.title,
      body: params.body,
      category: params.category,
      tone: params.tone ?? "info",
      event_key: params.eventKey ?? null,
      metadata: params.metadata ?? {},
    });
    if (isDuplicateError(error)) continue;
    if (error) throw new Error(error.message);
  }
}

async function existingByClientRequest<T>(
  admin: SupabaseAdminClient,
  table: string,
  actorColumn: string,
  actorId: string,
  requestKey: string,
  columns = "*",
) {
  const response = await admin
    .from(table)
    .select(columns)
    .eq(actorColumn, actorId)
    .eq("client_request_id", requestKey)
    .maybeSingle();
  if (response.error) throw new Error(response.error.message);
  return typedData<T>(response);
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
      return fail(error instanceof Error ? error.message : fallbackMessage);
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

    const uploadedPhoto = await uploadProfilePhoto(admin, profile.id, formData.get("photo"), requestKey);
    if (uploadedPhoto && typeof uploadedPhoto === "object" && "ok" in uploadedPhoto && !uploadedPhoto.ok) return uploadedPhoto;
    if (typeof uploadedPhoto === "string") {
      updates.avatar_url = uploadedPhoto;
    }

    if (Object.keys(updates).length === 0) return ok("No profile changes to save.");

    const { error } = await admin.from("profiles").update(updates).eq("id", profile.id);
    if (error) throw new Error(error.message);

    return ok("Profile updated.");
  }),

  createStaff: withErrors("Could not create staff.", async (formData, { admin, profile, idempotencyKey }) => {
    requireOwnerish(profile.role);

    const email = asString(formData, "email")?.toLowerCase();
    const password = asString(formData, "password");
    const fullName = asString(formData, "full_name");
    const role = (asString(formData, "role") ?? "staff") as AppRole;
    if (!["admin", "owner", "staff", "sales_agent"].includes(role)) {
      return fail("Choose a valid role.");
    }
    const permissions = role === "staff" ? permissionsFromForm(formData) : [];

    if (!email || !password || !fullName || password.length < 8) {
      return fail("Name, email, and an 8-character password are required.");
    }

    const existingProfileResponse = await admin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (existingProfileResponse.error) throw new Error(existingProfileResponse.error.message);
    if (existingProfileResponse.data) return ok("Staff account already exists.");

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    const user = data.user;
    if (error || !user) throw new Error(error?.message ?? "Could not create user.");

    const { error: profileError } = await admin.from("profiles").insert({
      id: user.id,
      email,
      full_name: fullName,
      role,
      active: true,
    });
    if (profileError) throw new Error(profileError.message);

    if (permissions.length > 0) {
      const { error: permissionError } = await admin.from("staff_permissions").insert(
        permissions.map((permission) => ({
          profile_id: user.id,
          permission,
        })),
      );
      if (permissionError) throw new Error(permissionError.message);
    }

    await createNotifications(admin, {
      recipientIds: [user.id],
      actorId: profile.id,
      title: "Account created",
      body: `${profile.full_name} created your Lenden account.`,
      category: "settings",
      tone: "success",
      eventKey: `staff-created:${user.id}:${idempotencyKey ?? "existing"}`,
      metadata: { role },
    });

    return ok("Staff account created.");
  }),

  saveStaffPermissions: withErrors("Could not save permissions.", async (formData, { admin, profile, idempotencyKey }) => {
    requireOwnerish(profile.role);

    const profileId = asString(formData, "profile_id");
    if (!profileId) return fail("Missing staff profile.");

    const targetProfileResponse = await admin.from("profiles").select("role").eq("id", profileId).single();
    const targetProfile = typedData<{ role: AppRole }>(targetProfileResponse);
    if (targetProfileResponse.error || !targetProfile) {
      throw new Error(targetProfileResponse.error?.message ?? "Staff profile not found.");
    }

    await admin.from("staff_permissions").delete().eq("profile_id", profileId);
    const permissions = targetProfile.role === "staff" ? permissionsFromForm(formData) : [];

    if (permissions.length > 0) {
      const { error } = await admin.from("staff_permissions").insert(
        permissions.map((permission) => ({ profile_id: profileId, permission })),
      );
      if (error) throw new Error(error.message);
    }

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

    return ok(targetProfile.role === "sales_agent" ? "Sales agents are read-only; permissions cleared." : "Permissions saved.");
  }),

  createPayment: withErrors("Could not save payment.", async (formData, { admin, profile, idempotencyKey }) => {
    if (isSalesAgent(profile.role)) {
      return fail("Sales agents have read-only incentive access.");
    }

    const business = asString(formData, "business_type") as BusinessType | null;
    const mode = (asString(formData, "mode") ?? "cash") as PaymentMode;
    const amount = asNumber(formData, "amount") ?? asNumber(formData, "paid_amount") ?? 0;
    const paymentDate = asString(formData, "payment_date") ?? new Date().toISOString().slice(0, 10);
    const requestKey = idempotencyKey ?? crypto.randomUUID();

    if (!business || amount <= 0) return fail("Business type and amount are required.");
    const neededPermission = businessPermissions[business];
    const permissionsResponse = await admin
      .from("staff_permissions")
      .select("permission")
      .eq("profile_id", profile.id);
    const permissions = typedDataArray<{ permission: string }>(permissionsResponse);
    const hasAccess = isOwnerish(profile.role) || permissions.some((item) => item.permission === neededPermission);
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

    const fee = asNumber(formData, "fee_amount");
    const paid = asNumber(formData, "paid_amount") ?? amount;
    const due = fee !== null ? Math.max(fee - paid, 0) : null;
    const advance = fee !== null ? Math.max(paid - fee, 0) : null;
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
    const skillCourseId = asString(formData, "skill_course_id");
    const referralCodeText = asString(formData, "referral_code");
    const photoPath = await uploadReceipt(admin, formData.get("photo"), "payments", requestKey);

    let roomSnapshot = null;
    if (roomId) {
      const roomResponse = await admin.from("rooms").select("room_number").eq("id", roomId).single();
      const room = typedData<{ room_number: string }>(roomResponse);
      roomSnapshot = room?.room_number ?? null;
    }

    let referralCodeId = null;
    let referralAgentId = null;
    let discountAmountApplied = 0;
    let incentiveAmount = 0;
    if (referralCodeText) {
      const referralResponse = await admin
        .from("referral_codes")
        .select("id, agent_id, discount_type, discount_value, incentive_type, incentive_value")
        .ilike("code", referralCodeText)
        .eq("active", true)
        .maybeSingle();
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

    const paymentPayload = {
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
      start_date: asString(formData, "start_date"),
      end_date: asString(formData, "end_date"),
      customer_name: asString(formData, "customer_name"),
      roll_number: asString(formData, "roll_number"),
      room_id: roomId,
      room_number_snapshot: roomSnapshot,
      seat_number: asString(formData, "seat_number"),
      start_time: asString(formData, "start_time"),
      end_time: asString(formData, "end_time"),
      slot_hours: asNumber(formData, "slot_hours"),
      course_id: courseId,
      skill_course_id: skillCourseId,
      referral_code_id: referralCodeId,
      referral_code_snapshot: referralCodeText,
      referral_agent_id: referralAgentId,
      discount_amount_applied: discountAmountApplied,
      incentive_amount: incentiveAmount,
      description: asString(formData, "description"),
      remark: asString(formData, "remark"),
      photo_path: photoPath,
      collected_by: profile.id,
      current_holder_id: cashCollection > 0 ? profile.id : null,
      client_request_id: requestKey,
    };

    let paymentResult = await admin
      .from("payments")
      .insert(paymentPayload)
      .select("id")
      .single();

    if (paymentResult.error && isMissingPaymentSplitSchemaError(paymentResult.error)) {
      if (mode === "mixed") {
        return fail("Mixed payments need the latest database migration before they can be saved.");
      }

      const legacyPaymentPayload: Partial<typeof paymentPayload> = { ...paymentPayload };
      delete legacyPaymentPayload.cash_collection;
      delete legacyPaymentPayload.online_collection;
      paymentResult = await admin
        .from("payments")
        .insert(legacyPaymentPayload)
        .select("id")
        .single();
    }

    const payment = typedData<{ id: string }>(paymentResult);
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

    await createNotifications(admin, {
      recipientIds: await ownerRecipientIds(admin, profile.id),
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

    return ok("Payment saved.");
  }),

  createExpense: withErrors("Could not save expense.", async (formData, { admin, profile, idempotencyKey }) => {
    if (isSalesAgent(profile.role)) {
      return fail("Sales agents have read-only incentive access.");
    }

    const permissionsResponse = await admin
      .from("staff_permissions")
      .select("permission")
      .eq("profile_id", profile.id);
    const permissions = typedDataArray<{ permission: string }>(permissionsResponse);

    if (!isOwnerish(profile.role) && !permissions.some((item) => item.permission === "add_expense")) {
      return fail("You do not have access to add expenses.");
    }

    const amount = asNumber(formData, "amount") ?? 0;
    const description = asString(formData, "description");
    const expenseDate = asString(formData, "expense_date") ?? new Date().toISOString().slice(0, 10);
    const mode = (asString(formData, "mode") ?? "cash") as PaymentMode;
    const requestKey = idempotencyKey ?? crypto.randomUUID();
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
    if (existingExpense) return ok("Expense saved as pending approval.");

    const photoPath = await uploadReceipt(admin, formData.get("photo"), "expenses", requestKey);
    const expenseResult = await admin
      .from("expenses")
      .insert({
        business_type: asString(formData, "business_type"),
        mode,
        amount,
        expense_date: expenseDate,
        description,
        remark: asString(formData, "remark"),
        photo_path: photoPath,
        spent_by: profile.id,
        client_request_id: requestKey,
      })
      .select("id")
      .single();

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
        if (duplicateExpense) return ok("Expense saved as pending approval.");
      }
      throw new Error(expenseResult.error?.message ?? "Could not save expense.");
    }

    await createNotifications(admin, {
      recipientIds: await ownerRecipientIds(admin, profile.id),
      actorId: profile.id,
      title: "New expense entry",
      body: `${profile.full_name} added an expense of ${amount}: ${description}.`,
      category: "expense",
      tone: "warning",
      eventKey: `expense-created:${expense.id}`,
      metadata: { expense_id: expense.id, amount },
    });

    return ok("Expense saved as pending approval.");
  }),

  approveRecord: withErrors("Approval failed.", async (formData, { admin, profile }) => {
    requireOwnerish(profile.role);
    const recordType = asString(formData, "record_type");
    const id = asString(formData, "id");
    const decision = asString(formData, "decision") as ApprovalDecision;
    if (!id || !recordType || !decision) return fail("Missing approval details.");
    if (recordType !== "payment" && recordType !== "expense") return fail("Invalid record type.");

    const table = recordType === "expense" ? "expenses" : "payments";
    const existingResponse = await admin.from(table).select("*").eq("id", id).single();
    const existing = typedData<Record<string, string | number | null>>(existingResponse);
    if (existingResponse.error || !existing) throw new Error(existingResponse.error?.message ?? "Record not found.");
    const currentDecision = String(existing.approval_status ?? "pending");
    const alreadySameDecision = currentDecision === decision;
    if (!alreadySameDecision && currentDecision !== "pending" && currentDecision !== "reapproval_required") {
      return fail("This record has already been reviewed.");
    }

    if (!alreadySameDecision && recordType === "payment" && decision === "approved") {
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

    if (!alreadySameDecision) {
      const { error } = await admin.from(table).update({ approval_status: decision }).eq("id", id);
      if (error) throw new Error(error.message);
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
          amount: recordType === "expense" ? -existingCashCollection : existingCashCollection,
          entryDate: String(recordType === "expense" ? existing.expense_date : existing.payment_date),
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

    const recordOwnerId = String(recordType === "expense" ? existing.spent_by : existing.collected_by);
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
    requireOwnerish(profile.role);
    const recordType = asString(formData, "record_type");
    const id = asString(formData, "id");
    if (!id || !recordType) return fail("Missing cancel details.");
    if (recordType !== "payment" && recordType !== "expense") return fail("Invalid record type.");

    const table = recordType === "expense" ? "expenses" : "payments";
    const recordResponse = await admin.from(table).select("*").eq("id", id).single();
    const record = typedData<Record<string, string | number | null>>(recordResponse);
    if (recordResponse.error || !record) throw new Error(recordResponse.error?.message ?? "Record not found.");
    if (String(record.record_status ?? "active") === "cancelled") {
      await removeRecordLedgerEntries(admin, recordType, id);
      return ok("Record cancelled.");
    }
    const reason = asString(formData, "reason");
    if (!reason) return fail("Deletion reason is required.");

    const { error } = await admin
      .from(table)
      .update({
        record_status: "cancelled",
        approval_status: "cancelled",
        cancel_reason: reason,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);

    await removeRecordLedgerEntries(admin, recordType, id);

    const recordOwnerId = String(recordType === "expense" ? record.spent_by : record.collected_by);
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
    if (isSalesAgent(profile.role)) {
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

    const recordOwnerId = String(recordType === "expense" ? record.spent_by : record.collected_by);
    if (recordOwnerId !== profile.id) {
      return fail("You can edit only your own transactions.");
    }
    if (String(record.record_status ?? "active") !== "active" || record.approval_status === "approved") {
      return fail("Transactions can be edited only before approval.");
    }
    if (recordType === "payment") {
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
      recipientIds: await ownerRecipientIds(admin, profile.id),
      actorId: profile.id,
      title: `${recordType === "expense" ? "Expense" : "Payment"} updated`,
      body: `${profile.full_name} updated a pending ${recordType} transaction.`,
      category: "approval",
      tone: "info",
      eventKey: `record-updated:${recordType}:${id}:${idempotencyKey ?? "direct"}`,
      metadata: { record_id: id, record_type: recordType },
    });

    return ok("Transaction updated.");
  }),

  requestCancel: withErrors("Could not request cancel.", async (formData, { admin, profile, idempotencyKey }) => {
    if (isSalesAgent(profile.role)) {
      return fail("Sales agents have read-only incentive access.");
    }

    const recordType = asString(formData, "record_type");
    const recordId = asString(formData, "record_id");
    const requestKey = idempotencyKey ?? crypto.randomUUID();
    if (!recordType || !recordId) return fail("Missing record.");
    if (recordType !== "payment" && recordType !== "expense") return fail("Invalid record type.");

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
      recipientIds: await ownerRecipientIds(admin, profile.id),
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
    requireOwnerish(profile.role);
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

    await admin
      .from("record_change_requests")
      .update({ status: decision, reviewed_by: profile.id, reviewed_at: new Date().toISOString() })
      .eq("id", requestId);

    if (decision === "accepted" && request.request_type === "cancel") {
      const table = request.record_type === "expense" ? "expenses" : "payments";
      const recordResponse = await admin.from(table).select("*").eq("id", request.record_id).single();
      if (recordResponse.error || !recordResponse.data) throw new Error(recordResponse.error?.message ?? "Record not found.");
      await admin
        .from(table)
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
    if (isSalesAgent(profile.role)) {
      return fail("Sales agents have read-only incentive access.");
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
    if (String(payment.record_status ?? "active") !== "active" || !canTransferPaymentStatus(String(payment.approval_status ?? ""))) {
      return fail("Only active transactions before owner approval can be transferred.");
    }
    if (payment.current_holder_id !== profile.id) {
      return fail("Only the current cash holder can transfer this transaction.");
    }

    const cashAmount = paymentCashCollection(payment);
    if (cashAmount <= 0) return fail("Only cash or mixed transactions with cash can be transferred.");

    const recipientResponse = await admin
      .from("profiles")
      .select("id, active, role, full_name")
      .eq("id", toProfileId)
      .single();
    const recipient = typedData<{ id: string; active: boolean; role: string; full_name: string }>(recipientResponse);
    if (recipientResponse.error || !recipient) throw new Error(recipientResponse.error?.message ?? "Receiving staff not found.");
    if (!recipient.active || isOwnerish(recipient.role)) {
      return fail("Choose an active non-owner staff member.");
    }

    const permissionResponse = await admin
      .from("staff_permissions")
      .select("permission")
      .eq("profile_id", toProfileId)
      .eq("permission", requiredPermission)
      .maybeSingle();
    if (permissionResponse.error) throw new Error(permissionResponse.error.message);
    if (!permissionResponse.data) {
      return fail("Receiving staff does not have permission for this collection category.");
    }

    const pendingResponse = await admin
      .from("money_movements")
      .select("id, from_profile_id, to_profile_id, requested_by")
      .eq("payment_id", paymentId)
      .eq("type", "transfer")
      .eq("status", "pending")
      .maybeSingle();
    if (pendingResponse.error) throw new Error(pendingResponse.error.message);
    const pendingTransfer = typedData<{
      id: string;
      from_profile_id: string;
      to_profile_id: string | null;
      requested_by: string;
    }>(pendingResponse);
    if (pendingTransfer) {
      return pendingTransfer.from_profile_id === profile.id &&
        pendingTransfer.to_profile_id === toProfileId &&
        pendingTransfer.requested_by === profile.id
        ? ok("Transaction transfer requested.")
        : fail("This transaction already has a pending transfer.");
    }

    const movementResult = await admin
      .from("money_movements")
      .insert({
        type: "transfer",
        mode: "cash",
        amount: cashAmount,
        payment_id: paymentId,
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
      recipientIds: [...(await ownerRecipientIds(admin, profile.id)), toProfileId],
      actorId: profile.id,
      title: "Transaction transfer requested",
      body: `${profile.full_name} requested to transfer ${cashAmount} cash to ${recipient.full_name}.`,
      category: "transfer",
      tone: "info",
      eventKey: `payment-transfer-request:${movement.id}`,
      metadata: { payment_id: paymentId, movement_id: movement.id, amount: cashAmount },
    });

    return ok("Transaction transfer requested.");
  }),

  respondPaymentTransfer: withErrors("Could not update transaction transfer.", async (formData, { admin, profile }) => {
    if (isSalesAgent(profile.role)) {
      return fail("Sales agents have read-only incentive access.");
    }

    const movementId = asString(formData, "movement_id");
    const decision = asString(formData, "decision") as Decision;
    if (!movementId || !decision) return fail("Missing transfer response.");
    if (decision !== "accepted" && decision !== "rejected") return fail("Choose a valid transfer response.");

    const movementResponse = await admin
      .from("money_movements")
      .select("*")
      .eq("id", movementId)
      .single();
    const movement = typedData<{
      id: string;
      payment_id: string | null;
      amount: number | string;
      from_profile_id: string;
      to_profile_id: string | null;
      status: string;
      type: string;
    }>(movementResponse);
    if (movementResponse.error || !movement) throw new Error(movementResponse.error?.message ?? "Movement not found.");
    if (movement.type !== "transfer" || !movement.payment_id) {
      return fail("This is not a transaction transfer.");
    }
    if (movement.to_profile_id !== profile.id) {
      return fail("Only the receiving staff can respond to this transfer.");
    }

    const paymentResponse = await admin.from("payments").select("*").eq("id", movement.payment_id).single();
    const payment = typedData<Record<string, string | number | null>>(paymentResponse);
    if (paymentResponse.error || !payment) throw new Error(paymentResponse.error?.message ?? "Payment not found.");
    if (movement.status !== "pending") {
      if (movement.status !== decision) return fail("This transfer has already been reviewed.");
      if (decision === "accepted" && payment.current_holder_id !== profile.id) {
        if (payment.current_holder_id === movement.from_profile_id) {
          const paymentUpdate = await admin
            .from("payments")
            .update({ current_holder_id: profile.id })
            .eq("id", movement.payment_id)
            .eq("current_holder_id", movement.from_profile_id);
          if (paymentUpdate.error) throw new Error(paymentUpdate.error.message);
        } else {
          return fail("This transfer has already been reviewed.");
        }
      }
      return ok(`Transaction transfer ${decision}.`);
    }
    if (String(payment.record_status ?? "active") !== "active" || !canTransferPaymentStatus(String(payment.approval_status ?? ""))) {
      return fail("This transaction can no longer be transferred.");
    }
    if (payment.current_holder_id !== movement.from_profile_id) {
      return fail("The transaction holder changed before this transfer was accepted.");
    }

    if (decision === "accepted") {
      const paymentUpdate = await admin
        .from("payments")
        .update({ current_holder_id: profile.id })
        .eq("id", movement.payment_id)
        .eq("current_holder_id", movement.from_profile_id);
      if (paymentUpdate.error) throw new Error(paymentUpdate.error.message);
    }

    const movementUpdate = await admin
      .from("money_movements")
      .update({
        status: decision,
        responded_by: profile.id,
        responded_at: new Date().toISOString(),
      })
      .eq("id", movementId);
    if (movementUpdate.error) {
      if (decision === "accepted") {
        await admin.from("payments").update({ current_holder_id: movement.from_profile_id }).eq("id", movement.payment_id);
      }
      throw new Error(movementUpdate.error.message);
    }

    await createNotifications(admin, {
      recipientIds: [...(await ownerRecipientIds(admin, profile.id)), movement.from_profile_id],
      actorId: profile.id,
      title: `Transaction transfer ${decision}`,
      body: `${profile.full_name} ${decision} a transaction transfer of ${movement.amount}.`,
      category: "transfer",
      tone: decision === "accepted" ? "success" : "warning",
      eventKey: `payment-transfer-response:${movementId}:${decision}`,
      metadata: { payment_id: movement.payment_id, movement_id: movementId, decision },
    });

    return ok(`Transaction transfer ${decision}.`);
  }),

  requestTransfer: withErrors("Could not request transfer.", async (formData, { admin, profile, idempotencyKey }) => {
    requireOwnerish(profile.role);
    const toProfileId = asString(formData, "to_profile_id");
    const amount = asNumber(formData, "amount") ?? 0;
    const requestKey = idempotencyKey ?? crypto.randomUUID();
    if (!toProfileId || amount <= 0) return fail("Choose staff and amount.");
    if (toProfileId === profile.id) return fail("Choose another staff member.");

    const recipientResponse = await admin
      .from("profiles")
      .select("id, active, role")
      .eq("id", toProfileId)
      .single();
    const recipient = typedData<{ id: string; active: boolean; role: string }>(recipientResponse);
    if (!recipient?.active || recipient.role !== "staff") {
      return fail("Choose an active staff member.");
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
    if (isSalesAgent(profile.role)) {
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
    }>(movementResponse);
    if (movementResponse.error || !movement) throw new Error(movementResponse.error?.message ?? "Movement not found.");
    if (movement.to_profile_id !== profile.id) {
      return fail("Only the receiving staff can accept this transfer.");
    }
    if (movement.status !== "pending") {
      if (movement.status !== decision) return fail("This transfer has already been reviewed.");
      if (decision === "accepted") {
        const amount = Number(movement.amount);
        const today = new Date().toISOString().slice(0, 10);
        await ensureLedgerEntry(admin, {
          accountProfileId: movement.from_profile_id,
          amount: -amount,
          entryDate: today,
          sourceType: "transfer",
          sourceId: movement.id,
          description: "Cash transferred out",
          createdBy: profile.id,
        });
        await ensureLedgerEntry(admin, {
          accountProfileId: movement.to_profile_id,
          amount,
          entryDate: today,
          sourceType: "transfer",
          sourceId: movement.id,
          description: "Cash transfer received",
          createdBy: profile.id,
        });
      }
      return ok("Transfer updated.");
    }

    const { error } = await admin
      .from("money_movements")
      .update({
        status: decision,
        responded_by: profile.id,
        responded_at: new Date().toISOString(),
      })
      .eq("id", movementId);
    if (error) throw new Error(error.message);

    if (decision === "accepted") {
      const amount = Number(movement.amount);
      const today = new Date().toISOString().slice(0, 10);
      await ensureLedgerEntry(admin, {
        accountProfileId: movement.from_profile_id,
        amount: -amount,
        entryDate: today,
        sourceType: "transfer",
        sourceId: movement.id,
        description: "Cash transferred out",
        createdBy: profile.id,
      });
      await ensureLedgerEntry(admin, {
        accountProfileId: movement.to_profile_id,
        amount,
        entryDate: today,
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

  settleCash: withErrors("Could not settle cash.", async (formData, { admin, profile, idempotencyKey }) => {
    if (isSalesAgent(profile.role)) {
      return fail("Sales agents have read-only incentive access.");
    }

    const direction = (asString(formData, "settlement_direction") ?? "received_from_user") as SettlementDirection;
    const counterpartyProfileId = asString(formData, "profile_id")
      ?? (direction === "sent_to_user" ? asString(formData, "to_profile_id") : asString(formData, "from_profile_id"));
    const amount = asNumber(formData, "amount") ?? 0;
    const settlementDate = asString(formData, "settlement_date") ?? new Date().toISOString().slice(0, 10);
    const requestKey = idempotencyKey ?? crypto.randomUUID();
    if (!counterpartyProfileId || amount <= 0) return fail("Choose a user and amount.");
    if (counterpartyProfileId === profile.id) return fail("Choose another user.");
    if (!isIsoDate(settlementDate)) return fail("Choose a valid settlement date.");
    if (direction !== "received_from_user" && direction !== "sent_to_user") {
      return fail("Choose whether money was received or sent.");
    }

    const selectedProfileResponse = await admin
      .from("profiles")
      .select("id, role, active, full_name")
      .eq("id", counterpartyProfileId)
      .single();
    const selectedProfile = typedData<{ id: string; role: string; active: boolean; full_name: string }>(selectedProfileResponse);
    if (!selectedProfile?.active) {
      return fail("Choose an active user.");
    }
    if (isSalesAgent(selectedProfile.role)) {
      return fail("Sales agents do not manage cash settlements.");
    }

    const actorOwnerish = isOwnerish(profile.role);
    const counterpartyOwnerish = isOwnerish(selectedProfile.role);
    if (!actorOwnerish && !counterpartyOwnerish) {
      return fail("Staff can only send or receive money with an owner.");
    }

    const fromProfileId = direction === "received_from_user" ? counterpartyProfileId : profile.id;
    const toProfileId = direction === "received_from_user" ? profile.id : counterpartyProfileId;
    const senderOwnerish = direction === "received_from_user" ? counterpartyOwnerish : actorOwnerish;
    const movementType = !senderOwnerish && (direction === "sent_to_user" ? counterpartyOwnerish : actorOwnerish)
      ? "settlement"
      : "transfer";

    const existingMovement = await existingByClientRequest<{
      id: string;
      type: "transfer" | "settlement";
      from_profile_id: string;
      to_profile_id: string | null;
    }>(
      admin,
      "money_movements",
      "requested_by",
      profile.id,
      requestKey,
      "id,type,from_profile_id,to_profile_id",
    );
    if (existingMovement) {
      await ensureLedgerEntry(admin, {
        accountProfileId: existingMovement.from_profile_id,
        amount: -amount,
        entryDate: settlementDate,
        sourceType: existingMovement.type,
        sourceId: existingMovement.id,
        description: `Cash sent to ${direction === "received_from_user" ? profile.full_name : selectedProfile.full_name}`,
        createdBy: profile.id,
      });
      await ensureLedgerEntry(admin, {
        accountProfileId: existingMovement.to_profile_id,
        amount,
        entryDate: settlementDate,
        sourceType: existingMovement.type,
        sourceId: existingMovement.id,
        description: `Cash received from ${direction === "received_from_user" ? selectedProfile.full_name : profile.full_name}`,
        createdBy: profile.id,
      });
      return ok(direction === "received_from_user" ? "Received payment recorded." : "Sent payment recorded.");
    }

    const senderLedgerResponse = await admin
      .from("ledger_entries")
      .select("amount")
      .eq("account_profile_id", fromProfileId)
      .lte("entry_date", settlementDate);
    const senderLedger = typedDataArray<{ amount: number | string | null }>(senderLedgerResponse);
    const senderBalance = senderLedger.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
    if (!senderOwnerish) {
      if (senderBalance <= 0) return fail("No cash is available to send from this user.");
      if (amount > senderBalance) return fail("Amount is higher than this user's closing balance.");
    }

    const movementResult = await admin
      .from("money_movements")
      .insert({
        type: movementType,
        mode: "cash",
        amount,
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
    if (movementResult.error || !movement) throw new Error(movementResult.error?.message ?? "Could not settle cash.");

    await ensureLedgerEntry(admin, {
      accountProfileId: fromProfileId,
      amount: -amount,
      entryDate: settlementDate,
      sourceType: movementType,
      sourceId: movement.id,
      description: `Cash sent to ${direction === "received_from_user" ? profile.full_name : selectedProfile.full_name}`,
      createdBy: profile.id,
    });
    await ensureLedgerEntry(admin, {
      accountProfileId: toProfileId,
      amount,
      entryDate: settlementDate,
      sourceType: movementType,
      sourceId: movement.id,
      description: `Cash received from ${direction === "received_from_user" ? selectedProfile.full_name : profile.full_name}`,
      createdBy: profile.id,
    });

    await createNotifications(admin, {
      recipientIds: [counterpartyProfileId],
      actorId: profile.id,
      title: direction === "received_from_user" ? "Cash marked received" : "Cash marked sent",
      body:
        direction === "received_from_user"
          ? `${profile.full_name} marked ${amount} as received from you for ${settlementDate}.`
          : `${profile.full_name} marked ${amount} as sent to you for ${settlementDate}.`,
      category: "transfer",
      tone: "success",
      eventKey: `cash-settlement:${movement.id}`,
      metadata: { movement_id: movement.id, amount, settlement_date: settlementDate, direction },
    });

    return ok(direction === "received_from_user" ? "Received payment recorded." : "Sent payment recorded.");
  }),

  createAgentSettlement: withErrors("Could not create settlement.", async (formData, { admin, profile, idempotencyKey }) => {
    requireOwnerish(profile.role);
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
    if (existingSettlement) return ok("Agent incentive settled.");

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

    const settlementResult = await admin
      .from("agent_settlements")
      .insert({
        agent_id: agentId,
        amount,
        status: "accepted",
        paid_by: profile.id,
        responded_by: profile.id,
        responded_at: new Date().toISOString(),
        client_request_id: requestKey,
        note: asString(formData, "note"),
      })
      .select("id")
      .single();
    const settlement = typedData<{ id: string }>(settlementResult);
    if (settlementResult.error || !settlement) {
      throw new Error(settlementResult.error?.message ?? "Could not create settlement.");
    }

    await createNotifications(admin, {
      recipientIds: [agentId],
      actorId: profile.id,
      title: "Agent incentive settled",
      body: `${profile.full_name} marked an agent incentive of ${amount} as settled.`,
      category: "agent",
      tone: "success",
      eventKey: `agent-settlement-created:${settlement.id}`,
      metadata: { settlement_id: settlement.id, amount },
    });

    return ok("Agent incentive settled.");
  }),

  respondAgentSettlement: withErrors("Could not update settlement.", async (formData, { admin, profile }) => {
    if (isSalesAgent(profile.role)) {
      return fail("Sales agents have read-only incentive access.");
    }

    const settlementId = asString(formData, "settlement_id");
    const decision = asString(formData, "decision") as Decision;
    if (!settlementId || !decision) return fail("Missing settlement response.");

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
    }>(settlementResponse);
    if (settlementResponse.error || !settlement) {
      throw new Error(settlementResponse.error?.message ?? "Settlement not found.");
    }
    if (settlement.agent_id !== profile.id) {
      return fail("Only the linked sales agent can confirm this settlement.");
    }
    if (settlement.status !== "pending") {
      if (settlement.status !== decision) return fail("This agent incentive has already been reviewed.");
      if (decision === "accepted") {
        await ensureLedgerEntry(admin, {
          accountProfileId: settlement.paid_by,
          amount: -Number(settlement.amount),
          entryDate: new Date().toISOString().slice(0, 10),
          sourceType: "settlement",
          sourceId: settlement.id,
          description: "Agent incentive paid",
          createdBy: profile.id,
        });
        await ensureLedgerEntry(admin, {
          accountProfileId: settlement.agent_id,
          amount: Number(settlement.amount),
          entryDate: new Date().toISOString().slice(0, 10),
          sourceType: "settlement",
          sourceId: settlement.id,
          description: "Agent incentive received",
          createdBy: profile.id,
        });
      }
      return ok("Agent incentive updated.");
    }

    const { error } = await admin
      .from("agent_settlements")
      .update({
        status: decision,
        responded_by: profile.id,
        responded_at: new Date().toISOString(),
      })
      .eq("id", settlementId);
    if (error) throw new Error(error.message);

    if (decision === "accepted") {
      await ensureLedgerEntry(admin, {
        accountProfileId: settlement.paid_by,
        amount: -Number(settlement.amount),
        entryDate: new Date().toISOString().slice(0, 10),
        sourceType: "settlement",
        sourceId: settlement.id,
        description: "Agent incentive paid",
        createdBy: profile.id,
      });
      await ensureLedgerEntry(admin, {
        accountProfileId: settlement.agent_id,
        amount: Number(settlement.amount),
        entryDate: new Date().toISOString().slice(0, 10),
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
    requireOwnerish(profile.role);
    const roomNumber = asString(formData, "room_number");
    if (!roomNumber) return fail("Room number is required.");
    const { error } = await admin.from("rooms").upsert({
      room_number: roomNumber,
      label: asString(formData, "label"),
      active: !asBool(formData, "inactive"),
    });
    if (error) throw new Error(error.message);
    return ok("Room saved.");
  }),

  deleteRoom: withErrors("Could not delete room.", async (formData, { admin, profile }) => {
    requireOwnerish(profile.role);
    const id = asString(formData, "id");
    if (!id) return fail("Room is required.");
    const { error } = await admin.from("rooms").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return ok("Room deleted.");
  }),

  saveCourse: withErrors("Could not save course.", async (formData, { admin, profile }) => {
    requireOwnerish(profile.role);
    const name = asString(formData, "name");
    const kind = asString(formData, "kind") ?? "main";
    if (!name) return fail("Course name is required.");
    const { error } = await admin.from("courses").upsert({ name, kind, active: true }, { onConflict: "name,kind" });
    if (error) throw new Error(error.message);
    return ok("Course saved.");
  }),

  deleteCourse: withErrors("Could not delete course.", async (formData, { admin, profile }) => {
    requireOwnerish(profile.role);
    const id = asString(formData, "id");
    if (!id) return fail("Course is required.");
    const { error } = await admin.from("courses").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return ok("Course deleted.");
  }),

  saveReferral: withErrors("Could not save referral.", async (formData, { admin, profile }) => {
    requireOwnerish(profile.role);
    const code = asString(formData, "code")?.toUpperCase();
    if (!code) return fail("Referral code is required.");
    const { error } = await admin.from("referral_codes").upsert({
      code,
      agent_id: asString(formData, "agent_id"),
      discount_amount: asNumber(formData, "discount_value") ?? asNumber(formData, "discount_amount") ?? 0,
      discount_type: asString(formData, "discount_type") ?? "amount",
      discount_value: asNumber(formData, "discount_value") ?? asNumber(formData, "discount_amount") ?? 0,
      incentive_type: asString(formData, "incentive_type") ?? "amount",
      incentive_value: asNumber(formData, "incentive_value") ?? 0,
      active: true,
    });
    if (error) throw new Error(error.message);
    return ok("Referral code saved.");
  }),

  deleteReferral: withErrors("Could not delete referral code.", async (formData, { admin, profile }) => {
    requireOwnerish(profile.role);
    const id = asString(formData, "id");
    if (!id) return fail("Referral code is required.");
    const { error } = await admin.from("referral_codes").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return ok("Referral code deleted.");
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

  const result = await handlers[action](formData, nextContext);
  await finishIdempotentAction(context.admin, started.requestId, result);
  return result;
}
