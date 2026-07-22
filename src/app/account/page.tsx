import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { createAdminClient } from "@/lib/supabase/server";
import { invitationState } from "@/lib/invitations";
import { loadAllBusinessAccesses, requireIdentity } from "@/lib/tenancy";
import type { BusinessCreationRequest, BusinessInvitation, BusinessRole, BusinessType } from "@/lib/types";
import AccountClient from "./account-client";

export default async function AccountPage() {
  const { user, profile } = await requireIdentity();
  const admin = createAdminClient();
  const [allAccesses, invitationResult, requestResult] = await Promise.all([
    loadAllBusinessAccesses(user.id),
    admin.from("business_invitations").select("id,business_id,email,intended_role,permissions,status,expires_at,delivery_status,delivery_error,created_at,updated_at").ilike("email", profile.email).eq("status", "pending").order("created_at", { ascending: false }),
    admin.from("business_creation_requests").select("id,requested_by,requested_name,requested_modules,note,status,reviewed_by,review_reason,reviewed_at,created_business_id,created_at,updated_at").eq("requested_by", user.id).order("created_at", { ascending: false }),
  ]);
  if (invitationResult.error) throw new Error(invitationResult.error.message);
  if (requestResult.error) throw new Error(requestResult.error.message);
  const inviteRows = (invitationResult.data ?? []) as Array<Omit<BusinessInvitation, "state"> & { status: "pending" | "accepted" | "declined" | "revoked" }>;
  const requestRows = (requestResult.data ?? []) as BusinessCreationRequest[];
  const businessIds = [...new Set([...inviteRows.map((row) => row.business_id), ...requestRows.flatMap((row) => row.created_business_id ? [row.created_business_id] : [])])];
  const { data: linkedBusinesses, error: businessError } = businessIds.length
    ? await admin.from("businesses").select("id,name,slug").in("id", businessIds)
    : { data: [], error: null };
  if (businessError) throw new Error(businessError.message);
  const businessMap = new Map((linkedBusinesses ?? []).map((business) => [business.id, business]));

  return <main className="account-page">
    <header className="account-header"><div><p className="eyebrow">Lenden account</p><h1>Profile, businesses and access</h1><p>Signed in as {profile.email}</p></div><div className="account-header-actions">{profile.platform_role === "platform_admin" ? <Link className="secondary-button" href="/admin/businesses">Platform admin</Link> : null}<form action={logoutAction}><button className="secondary-button" type="submit">Sign out</button></form></div></header>
    <AccountClient
      profile={{ fullName: profile.full_name, email: profile.email }}
      signInMethods={[...new Set((user.identities ?? []).map((identity) => identity.provider === "email" ? "Email and password" : identity.provider === "google" ? "Google" : identity.provider))]}
      accesses={allAccesses.map(({ business, membership }) => ({ businessId: business.id, name: business.name, slug: business.slug, role: membership.role as BusinessRole, status: membership.status, businessStatus: business.status }))}
      invitations={inviteRows.map((row) => ({ id: row.id, businessName: businessMap.get(row.business_id)?.name ?? "Business", role: row.intended_role, state: invitationState(row), expiresAt: row.expires_at }))}
      requests={requestRows.map((row) => ({ id: row.id, name: row.requested_name, modules: row.requested_modules as BusinessType[], status: row.status, reason: row.review_reason, createdAt: row.created_at, businessSlug: row.created_business_id ? businessMap.get(row.created_business_id)?.slug ?? null : null }))}
    />
  </main>;
}
