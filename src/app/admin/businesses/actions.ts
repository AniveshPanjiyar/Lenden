"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { BusinessRole, BusinessStatus, BusinessType, MembershipStatus } from "@/lib/types";
import { requirePlatformAdmin } from "./admin-data";

export type AdminActionState = {
  ok: boolean | null;
  message: string;
  fieldErrors?: Record<string, string>;
  entityId?: string;
  temporaryPassword?: string;
  href?: string;
};

const BUSINESS_MODULES: BusinessType[] = ["library", "guest_house", "course", "general"];
const MEMBER_ROLES: BusinessRole[] = ["co_owner", "staff", "sales_agent"];
const STAFF_PERMISSIONS = new Set([
  "collect_guest_house",
  "collect_library",
  "collect_course",
  "collect_general",
  "add_expense",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function value(formData: FormData, key: string) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

function slugify(input: string) {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function generatedTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function actionError(error: unknown, fallback: string): AdminActionState {
  return { ok: false, message: error instanceof Error ? error.message : fallback };
}

function fieldFailure(message: string, fieldErrors: Record<string, string>): AdminActionState {
  return { ok: false, message, fieldErrors };
}

function assertUuid(id: string, label = "Entity") {
  if (!UUID_PATTERN.test(id)) throw new Error(`${label} is invalid.`);
}

function selectedModules(formData: FormData) {
  return [...new Set(formData.getAll("modules").filter(
    (entry): entry is BusinessType => typeof entry === "string" && BUSINESS_MODULES.includes(entry as BusinessType),
  ))];
}

function selectedPermissions(formData: FormData) {
  return [...new Set(formData.getAll("permissions").filter(
    (entry): entry is string => typeof entry === "string" && STAFF_PERMISSIONS.has(entry),
  ))];
}

function revalidateBusinessAdmin(businessId?: string, slug?: string) {
  revalidatePath("/admin/businesses");
  if (businessId) revalidatePath(`/admin/businesses/${businessId}`, "layout");
  if (slug) {
    revalidatePath(`/b/${slug}`);
    revalidatePath(`/b/${slug}/manage`);
  }
}

async function lookupBusiness(businessId: string) {
  assertUuid(businessId, "Business");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("businesses")
    .select("id,name,slug,status")
    .eq("id", businessId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Business was not found.");
  return data as { id: string; name: string; slug: string; status: BusinessStatus };
}

async function deleteNewAuthAccount(profileId: string | null) {
  if (!profileId) return;
  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(profileId);
}

export async function createBusinessAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let createdBusinessId: string | null = null;
  let createdAuthProfileId: string | null = null;

  try {
    const { user } = await requirePlatformAdmin();
    const name = value(formData, "name");
    const slug = slugify(value(formData, "slug") || name);
    const timezone = value(formData, "timezone") || "Asia/Kolkata";
    const currency = (value(formData, "currency") || "INR").toUpperCase();
    const ownerName = value(formData, "owner_name");
    const ownerEmail = value(formData, "owner_email").toLowerCase();
    const modules = selectedModules(formData);
    const fieldErrors: Record<string, string> = {};

    if (name.length < 2) fieldErrors.name = "Enter a business name with at least 2 characters.";
    if (!SLUG_PATTERN.test(slug)) fieldErrors.slug = "Use lowercase letters, numbers, and single hyphens only.";
    if (!timezone) fieldErrors.timezone = "Enter a timezone.";
    if (!/^[A-Z]{3}$/.test(currency)) fieldErrors.currency = "Enter a 3-letter currency code.";
    if (ownerName.length < 2) fieldErrors.owner_name = "Enter the Owner's full name.";
    if (!EMAIL_PATTERN.test(ownerEmail)) fieldErrors.owner_email = "Enter a valid Owner email address.";
    if (modules.length === 0) fieldErrors.modules = "Enable at least one module.";
    if (Object.keys(fieldErrors).length > 0) return fieldFailure("Review the highlighted details.", fieldErrors);

    const admin = createAdminClient();
    const [{ data: duplicate, error: duplicateError }, { data: existingProfile, error: profileError }] = await Promise.all([
      admin.from("businesses").select("id").eq("slug", slug).maybeSingle(),
      admin
        .from("profiles")
        .select("id,email,full_name,active,account_status")
        .ilike("email", ownerEmail)
        .maybeSingle(),
    ]);
    if (duplicateError) throw new Error(duplicateError.message);
    if (duplicate) return fieldFailure("That business URL is already in use.", { slug: "Choose a different URL slug." });
    if (profileError) throw new Error(profileError.message);
    if (existingProfile && (!existingProfile.active || existingProfile.account_status !== "active")) {
      return fieldFailure("This existing Lenden account is inactive.", {
        owner_email: "Reactivate the global account before assigning it as an Owner.",
      });
    }

    const { data: business, error: businessError } = await admin
      .from("businesses")
      .insert({ name, slug, timezone, currency, status: "active", created_by: user.id })
      .select("id")
      .single();
    if (businessError || !business) throw new Error(businessError?.message ?? "Could not create business.");
    createdBusinessId = business.id;

    const { error: modulesError } = await admin.from("business_modules").insert(
      modules.map((module) => ({ business_id: business.id, module, enabled: true, configured_by: user.id })),
    );
    if (modulesError) throw new Error(modulesError.message);

    let ownerId = existingProfile?.id ?? null;
    let temporaryPassword: string | undefined;
    if (!ownerId) {
      temporaryPassword = generatedTemporaryPassword();
      const { data: created, error: authError } = await admin.auth.admin.createUser({
        email: ownerEmail,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { full_name: ownerName },
      });
      if (authError || !created.user) throw new Error(authError?.message ?? "Could not create the Owner login.");
      ownerId = created.user.id;
      createdAuthProfileId = ownerId;

      const { error: ownerProfileError } = await admin.from("profiles").upsert({
        id: ownerId,
        email: ownerEmail,
        full_name: ownerName,
        role: "owner",
        platform_role: "user",
        account_status: "active",
        must_change_password: true,
        active: true,
        last_business_id: business.id,
      });
      if (ownerProfileError) throw new Error(ownerProfileError.message);
    }
    if (!ownerId) throw new Error("Could not resolve the Owner account.");

    const { data: membership, error: membershipError } = await admin
      .from("business_memberships")
      .insert({
        business_id: business.id,
        profile_id: ownerId,
        role: "primary_owner",
        status: "active",
        invited_by: user.id,
        joined_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (membershipError || !membership) throw new Error(membershipError?.message ?? "Could not assign the Owner.");

    const { error: auditError } = await admin.from("audit_events").insert({
      business_id: business.id,
      actor_profile_id: user.id,
      event_type: "business_created",
      entity_type: "business",
      entity_id: business.id,
      after_data: {
        name,
        slug,
        modules,
        initial_owner_profile_id: ownerId,
        owner_account: existingProfile ? "existing" : "new",
      },
    });
    if (auditError) throw new Error(auditError.message);

    createdBusinessId = null;
    createdAuthProfileId = null;
    revalidateBusinessAdmin(business.id, slug);
    return {
      ok: true,
      message: temporaryPassword
        ? "Business and Owner login created. Copy the one-time password now."
        : "Business created. The existing Lenden account is now the Owner; its password was not changed.",
      entityId: business.id,
      href: `/admin/businesses/${business.id}`,
      temporaryPassword,
    };
  } catch (error) {
    const admin = createAdminClient();
    if (createdBusinessId) await admin.from("businesses").delete().eq("id", createdBusinessId);
    await deleteNewAuthAccount(createdAuthProfileId);
    return actionError(error, "Could not create business.");
  }
}

export async function setBusinessStatusAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const { user } = await requirePlatformAdmin();
    const businessId = value(formData, "business_id");
    const status = value(formData, "status") as BusinessStatus;
    if (!(["active", "suspended"] as string[]).includes(status)) {
      return fieldFailure("Choose a valid business status.", { status: "Status must be Active or Suspended." });
    }
    const business = await lookupBusiness(businessId);
    if (business.status === status) return { ok: true, message: `Business is already ${status}.`, entityId: business.id };

    const admin = createAdminClient();
    const { error } = await admin.from("businesses").update({
      status,
      suspended_at: status === "suspended" ? new Date().toISOString() : null,
    }).eq("id", business.id);
    if (error) throw new Error(error.message);
    const { error: auditError } = await admin.from("audit_events").insert({
      business_id: business.id,
      actor_profile_id: user.id,
      event_type: status === "active" ? "business_activated" : "business_suspended",
      entity_type: "business",
      entity_id: business.id,
      before_data: { status: business.status },
      after_data: { status },
    });
    if (auditError) throw new Error(auditError.message);

    revalidateBusinessAdmin(business.id, business.slug);
    return {
      ok: true,
      message: status === "active"
        ? "Business activated. Active members can sign in again."
        : "Business suspended. Every member is blocked; business data is preserved.",
      entityId: business.id,
    };
  } catch (error) {
    return actionError(error, "Could not update business status.");
  }
}

export async function saveBusinessModulesAdminAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const { user } = await requirePlatformAdmin();
    const businessId = value(formData, "business_id");
    const enabledModules = selectedModules(formData);
    if (enabledModules.length === 0) {
      return fieldFailure("Enable at least one business module.", { modules: "Choose one or more modules." });
    }
    const business = await lookupBusiness(businessId);
    const admin = createAdminClient();
    const { data: previousRows, error: previousError } = await admin
      .from("business_modules")
      .select("module,enabled")
      .eq("business_id", business.id);
    if (previousError) throw new Error(previousError.message);

    const { error } = await admin.from("business_modules").upsert(
      BUSINESS_MODULES.map((module) => ({
        business_id: business.id,
        module,
        enabled: enabledModules.includes(module),
        configured_by: user.id,
        configured_at: new Date().toISOString(),
      })),
      { onConflict: "business_id,module" },
    );
    if (error) throw new Error(error.message);
    const { error: auditError } = await admin.from("audit_events").insert({
      business_id: business.id,
      actor_profile_id: user.id,
      event_type: "business_modules_updated",
      entity_type: "business",
      entity_id: business.id,
      before_data: { enabled_modules: (previousRows ?? []).filter((row) => row.enabled).map((row) => row.module) },
      after_data: { enabled_modules: enabledModules },
    });
    if (auditError) throw new Error(auditError.message);

    revalidateBusinessAdmin(business.id, business.slug);
    return { ok: true, message: "Business modules updated.", entityId: business.id };
  } catch (error) {
    return actionError(error, "Could not update modules.");
  }
}

export async function createBusinessMemberAdminAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let createdAuthProfileId: string | null = null;
  let createdMembershipId: string | null = null;

  try {
    const { user } = await requirePlatformAdmin();
    const businessId = value(formData, "business_id");
    const fullName = value(formData, "full_name");
    const email = value(formData, "email").toLowerCase();
    const password = value(formData, "password");
    const role = value(formData, "role") as BusinessRole;
    const permissions = role === "staff" ? selectedPermissions(formData) : [];
    const fieldErrors: Record<string, string> = {};

    if (fullName.length < 2) fieldErrors.full_name = "Enter the user's full name.";
    if (!EMAIL_PATTERN.test(email)) fieldErrors.email = "Enter a valid email address.";
    if (!MEMBER_ROLES.includes(role)) fieldErrors.role = "Choose Manager, Staff, or Sales Agent.";
    if (password && password.length < 8) fieldErrors.password = "Temporary passwords need at least 8 characters.";
    if (Object.keys(fieldErrors).length > 0) return fieldFailure("Review the user details.", fieldErrors);

    const business = await lookupBusiness(businessId);
    const admin = createAdminClient();
    const { data: existingProfile, error: profileError } = await admin
      .from("profiles")
      .select("id,active,account_status")
      .ilike("email", email)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (existingProfile && (!existingProfile.active || existingProfile.account_status !== "active")) {
      return fieldFailure("This existing Lenden account is inactive.", {
        email: "Reactivate the global account before adding business access.",
      });
    }
    if (!existingProfile && password.length < 8) {
      return fieldFailure("A temporary password is required for a new account.", {
        password: "Enter at least 8 characters. The user must replace it after login.",
      });
    }

    let profileId = existingProfile?.id ?? null;
    if (profileId) {
      const { data: existingMembership, error: membershipLookupError } = await admin
        .from("business_memberships")
        .select("id")
        .eq("business_id", business.id)
        .eq("profile_id", profileId)
        .maybeSingle();
      if (membershipLookupError) throw new Error(membershipLookupError.message);
      if (existingMembership) return fieldFailure("This user already belongs to the business.", { email: "Use the existing membership below." });
    } else {
      const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (authError || !authData.user) throw new Error(authError?.message ?? "Could not create the user login.");
      profileId = authData.user.id;
      createdAuthProfileId = profileId;
      const legacyRole = role === "co_owner" ? "owner" : role;
      const { error: newProfileError } = await admin.from("profiles").upsert({
        id: profileId,
        email,
        full_name: fullName,
        role: legacyRole,
        platform_role: "user",
        account_status: "active",
        must_change_password: true,
        active: true,
        last_business_id: business.id,
      });
      if (newProfileError) throw new Error(newProfileError.message);
    }
    if (!profileId) throw new Error("Could not resolve the user account.");

    const { data: membership, error: membershipError } = await admin
      .from("business_memberships")
      .insert({
        business_id: business.id,
        profile_id: profileId,
        role,
        status: "active",
        invited_by: user.id,
        joined_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (membershipError || !membership) throw new Error(membershipError?.message ?? "Could not add the business user.");
    createdMembershipId = membership.id;

    if (permissions.length > 0) {
      const { error: permissionError } = await admin.from("business_member_permissions").insert(
        permissions.map((permission) => ({ membership_id: membership.id, permission, granted_by: user.id })),
      );
      if (permissionError) throw new Error(permissionError.message);
    }
    const { error: auditError } = await admin.from("audit_events").insert({
      business_id: business.id,
      actor_profile_id: user.id,
      event_type: "membership_created",
      entity_type: "business_membership",
      entity_id: membership.id,
      after_data: {
        profile_id: profileId,
        role,
        permissions,
        account: existingProfile ? "existing" : "new",
      },
    });
    if (auditError) throw new Error(auditError.message);

    createdMembershipId = null;
    createdAuthProfileId = null;
    revalidateBusinessAdmin(business.id, business.slug);
    return {
      ok: true,
      message: existingProfile
        ? "Existing Lenden account added. Its current password was not changed."
        : "New account added. The user must change the temporary password after login.",
      entityId: membership.id,
    };
  } catch (error) {
    const admin = createAdminClient();
    if (createdMembershipId) await admin.from("business_memberships").delete().eq("id", createdMembershipId);
    await deleteNewAuthAccount(createdAuthProfileId);
    return actionError(error, "Could not add the business user.");
  }
}

export async function saveBusinessMemberPermissionsAdminAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const { user } = await requirePlatformAdmin();
    const businessId = value(formData, "business_id");
    const membershipId = value(formData, "membership_id");
    const permissions = selectedPermissions(formData);
    const business = await lookupBusiness(businessId);
    assertUuid(membershipId, "Membership");
    const admin = createAdminClient();
    const { data: membership, error: lookupError } = await admin
      .from("business_memberships")
      .select("id,role")
      .eq("id", membershipId)
      .eq("business_id", business.id)
      .maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    if (!membership) throw new Error("Business membership was not found.");
    if (membership.role !== "staff") throw new Error("Granular permissions apply only to Staff memberships.");

    const { data: beforeRows, error: beforeError } = await admin
      .from("business_member_permissions")
      .select("permission")
      .eq("membership_id", membership.id);
    if (beforeError) throw new Error(beforeError.message);
    const { error: deleteError } = await admin.from("business_member_permissions").delete().eq("membership_id", membership.id);
    if (deleteError) throw new Error(deleteError.message);
    if (permissions.length > 0) {
      const { error: insertError } = await admin.from("business_member_permissions").insert(
        permissions.map((permission) => ({ membership_id: membership.id, permission, granted_by: user.id })),
      );
      if (insertError) throw new Error(insertError.message);
    }
    const { error: auditError } = await admin.from("audit_events").insert({
      business_id: business.id,
      actor_profile_id: user.id,
      event_type: "staff_permissions_updated",
      entity_type: "business_membership",
      entity_id: membership.id,
      before_data: { permissions: (beforeRows ?? []).map((row) => row.permission) },
      after_data: { permissions },
    });
    if (auditError) throw new Error(auditError.message);

    revalidateBusinessAdmin(business.id, business.slug);
    return { ok: true, message: "Staff permissions updated.", entityId: membership.id };
  } catch (error) {
    return actionError(error, "Could not update permissions.");
  }
}

export async function setBusinessMemberStatusAdminAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const { user } = await requirePlatformAdmin();
    const businessId = value(formData, "business_id");
    const membershipId = value(formData, "membership_id");
    const status = value(formData, "status") as MembershipStatus;
    if (!(["active", "suspended"] as string[]).includes(status)) {
      return fieldFailure("Choose a valid access status.", { status: "Status must be Active or Suspended." });
    }
    const business = await lookupBusiness(businessId);
    assertUuid(membershipId, "Membership");
    const admin = createAdminClient();
    const { data: membership, error: lookupError } = await admin
      .from("business_memberships")
      .select("id,profile_id,role,status")
      .eq("id", membershipId)
      .eq("business_id", business.id)
      .maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    if (!membership) throw new Error("Business membership was not found.");
    if (membership.role === "primary_owner") {
      return { ok: false, message: "The active Owner cannot be suspended. Transfer ownership first." };
    }
    if (membership.status === status) {
      return { ok: true, message: `Business access is already ${status}.`, entityId: membership.id };
    }

    const { error } = await admin.from("business_memberships").update({
      status,
      suspended_at: status === "suspended" ? new Date().toISOString() : null,
    }).eq("id", membership.id);
    if (error) throw new Error(error.message);
    if (membership.role === "sales_agent" && status === "suspended") {
      const { error: referralError } = await admin
        .from("referral_codes")
        .update({ active: false })
        .eq("business_id", business.id)
        .eq("agent_id", membership.profile_id);
      if (referralError) throw new Error(referralError.message);
    }
    const { error: auditError } = await admin.from("audit_events").insert({
      business_id: business.id,
      actor_profile_id: user.id,
      event_type: status === "active" ? "membership_reactivated" : "membership_suspended",
      entity_type: "business_membership",
      entity_id: membership.id,
      before_data: { status: membership.status, role: membership.role },
      after_data: { status, role: membership.role },
    });
    if (auditError) throw new Error(auditError.message);

    revalidateBusinessAdmin(business.id, business.slug);
    return {
      ok: true,
      message: status === "active"
        ? "Business access activated. Other memberships were not changed."
        : "Access to this business suspended. History and other memberships were preserved.",
      entityId: membership.id,
    };
  } catch (error) {
    return actionError(error, "Could not update business access.");
  }
}

export async function resetPrimaryOwnerPasswordAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const { user } = await requirePlatformAdmin();
    const businessId = value(formData, "business_id");
    const profileId = value(formData, "profile_id");
    const business = await lookupBusiness(businessId);
    assertUuid(profileId, "Owner profile");
    const admin = createAdminClient();
    const [{ data: membership, error: membershipError }, { data: ownerProfile, error: profileError }] = await Promise.all([
      admin
        .from("business_memberships")
        .select("id,role,status")
        .eq("business_id", business.id)
        .eq("profile_id", profileId)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("id,full_name,email,active,account_status")
        .eq("id", profileId)
        .maybeSingle(),
    ]);
    if (membershipError) throw new Error(membershipError.message);
    if (profileError) throw new Error(profileError.message);
    if (!membership || !ownerProfile) throw new Error("Active Owner was not found.");
    if (
      membership.role !== "primary_owner" ||
      membership.status !== "active" ||
      !ownerProfile.active ||
      ownerProfile.account_status !== "active"
    ) {
      throw new Error("Only the active Owner's password can be reset here.");
    }

    const temporaryPassword = generatedTemporaryPassword();
    const { error: authError } = await admin.auth.admin.updateUserById(profileId, { password: temporaryPassword });
    if (authError) throw new Error(authError.message);
    const { error: profileUpdateError } = await admin
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", profileId);
    if (profileUpdateError) throw new Error(profileUpdateError.message);
    const { error: auditError } = await admin.from("audit_events").insert({
      business_id: business.id,
      actor_profile_id: user.id,
      event_type: "primary_owner_password_reset",
      entity_type: "business_membership",
      entity_id: membership.id,
      after_data: { profile_id: profileId, must_change_password: true },
    });
    if (auditError) throw new Error(auditError.message);

    revalidateBusinessAdmin(business.id, business.slug);
    return {
      ok: true,
      message: `Temporary password generated for ${ownerProfile.full_name}. Copy it now.`,
      entityId: membership.id,
      temporaryPassword,
    };
  } catch (error) {
    return actionError(error, "Could not reset the Owner password.");
  }
}

