import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/server";
import { invitationState } from "@/lib/invitations";
import { requireIdentity } from "@/lib/tenancy";
import type {
  BusinessRole,
  BusinessStatus,
  BusinessType,
  MembershipStatus,
} from "@/lib/types";

export type AdminProfile = {
  id: string;
  fullName: string;
  email: string;
  active: boolean;
  accountStatus: BusinessStatus;
  mustChangePassword: boolean;
};

export type AdminBusinessMember = {
  id: string;
  businessId: string;
  profileId: string;
  role: BusinessRole;
  status: MembershipStatus;
  joinedAt: string | null;
  suspendedAt: string | null;
  profile: AdminProfile;
  permissions: string[];
};

export type AdminBusinessSummary = {
  id: string;
  name: string;
  slug: string;
  status: BusinessStatus;
  timezone: string;
  currency: string;
  createdAt: string;
  owner: AdminProfile | null;
  activeUserCount: number;
  enabledModules: BusinessType[];
};

export type AdminBusinessDetail = AdminBusinessSummary & {
  updatedAt: string;
  suspendedAt: string | null;
  members: AdminBusinessMember[];
  invitations: AdminBusinessInvitation[];
};

export type AdminBusinessInvitation = {
  id: string;
  businessId: string;
  email: string;
  role: Exclude<BusinessRole, "primary_owner">;
  permissions: string[];
  expiresAt: string;
  deliveryStatus: "pending" | "sent" | "failed";
  deliveryError: string | null;
  expired: boolean;
};

export type AdminAuditEvent = {
  id: string;
  eventType: string;
  entityType: string | null;
  reason: string | null;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  createdAt: string;
  actor: Pick<AdminProfile, "id" | "fullName" | "email"> | null;
};

export type AdminSupportSession = {
  id: string;
  reason: string;
  startedAt: string;
  expiresAt: string;
  endedAt: string | null;
  admin: Pick<AdminProfile, "id" | "fullName" | "email"> | null;
};

export type AdminBusinessRequest = {
  id: string;
  requestedName: string;
  requestedModules: BusinessType[];
  note: string | null;
  createdAt: string;
  requester: Pick<AdminProfile, "id" | "fullName" | "email">;
};

type BusinessRow = {
  id: string;
  name: string;
  slug: string;
  status: BusinessStatus;
  timezone: string;
  currency: string;
  created_at: string;
  updated_at: string;
  suspended_at: string | null;
};

type MembershipRow = {
  id: string;
  business_id: string;
  profile_id: string;
  role: BusinessRole;
  status: MembershipStatus;
  joined_at: string | null;
  suspended_at: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string;
  email: string;
  active: boolean;
  account_status: BusinessStatus;
  must_change_password: boolean;
};

type ModuleRow = {
  business_id: string;
  module: BusinessType;
  enabled: boolean;
};

function profileFromRow(profile: ProfileRow): AdminProfile {
  return {
    id: profile.id,
    fullName: profile.full_name,
    email: profile.email,
    active: profile.active,
    accountStatus: profile.account_status,
    mustChangePassword: profile.must_change_password,
  };
}

export const requirePlatformAdmin = cache(async () => {
  const identity = await requireIdentity();
  if (identity.profile.platform_role !== "platform_admin") {
    throw new Error("Platform administrator access is required.");
  }
  return identity;
});

async function loadProfiles(profileIds: string[]) {
  const uniqueIds = [...new Set(profileIds)];
  if (uniqueIds.length === 0) return new Map<string, AdminProfile>();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id,full_name,email,active,account_status,must_change_password")
    .in("id", uniqueIds);
  if (error) throw new Error(error.message);
  return new Map(
    ((data ?? []) as ProfileRow[]).map((profile) => [profile.id, profileFromRow(profile)]),
  );
}

function toSummary(
  business: BusinessRow,
  memberships: MembershipRow[],
  modules: ModuleRow[],
  profiles: Map<string, AdminProfile>,
): AdminBusinessSummary {
  const businessMemberships = memberships.filter((membership) => membership.business_id === business.id);
  const ownerMembership = businessMemberships.find(
    (membership) => membership.role === "primary_owner" && membership.status === "active",
  );

  return {
    id: business.id,
    name: business.name,
    slug: business.slug,
    status: business.status,
    timezone: business.timezone,
    currency: business.currency,
    createdAt: business.created_at,
    owner: ownerMembership ? profiles.get(ownerMembership.profile_id) ?? null : null,
    activeUserCount: businessMemberships.filter((membership) => membership.status === "active").length,
    enabledModules: modules
      .filter((module) => module.business_id === business.id && module.enabled)
      .map((module) => module.module),
  };
}

export const loadAdminBusinessDirectory = cache(async (): Promise<AdminBusinessSummary[]> => {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  const [businessResult, membershipResult, moduleResult] = await Promise.all([
    admin
      .from("businesses")
      .select("id,name,slug,status,timezone,currency,created_at,updated_at,suspended_at")
      .order("created_at", { ascending: false }),
    admin
      .from("business_memberships")
      .select("id,business_id,profile_id,role,status,joined_at,suspended_at"),
    admin.from("business_modules").select("business_id,module,enabled"),
  ]);
  if (businessResult.error) throw new Error(businessResult.error.message);
  if (membershipResult.error) throw new Error(membershipResult.error.message);
  if (moduleResult.error) throw new Error(moduleResult.error.message);

  const businesses = (businessResult.data ?? []) as BusinessRow[];
  const memberships = (membershipResult.data ?? []) as MembershipRow[];
  const modules = (moduleResult.data ?? []) as ModuleRow[];
  const profiles = await loadProfiles(memberships.map((membership) => membership.profile_id));
  return businesses.map((business) => toSummary(business, memberships, modules, profiles));
});

