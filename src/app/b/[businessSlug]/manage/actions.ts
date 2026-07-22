"use server";

import { revalidatePath } from "next/cache";
import {
  saveStaffPermissionsAction as saveStaffPermissionsAppAction,
} from "@/app/actions";
import { appBaseUrl } from "@/lib/auth-helpers";
import {
  createOrRegenerateBusinessInvitation,
  regenerateBusinessInvitation,
  resolveExactBusinessEmail,
  revokeBusinessInvitation,
} from "@/lib/business-access-service";
import { businessPermissions } from "@/lib/constants";
import { sendBusinessAccessGrantedEmail } from "@/lib/email";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { canManageBusinessMemberRole, isBusinessOwner, isPrimaryOwner, resolveBusinessContextFromRequest } from "@/lib/tenancy";
import type { BusinessRole, BusinessType, MembershipStatus } from "@/lib/types";

export type BusinessUserActionState = {
  ok: boolean | null;
  message: string;
  lookup?: "registered" | "invite" | "suspended" | "already_active";
  email?: string;
  fullName?: string;
  existingRole?: BusinessRole;
  inviteUrl?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const staffPermissions = new Set(["collect_guest_house", "collect_library", "collect_course", "collect_general", "add_expense"]);
const modulePermissions = new Set(Object.values(businessPermissions));

function read(formData: FormData, key: string) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

function roleFromForm(formData: FormData): Exclude<BusinessRole, "primary_owner"> {
  const value = read(formData, "role");
  if (value === "owner" || value === "co_owner") return "co_owner";
  return value === "sales_agent" ? "sales_agent" : "staff";
}

function submittedPermissions(formData: FormData) {
  return [...new Set(formData.getAll("permissions").filter(
    (permission): permission is string => typeof permission === "string" && staffPermissions.has(permission),
  ))];
}

async function constrainedStaffPermissions(input: {
  businessId: string;
  role: Exclude<BusinessRole, "primary_owner">;
  submitted: string[];
  preserved?: string[];
}) {
  if (input.role !== "staff") return [];
  const admin = createAdminClient();
  const { data: modules, error } = await admin
    .from("business_modules")
    .select("module,enabled")
    .eq("business_id", input.businessId);
  if (error) throw new Error(error.message);

  const enabledPermissions = new Set(
    (modules ?? [])
      .filter((module) => module.enabled)
      .map((module) => businessPermissions[module.module as BusinessType]),
  );
  const permissions = new Set(
    input.submitted.filter((permission) => permission === "add_expense" || enabledPermissions.has(permission)),
  );

  for (const permission of input.preserved ?? []) {
    if (modulePermissions.has(permission) && !enabledPermissions.has(permission)) permissions.add(permission);
  }
  return [...permissions];
}

async function currentAccessPermissions(input: {
  businessId: string;
  email: string;
  membershipId?: string | null;
}) {
  const admin = createAdminClient();
  if (input.membershipId) {
    const { data, error } = await admin
      .from("business_member_permissions")
      .select("permission")
      .eq("membership_id", input.membershipId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => String(row.permission));
  }

  const { data, error } = await admin
    .from("business_invitations")
    .select("permissions")
    .eq("business_id", input.businessId)
    .eq("email", input.email)
    .eq("status", "pending")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.permissions ?? []) as string[];
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
  if (read(formData, "business_name_confirmation") !== context.business.name) {
    throw new Error("Type the business name exactly to confirm the ownership transfer.");
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
  try {
    const { identity, context } = await resolveBusinessContextFromRequest();
    const email = read(formData, "email").toLowerCase();
    const role = roleFromForm(formData);
    if (!emailPattern.test(email)) return { ok: false, message: "Enter a valid email address." };
    if (!canManageBusinessMemberRole(context.membership?.role, role, context.accessMode)) {
      return { ok: false, message: "You cannot assign this business role." };
    }
    const resolution = await resolveExactBusinessEmail(context.business.id, email);
    const preservedPermissions = await currentAccessPermissions({
      businessId: context.business.id,
      email,
      membershipId: resolution.membership?.id,
    });
    const permissions = await constrainedStaffPermissions({
      businessId: context.business.id,
      role,
      submitted: submittedPermissions(formData),
      preserved: preservedPermissions,
    });
    if (resolution.profile) {
      if (!resolution.profile.active || resolution.profile.accountStatus !== "active") {
        return { ok: false, message: "This Lenden account is globally inactive. Contact a platform administrator." };
      }
      if (resolution.membership?.role === "primary_owner") return { ok: false, message: "This user is already the business Owner." };
      if (context.accessMode === "member" && context.membership?.role === "co_owner" && resolution.membership?.role === "co_owner") {
        return { ok: false, message: "Managers cannot change another Manager." };
      }
      const client = await createClient({ businessId: context.business.id });
      const { error } = await client.rpc("grant_business_access", {
        target_business_id: context.business.id,
        target_profile_id: resolution.profile.id,
        target_role: role,
        target_permissions: permissions,
      });
      if (error) throw new Error(error.message);
      const baseUrl = await appBaseUrl();
      const delivery = await sendBusinessAccessGrantedEmail({
        recipientEmail: email,
        businessId: context.business.id,
        businessName: context.business.name,
        roleLabel: role === "co_owner" ? "Manager" : role === "sales_agent" ? "Sales Agent" : "Staff",
        businessUrl: `${baseUrl}/b/${context.business.slug}`,
        generation: new Date().toISOString().slice(0, 16),
      });
      revalidatePath(`/b/${context.business.slug}`);
      revalidatePath(`/b/${context.business.slug}/manage`);
      revalidatePath("/account");
      const accessVerb = resolution.membership?.status === "active" ? "has updated business access" : "now has access";
      return {
        ok: true,
        message: delivery.ok
          ? `${resolution.profile.fullName} ${accessVerb}. Their password was not changed.`
          : `${resolution.profile.fullName} ${accessVerb}. Email delivery failed, but their Account page will show the business.`,
      };
    }

    const invitation = await createOrRegenerateBusinessInvitation({
      businessId: context.business.id,
      businessName: context.business.name,
      email,
      role,
      permissions,
      actorId: identity.id,
      actorName: identity.full_name,
    });
    revalidatePath(`/b/${context.business.slug}/manage`);
    return {
      ok: true,
      message: invitation.delivery.ok
        ? `Invitation sent to ${email}. It expires in 30 days.`
        : `Invitation saved, but email could not be sent: ${invitation.delivery.error}`,
      inviteUrl: invitation.invitationUrl,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not grant business access." };
  }
}

export async function resolveBusinessUserEmailAction(
  previousState: BusinessUserActionState,
  formData: FormData,
): Promise<BusinessUserActionState> {
  void previousState;
  try {
    const { context } = await resolveBusinessContextFromRequest();
    if (context.accessMode !== "support" && !isBusinessOwner(context.membership?.role)) {
      return { ok: false, message: "Only the Owner or a Manager can add business users." };
    }
    const email = read(formData, "email").toLowerCase();
    if (!emailPattern.test(email)) return { ok: false, message: "Enter a valid email address." };
    const resolution = await resolveExactBusinessEmail(context.business.id, email);
    if (!resolution.profile) return { ok: true, message: "No Lenden account exists yet. An invitation will be sent.", lookup: "invite", email };
    if (!resolution.profile.active || resolution.profile.accountStatus !== "active") {
      return { ok: false, message: "This Lenden account is globally inactive. A platform administrator must reactivate it." };
    }
    if (context.accessMode === "member" && context.membership?.role === "co_owner" && resolution.membership?.role === "co_owner") {
      return { ok: false, message: "Managers can manage Staff and Sales Agents only." };
    }
    if (resolution.membership?.status === "active") return { ok: true, message: resolution.membership.role === "primary_owner" ? `${resolution.profile.fullName} is the protected business Owner.` : `${resolution.profile.fullName} already has active access. Confirm below to change their role or starting permissions.`, lookup: "already_active", email, fullName: resolution.profile.fullName, existingRole: resolution.membership.role };
    if (resolution.membership?.status === "suspended") return { ok: true, message: `${resolution.profile.fullName} previously had access. Confirming will reactivate it.`, lookup: "suspended", email, fullName: resolution.profile.fullName, existingRole: resolution.membership.role };
    return { ok: true, message: `Registered account found for ${resolution.profile.fullName}.`, lookup: "registered", email, fullName: resolution.profile.fullName };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not check this email." };
  }
}

export async function updateBusinessMemberAccessAction(
  previousState: BusinessUserActionState,
  formData: FormData,
): Promise<BusinessUserActionState> {
  void previousState;
  try {
    const { context } = await resolveBusinessContextFromRequest();
    const membershipId = read(formData, "membership_id");
    const role = roleFromForm(formData);
    if (!membershipId) return { ok: false, message: "Choose a business member." };

    const client = await createClient({ businessId: context.business.id });
    const { data: membership, error: membershipError } = await client
      .from("business_memberships")
      .select("id,profile_id,role,status")
      .eq("id", membershipId)
      .eq("business_id", context.business.id)
      .single();
    if (membershipError || !membership) {
      return { ok: false, message: membershipError?.message ?? "Business membership was not found." };
    }
    if (!canManageBusinessMemberRole(context.membership?.role, membership.role, context.accessMode)) {
      return { ok: false, message: membership.role === "primary_owner"
        ? "Ownership must be changed through the ownership transfer workflow."
        : "You cannot manage this business member." };
    }
    if (!canManageBusinessMemberRole(context.membership?.role, role, context.accessMode)) {
      return { ok: false, message: "You cannot assign this business role." };
    }

    const admin = createAdminClient();
    const { data: targetProfile, error: profileError } = await admin
      .from("profiles")
      .select("id,email,full_name,active,account_status")
      .eq("id", membership.profile_id)
      .single();
    if (profileError || !targetProfile) throw new Error(profileError?.message ?? "Member profile was not found.");
    if (!targetProfile.active || targetProfile.account_status !== "active") {
      return { ok: false, message: "This Lenden account is globally inactive. A platform administrator must reactivate it first." };
    }

    const preservedPermissions = await currentAccessPermissions({
      businessId: context.business.id,
      email: targetProfile.email,
      membershipId,
    });
    const permissions = await constrainedStaffPermissions({
      businessId: context.business.id,
      role,
      submitted: submittedPermissions(formData),
      preserved: preservedPermissions,
    });
    const { error } = await client.rpc("grant_business_access", {
      target_business_id: context.business.id,
      target_profile_id: membership.profile_id,
      target_role: role,
      target_permissions: permissions,
    });
    if (error) throw new Error(error.message);

    const baseUrl = await appBaseUrl();
    const delivery = await sendBusinessAccessGrantedEmail({
      recipientEmail: targetProfile.email,
      businessId: context.business.id,
      businessName: context.business.name,
      roleLabel: role === "co_owner" ? "Manager" : role === "sales_agent" ? "Sales Agent" : "Staff",
      businessUrl: `${baseUrl}/b/${context.business.slug}`,
      generation: new Date().toISOString().slice(0, 16),
    });
    revalidatePath(`/b/${context.business.slug}`);
    revalidatePath(`/b/${context.business.slug}/manage`);
    revalidatePath("/account");
    const verb = membership.status === "suspended" ? "restored" : "updated";
    return {
      ok: true,
      message: delivery.ok
        ? `${targetProfile.full_name}'s access was ${verb}.`
        : `${targetProfile.full_name}'s access was ${verb}. Email delivery failed, but the access change is active.`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not update business access." };
  }
}

export async function saveBusinessUserPermissionsAction(
  previousState: BusinessUserActionState,
  formData: FormData,
): Promise<BusinessUserActionState> {
  void previousState;
  return runBusinessUserAction(saveStaffPermissionsAppAction, formData);
}

export async function resendBusinessInvitationAction(
  previousState: BusinessUserActionState,
  formData: FormData,
): Promise<BusinessUserActionState> {
  void previousState;
  try {
    const { identity, context } = await resolveBusinessContextFromRequest();
    const invitationId = read(formData, "invitation_id");
    const admin = createAdminClient();
    const { data: invitation } = await admin.from("business_invitations").select("intended_role").eq("id", invitationId).eq("business_id", context.business.id).maybeSingle();
    if (!invitation || !canManageBusinessMemberRole(context.membership?.role, invitation.intended_role, context.accessMode)) throw new Error("You cannot resend this invitation.");
    const sent = await regenerateBusinessInvitation({ invitationId, businessId: context.business.id, businessName: context.business.name, actorId: identity.id, actorName: identity.full_name });
    revalidatePath(`/b/${context.business.slug}/manage`);
    return { ok: true, message: sent.delivery.ok ? "Invitation regenerated and sent." : `New link created, but email failed: ${sent.delivery.error}`, inviteUrl: sent.invitationUrl };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not resend invitation." };
  }
}

export async function revokeBusinessInvitationAction(
  previousState: BusinessUserActionState,
  formData: FormData,
): Promise<BusinessUserActionState> {
  void previousState;
  try {
    const { identity, context } = await resolveBusinessContextFromRequest();
    const invitationId = read(formData, "invitation_id");
    const admin = createAdminClient();
    const { data: invitation } = await admin.from("business_invitations").select("intended_role").eq("id", invitationId).eq("business_id", context.business.id).maybeSingle();
    if (!invitation || !canManageBusinessMemberRole(context.membership?.role, invitation.intended_role, context.accessMode)) throw new Error("You cannot revoke this invitation.");
    await revokeBusinessInvitation({ invitationId, businessId: context.business.id, actorId: identity.id });
    revalidatePath(`/b/${context.business.slug}/manage`);
    return { ok: true, message: "Invitation revoked." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not revoke invitation." };
  }
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