export async function transferOwnershipAdminAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requirePlatformAdmin();
    const businessId = value(formData, "business_id");
    const targetProfileId = value(formData, "profile_id");
    const reason = value(formData, "reason");
    const fieldErrors: Record<string, string> = {};
    if (!UUID_PATTERN.test(targetProfileId)) fieldErrors.profile_id = "Choose an active Manager.";
    if (reason.length < 10) fieldErrors.reason = "Provide a detailed reason with at least 10 characters.";
    if (Object.keys(fieldErrors).length > 0) return fieldFailure("Review the ownership transfer.", fieldErrors);

    const business = await lookupBusiness(businessId);
    const admin = createAdminClient();
    const { data: targetMembership, error: targetError } = await admin
      .from("business_memberships")
      .select("id,role,status")
      .eq("business_id", business.id)
      .eq("profile_id", targetProfileId)
      .maybeSingle();
    if (targetError) throw new Error(targetError.message);
    if (!targetMembership || targetMembership.role !== "co_owner" || targetMembership.status !== "active") {
      return fieldFailure("Ownership can be transferred only to an active Manager.", { profile_id: "Choose an active Manager." });
    }

    const client = await createClient({ businessId: business.id });
    const { error } = await client.rpc("platform_recover_primary_ownership", {
      target_business_id: business.id,
      target_profile_id: targetProfileId,
      recovery_reason: reason,
    });
    if (error) throw new Error(error.message);

    revalidateBusinessAdmin(business.id, business.slug);
    return {
      ok: true,
      message: "Ownership transferred. The new person is Owner and the previous Owner is now Manager. Passwords were not changed.",
      entityId: targetMembership.id,
    };
  } catch (error) {
    return actionError(error, "Could not transfer ownership.");
  }
}

