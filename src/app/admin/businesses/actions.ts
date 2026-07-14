"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireIdentity } from "@/lib/tenancy";
import type { BusinessType } from "@/lib/types";

export type BusinessAdminState = {
  ok: boolean;
  message: string;
  temporaryPassword?: string;
};

function value(formData: FormData, key: string) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

function slugify(input: string) {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function temporaryPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `Ln!${Array.from(bytes, (byte) => byte.toString(36)).join("").slice(0, 14)}9`;
}

async function requirePlatformAdmin() {
  const { user, profile } = await requireIdentity();
  if (profile.platform_role !== "platform_admin") throw new Error("Platform administrator access is required.");
  return { user, profile };
}

export async function createBusinessAction(
  _previousState: BusinessAdminState,
  formData: FormData,
): Promise<BusinessAdminState> {
  try {
    const { user } = await requirePlatformAdmin();
    const admin = createAdminClient();
    const name = value(formData, "name");
    const slug = slugify(value(formData, "slug") || name);
    const timezone = value(formData, "timezone") || "Asia/Kolkata";
    const currency = (value(formData, "currency") || "INR").toUpperCase();
    const ownerEmail = value(formData, "owner_email").toLowerCase();
    const ownerName = value(formData, "owner_name") || "Business Owner";
    const modules = formData.getAll("modules").filter((module): module is string => typeof module === "string") as BusinessType[];
    if (!name || !slug || !ownerEmail || modules.length === 0) {
      return { ok: false, message: "Business name, owner email, and at least one module are required." };
    }

    const { data: business, error: businessError } = await admin.from("businesses").insert({
      name,
      slug,
      timezone,
      currency,
      status: "active",
      created_by: user.id,
    }).select("id,name,slug").single();
    if (businessError || !business) throw new Error(businessError?.message ?? "Could not create business.");

    const { error: modulesError } = await admin.from("business_modules").insert(
      modules.map((module) => ({ business_id: business.id, module, enabled: true, configured_by: user.id })),
    );
    if (modulesError) throw new Error(modulesError.message);

    const { data: existingProfile, error: profileLookupError } = await admin
      .from("profiles")
      .select("id,email,full_name")
      .ilike("email", ownerEmail)
      .maybeSingle();
    if (profileLookupError) throw new Error(profileLookupError.message);

    let ownerId = existingProfile?.id ?? null;
    let generatedPassword: string | undefined;

    if (!ownerId) {
      generatedPassword = temporaryPassword();
      const { data: created, error: authError } = await admin.auth.admin.createUser({
        email: ownerEmail,
        password: generatedPassword,
        email_confirm: true,
        user_metadata: { full_name: ownerName },
      });
      if (authError || !created.user) throw new Error(authError?.message ?? "Could not create owner login.");
      ownerId = created.user.id;
      const { error: profileError } = await admin.from("profiles").upsert({
        id: ownerId,
        email: ownerEmail,
        full_name: ownerName,
        role: "owner",
        platform_role: "user",
        must_change_password: true,
        active: true,
        last_business_id: business.id,
      });
      if (profileError) throw new Error(profileError.message);
    } else {
      const { error: profileError } = await admin.from("profiles").update({
        last_business_id: business.id,
      }).eq("id", ownerId);
      if (profileError) throw new Error(profileError.message);
    }

    const { error: membershipError } = await admin.from("business_memberships").insert({
      business_id: business.id,
      profile_id: ownerId,
      role: "primary_owner",
      status: "active",
      invited_by: user.id,
      joined_at: new Date().toISOString(),
    });
    if (membershipError) throw new Error(membershipError.message);

    await admin.from("audit_events").insert({
      business_id: business.id,
      actor_profile_id: user.id,
      event_type: "business_created",
      entity_type: "business",
      entity_id: business.id,
      after_data: { name, slug, modules, initial_owner_email: ownerEmail, onboarding: "direct_credentials" },
    });

    revalidatePath("/admin/businesses");
    return {
      ok: true,
      message: generatedPassword
        ? "Business and primary-owner login created."
        : "Business created and existing user assigned as primary owner.",
      temporaryPassword: generatedPassword,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not create business." };
  }
}

export async function resetPrimaryOwnerPasswordAction(
  _previousState: BusinessAdminState,
  formData: FormData,
): Promise<BusinessAdminState> {
  try {
    const { user } = await requirePlatformAdmin();
  const businessId = value(formData, "business_id");
    const profileId = value(formData, "profile_id");
    if (!businessId || !profileId) throw new Error("An active primary owner is required.");

  const admin = createAdminClient();
    const [{ data: membership, error: membershipError }, { data: ownerProfile, error: profileError }] = await Promise.all([
    admin
        .from("business_memberships")
        .select("id,role,status")
      .eq("business_id", businessId)
        .eq("profile_id", profileId)
      .single(),
    admin
        .from("profiles")
        .select("id,full_name,email,active")
        .eq("id", profileId)
        .single(),
  ]);
    if (membershipError || !membership) throw new Error(membershipError?.message ?? "Primary-owner membership was not found.");
    if (profileError || !ownerProfile) throw new Error(profileError?.message ?? "Primary-owner profile was not found.");
    if (membership.role !== "primary_owner" || membership.status !== "active" || !ownerProfile.active) {
      throw new Error("Only an active primary-owner password can be reset here.");
    }

    const generatedPassword = temporaryPassword();
    const { error: authError } = await admin.auth.admin.updateUserById(profileId, { password: generatedPassword });
    if (authError) throw new Error(authError.message);
    const { error: profileUpdateError } = await admin.from("profiles").update({ must_change_password: true }).eq("id", profileId);
    if (profileUpdateError) throw new Error(profileUpdateError.message);

  await admin.from("audit_events").insert({
    business_id: businessId,
    actor_profile_id: user.id,
      event_type: "primary_owner_password_reset",
      entity_type: "business_membership",
      entity_id: membership.id,
      after_data: { profile_id: profileId, must_change_password: true },
  });
  revalidatePath("/admin/businesses");
    return {
      ok: true,
      message: `Temporary password generated for ${ownerProfile.full_name}.`,
      temporaryPassword: generatedPassword,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not reset owner password." };
  }
}

export async function setBusinessStatusAction(formData: FormData) {
  const { user } = await requirePlatformAdmin();
  const businessId = value(formData, "business_id");
  const status = value(formData, "status") === "suspended" ? "suspended" : "active";
  if (!businessId) return;
  const admin = createAdminClient();
  const { error } = await admin.from("businesses").update({
    status,
    suspended_at: status === "suspended" ? new Date().toISOString() : null,
  }).eq("id", businessId);
  if (error) throw new Error(error.message);
  await admin.from("audit_events").insert({
    business_id: businessId,
    actor_profile_id: user.id,
    event_type: `business_${status}`,
    entity_type: "business",
    entity_id: businessId,
  });
  revalidatePath("/admin/businesses");
}

export async function startSupportSessionAction(formData: FormData) {
  const { user } = await requirePlatformAdmin();
  const businessId = value(formData, "business_id");
  const businessSlug = value(formData, "business_slug");
  const reason = value(formData, "reason");
  if (!businessId || !businessSlug || reason.length < 5) throw new Error("A support reason with at least 5 characters is required.");
  const admin = createAdminClient();
  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + 30 * 60 * 1000);
  const { data: session, error } = await admin.from("business_support_sessions").insert({
    admin_profile_id: user.id,
    business_id: businessId,
    reason,
    access_level: "configuration",
    started_at: startedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  }).select("id").single();
  if (error || !session) throw new Error(error?.message ?? "Could not start support session.");
  await admin.from("audit_events").insert({
    business_id: businessId,
    actor_profile_id: user.id,
    event_type: "support_session_started",
    entity_type: "business_support_session",
    entity_id: session.id,
    reason,
    after_data: { expires_at: expiresAt.toISOString(), access_level: "configuration" },
  });
  redirect(`/b/${businessSlug}`);
}

export async function recoverPrimaryOwnerAction(formData: FormData) {
  await requirePlatformAdmin();
  const businessId = value(formData, "business_id");
  const targetProfileId = value(formData, "profile_id");
  const reason = value(formData, "reason");
  if (!businessId || !targetProfileId || reason.length < 10) throw new Error("Choose a co-owner and provide a detailed recovery reason.");
  const client = await createClient({ businessId });
  const { error } = await client.rpc("platform_recover_primary_ownership", {
    target_business_id: businessId,
    target_profile_id: targetProfileId,
    recovery_reason: reason,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/businesses");
}
