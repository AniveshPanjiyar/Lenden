import "server-only";

import { invitationState } from "@/lib/invitations";
import { createAdminClient } from "@/lib/supabase/server";
import { loadAllBusinessAccesses, requireIdentity } from "@/lib/tenancy";
import type {
  BusinessCreationRequest,
  BusinessInvitation,
  BusinessRole,
  BusinessType,
  LinkedIdentitySummary,
  UserSettingsPayload,
} from "@/lib/types";

function storageObjectPath(value: string, bucket: string) {
  if (!/^https?:\/\//i.test(value)) return value;
  try {
    const pathname = decodeURIComponent(new URL(value).pathname);
    const markers = [
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/sign/${bucket}/`,
    ];
    const marker = markers.find((item) => pathname.includes(item));
    return marker ? pathname.split(marker)[1] ?? value : value;
  } catch {
    return value;
  }
}

async function signedAvatarUrl(avatarPath: string | null) {
  if (!avatarPath || avatarPath.startsWith("data:")) return avatarPath;
  const path = storageObjectPath(avatarPath, "profile-photos");
  if (/^https?:\/\//i.test(path)) return path;
  const { data } = await createAdminClient()
    .storage
    .from("profile-photos")
    .createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

function identitySummary(identity: {
  id: string;
  provider?: string;
  identity_data?: Record<string, unknown>;
  created_at?: string;
}): LinkedIdentitySummary {
  const identityEmail = identity.identity_data?.email;
  return {
    id: identity.id,
    provider: identity.provider ?? "unknown",
    email: typeof identityEmail === "string" ? identityEmail : null,
    createdAt: identity.created_at ?? null,
  };
}

export async function loadUserSettings(): Promise<{
  payload: UserSettingsPayload;
  hasActiveBusiness: boolean;
}> {
  const { user, profile } = await requireIdentity();
  const admin = createAdminClient();
  const [allAccesses, invitationResult, requestResult, avatarUrl] = await Promise.all([
    loadAllBusinessAccesses(user.id),
    admin
      .from("business_invitations")
      .select("id,business_id,email,intended_role,permissions,status,expires_at,delivery_status,delivery_error,created_at,updated_at")
      .ilike("email", profile.email)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    admin
      .from("business_creation_requests")
      .select("id,requested_by,requested_name,requested_modules,note,status,reviewed_by,review_reason,reviewed_at,created_business_id,created_at,updated_at")
      .eq("requested_by", user.id)
      .order("created_at", { ascending: false }),
    signedAvatarUrl(profile.avatar_url),
  ]);
  if (invitationResult.error) throw new Error(invitationResult.error.message);
  if (requestResult.error) throw new Error(requestResult.error.message);

  const invitationRows = (invitationResult.data ?? []) as Array<
    Omit<BusinessInvitation, "state"> & {
      status: "pending" | "accepted" | "declined" | "revoked";
    }
  >;
  const requestRows = (requestResult.data ?? []) as BusinessCreationRequest[];
  const linkedBusinessIds = [
    ...new Set([
      ...invitationRows.map((row) => row.business_id),
      ...requestRows.flatMap((row) => (
        row.created_business_id ? [row.created_business_id] : []
      )),
    ]),
  ];
  const { data: linkedBusinesses, error: businessError } = linkedBusinessIds.length
    ? await admin.from("businesses").select("id,name,slug").in("id", linkedBusinessIds)
    : { data: [], error: null };
  if (businessError) throw new Error(businessError.message);
  const businessMap = new Map((linkedBusinesses ?? []).map((business) => [business.id, business]));

  const accesses = allAccesses.map(({ business, membership }) => ({
    businessId: business.id,
    name: business.name,
    slug: business.slug,
    role: membership.role as BusinessRole,
    status: membership.status,
    businessStatus: business.status,
    canManage: membership.status === "active"
      && business.status === "active"
      && (membership.role === "primary_owner" || membership.role === "co_owner"),
  }));

  return {
    hasActiveBusiness: accesses.some((item) => (
      item.status === "active" && item.businessStatus === "active"
    )),
    payload: {
      profile: {
        id: profile.id,
        fullName: profile.full_name,
        email: profile.email,
        avatarPath: profile.avatar_url,
        avatarUrl,
        platformRole: profile.platform_role,
      },
      identities: (user.identities ?? []).map(identitySummary),
      accesses,
      invitations: invitationRows.map((row) => ({
        id: row.id,
        businessName: businessMap.get(row.business_id)?.name ?? "Business",
        role: row.intended_role,
        state: invitationState(row),
        expiresAt: row.expires_at,
      })),
      requests: requestRows.map((row) => ({
        id: row.id,
        name: row.requested_name,
        modules: row.requested_modules as BusinessType[],
        status: row.status,
        reason: row.review_reason,
        createdAt: row.created_at,
        businessSlug: row.created_business_id
          ? businessMap.get(row.created_business_id)?.slug ?? null
          : null,
      })),
      supportEmail: process.env.SUPPORT_EMAIL?.trim() || "support@margdarshakss.com",
    },
  };
}