export async function startSupportSessionAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const { user } = await requirePlatformAdmin();
    const businessId = value(formData, "business_id");
    const reason = value(formData, "reason");
    if (reason.length < 5) {
      return fieldFailure("Explain why support access is needed.", { reason: "Enter at least 5 characters." });
    }
    const business = await lookupBusiness(businessId);
    if (business.status !== "active") throw new Error("Activate the business before starting a support session.");

    const admin = createAdminClient();
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + 30 * 60 * 1000);
    const { data: session, error } = await admin.from("business_support_sessions").insert({
      admin_profile_id: user.id,
      business_id: business.id,
      reason,
      access_level: "configuration",
      started_at: startedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    }).select("id").single();
    if (error || !session) throw new Error(error?.message ?? "Could not start the support session.");
    const { error: auditError } = await admin.from("audit_events").insert({
      business_id: business.id,
      actor_profile_id: user.id,
      event_type: "support_session_started",
      entity_type: "business_support_session",
      entity_id: session.id,
      reason,
      after_data: { expires_at: expiresAt.toISOString(), access_level: "configuration" },
    });
    if (auditError) throw new Error(auditError.message);

    revalidateBusinessAdmin(business.id, business.slug);
    return {
      ok: true,
      message: "30-minute support session started. Open the business workspace to continue.",
      entityId: session.id,
      href: `/b/${business.slug}`,
    };
  } catch (error) {
    return actionError(error, "Could not start the support session.");
  }
}