export const loadAdminBusiness = cache(async (businessId: string): Promise<AdminBusinessDetail | null> => {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  const [businessResult, membershipResult, moduleResult, invitationResult] = await Promise.all([
    admin
      .from("businesses")
      .select("id,name,slug,status,timezone,currency,created_at,updated_at,suspended_at")
      .eq("id", businessId)
      .maybeSingle(),
    admin
      .from("business_memberships")
      .select("id,business_id,profile_id,role,status,joined_at,suspended_at")
      .eq("business_id", businessId)
      .order("created_at"),
    admin
      .from("business_modules")
      .select("business_id,module,enabled")
      .eq("business_id", businessId),
    admin
      .from("business_invitations")
      .select("id,business_id,email,intended_role,permissions,expires_at,delivery_status,delivery_error")
      .eq("business_id", businessId)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);
  if (businessResult.error) throw new Error(businessResult.error.message);
  if (!businessResult.data) return null;
  if (membershipResult.error) throw new Error(membershipResult.error.message);
  if (moduleResult.error) throw new Error(moduleResult.error.message);
  if (invitationResult.error) throw new Error(invitationResult.error.message);

  const business = businessResult.data as BusinessRow;
  const memberships = (membershipResult.data ?? []) as MembershipRow[];
  const modules = (moduleResult.data ?? []) as ModuleRow[];
  const profiles = await loadProfiles(memberships.map((membership) => membership.profile_id));
  const membershipIds = memberships.map((membership) => membership.id);
  const permissionsByMembership = new Map<string, string[]>();

  if (membershipIds.length > 0) {
    const { data: permissionRows, error: permissionError } = await admin
      .from("business_member_permissions")
      .select("membership_id,permission")
      .in("membership_id", membershipIds);
    if (permissionError) throw new Error(permissionError.message);
    for (const row of (permissionRows ?? []) as Array<{ membership_id: string; permission: string }>) {
      const permissions = permissionsByMembership.get(row.membership_id) ?? [];
      permissions.push(row.permission);
      permissionsByMembership.set(row.membership_id, permissions);
    }
  }

  const summary = toSummary(business, memberships, modules, profiles);
  return {
    ...summary,
    updatedAt: business.updated_at,
    suspendedAt: business.suspended_at,
    invitations: (invitationResult.data ?? []).map((invitation) => ({
      id: invitation.id,
      businessId: invitation.business_id,
      email: invitation.email,
      role: invitation.intended_role as Exclude<BusinessRole, "primary_owner">,
      permissions: invitation.permissions ?? [],
      expiresAt: invitation.expires_at,
      deliveryStatus: invitation.delivery_status as "pending" | "sent" | "failed",
      deliveryError: invitation.delivery_error,
      expired: invitationState({ status: "pending", expires_at: invitation.expires_at }) === "expired",
    })),
    members: memberships.flatMap((membership) => {
      const profile = profiles.get(membership.profile_id);
      return profile
        ? [{
            id: membership.id,
            businessId: membership.business_id,
            profileId: membership.profile_id,
            role: membership.role,
            status: membership.status,
            joinedAt: membership.joined_at,
            suspendedAt: membership.suspended_at,
            profile,
            permissions: permissionsByMembership.get(membership.id) ?? [],
          }]
        : [];
    }),
  };
});

export const loadAdminBusinessActivity = cache(async (businessId: string): Promise<AdminAuditEvent[]> => {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("audit_events")
    .select("id,actor_profile_id,event_type,entity_type,reason,before_data,after_data,created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(150);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    id: string;
    actor_profile_id: string | null;
    event_type: string;
    entity_type: string | null;
    reason: string | null;
    before_data: Record<string, unknown> | null;
    after_data: Record<string, unknown> | null;
    created_at: string;
  }>;
  const profiles = await loadProfiles(rows.flatMap((row) => row.actor_profile_id ? [row.actor_profile_id] : []));
  return rows.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    entityType: row.entity_type,
    reason: row.reason,
    beforeData: row.before_data,
    afterData: row.after_data,
    createdAt: row.created_at,
    actor: row.actor_profile_id ? profiles.get(row.actor_profile_id) ?? null : null,
  }));
});

export const loadAdminSupportSessions = cache(async (businessId: string): Promise<AdminSupportSession[]> => {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("business_support_sessions")
    .select("id,admin_profile_id,reason,started_at,expires_at,ended_at")
    .eq("business_id", businessId)
    .order("started_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    id: string;
    admin_profile_id: string;
    reason: string;
    started_at: string;
    expires_at: string;
    ended_at: string | null;
  }>;
  const profiles = await loadProfiles(rows.map((row) => row.admin_profile_id));
  return rows.map((row) => ({
    id: row.id,
    reason: row.reason,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    endedAt: row.ended_at,
    admin: profiles.get(row.admin_profile_id) ?? null,
  }));
});

export const loadPendingBusinessRequests = cache(async (): Promise<AdminBusinessRequest[]> => {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("business_creation_requests")
    .select("id,requested_by,requested_name,requested_modules,note,created_at")
    .eq("status", "pending")
    .order("created_at");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ id: string; requested_by: string; requested_name: string; requested_modules: BusinessType[]; note: string | null; created_at: string }>;
  const profiles = await loadProfiles(rows.map((row) => row.requested_by));
  return rows.flatMap((row) => {
    const requester = profiles.get(row.requested_by);
    return requester ? [{
      id: row.id,
      requestedName: row.requested_name,
      requestedModules: row.requested_modules,
      note: row.note,
      createdAt: row.created_at,
      requester: { id: requester.id, fullName: requester.fullName, email: requester.email },
    }] : [];
  });
});
