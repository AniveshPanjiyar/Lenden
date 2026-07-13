"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  executeLendenAction,
  type LendenActionAdminClient,
  type LendenActionName,
  type LendenActionProfile,
} from "@/lib/lenden-actions";

type ActionResult = { ok: true; message?: string } | { ok: false; message: string };

const appPath = "/";
const salesAgentAllowedActions = new Set<LendenActionName>(["markNotificationsRead", "updateProfile"]);

function asString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function requireUserProfile() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || !profile.active) {
    redirect("/login?error=inactive");
  }

  return profile as LendenActionProfile;
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
    if (profile.role === "sales_agent" && !salesAgentAllowedActions.has(action)) {
      const result = { ok: false, message: "Sales agents have read-only incentive access." } satisfies ActionResult;
      logActionTiming(action, profile, startedAt, result);
      return result;
    }
    const admin = createAdminClient() as unknown as LendenActionAdminClient;
    const result = await executeLendenAction(action, formData, { admin, profile });
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

  if (!email || !password) {
    redirect("/login?error=missing");
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(appPath);
  redirect(appPath);
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
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
      active: true,
    });
    if (profileError) throw new Error(profileError.message);

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
