"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { canManageBusinessMemberRole, isPrimaryOwner, resolveBusinessContextFromRequest } from "@/lib/tenancy";
import type { BusinessType } from "@/lib/types";

function read(formData: FormData, key: string) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

export async function saveBusinessModulesAction(formData: FormData) {
  const { identity, context } = await resolveBusinessContextFromRequest();
  if (context.accessMode !== "support" && !isPrimaryOwner(context.membership?.role)) {
    throw new Error("Only the primary owner can change business settings.");
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
  const targetProfileId = read(formData, "profile_id");
  if (!targetProfileId) throw new Error("Choose an active co-owner.");
  const client = await createClient({ businessId: context.business.id });
  const { error } = await client.rpc("transfer_primary_ownership", {
    target_business_id: context.business.id,
    target_profile_id: targetProfileId,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/b/${context.business.slug}`);
  revalidatePath(`/b/${context.business.slug}/manage`);
}

export async function suspendBusinessMemberAction(formData: FormData) {
  const { identity, context } = await resolveBusinessContextFromRequest();
  const membershipId = read(formData, "membership_id");
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
      ? "The main owner cannot be removed. Transfer primary ownership first."
      : "Co-owners can remove only staff and sales agents.");
  }
  if (membership.status !== "active") throw new Error("This member no longer has active access.");
  const { error } = await client.from("business_memberships").update({ status: "suspended", suspended_at: new Date().toISOString() }).eq("id", membershipId);
  if (error) throw new Error(error.message);
  if (membership.role === "sales_agent") {
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
    event_type: "membership_access_removed",
    entity_type: "business_membership",
    entity_id: membershipId,
    before_data: { status: membership.status },
    after_data: { status: "suspended", removed_role: membership.role },
  });
  revalidatePath(`/b/${context.business.slug}/manage`);
}
