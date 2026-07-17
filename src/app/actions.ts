"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { profileForBusiness, resolveBusinessContextFromRequest } from "@/lib/tenancy";
import {
  executeLendenAction,
  type LendenActionAdminClient,
  type LendenActionName,
  type LendenActionProfile,
} from "@/lib/lenden-actions";

type ActionResult = { ok: true; message?: string } | { ok: false; message: string };

const appPath = "/";
const salesAgentAllowedActions = new Set<LendenActionName>(["markNotificationsRead", "updateProfile"]);
const financialActions = new Set<LendenActionName>([
  "createPayment",
  "saveLibraryStudent",
  "setLibraryStudentStatus",
  "saveCourseStudent",
  "createExpense",
  "approveRecord",
  "cancelRecord",
  "updateRecord",
  "requestCancel",
  "reviewChangeRequest",
  "requestPaymentTransfer",
  "respondPaymentTransfer",
  "requestTransfer",
  "respondTransfer",
  "settleCash",
  "createAgentSettlement",
  "respondAgentSettlement",
]);

function asString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function requireUserProfile() {
  const { identity, context } = await resolveBusinessContextFromRequest();
  const role = context.membership?.role ?? "co_owner";
  return {
    ...profileForBusiness(identity, role),
    businessId: context.business.id,
    businessTimezone: context.business.timezone,
    businessRole: role,
    accessMode: context.accessMode,
  } as LendenActionProfile;
}

function logActionTiming(action: LendenActionName, profile: LendenActionProfile | null, startedAt: number, result: ActionResult) {
  const durationMs = Math.round(performance.now() - startedAt);
  const status = result.ok ? "success" : "failure";
  console.info("[lenden-action]", {
    action,
    status,
    durationMs,
    userId: profile?.id ?? null,
    message: result.message ?? null,
  });
}

async function invokeLendenAction(action: LendenActionName, formData = new FormData()): Promise<ActionResult> {
  const startedAt = performance.now();
  let profile: LendenActionProfile | null = null;
  try {
    profile = await requireUserProfile();
    if (profile.businessRole === "sales_agent" && !salesAgentAllowedActions.has(action)) {
      const result = { ok: false, message: "Sales agents have read-only incentive access." } satisfies ActionResult;
      logActionTiming(action, profile, startedAt, result);
      return result;
    }
    if (profile.accessMode === "support" && financialActions.has(action)) {
      const result = { ok: false, message: "Financial changes are blocked in audited support mode." } satisfies ActionResult;
      logActionTiming(action, profile, startedAt, result);
      return result;
    }
    const dataClient = await createClient({ businessId: profile.businessId });
    const admin = dataClient as unknown as LendenActionAdminClient;
    const authAdmin = createAdminClient() as unknown as LendenActionAdminClient;
    const result = await executeLendenAction(action, formData, { admin, authAdmin, profile });
    logActionTiming(action, profile, startedAt, result);
    return result;
  } catch (error) {
    const result = {
      ok: false,
      message: error instanceof Error ? error.message : "Could not process request.",
    } satisfies ActionResult;
    logActionTiming(action, profile, startedAt, result);
    return result;
  }
}

