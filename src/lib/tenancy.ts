import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type {
  AppRole,
  Business,
  BusinessContext,
  BusinessMembership,
  BusinessRole,
  BusinessType,
  PlatformRole,
  Profile,
} from "@/lib/types";

type IdentityProfile = Omit<Profile, "membership_role" | "membership_status" | "role"> & {
  platform_role: PlatformRole;
};

export class BusinessAccessError extends Error {
  constructor(
    message: string,
    readonly status = 403,
    readonly details?: {
      reason: "business_suspended" | "membership_suspended";
      business: Pick<Business, "id" | "name" | "slug" | "status">;
    },
  ) {
    super(message);
    this.name = "BusinessAccessError";
  }
}

export function businessRoleToAppRole(role: BusinessRole): AppRole {
  if (role === "primary_owner") return "admin";
  if (role === "co_owner") return "owner";
  return role;
}

export function isBusinessOwner(role: BusinessRole | null | undefined) {
  return role === "primary_owner" || role === "co_owner";
}

export function isPrimaryOwner(role: BusinessRole | null | undefined) {
  return role === "primary_owner";
}

export function canManageBusinessMemberRole(
  actorRole: BusinessRole | null | undefined,
  targetRole: BusinessRole,
  accessMode: BusinessContext["accessMode"] = "member",
) {
  if (targetRole === "primary_owner") return false;
  if (accessMode === "support") return true;
  if (actorRole === "primary_owner") return true;
  return actorRole === "co_owner" && (targetRole === "staff" || targetRole === "sales_agent");
}

export function isBusinessSalesAgent(role: BusinessRole | null | undefined) {
  return role === "sales_agent";
}

export async function requireIdentity(options: { allowPasswordChange?: boolean } = {}) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");
  if (!user.email || !user.email_confirmed_at) {
    redirect("/login?error=Verify%20your%20email%20before%20opening%20Lenden.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,full_name,avatar_url,platform_role,account_status,must_change_password,last_business_id,active")
    .eq("id", user.id)
    .single();
  if (error || !data || !data.active || data.account_status !== "active") {
    redirect("/login?error=inactive");
  }
  if (data.must_change_password && !options.allowPasswordChange) {
    redirect("/change-password");
  }

  return { user, profile: data as IdentityProfile };
}

export async function loadAvailableBusinesses(userId: string) {
  const supabase = await createClient();
  const { data: membershipRows, error: membershipError } = await supabase
    .from("business_memberships")
    .select("id,business_id,profile_id,role,status,joined_at")
    .eq("profile_id", userId)
    .eq("status", "active");
  if (membershipError) throw new BusinessAccessError(membershipError.message, 500);

  const memberships = (membershipRows ?? []) as BusinessMembership[];
  if (memberships.length === 0) return [];

  const { data: businessRows, error: businessError } = await supabase
    .from("businesses")
    .select("id,name,slug,status,timezone,currency,created_at")
    .in("id", memberships.map((membership) => membership.business_id))
    .eq("status", "active")
    .order("name");
  if (businessError) throw new BusinessAccessError(businessError.message, 500);

  const businesses = new Map(((businessRows ?? []) as Business[]).map((business) => [business.id, business]));
  return memberships.flatMap((membership) => {
    const business = businesses.get(membership.business_id);
    return business ? [{ business, membership }] : [];
  });
}

export async function loadAllBusinessAccesses(userId: string) {
  const admin = createAdminClient();
  const { data: membershipRows, error: membershipError } = await admin
    .from("business_memberships")
    .select("id,business_id,profile_id,role,status,joined_at")
    .eq("profile_id", userId);
  if (membershipError) throw new BusinessAccessError(membershipError.message, 500);

  const memberships = (membershipRows ?? []) as BusinessMembership[];
  if (memberships.length === 0) return [];

  const { data: businessRows, error: businessError } = await admin
    .from("businesses")
    .select("id,name,slug,status,timezone,currency,created_at")
    .in("id", memberships.map((membership) => membership.business_id))
    .order("name");
  if (businessError) throw new BusinessAccessError(businessError.message, 500);

  const businesses = new Map(((businessRows ?? []) as Business[]).map((business) => [business.id, business]));
  return memberships.flatMap((membership) => {
    const business = businesses.get(membership.business_id);
    return business ? [{ business, membership }] : [];
  });
}

