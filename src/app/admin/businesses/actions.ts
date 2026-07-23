"use server";

import { revalidatePath } from "next/cache";
import { appBaseUrl } from "@/lib/auth-helpers";
import { createOrRegenerateBusinessInvitation, regenerateBusinessInvitation, resolveExactBusinessEmail, revokeBusinessInvitation } from "@/lib/business-access-service";
import { sendBusinessAccessGrantedEmail } from "@/lib/email";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { BusinessRole, BusinessStatus, BusinessType, MembershipStatus } from "@/lib/types";
import { requirePlatformAdmin } from "./admin-data";

export type AdminActionState = {
  ok: boolean | null;
  message: string;
  fieldErrors?: Record<string, string>;
  entityId?: string;
  href?: string;
  inviteUrl?: string;
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

export async function createBusinessAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requirePlatformAdmin();
    const name = value(formData, "name");
    const slug = slugify(value(formData, "slug") || name);
    const timezone = value(formData, "timezone") || "Asia/Kolkata";
    const currency = (value(formData, "currency") || "INR").toUpperCase();
    const ownerEmail = value(formData, "owner_email").toLowerCase();
    const modules = selectedModules(formData);
    const fieldErrors: Record<string, string> = {};

    if (name.length < 2) fieldErrors.name = "Enter a business name with at least 2 characters.";
    if (!SLUG_PATTERN.test(slug)) fieldErrors.slug = "Use lowercase letters, numbers, and single hyphens only.";
    if (!timezone) fieldErrors.timezone = "Enter a timezone.";
    if (!/^[A-Z]{3}$/.test(currency)) fieldErrors.currency = "Enter a 3-letter currency code.";
    if (!EMAIL_PATTERN.test(ownerEmail)) fieldErrors.owner_email = "Enter a valid Owner email address.";
    if (modules.length === 0) fieldErrors.modules = "Enable at least one module.";
    if (Object.keys(fieldErrors).length > 0) return fieldFailure("Review the highlighted details.", fieldErrors);

    const client = await createClient();
    const { data: businessId, error: createError } = await client.rpc("create_business_with_owner", {
      final_name: name,
      final_slug: slug,
      final_timezone: timezone,
      final_currency: currency,
      final_modules: modules,
      target_owner_email: ownerEmail,
    });
    if (createError || typeof businessId !== "string") {
      const message = createError?.message ?? "Could not create business.";
      if (message.includes("business URL")) {
        return fieldFailure("That business URL is already in use.", { slug: "Choose a different URL slug." });
      }
      if (message.includes("No registered Lenden account")) {
        return fieldFailure("The Owner must create their own Lenden account first.", {
          owner_email: "No registered account was found. Ask this person to sign up, then retry.",
        });
      }
      if (message.includes("Owner account")) {
        return fieldFailure("This existing Lenden account is inactive.", {
          owner_email: "Reactivate the global account before assigning it as an Owner.",
        });
      }
      throw new Error(message);
    }

    revalidateBusinessAdmin(businessId, slug);
    return {
      ok: true,
      message: "Business created. The registered Lenden account is now the Owner; its password was not changed.",
      entityId: businessId,
      href: `/admin/businesses/${businessId}`,
    };
  } catch (error) {
    return actionError(error, "Could not create business.");
  }
}

export async function approveBusinessRequestAdminAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requirePlatformAdmin();
    const requestId = value(formData, "request_id");
    const name = value(formData, "name");
    const slug = slugify(value(formData, "slug") || name);
    const timezone = value(formData, "timezone") || "Asia/Kolkata";
    const currency = (value(formData, "currency") || "INR").toUpperCase();
    const modules = selectedModules(formData);
    const fieldErrors: Record<string, string> = {};
    if (!UUID_PATTERN.test(requestId)) fieldErrors.request_id = "Request is invalid.";
    if (name.length < 2) fieldErrors.name = "Enter a business name.";
    if (!SLUG_PATTERN.test(slug)) fieldErrors.slug = "Use lowercase letters, numbers, and single hyphens.";
    if (!/^[A-Z]{3}$/.test(currency)) fieldErrors.currency = "Enter a 3-letter currency code.";
    if (!timezone) fieldErrors.timezone = "Enter a timezone.";
    if (modules.length === 0) fieldErrors.modules = "Enable at least one module.";
    if (Object.keys(fieldErrors).length) return fieldFailure("Review the business settings.", fieldErrors);
    const client = await createClient();
    const { data: businessId, error } = await client.rpc("approve_business_creation_request", {
      target_request_id: requestId,
      final_name: name,
      final_slug: slug,
      final_timezone: timezone,
      final_currency: currency,
      final_modules: modules,
    });
    if (error || !businessId) throw new Error(error?.message ?? "Could not approve request.");
    revalidatePath("/admin/businesses/requests");
    revalidateBusinessAdmin(businessId, slug);
    revalidatePath("/account");
    revalidatePath("/settings");
    return { ok: true, message: "Request approved. The requester is now the protected Owner.", entityId: businessId, href: `/admin/businesses/${businessId}` };
  } catch (error) {
    return actionError(error, "Could not approve request.");
  }
}

export async function rejectBusinessRequestAdminAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requirePlatformAdmin();
    const requestId = value(formData, "request_id");
    const reason = value(formData, "reason");
    if (!UUID_PATTERN.test(requestId)) return fieldFailure("Request is invalid.", { request_id: "Invalid request." });
    if (reason.length < 3) return fieldFailure("A rejection reason is required.", { reason: "Enter at least 3 characters." });
    const client = await createClient();
    const { error } = await client.rpc("reject_business_creation_request", { target_request_id: requestId, rejection_reason: reason });
    if (error) throw new Error(error.message);
    revalidatePath("/admin/businesses/requests");
    revalidatePath("/account");
    revalidatePath("/settings");
    return { ok: true, message: "Request rejected. The reason is visible to the requester.", entityId: requestId };
  } catch (error) {
    return actionError(error, "Could not reject request.");
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
  try {
    const { user, profile: actor } = await requirePlatformAdmin();
    const businessId = value(formData, "business_id");
    const email = value(formData, "email").toLowerCase();
    const role = value(formData, "role") as BusinessRole;
    const permissions = role === "staff" ? selectedPermissions(formData) : [];
    const fieldErrors: Record<string, string> = {};

    if (!EMAIL_PATTERN.test(email)) fieldErrors.email = "Enter a valid email address.";
    if (!MEMBER_ROLES.includes(role)) fieldErrors.role = "Choose Manager, Staff, or Sales Agent.";
    if (Object.keys(fieldErrors).length > 0) return fieldFailure("Review the user details.", fieldErrors);

    const business = await lookupBusiness(businessId);
    const resolution = await resolveExactBusinessEmail(business.id, email);
    if (resolution.profile && (!resolution.profile.active || resolution.profile.accountStatus !== "active")) {
      return fieldFailure("This existing Lenden account is inactive.", {
        email: "Reactivate the global account before adding business access.",
      });
    }
    if (resolution.profile) {
      if (resolution.membership?.role === "primary_owner") return fieldFailure("This user is already the Owner.", { email: "Use the ownership workflow." });
      const client = await createClient({ businessId: business.id });
      const { data: membershipId, error } = await client.rpc("grant_business_access", {
        target_business_id: business.id,
        target_profile_id: resolution.profile.id,
        target_role: role,
        target_permissions: permissions,
      });
      if (error) throw new Error(error.message);
      const baseUrl = await appBaseUrl();
      const delivery = await sendBusinessAccessGrantedEmail({ recipientEmail: email, businessId: business.id, businessName: business.name, roleLabel: role === "co_owner" ? "Manager" : role === "sales_agent" ? "Sales Agent" : "Staff", businessUrl: `${baseUrl}/b/${business.slug}`, generation: new Date().toISOString().slice(0, 16) });
      revalidateBusinessAdmin(business.id, business.slug);
      return { ok: true, message: delivery.ok ? "Registered user access granted. Their password was not changed." : "Access granted. Email delivery failed, but the business will appear in their Account page.", entityId: membershipId };
    }

    const invitation = await createOrRegenerateBusinessInvitation({ businessId: business.id, businessName: business.name, email, role: role as Exclude<BusinessRole, "primary_owner">, permissions, actorId: user.id, actorName: actor.full_name });
    revalidateBusinessAdmin(business.id, business.slug);
    return { ok: true, message: invitation.delivery.ok ? "Invitation sent. The user will create their own account and accept access." : `Invitation saved, but email failed: ${invitation.delivery.error}`, entityId: invitation.invitationId, inviteUrl: invitation.invitationUrl };
  } catch (error) {
    return actionError(error, "Could not add the business user.");
  }
}

export async function resendBusinessInvitationAdminAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const { user, profile } = await requirePlatformAdmin();
    const business = await lookupBusiness(value(formData, "business_id"));
    const invitationId = value(formData, "invitation_id");
    assertUuid(invitationId, "Invitation");
    const sent = await regenerateBusinessInvitation({ invitationId, businessId: business.id, businessName: business.name, actorId: user.id, actorName: profile.full_name });
    revalidateBusinessAdmin(business.id, business.slug);
    return { ok: true, message: sent.delivery.ok ? "Invitation regenerated and sent." : `New link created, but email failed: ${sent.delivery.error}`, entityId: invitationId, inviteUrl: sent.invitationUrl };
  } catch (error) {
    return actionError(error, "Could not resend invitation.");
  }
}

export async function revokeBusinessInvitationAdminAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const { user } = await requirePlatformAdmin();
    const business = await lookupBusiness(value(formData, "business_id"));
    const invitationId = value(formData, "invitation_id");
    assertUuid(invitationId, "Invitation");
    await revokeBusinessInvitation({ invitationId, businessId: business.id, actorId: user.id });
    revalidateBusinessAdmin(business.id, business.slug);
    return { ok: true, message: "Invitation revoked.", entityId: invitationId };
  } catch (error) {
    return actionError(error, "Could not revoke invitation.");
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
