import Link from "next/link";
import { redirect } from "next/navigation";
import { businessLabels } from "@/lib/constants";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { invitationState } from "@/lib/invitations";
import { canManageBusinessMemberRole, isBusinessOwner, isPrimaryOwner, resolveBusinessContext } from "@/lib/tenancy";
import type { BusinessMembership, Profile } from "@/lib/types";
import type { BusinessType } from "@/lib/types";
import {
  saveBusinessModulesAction,
} from "./actions";
import BusinessUsersSettings from "./business-users-settings";
import { OwnershipTransferForm } from "./ownership-transfer-form";

type ManageTab = "people" | "modules" | "ownership";

const moduleDescriptions: Record<BusinessType, string> = {
  library: "Library subscriptions, collections, and student records",
  guest_house: "Guest-house residents, rooms, and collections",
  course: "Course students, subscriptions, and collections",
  general: "General-purpose payments and collections",
};

export default async function BusinessManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { businessSlug } = await params;
  const { identity, context } = await resolveBusinessContext({ slug: businessSlug });
  if (context.accessMode !== "support" && !isBusinessOwner(context.membership?.role)) {
    redirect(`/b/${businessSlug}`);
  }

  const requestedTab = (await searchParams).tab;

  const client = await createClient({ businessId: context.business.id });
  const [{ data: memberships }, { data: profiles }, { data: modules }, { data: memberPermissions }, { data: invitations, error: invitationError }] = await Promise.all([
    client.from("business_memberships").select("id,business_id,profile_id,role,status,invited_at,joined_at,suspended_at,created_at,updated_at").eq("business_id", context.business.id).order("created_at"),
    client.from("profiles").select("id,email,full_name,avatar_url,platform_role,account_status,must_change_password,last_business_id,active").order("full_name"),
    client.from("business_modules").select("module,enabled").eq("business_id", context.business.id),
    client.from("business_member_permissions").select("membership_id,permission"),
    createAdminClient().from("business_invitations").select("id,email,intended_role,permissions,status,expires_at,delivery_status,delivery_error,last_sent_at,created_at,updated_at").eq("business_id", context.business.id).eq("status", "pending").order("created_at", { ascending: false }),
  ]);
  if (invitationError) throw new Error(invitationError.message);
  const profileMap = new Map(((profiles ?? []) as Array<Pick<Profile, "id" | "full_name" | "email" | "active">>).map((profile) => [profile.id, profile]));
  const memberRows = (memberships ?? []) as BusinessMembership[];
  const managers = memberRows.filter((membership) => membership.role === "co_owner" && membership.status === "active");
  const enabledModules = new Set((modules ?? []).filter((module) => module.enabled).map((module) => module.module));
  const canManageBusinessSettings = context.accessMode === "support" || isPrimaryOwner(context.membership?.role);
  const canTransferOwnership = context.accessMode === "member" && isPrimaryOwner(context.membership?.role);
  const availableTabs: ManageTab[] = ["people", ...(canManageBusinessSettings ? ["modules" as const] : []), ...(canTransferOwnership ? ["ownership" as const] : [])];
  const requestedTabValue = typeof requestedTab === "string" ? requestedTab : "people";
  const activeTab: ManageTab = availableTabs.includes(requestedTabValue as ManageTab) ? requestedTabValue as ManageTab : "people";
  const permissionsByMembership = (memberPermissions ?? []).reduce<Record<string, string[]>>((rows, permission) => {
    const membershipId = String(permission.membership_id);
    rows[membershipId] = [...(rows[membershipId] ?? []), String(permission.permission)];
    return rows;
  }, {});
  const businessUsers = memberRows.map((membership) => {
    const member = profileMap.get(membership.profile_id);
    return {
      membershipId: membership.id,
      profileId: membership.profile_id,
      fullName: member?.full_name ?? membership.profile_id,
      email: member?.email ?? "",
      role: membership.role,
      status: membership.status,
      profileActive: member?.active ?? false,
      canManage: canManageBusinessMemberRole(context.membership?.role, membership.role, context.accessMode),
      permissions: permissionsByMembership[membership.id] ?? [],
      joinedAt: membership.joined_at,
      suspendedAt: membership.suspended_at ?? null,
      updatedAt: membership.updated_at ?? null,
    };
  }).sort((left, right) => {
    const roleOrder = { primary_owner: 0, co_owner: 1, staff: 2, sales_agent: 3 };
    return roleOrder[left.role] - roleOrder[right.role] || left.fullName.localeCompare(right.fullName);
  });

  const enabledModuleList = (["library", "guest_house", "course", "general"] as BusinessType[]).filter((module) => enabledModules.has(module));

  return (
    <main className="business-manage-page">
      <header className="business-manage-header">
        <div><p className="eyebrow">{context.business.name}</p><h1>Business settings</h1><p>Manage users, access, modules, and ownership. Every membership change is audited.</p></div>
        <Link className="secondary-button" href={`/b/${businessSlug}`}>Back to app</Link>
      </header>

      {context.accessMode === "support" && context.supportSession ? (
        <div className="support-mode-banner"><strong>Audited support mode</strong><span>{context.supportSession.reason}</span><span>Expires {new Date(context.supportSession.expires_at).toLocaleString()}</span></div>
      ) : null}

      <nav aria-label="Business settings sections" className="business-settings-tabs">
        <Link aria-current={activeTab === "people" ? "page" : undefined} href={`/b/${businessSlug}/manage?tab=people`}>People & access</Link>
        {canManageBusinessSettings ? <Link aria-current={activeTab === "modules" ? "page" : undefined} href={`/b/${businessSlug}/manage?tab=modules`}>Business modules</Link> : null}
        {canTransferOwnership ? <Link aria-current={activeTab === "ownership" ? "page" : undefined} href={`/b/${businessSlug}/manage?tab=ownership`}>Ownership</Link> : null}
      </nav>

      {activeTab === "people" ? (
        <BusinessUsersSettings
          businessName={context.business.name}
          members={businessUsers}
          invitations={(invitations ?? []).map((invitation) => ({
            id: invitation.id,
            email: invitation.email,
            role: invitation.intended_role,
            permissions: invitation.permissions ?? [],
            state: invitationState(invitation) === "expired" ? "expired" as const : "pending" as const,
            expiresAt: invitation.expires_at,
            lastSentAt: invitation.last_sent_at,
            deliveryStatus: invitation.delivery_status,
            deliveryError: invitation.delivery_error,
            canManage: canManageBusinessMemberRole(context.membership?.role, invitation.intended_role, context.accessMode),
          }))}
          canCreateManager={context.accessMode === "support" || isPrimaryOwner(context.membership?.role)}
          canManageModules={canManageBusinessSettings}
          currentProfileId={identity.id}
          enabledModules={enabledModuleList}
        />
      ) : null}

      {activeTab === "modules" && canManageBusinessSettings ? (
        <section className="admin-panel business-modules-panel">
          <div className="business-users-heading">
            <div><p className="eyebrow">Business modules</p><h2>Choose how this business operates</h2><p>Disabling a module blocks new activity while preserving historical records and existing Staff grants.</p></div>
            <span className="status-pill active">{enabledModuleList.length} enabled</span>
          </div>
          <form action={saveBusinessModulesAction} className="business-module-config-form">
            <div className="business-module-config-grid">
              {(["library", "guest_house", "course", "general"] as BusinessType[]).map((module) => (
                <label key={module}>
                  <input type="checkbox" name="modules" value={module} defaultChecked={enabledModules.has(module)} />
                  <span><strong>{businessLabels[module]}</strong><small>{moduleDescriptions[module]}</small></span>
                </label>
              ))}
            </div>
            <div className="business-module-preservation-note"><strong>Safe to change</strong><span>Existing payments, students, and Staff grants are never deleted. Preserved Staff access returns when a module is enabled again.</span></div>
            <button className="primary-button" type="submit">Save business modules</button>
          </form>
        </section>
      ) : null}

      {activeTab === "ownership" && canTransferOwnership ? (
        <section className="admin-panel business-ownership-panel">
          <div className="business-users-heading"><div><p className="eyebrow">Ownership</p><h2>Transfer primary ownership</h2><p>Choose an active Manager and review the role swap before confirming.</p></div><span className="status-pill">1 protected Owner</span></div>
          <OwnershipTransferForm
            businessName={context.business.name}
            candidates={managers.map((membership) => ({
              profileId: membership.profile_id,
              label: profileMap.get(membership.profile_id)?.full_name ?? membership.profile_id,
              email: profileMap.get(membership.profile_id)?.email ?? "",
            }))}
          />
        </section>
      ) : null}

    </main>
  );
}
