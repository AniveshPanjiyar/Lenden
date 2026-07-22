"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireIdentity } from "@/lib/tenancy";
import type { BusinessType } from "@/lib/types";

export type AccountActionState = { ok: boolean | null; message: string };

const allowedModules = new Set<BusinessType>(["library", "guest_house", "course", "general"]);

function value(formData: FormData, key: string) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

function result(error: unknown, fallback: string): AccountActionState {
  return { ok: false, message: error instanceof Error ? error.message : fallback };
}

export async function updateAccountProfileAction(_state: AccountActionState, formData: FormData): Promise<AccountActionState> {
  try {
    const { user } = await requireIdentity();
    const fullName = value(formData, "full_name");
    if (fullName.length < 2) return { ok: false, message: "Enter your full name." };
    const client = await createClient();
    const { error } = await client.from("profiles").update({ full_name: fullName }).eq("id", user.id);
    if (error) throw new Error(error.message);
    revalidatePath("/account");
    return { ok: true, message: "Profile updated." };
  } catch (error) {
    return result(error, "Could not update profile.");
  }
}

export async function setAccountPasswordAction(_state: AccountActionState, formData: FormData): Promise<AccountActionState> {
  try {
    const { user } = await requireIdentity();
    const password = value(formData, "password");
    const confirmation = value(formData, "password_confirmation");
    if (password.length < 8) return { ok: false, message: "Use at least 8 characters." };
    if (password !== confirmation) return { ok: false, message: "Passwords do not match." };
    const client = await createClient();
    const { error } = await client.auth.updateUser({ password });
    if (error) throw new Error(error.message);
    await createAdminClient().from("profiles").update({ must_change_password: false }).eq("id", user.id);
    return { ok: true, message: "Your password has been updated." };
  } catch (error) {
    return result(error, "Could not update password.");
  }
}

export async function requestBusinessCreationAction(_state: AccountActionState, formData: FormData): Promise<AccountActionState> {
  try {
    const { user } = await requireIdentity();
    const requestedName = value(formData, "requested_name");
    const note = value(formData, "note");
    const modules = [...new Set(formData.getAll("modules").filter(
      (entry): entry is BusinessType => typeof entry === "string" && allowedModules.has(entry as BusinessType),
    ))];
    if (requestedName.length < 2) return { ok: false, message: "Enter a business name." };
    if (modules.length === 0) return { ok: false, message: "Choose at least one module." };
    if (note.length > 1000) return { ok: false, message: "Keep the note under 1,000 characters." };
    const client = await createClient();
    const { error } = await client.from("business_creation_requests").insert({
      requested_by: user.id,
      requested_name: requestedName,
      requested_modules: modules,
      note: note || null,
      status: "pending",
    });
    if (error) {
      if (error.code === "23505") return { ok: false, message: "You already have a pending request with this business name." };
      throw new Error(error.message);
    }
    revalidatePath("/account");
    revalidatePath("/admin/businesses/requests");
    return { ok: true, message: "Business request submitted for platform review." };
  } catch (error) {
    return result(error, "Could not submit the business request.");
  }
}

export async function cancelBusinessCreationRequestAction(formData: FormData) {
  await requireIdentity();
  const requestId = z.uuid().parse(value(formData, "request_id"));
  const client = await createClient();
  const { error } = await client.rpc("cancel_business_creation_request", { target_request_id: requestId });
  if (error) throw new Error(error.message);
  revalidatePath("/account");
  revalidatePath("/admin/businesses/requests");
}

export async function acceptBusinessInvitationAction(formData: FormData) {
  await requireIdentity();
  const invitationId = z.uuid().parse(value(formData, "invitation_id"));
  const client = await createClient();
  const { error } = await client.rpc("accept_business_invitation", { target_invitation_id: invitationId });
  if (error) throw new Error(error.message);
  revalidatePath("/account");
  revalidatePath("/");
}

export async function declineBusinessInvitationAction(formData: FormData) {
  await requireIdentity();
  const invitationId = z.uuid().parse(value(formData, "invitation_id"));
  const client = await createClient();
  const { error } = await client.rpc("decline_business_invitation", { target_invitation_id: invitationId });
  if (error) throw new Error(error.message);
  revalidatePath("/account");
}

