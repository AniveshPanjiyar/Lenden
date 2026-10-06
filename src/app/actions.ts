"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { profileForBusiness, resolveBusinessContextFromRequest } from "@/lib/tenancy";
import { actionWarning, normalizeActionError, type UserActionStateBase } from "@/lib/action-errors";
import type { ActionResult } from "@/lib/types";
import {
  executeLendenAction,
  type LendenActionAdminClient,
  type LendenActionName,
  type LendenActionProfile,
} from "@/lib/lenden-actions";

const appPath = "/";
const workActions = new Set<LendenActionName>([
  "checkIn",
  "checkOut",
  "createWorkTask",
  "setWorkTaskStatus",
  "postWorkUpdate",
  "deleteWorkUpdate",
]);
const salesAgentAllowedActions = new Set<LendenActionName>(["markNotificationsRead", "updateProfile", ...workActions]);
const financialActions = new Set<LendenActionName>([
  "createPayment",
  "saveLibraryStudent",
  "setStudentStatus",
  "updateSubscription",
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
    if (profile.accessMode === "support" && workActions.has(action)) {
      const result = { ok: false, message: "Attendance and work updates are blocked in audited support mode." } satisfies ActionResult;
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
      ...normalizeActionError(error, {
        action,
        fallback: "Could not process request.",
        businessId: profile?.businessId,
        userId: profile?.id,
      }),
    } satisfies ActionResult;
    logActionTiming(action, profile, startedAt, result);
    return result;
  }
}

export async function loginAction(formData: FormData) {
  const email = asString(formData, "email");
  const password = asString(formData, "password");
  const requestedNext = asString(formData, "next");
  const nextPath = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/";

  if (!email || !password) {
    redirect(`/login?error=missing&next=${encodeURIComponent(nextPath)}`);
  }

  let signInError: unknown = null;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    signInError = error;
  } catch (error) {
    signInError = error;
  }
  if (signInError) {
    const normalized = normalizeActionError(signInError, {
      action: "loginAction",
      fallback: "Could not sign in.",
    });
    redirect(`/login?error=${encodeURIComponent(normalized.message)}&next=${encodeURIComponent(nextPath)}`);
  }

  revalidatePath(appPath);
  redirect(nextPath);
}

export async function logoutAction() {
  let signOutError: unknown = null;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    signOutError = error;
  } catch (error) {
    signOutError = error;
  }
  if (signOutError) {
    const normalized = normalizeActionError(signOutError, {
      action: "logoutAction",
      fallback: "Could not sign out.",
    });
    redirect(`/login?error=${encodeURIComponent(normalized.message)}`);
  }
  redirect("/login");
}

export type PasswordSetupActionState = UserActionStateBase;

export async function changeOwnPasswordAction(
  _state: PasswordSetupActionState,
  formData: FormData,
): Promise<PasswordSetupActionState> {
  const password = asString(formData, "password");
  const confirmation = asString(formData, "password_confirmation");
  if (!password || password.length < 8) {
    return {
      ok: false,
      message: "Use a password with at least 8 characters.",
      fieldErrors: { password: "Use at least 8 characters." },
    };
  }
  if (password !== confirmation) {
    return {
      ok: false,
      message: "Passwords do not match.",
      fieldErrors: { password_confirmation: "Enter the same password again." },
    };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "Your session expired. Sign in and try again." };
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    const { error: profileError } = await createAdminClient()
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", user.id);
    if (profileError) {
      return {
        ok: true,
        message: "Password updated.",
        ...actionWarning(
          profileError,
          {
            action: "changeOwnPasswordAction.profile",
            fallback: "Could not finish password setup.",
            userId: user.id,
          },
          "The password changed, but account setup could not finish. Try submitting once more.",
        ),
      };
    }
    revalidatePath(appPath);
    return { ok: true, message: "Password updated." };
  } catch (error) {
    return {
      ok: false,
      ...normalizeActionError(error, {
        action: "changeOwnPasswordAction",
        fallback: "Could not update your password.",
      }),
    };
  }
}

export async function setupOwnerAction(formData: FormData): Promise<ActionResult> {
  try {
    const admin = createAdminClient();
    const email = asString(formData, "email")?.toLowerCase();
    const password = asString(formData, "password");
    const fullName = asString(formData, "full_name") ?? "Owner";

    const fieldErrors: Record<string, string> = {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = "Enter a valid email address.";
    if (!password || password.length < 8) fieldErrors.password = "Use at least 8 characters.";
    if (fullName.length < 2) fieldErrors.full_name = "Enter the Owner's name.";
    if (Object.keys(fieldErrors).length > 0) {
      return { ok: false, message: "Review the highlighted details.", fieldErrors };
    }
    if (!email || !password) {
      return { ok: false, message: "Review the highlighted details." };
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

    const { count, error: countError } = await admin.from("profiles").select("id", { count: "exact", head: true });
    if (countError) throw countError;

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

    // The auth trigger normally creates this row. Upsert keeps the deployment-only
    // first-admin bootstrap compatible with databases both before and after that trigger.
    const { error: profileError } = await admin.from("profiles").upsert({
      id: data.user.id,
      email,
      full_name: fullName,
      role: "admin",
      platform_role: "platform_admin",
      account_status: "active",
      must_change_password: false,
      active: true,
    }, { onConflict: "id" });
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
    return {
      ok: false,
      ...normalizeActionError(error, {
        action: "setupOwnerAction",
        fallback: "Could not create the Owner account.",
      }),
    };
  }
}

export async function markNotificationsReadAction(): Promise<ActionResult> {
  return invokeLendenAction("markNotificationsRead");
}

export async function updateProfileAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("updateProfile", formData);
}

export async function saveStaffPermissionsAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("saveStaffPermissions", formData);
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

export async function setStudentStatusAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("setStudentStatus", formData);
}

export async function updateSubscriptionAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("updateSubscription", formData);
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

export async function setRoomActiveAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("setRoomActive", formData);
}

export async function saveCourseAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("saveCourse", formData);
}

export async function deleteCourseAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("deleteCourse", formData);
}

export async function setCourseActiveAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("setCourseActive", formData);
}

export async function saveReferralAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("saveReferral", formData);
}

export async function deleteReferralAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("deleteReferral", formData);
}

export async function setReferralActiveAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("setReferralActive", formData);
}

export async function checkInAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("checkIn", formData);
}

export async function checkOutAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("checkOut", formData);
}

export async function createWorkTaskAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("createWorkTask", formData);
}

export async function setWorkTaskStatusAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("setWorkTaskStatus", formData);
}

export async function postWorkUpdateAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("postWorkUpdate", formData);
}

export async function deleteWorkUpdateAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("deleteWorkUpdate", formData);
}
