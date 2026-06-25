import { createSupabaseContext } from "npm:@supabase/server@1.1.0";

type ActionResult = { ok: true; message?: string } | { ok: false; message: string };
type AppRole = "admin" | "owner" | "staff" | "sales_agent";
type BusinessType = "guest_house" | "library" | "course" | "general";
type PaymentMode = "cash" | "online" | "mixed";
type SettlementDirection = "received_from_user" | "sent_to_user";
type Decision = "accepted" | "rejected";
type ApprovalDecision = "approved" | "rejected";

type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: AppRole;
  active: boolean;
};

type ActionContext = {
  admin: SupabaseAdminClient;
  profile: Profile;
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
    };
  };
};

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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-lenden-action",
};

const businessPermissions: Record<BusinessType, string> = {
  guest_house: "collect_guest_house",
  library: "collect_library",
  course: "collect_course",
  general: "collect_general",
};

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

function json(result: ActionResult, status = 200) {
  return Response.json(result, { status, headers: corsHeaders });
}

async function uploadReceipt(admin: SupabaseAdminClient, file: FormDataEntryValue | null, folder: string) {
  if (!(file instanceof File) || file.size === 0) return null;

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${folder}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await admin.storage.from("receipts").upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (error) {
    throw new Error(error.message);
  }

  return path;
}