export async function loginAction(formData: FormData) {
  const supabase = await createClient();
  const email = asString(formData, "email");
  const password = asString(formData, "password");
  const requestedNext = asString(formData, "next");
  const nextPath = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/";

  if (!email || !password) {
    redirect(`/login?error=missing&next=${encodeURIComponent(nextPath)}`);
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(nextPath)}`);
  }

  revalidatePath(appPath);
  redirect(nextPath);
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function changeOwnPasswordAction(formData: FormData) {
  const supabase = await createClient();
  const password = asString(formData, "password");
  const confirmation = asString(formData, "password_confirmation");
  if (!password || password.length < 8 || password !== confirmation) {
    redirect("/change-password?error=Passwords%20must%20match%20and%20contain%20at%20least%208%20characters.");
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(`/change-password?error=${encodeURIComponent(error.message)}`);
  await createAdminClient().from("profiles").update({ must_change_password: false }).eq("id", user.id);
  redirect("/");
}

export async function setupOwnerAction(formData: FormData): Promise<ActionResult> {
  try {
    const admin = createAdminClient();
    const email = asString(formData, "email")?.toLowerCase();
    const password = asString(formData, "password");
    const fullName = asString(formData, "full_name") ?? "Owner";

    if (!email || !password || password.length < 8) {
      return { ok: false, message: "Enter an email and a password with at least 8 characters." };
    }

    const { data: existingProfile, error: existingProfileError } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (existingProfileError) throw new Error(existingProfileError.message);
    if (existingProfile) {
      return { ok: true, message: "Owner created. You can log in now." };
    }

    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true });

    if ((count ?? 0) > 0) {
      return { ok: false, message: "Setup is closed because at least one profile already exists." };
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !data.user) throw new Error(error?.message ?? "Could not create owner.");

    const { error: profileError } = await admin.from("profiles").insert({
      id: data.user.id,
      email,
      full_name: fullName,
      role: "admin",
      platform_role: "platform_admin",
      active: true,
    });
    if (profileError) throw new Error(profileError.message);

    const { data: legacyBusiness, error: businessError } = await admin
      .from("businesses")
      .select("id")
      .eq("slug", "lenden-legacy")
      .single();
    if (businessError || !legacyBusiness) throw new Error(businessError?.message ?? "Legacy business is missing.");

    const { error: membershipError } = await admin.from("business_memberships").insert({
      business_id: legacyBusiness.id,
      profile_id: data.user.id,
      role: "primary_owner",
      status: "active",
      joined_at: new Date().toISOString(),
    });
    if (membershipError) throw new Error(membershipError.message);
    await admin.from("profiles").update({ last_business_id: legacyBusiness.id }).eq("id", data.user.id);

    revalidatePath(appPath);
    return { ok: true, message: "Owner created. You can log in now." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Setup failed." };
  }
}

export async function markNotificationsReadAction(): Promise<ActionResult> {
  return invokeLendenAction("markNotificationsRead");
}

export async function updateProfileAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("updateProfile", formData);
}

export async function createStaffAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("createStaff", formData);
}

export async function saveStaffPermissionsAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("saveStaffPermissions", formData);
}

export async function changeUserPasswordAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("changeUserPassword", formData);
}

export async function deleteUserAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("deleteUser", formData);
}

export async function createPaymentAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("createPayment", formData);
}

export async function saveLibraryStudentAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("saveLibraryStudent", formData);
}

export async function setLibraryStudentStatusAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("setLibraryStudentStatus", formData);
}

export async function saveCourseStudentAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("saveCourseStudent", formData);
}

export async function createExpenseAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("createExpense", formData);
}

export async function approveRecordAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("approveRecord", formData);
}

export async function cancelRecordAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("cancelRecord", formData);
}

export async function updateRecordAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("updateRecord", formData);
}

export async function requestCancelAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("requestCancel", formData);
}

export async function reviewChangeRequestAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("reviewChangeRequest", formData);
}

export async function requestPaymentTransferAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("requestPaymentTransfer", formData);
}

export async function respondPaymentTransferAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("respondPaymentTransfer", formData);
}

export async function requestTransferAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("requestTransfer", formData);
}

export async function respondTransferAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("respondTransfer", formData);
}

export async function settleCashAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("settleCash", formData);
}

export async function createAgentSettlementAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("createAgentSettlement", formData);
}

export async function respondAgentSettlementAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("respondAgentSettlement", formData);
}

export async function saveRoomAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("saveRoom", formData);
}

export async function deleteRoomAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("deleteRoom", formData);
}

export async function saveCourseAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("saveCourse", formData);
}

export async function deleteCourseAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("deleteCourse", formData);
}

export async function saveReferralAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("saveReferral", formData);
}

export async function deleteReferralAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("deleteReferral", formData);
}