export async function resolveBusinessContext(identifier: { id?: string; slug?: string }): Promise<{
  identity: IdentityProfile;
  context: BusinessContext;
}> {
  const { user, profile } = await requireIdentity();
  const available = await loadAvailableBusinesses(user.id);
  const memberMatch = available.find(({ business }) =>
    identifier.id ? business.id === identifier.id : business.slug === identifier.slug,
  );

  let business = memberMatch?.business ?? null;
  const membership = memberMatch?.membership ?? null;
  let supportSession: BusinessContext["supportSession"] = null;
  let accessMode: BusinessContext["accessMode"] = "member";

  if (!business && profile.platform_role === "platform_admin") {
    const supabase = await createClient();
    let query = supabase
      .from("businesses")
      .select("id,name,slug,status,timezone,currency,created_at")
      .eq("status", "active");
    query = identifier.id ? query.eq("id", identifier.id) : query.eq("slug", identifier.slug ?? "");
    const { data: supportBusiness, error: businessError } = await query.maybeSingle();
    if (businessError) throw new BusinessAccessError(businessError.message, 500);

    if (supportBusiness) {
      const now = new Date().toISOString();
      const { data: session, error: sessionError } = await supabase
        .from("business_support_sessions")
        .select("id,reason,expires_at")
        .eq("admin_profile_id", user.id)
        .eq("business_id", supportBusiness.id)
        .is("ended_at", null)
        .gt("expires_at", now)
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sessionError) throw new BusinessAccessError(sessionError.message, 500);
      if (session) {
        business = supportBusiness as Business;
        supportSession = session as BusinessContext["supportSession"];
        accessMode = "support";
      }
    }
  }

  if (!business) {
    const allAccess = await loadAllBusinessAccesses(user.id);
    const inaccessibleMatch = allAccess.find(({ business: candidate }) =>
      identifier.id ? candidate.id === identifier.id : candidate.slug === identifier.slug,
    );
    if (inaccessibleMatch?.business.status === "suspended") {
      throw new BusinessAccessError("This business is inactive.", 403, {
        reason: "business_suspended",
        business: inaccessibleMatch.business,
      });
    }
    if (inaccessibleMatch?.membership.status === "suspended") {
      throw new BusinessAccessError("Your access to this business is suspended.", 403, {
        reason: "membership_suspended",
        business: inaccessibleMatch.business,
      });
    }
    throw new BusinessAccessError("You do not have access to this business.");
  }

  if (membership && profile.last_business_id !== business.id) {
    const identityClient = await createClient();
    await identityClient.from("profiles").update({ last_business_id: business.id }).eq("id", user.id);
    profile.last_business_id = business.id;
  }

  const tenantClient = await createClient({ businessId: business.id });
  const membershipId = membership?.id;
  const [permissionsResult, modulesResult] = await Promise.all([
    membershipId
      ? tenantClient.from("business_member_permissions").select("permission").eq("membership_id", membershipId)
      : Promise.resolve({ data: [], error: null }),
    tenantClient.from("business_modules").select("module").eq("business_id", business.id).eq("enabled", true),
  ]);
  if (permissionsResult.error) throw new BusinessAccessError(permissionsResult.error.message, 500);
  if (modulesResult.error) throw new BusinessAccessError(modulesResult.error.message, 500);

  return {
    identity: profile,
    context: {
      business,
      membership,
      permissions: (permissionsResult.data ?? []).map((row) => String(row.permission)),
      enabledModules: (modulesResult.data ?? []).map((row) => row.module as BusinessType),
      accessMode,
      supportSession,
      availableBusinesses: available.map((item) => ({
        business: item.business,
        role: item.membership.role,
      })),
    },
  };
}

/**
 * Lightweight access resolution for authenticated operational read APIs.
 * It deliberately avoids loading every business a user belongs to and never
 * updates last_business_id. Full workspace navigation still uses
 * resolveBusinessContext on the server-rendered entry route.
 */
export async function resolveBusinessReadContext(businessId: string): Promise<{
  identity: IdentityProfile;
  context: BusinessContext;
}> {
  const { user, profile } = await requireIdentity();
  const identityClient = await createClient();
  const [businessResult, membershipResult] = await Promise.all([
    identityClient
      .from("businesses")
      .select("id,name,slug,status,timezone,currency,created_at")
      .eq("id", businessId)
      .maybeSingle(),
    identityClient
      .from("business_memberships")
      .select("id,business_id,profile_id,role,status,joined_at")
      .eq("business_id", businessId)
      .eq("profile_id", user.id)
      .maybeSingle(),
  ]);

  if (businessResult.error) throw new BusinessAccessError(businessResult.error.message, 500);
  if (membershipResult.error) throw new BusinessAccessError(membershipResult.error.message, 500);

  const business = businessResult.data as Business | null;
  const membership = membershipResult.data as BusinessMembership | null;
  if (!business || !membership || membership.status !== "active" || business.status !== "active") {
    if (profile.platform_role === "platform_admin") {
      return resolveBusinessContext({ id: businessId });
    }
    if (business && business.status !== "active") {
      throw new BusinessAccessError("This business is inactive.");
    }
    if (business && membership?.status === "suspended") {
      throw new BusinessAccessError("Your access to this business is suspended.");
    }
    throw new BusinessAccessError("You do not have access to this business.");
  }

  const tenantClient = await createClient({ businessId });
  const [permissionsResult, modulesResult] = await Promise.all([
    tenantClient
      .from("business_member_permissions")
      .select("permission")
      .eq("membership_id", membership.id),
    tenantClient
      .from("business_modules")
      .select("module")
      .eq("business_id", businessId)
      .eq("enabled", true),
  ]);
  if (permissionsResult.error) throw new BusinessAccessError(permissionsResult.error.message, 500);
  if (modulesResult.error) throw new BusinessAccessError(modulesResult.error.message, 500);

  return {
    identity: profile,
    context: {
      business,
      membership,
      permissions: (permissionsResult.data ?? []).map((row) => String(row.permission)),
      enabledModules: (modulesResult.data ?? []).map((row) => row.module as BusinessType),
      accessMode: "member",
      supportSession: null,
      availableBusinesses: [{ business, role: membership.role }],
    },
  };
}

export async function resolveBusinessContextFromRequest() {
  const requestHeaders = await headers();
  const referer = requestHeaders.get("referer");
  let slug: string | null = null;
  if (referer) {
    try {
      const segments = new URL(referer).pathname.split("/").filter(Boolean);
      if (segments[0] === "b" && segments[1]) slug = decodeURIComponent(segments[1]);
    } catch {
      slug = null;
    }
  }
  if (!slug) throw new BusinessAccessError("Open a business before performing this action.", 400);
  return resolveBusinessContext({ slug });
}

export function profileForBusiness(
  identity: IdentityProfile,
  role: BusinessRole,
  status: BusinessMembership["status"] = "active",
): Profile {
  return {
    ...identity,
    membership_role: role,
    membership_status: status,
    role: businessRoleToAppRole(role),
  };
}
