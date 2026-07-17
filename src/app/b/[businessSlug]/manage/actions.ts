"use server";

import { revalidatePath } from "next/cache";
import {
  changeUserPasswordAction as changeUserPasswordAppAction,
  createStaffAction as createStaffAppAction,
  saveStaffPermissionsAction as saveStaffPermissionsAppAction,
} from "@/app/actions";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { canManageBusinessMemberRole, isPrimaryOwner, resolveBusinessContextFromRequest } from "@/lib/tenancy";
import type { BusinessType, MembershipStatus } from "@/lib/types";

export type BusinessUserActionState = {
  ok: boolean | null;
  message: string;
};

function read(formData: FormData, key: string) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

export async function saveBusinessModulesAction(formData: FormData) {
  const { identity, context } = await resolveBusinessContextFromRequest();
  if (context.accessMode !== "support" && !isPrimaryOwner(context.membership?.role)) {
    throw new Error("Only the Owner can change business settings.");
  }
  const client = await createClient({ businessId: context.business.id });
  const enabled = new Set(formData.getAll("modules").filter((item): item is string => typeof item === "string"));
  const modules: BusinessType[] = ["library", "guest_house", "course", "general"];
  const { error } = await client.from("business_modules").upsert(
    modules.map((module) => ({
      business_id: context.business.id,
      module,
      enabled: enabled.has(module),
      configured_by: identity.id,
      configured_at: new Date().toISOString(),
    })),
    { onConflict: "business_id,module" },
  );
  if (error) throw new Error(error.message);
  await client.from("audit_events").insert({
    business_id: context.business.id,
    actor_profile_id: identity.id,
    event_type: "business_modules_updated",
    entity_type: "business",
    entity_id: context.business.id,
    after_data: { enabled_modules: [...enabled] },
  });
  revalidatePath(`/b/${context.business.slug}`);
  revalidatePath(`/b/${context.business.slug}/manage`);
}

export async function transferPrimaryOwnershipAction(formData: FormData) {
  const { context } = await resolveBusinessContextFromRequest();
  if (context.accessMode !== "member" || !isPrimaryOwner(context.membership?.role)) {
    throw new Error("Only the current Owner can transfer primary ownership.");
  }
  const targetProfileId = read(formData, "profile_id");
  if (!targetProfileId) throw new Error("Choose an active Manager.");
  const client = await createClient({ businessId: context.business.id });
  const { error } = await client.rpc("transfer_primary_ownership", {
    target_business_id: context.business.id,
    target_profile_id: targetProfileId,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/b/${context.business.slug}`);
  revalidatePath(`/b/${context.business.slug}/manage`);
}

async function updateBusinessMemberStatus(formData: FormData) {
  const { identity, context } = await resolveBusinessContextFromRequest();
  const membershipId = read(formData, "membership_id");
  const nextStatus: MembershipStatus = read(formData, "status") === "active" ? "active" : "suspended";
  if (!membershipId) throw new Error("Membership is required.");
  const client = await createClient({ businessId: context.business.id });
  const { data: membership, error: lookupError } = await client
    .from("business_memberships")
    .select("id,profile_id,role,status")
    .eq("id", membershipId)
    .eq("business_id", context.business.id)
    .single();
  if (lookupError || !membership) throw new Error(lookupError?.message ?? "Membership not found.");
  if (!canManageBusinessMemberRole(context.membership?.role, membership.role, context.accessMode)) {
    throw new Error(membership.role === "primary_owner"
      ? "The Owner cannot be removed. Transfer ownership first."
      : "Managers can remove only Staff and Sales Agents.");
  }
  if (membership.status === nextStatus) return nextStatus;
  const { error } = await client.from("business_memberships").update({
    status: nextStatus,
    suspended_at: nextStatus === "suspended" ? new Date().toISOString() : null,
  }).eq("id", membershipId);
  if (error) throw new Error(error.message);
  if (membership.role === "sales_agent" && nextStatus === "suspended") {
    const { error: referralError } = await createAdminClient()
      .from("referral_codes")
      .update({ active: false })
      .eq("business_id", context.business.id)
      .eq("agent_id", membership.profile_id);
    if (referralError) throw new Error(referralError.message);
  }
  await client.from("audit_events").insert({
    business_id: context.business.id,
    actor_profile_id: identity.id,
    event_type: nextStatus === "active" ? "membership_reactivated" : "membership_suspended",
    entity_type: "business_membership",
    entity_id: membershipId,
    before_data: { status: membership.status },
    after_data: { status: nextStatus, role: membership.role },
  });
  revalidatePath(`/b/${context.business.slug}`);
  revalidatePath(`/b/${context.business.slug}/manage`);
  return nextStatus;
}

async function runBusinessUserAction(
  action: (formData: FormData) => Promise<{ ok: true; message?: string } | { ok: false; message: string }>,
  formData: FormData,
): Promise<BusinessUserActionState> {
  const result = await action(formData);
  const { context } = await resolveBusinessContextFromRequest();
  if (result.ok) {
    revalidatePath(`/b/${context.business.slug}`);
    revalidatePath(`/b/${context.business.slug}/manage`);
  }
  return { ok: result.ok, message: result.message ?? (result.ok ? "Saved." : "Could not save changes.") };
}

export async function createBusinessUserAction(
  previousState: BusinessUserActionState,
  formData: FormData,
): Promise<BusinessUserActionState> {
  void previousState;
  return runBusinessUserAction(createStaffAppAction, formData);
}

export async function saveBusinessUserPermissionsAction(
  previousState: BusinessUserActionState,
  formData: FormData,
): Promise<BusinessUserActionState> {
  void previousState;
  return runBusinessUserAction(saveStaffPermissionsAppAction, formData);
}

export async function resetBusinessUserPasswordAction(
  previousState: BusinessUserActionState,
  formData: FormData,
): Promise<BusinessUserActionState> {
  void previousState;
  return runBusinessUserAction(changeUserPasswordAppAction, formData);
}

export async function setBusinessMemberStatusAction(
  previousState: BusinessUserActionState,
  formData: FormData,
): Promise<BusinessUserActionState> {
  void previousState;
  try {
    const status = await updateBusinessMemberStatus(formData);
    return {
      ok: true,
      message: status === "active" ? "Business access activated." : "Business access suspended.",
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not update business access.",
    };
  }
}
