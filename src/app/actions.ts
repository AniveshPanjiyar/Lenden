"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  executeLendenAction,
  type LendenActionAdminClient,
  type LendenActionName,
  type LendenActionProfile,
} from "@/lib/lenden-actions-local";

type ActionResult = { ok: true; message?: string } | { ok: false; message: string };

type EdgeActionName = LendenActionName;

const appPath = "/";

function asString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isActionResult(value: unknown): value is ActionResult {
  if (!value || typeof value !== "object" || !("ok" in value)) return false;
  const result = value as { ok?: unknown; message?: unknown };
  return (
    result.ok === true ||
    (result.ok === false && typeof result.message === "string")
  );
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

async function invokeLocalLendenAction(action: EdgeActionName, formData: FormData): Promise<ActionResult> {
  try {
    const profile = await requireUserProfile();
    const admin = createAdminClient() as unknown as LendenActionAdminClient;
    const result = await executeLendenAction(action, formData, { admin, profile });

    if (result.ok) {
      revalidatePath(appPath);
    }

    return result;
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not process request.",
    };
  }
}

async function invokeLendenAction(action: EdgeActionName, formData = new FormData()): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    redirect("/login");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    return { ok: false, message: "Supabase Edge Function configuration is missing." };
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/lenden-actions`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${session.access_token}`,
        "x-lenden-action": action,
      },
      body: formData,
      cache: "no-store",
    });
  } catch {
    return invokeLocalLendenAction(action, formData);
  }

  if (response.status === 401) {
    redirect("/login");
  }

  if (response.status === 404) {
    return invokeLocalLendenAction(action, formData);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, message: `Edge Function returned an unreadable response (${response.status}).` };
  }

  if (!isActionResult(payload)) {
    return { ok: false, message: `Edge Function returned an unexpected response (${response.status}).` };
  }

  if (payload.ok) {
    revalidatePath(appPath);
  }

  return payload;
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
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true });

    if ((count ?? 0) > 0) {
      return { ok: false, message: "Setup is closed because at least one profile already exists." };
    }

    const email = asString(formData, "email");
    const password = asString(formData, "password");
    const fullName = asString(formData, "full_name") ?? "Owner";

    if (!email || !password || password.length < 8) {
      return { ok: false, message: "Enter an email and a password with at least 8 characters." };
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

export async function createStaffAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("createStaff", formData);
}

export async function saveStaffPermissionsAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("saveStaffPermissions", formData);
}

export async function createPaymentAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("createPayment", formData);
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

export async function saveCourseAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("saveCourse", formData);
}

export async function saveReferralAction(formData: FormData): Promise<ActionResult> {
  return invokeLendenAction("saveReferral", formData);
}
