import "server-only";

import { appBaseUrl } from "@/lib/auth-helpers";
import { sendBusinessInvitationEmail } from "@/lib/email";
import { createInvitationToken, invitationTokenHash } from "@/lib/invitations";
import { createAdminClient } from "@/lib/supabase/server";
import type { BusinessRole, BusinessType, MembershipStatus } from "@/lib/types";

export type ExactEmailResolution = {
  email: string;
  profile: { id: string; fullName: string; active: boolean; accountStatus: string } | null;
  membership: { id: string; role: BusinessRole; status: MembershipStatus } | null;
};

function roleLabel(role: Exclude<BusinessRole, "primary_owner">) {
  return role === "co_owner" ? "Manager" : role === "sales_agent" ? "Sales Agent" : "Staff";
}

export async function resolveExactBusinessEmail(businessId: string, rawEmail: string): Promise<ExactEmailResolution> {
  const email = rawEmail.trim().toLowerCase();
  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id,full_name,active,account_status")
    .eq("email", email)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!profile) return { email, profile: null, membership: null };
  const { data: membership, error: membershipError } = await admin
    .from("business_memberships")
    .select("id,role,status")
    .eq("business_id", businessId)
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (membershipError) throw new Error(membershipError.message);
  return {
    email,
    profile: { id: profile.id, fullName: profile.full_name, active: profile.active, accountStatus: profile.account_status },
    membership: membership ? { id: membership.id, role: membership.role as BusinessRole, status: membership.status as MembershipStatus } : null,
  };
}

async function deliverInvitation(input: {
  invitationId: string;
  token: string;
  recipientEmail: string;
  businessName: string;
  inviterName: string;
  role: Exclude<BusinessRole, "primary_owner">;
  generation: string;
}) {
  const baseUrl = await appBaseUrl();
  const invitationUrl = `${baseUrl}/invitations/${encodeURIComponent(input.token)}`;
  const delivery = await sendBusinessInvitationEmail({
    invitationId: input.invitationId,
    recipientEmail: input.recipientEmail,
    businessName: input.businessName,
    inviterName: input.inviterName,
    roleLabel: roleLabel(input.role),
    invitationUrl,
    generation: input.generation,
  });
  const admin = createAdminClient();
  await admin.from("business_invitations").update(delivery.ok ? {
    delivery_status: "sent",
    delivery_provider_id: delivery.providerId,
    delivery_error: null,
    last_sent_at: new Date().toISOString(),
  } : {
    delivery_status: "failed",
    delivery_provider_id: null,
    delivery_error: delivery.error.slice(0, 1000),
    last_sent_at: new Date().toISOString(),
  }).eq("id", input.invitationId);
  return { invitationUrl, delivery };
}

export async function createOrRegenerateBusinessInvitation(input: {
  businessId: string;
  businessName: string;
  email: string;
  role: Exclude<BusinessRole, "primary_owner">;
  permissions: string[];
  unitScopes: BusinessType[];
  unitManagerAssignments: Record<string, string>;
  actorId: string;
  actorName: string;
}) {
  const admin = createAdminClient();
  const token = createInvitationToken();
  const tokenHash = invitationTokenHash(token);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: existing, error: existingError } = await admin
    .from("business_invitations")
    .select("id")
    .eq("business_id", input.businessId)
    .eq("email", input.email)
    .eq("status", "pending")
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  const payload = {
    email: input.email,
    intended_role: input.role,
    permissions: input.permissions,
    unit_scopes: input.unitScopes,
    unit_manager_assignments: input.unitManagerAssignments,
    token_hash: tokenHash,
    invited_by: input.actorId,
    expires_at: expiresAt,
    delivery_status: "pending",
    delivery_provider_id: null,
    delivery_error: null,
  };
  const mutation = existing
    ? admin.from("business_invitations").update(payload).eq("id", existing.id).select("id,updated_at").single()
    : admin.from("business_invitations").insert({ business_id: input.businessId, ...payload }).select("id,updated_at").single();
  const { data: invitation, error } = await mutation;
  if (error || !invitation) throw new Error(error?.message ?? "Could not create invitation.");
  await admin.from("audit_events").insert({
    business_id: input.businessId,
    actor_profile_id: input.actorId,
    event_type: existing ? "invitation_regenerated" : "invitation_created",
    entity_type: "business_invitation",
    entity_id: invitation.id,
    after_data: {
      email: input.email,
      role: input.role,
      permissions: input.permissions,
      unit_scopes: input.unitScopes,
      unit_manager_assignments: input.unitManagerAssignments,
      expires_at: expiresAt,
    },
  });
  const delivered = await deliverInvitation({
    invitationId: invitation.id,
    token,
    recipientEmail: input.email,
    businessName: input.businessName,
    inviterName: input.actorName,
    role: input.role,
    generation: invitation.updated_at,
  });
  return { invitationId: invitation.id, expiresAt, ...delivered };
}

export async function regenerateBusinessInvitation(input: {
  invitationId: string;
  businessId: string;
  businessName: string;
  actorId: string;
  actorName: string;
}) {
  const admin = createAdminClient();
  const { data: invitation, error } = await admin
    .from("business_invitations")
    .select("id,email,intended_role,permissions,unit_scopes,unit_manager_assignments,status")
    .eq("id", input.invitationId)
    .eq("business_id", input.businessId)
    .single();
  if (error || !invitation || invitation.status !== "pending") throw new Error("Pending invitation was not found.");
  return createOrRegenerateBusinessInvitation({
    businessId: input.businessId,
    businessName: input.businessName,
    email: invitation.email,
    role: invitation.intended_role,
    permissions: invitation.permissions ?? [],
    unitScopes: invitation.unit_scopes ?? [],
    unitManagerAssignments: (invitation.unit_manager_assignments ?? {}) as Record<string, string>,
    actorId: input.actorId,
    actorName: input.actorName,
  });
}

export async function revokeBusinessInvitation(input: { invitationId: string; businessId: string; actorId: string }) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("business_invitations").update({
    status: "revoked",
    revoked_at: new Date().toISOString(),
    revoked_by: input.actorId,
  }).eq("id", input.invitationId).eq("business_id", input.businessId).eq("status", "pending").select("id").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Pending invitation was not found.");
  await admin.from("audit_events").insert({
    business_id: input.businessId,
    actor_profile_id: input.actorId,
    event_type: "invitation_revoked",
    entity_type: "business_invitation",
    entity_id: input.invitationId,
  });
}