async function insertLedger(
  admin: SupabaseAdminClient,
  params: {
    accountProfileId: string;
    amount: number;
    entryDate: string;
    sourceType: "payment" | "expense" | "transfer" | "settlement" | "adjustment";
    sourceId: string;
    description: string;
    createdBy: string;
  },
) {
  const { error } = await admin.from("ledger_entries").insert({
    account_profile_id: params.accountProfileId,
    amount: params.amount,
    entry_date: params.entryDate,
    source_type: params.sourceType,
    source_id: params.sourceId,
    description: params.description,
    created_by: params.createdBy,
  });
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
    metadata?: Record<string, string | number | boolean | null>;
  },
) {
  const recipientIds = [...new Set(params.recipientIds.filter((id): id is string => Boolean(id)))];
  if (recipientIds.length === 0) return;

  await admin.from("app_notifications").insert(
    recipientIds.map((recipientId) => ({
      recipient_id: recipientId,
      actor_id: params.actorId ?? null,
      title: params.title,
      body: params.body,
      category: params.category,
      tone: params.tone ?? "info",
      metadata: params.metadata ?? {},
    })),
  );
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

  createStaff: withErrors("Could not create staff.", async (formData, { admin, profile }) => {
    requireOwnerish(profile.role);

    const email = asString(formData, "email");
    const password = asString(formData, "password");
    const fullName = asString(formData, "full_name");
    const role = (asString(formData, "role") ?? "staff") as AppRole;
    const permissions = permissionsFromForm(formData);

    if (!email || !password || !fullName || password.length < 8) {
      return fail("Name, email, and an 8-character password are required.");
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !data.user) throw new Error(error?.message ?? "Could not create user.");

    const { error: profileError } = await admin.from("profiles").insert({
      id: data.user.id,
      email,
      full_name: fullName,
      role,
      active: true,
    });
    if (profileError) throw new Error(profileError.message);

    if (permissions.length > 0) {
      const { error: permissionError } = await admin.from("staff_permissions").insert(
        permissions.map((permission) => ({
          profile_id: data.user.id,
          permission,
        })),
      );
      if (permissionError) throw new Error(permissionError.message);
    }

    await createNotifications(admin, {
      recipientIds: [data.user.id],
      actorId: profile.id,
      title: "Account created",
      body: `${profile.full_name} created your Lenden account.`,
      category: "settings",
      tone: "success",
      metadata: { role },
    });

    return ok("Staff account created.");
  }),

  saveStaffPermissions: withErrors("Could not save permissions.", async (formData, { admin, profile }) => {
    requireOwnerish(profile.role);

    const profileId = asString(formData, "profile_id");
    if (!profileId) return fail("Missing staff profile.");

    await admin.from("staff_permissions").delete().eq("profile_id", profileId);
    const permissions = permissionsFromForm(formData);

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
      metadata: { permission_count: permissions.length },
    });

    return ok("Permissions saved.");
  }),

  createPayment: withErrors("Could not save payment.", async (formData, { admin, profile }) => {
    const business = asString(formData, "business_type") as BusinessType | null;
    const mode = (asString(formData, "mode") ?? "cash") as PaymentMode;
    const amount = asNumber(formData, "amount") ?? asNumber(formData, "paid_amount") ?? 0;
    const paymentDate = asString(formData, "payment_date") ?? new Date().toISOString().slice(0, 10);

    if (!business || amount <= 0) return fail("Business type and amount are required.");
    const neededPermission = businessPermissions[business];
    const permissionsResponse = await admin
      .from("staff_permissions")
      .select("permission")
      .eq("profile_id", profile.id);
    const permissions = typedDataArray<{ permission: string }>(permissionsResponse);
    const hasAccess = isOwnerish(profile.role) || permissions.some((item) => item.permission === neededPermission);
    if (!hasAccess) return fail("You do not have access to this collection type.");

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
    const photoPath = await uploadReceipt(admin, formData.get("photo"), "payments");

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
      throw new Error(paymentResult.error?.message ?? "Could not save payment.");
    }

    await createNotifications(admin, {
      recipientIds: await ownerRecipientIds(admin, profile.id),
      actorId: profile.id,
      title: "New payment entry",
      body: `${profile.full_name} saved a ${business.replace("_", " ")} payment of ${amount}.`,
      category: "payment",
      tone: "info",
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
        metadata: { payment_id: payment.id, referral_code: referralCodeText, incentive_amount: incentiveAmount },
      });
    }

    return ok("Payment saved.");
  }),

  createExpense: withErrors("Could not save expense.", async (formData, { admin, profile }) => {
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
    if (amount <= 0 || !description || description.length < 3) {
      return fail("Expense amount and a 3-character description are required.");
    }

    const photoPath = await uploadReceipt(admin, formData.get("photo"), "expenses");
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
      })
      .select("id")
      .single();

    const expense = typedData<{ id: string }>(expenseResult);
    if (expenseResult.error || !expense) throw new Error(expenseResult.error?.message ?? "Could not save expense.");

    await createNotifications(admin, {
      recipientIds: await ownerRecipientIds(admin, profile.id),
      actorId: profile.id,
      title: "New expense entry",
      body: `${profile.full_name} added an expense of ${amount}: ${description}.`,
      category: "expense",
      tone: "warning",
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

    const { error } = await admin.from(table).update({ approval_status: decision }).eq("id", id);
    if (error) throw new Error(error.message);

    const existingCashCollection = recordType === "expense" && existing.mode === "cash"
      ? Number(existing.amount)
      : paymentCashCollection(existing);
    if (decision === "approved" && String(existing.record_status ?? "active") === "active" && existingCashCollection > 0) {
      const accountId = recordType === "expense" ? existing.spent_by : existing.current_holder_id ?? existing.collected_by;
      const alreadyPosted = await hasRecordLedgerEntry(admin, recordType, id);
      if (!alreadyPosted) {
        await insertLedger(admin, {
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

    const recordOwnerId = String(recordType === "expense" ? existing.spent_by : existing.collected_by);
    await createNotifications(admin, {
      recipientIds: recordOwnerId === profile.id ? [] : [recordOwnerId],
      actorId: profile.id,
      title: `${recordType === "expense" ? "Expense" : "Payment"} ${decision}`,
      body: `${profile.full_name} ${decision} your ${recordType} entry of ${existing.amount}.`,
      category: "approval",
      tone: decision === "approved" ? "success" : "warning",
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
      metadata: { record_id: id, record_type: recordType },
    });

    return ok("Record cancelled.");
  }),

  updateRecord: withErrors("Could not update record.", async (formData, { admin, profile }) => {
    const recordType = asString(formData, "record_type");
    const id = asString(formData, "id");
    if (!id || !recordType) return fail("Missing record details.");
    if (recordType !== "payment" && recordType !== "expense") return fail("Invalid record type.");

    const table = recordType === "expense" ? "expenses" : "payments";
    const recordResponse = await admin.from(table).select("*").eq("id", id).single();
    const record = typedData<Record<string, string | number | null>>(recordResponse);
    if (recordResponse.error || !record) throw new Error(recordResponse.error?.message ?? "Record not found.");

    const recordOwnerId = String(recordType === "expense" ? record.spent_by : record.collected_by);
    if (!isOwnerish(profile.role) && recordOwnerId !== profile.id) {
      return fail("You can edit only your own transactions.");
    }
    if (String(record.record_status ?? "active") !== "active" || record.approval_status === "approved") {
      return fail("Transactions can be edited only before approval.");
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

    const { error } = await admin.from(table).update(updates).eq("id", id);
    if (error) throw new Error(error.message);

    await createNotifications(admin, {
      recipientIds: await ownerRecipientIds(admin, profile.id),
      actorId: profile.id,
      title: `${recordType === "expense" ? "Expense" : "Payment"} updated`,
      body: `${profile.full_name} updated a pending ${recordType} transaction.`,
      category: "approval",
      tone: "info",
      metadata: { record_id: id, record_type: recordType },
    });

    return ok("Transaction updated.");
  }),

  requestCancel: withErrors("Could not request cancel.", async (formData, { admin, profile }) => {
    const recordType = asString(formData, "record_type");
    const recordId = asString(formData, "record_id");
    if (!recordType || !recordId) return fail("Missing record.");

    const { error } = await admin.from("record_change_requests").insert({
      record_type: recordType,
      record_id: recordId,
      request_type: "cancel",
      requested_by: profile.id,
      reason: asString(formData, "reason"),
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
    }>(requestResponse);
    if (requestResponse.error || !request) throw new Error(requestResponse.error?.message ?? "Request not found.");

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
      metadata: { request_id: requestId, record_id: request.record_id, record_type: request.record_type },
    });

    return ok("Request reviewed.");
  }),

  requestTransfer: withErrors("Could not request transfer.", async (formData, { admin, profile }) => {
    requireOwnerish(profile.role);
    const toProfileId = asString(formData, "to_profile_id");
    const amount = asNumber(formData, "amount") ?? 0;
    if (!toProfileId || amount <= 0) return fail("Choose staff and amount.");
    if (toProfileId === profile.id) return fail("Choose another staff member or agent.");

    const recipientResponse = await admin
      .from("profiles")
      .select("id, active, role")
      .eq("id", toProfileId)
      .single();
    const recipient = typedData<{ id: string; active: boolean; role: string }>(recipientResponse);
    if (!recipient?.active || (recipient.role !== "staff" && recipient.role !== "sales_agent")) {
      return fail("Choose an active staff member or agent.");
    }

    const movementResult = await admin
      .from("money_movements")
      .insert({
        type: "transfer",
        mode: "cash",
        amount,
        from_profile_id: profile.id,
        to_profile_id: toProfileId,
        requested_by: profile.id,
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
      metadata: { movement_id: movement.id, amount },
    });

    return ok("Transfer request sent.");
  }),

  respondTransfer: withErrors("Could not update transfer.", async (formData, { admin, profile }) => {
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
      return fail("Only the receiving staff or agent can accept this transfer.");
    }
    if (movement.status !== "pending") {
      return fail("This transfer has already been reviewed.");
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
      await insertLedger(admin, {
        accountProfileId: movement.from_profile_id,
        amount: -amount,
        entryDate: today,
        sourceType: "transfer",
        sourceId: movement.id,
        description: "Cash transferred out",
        createdBy: profile.id,
      });
      await insertLedger(admin, {
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
      metadata: { movement_id: movementId, decision },
    });

    return ok("Transfer updated.");
  }),

  settleCash: withErrors("Could not settle cash.", async (formData, { admin, profile }) => {
    const direction = (asString(formData, "settlement_direction") ?? "received_from_user") as SettlementDirection;
    const counterpartyProfileId = asString(formData, "profile_id")
      ?? (direction === "sent_to_user" ? asString(formData, "to_profile_id") : asString(formData, "from_profile_id"));
    const amount = asNumber(formData, "amount") ?? 0;
    const settlementDate = asString(formData, "settlement_date") ?? new Date().toISOString().slice(0, 10);
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
        note: asString(formData, "note"),
      })
      .select("id")
      .single();
    const movement = typedData<{ id: string }>(movementResult);
    if (movementResult.error || !movement) throw new Error(movementResult.error?.message ?? "Could not settle cash.");

    await insertLedger(admin, {
      accountProfileId: fromProfileId,
      amount: -amount,
      entryDate: settlementDate,
      sourceType: movementType,
      sourceId: movement.id,
      description: `Cash sent to ${direction === "received_from_user" ? profile.full_name : selectedProfile.full_name}`,
      createdBy: profile.id,
    });
    await insertLedger(admin, {
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
      metadata: { movement_id: movement.id, amount, settlement_date: settlementDate, direction },
    });

    return ok(direction === "received_from_user" ? "Received payment recorded." : "Sent payment recorded.");
  }),

  createAgentSettlement: withErrors("Could not create settlement.", async (formData, { admin, profile }) => {
    requireOwnerish(profile.role);
    const agentId = asString(formData, "agent_id");
    const amount = asNumber(formData, "amount") ?? 0;
    if (!agentId || amount <= 0) return fail("Choose sales agent and amount.");

    const [paymentsResponse, settlementsResponse] = await Promise.all([
      admin
        .from("payments")
        .select("incentive_amount")
        .eq("referral_agent_id", agentId)
        .eq("record_status", "active"),
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
        paid_by: profile.id,
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
      title: "Agent incentive sent",
      body: `${profile.full_name} sent an agent incentive of ${amount} for confirmation.`,
      category: "agent",
      tone: "info",
      metadata: { settlement_id: settlement.id, amount },
    });

    return ok("Agent incentive sent for confirmation.");
  }),

  respondAgentSettlement: withErrors("Could not update settlement.", async (formData, { admin, profile }) => {
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
      return fail("This agent incentive has already been reviewed.");
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
      await insertLedger(admin, {
        accountProfileId: settlement.paid_by,
        amount: -Number(settlement.amount),
        entryDate: new Date().toISOString().slice(0, 10),
        sourceType: "settlement",
        sourceId: settlement.id,
        description: "Agent incentive paid",
        createdBy: profile.id,
      });
      await insertLedger(admin, {
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

  saveCourse: withErrors("Could not save course.", async (formData, { admin, profile }) => {
    requireOwnerish(profile.role);
    const name = asString(formData, "name");
    const kind = asString(formData, "kind") ?? "main";
    if (!name) return fail("Course name is required.");
    const { error } = await admin.from("courses").upsert({ name, kind, active: true }, { onConflict: "name,kind" });
    if (error) throw new Error(error.message);
    return ok("Course saved.");
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
} satisfies Record<string, (formData: FormData, context: ActionContext) => Promise<ActionResult>>;

async function readFormData(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
    return req.formData();
  }

  const data = await req.json().catch(() => ({}));
  const formData = new FormData();
  if (data && typeof data === "object") {
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (value === null || value === undefined) continue;
      if (Array.isArray(value)) {
        value.forEach((item) => formData.append(key, String(item)));
      } else {
        formData.append(key, String(value));
      }
    }
  }
  return formData;
}

function userIdFromContext(ctx: { userClaims?: Record<string, unknown> | null; jwtClaims?: Record<string, unknown> | null }) {
  const userClaims = ctx.userClaims ?? {};
  const jwtClaims = ctx.jwtClaims ?? {};
  const id = userClaims.id ?? userClaims.sub ?? jwtClaims.sub;
  return typeof id === "string" ? id : null;
}

async function requireUserProfile(
  ctx: { userClaims?: Record<string, unknown> | null; jwtClaims?: Record<string, unknown> | null },
  admin: SupabaseAdminClient,
) {
  const userId = userIdFromContext(ctx);
  if (!userId) {
    throw new Error("Unauthorized.");
  }

  const profileResponse = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  const profile = typedData<Profile>(profileResponse);

  if (profileResponse.error || !profile || !profile.active) {
    throw new Error("Your account is inactive or unavailable.");
  }

  return profile;
}

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return json(fail("Method not allowed."), 405);
    }

    const action = req.headers.get("x-lenden-action");
    if (!action || !(action in handlers)) {
      return json(fail("Unknown action."), 400);
    }

    const { data: ctx, error } = await createSupabaseContext(req, { auth: "user" });
    if (error) {
      return json(fail(error.message), error.status ?? 401);
    }

    try {
      const formData = await readFormData(req);
      const admin = ctx.supabaseAdmin as unknown as SupabaseAdminClient;
      const profile = await requireUserProfile(ctx, admin);
      const handler = handlers[action as keyof typeof handlers];
      return json(await handler(formData, { admin, profile }));
    } catch (error) {
      return json(fail(error instanceof Error ? error.message : "Could not process request."));
    }
  },
};
