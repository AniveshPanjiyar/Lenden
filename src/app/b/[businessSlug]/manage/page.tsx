import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canManageBusinessMemberRole, isBusinessOwner, isPrimaryOwner, resolveBusinessContext } from "@/lib/tenancy";
import type { BusinessMembership, Profile } from "@/lib/types";
import {
  saveBusinessModulesAction,
} from "./actions";
import BusinessUsersSettings from "./business-users-settings";
import { OwnershipTransferForm } from "./ownership-transfer-form";

export default async function BusinessManagePage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const { identity, context } = await resolveBusinessContext({ slug: businessSlug });
  if (context.accessMode !== "support" && !isBusinessOwner(context.membership?.role)) {
    redirect(`/b/${businessSlug}`);
  }

  const client = await createClient({ businessId: context.business.id });
  const [{ data: memberships }, { data: profiles }, { data: modules }, { data: memberPermissions }] = await Promise.all([
    client.from("business_memberships").select("id,business_id,profile_id,role,status,joined_at").eq("business_id", context.business.id).order("created_at"),
    client.from("profiles").select("id,email,full_name,avatar_url,platform_role,account_status,must_change_password,last_business_id,active").order("full_name"),
    client.from("business_modules").select("module,enabled").eq("business_id", context.business.id),
    client.from("business_member_permissions").select("membership_id,permission"),
  ]);
  const profileMap = new Map(((profiles ?? []) as Array<Pick<Profile, "id" | "full_name" | "email" | "active">>).map((profile) => [profile.id, profile]));
  const memberRows = (memberships ?? []) as BusinessMembership[];
  const managers = memberRows.filter((membership) => membership.role === "co_owner" && membership.status === "active");
  const enabledModules = new Set((modules ?? []).filter((module) => module.enabled).map((module) => module.module));
  const canManageBusinessSettings = context.accessMode === "support" || isPrimaryOwner(context.membership?.role);
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
      canChangeStatus: canManageBusinessMemberRole(context.membership?.role, membership.role, context.accessMode),
      canResetPassword:
        context.accessMode === "member" &&
        isPrimaryOwner(context.membership?.role) &&
        membership.profile_id !== identity.id &&
        membership.role !== "primary_owner" &&
        membership.status === "active" &&
        Boolean(member?.active),
      permissions: permissionsByMembership[membership.id] ?? [],
    };
  });

  return (
    <main className="business-manage-page">
      <header className="business-manage-header">
        <div><p className="eyebrow">{context.business.name}</p><h1>Business settings</h1><p>Manage users, access, modules, and ownership. Every membership change is audited.</p></div>
        <Link className="secondary-button" href={`/b/${businessSlug}`}>Back to app</Link>
      </header>

      {context.accessMode === "support" && context.supportSession ? (
        <div className="support-mode-banner"><strong>Audited support mode</strong><span>{context.supportSession.reason}</span><span>Expires {new Date(context.supportSession.expires_at).toLocaleString()}</span></div>
      ) : null}

      <BusinessUsersSettings
        members={businessUsers}
        canCreateManager={context.accessMode === "member" && isPrimaryOwner(context.membership?.role)}
      />

      <section className="admin-panel">
        <h2>Enabled modules</h2>
        <p>{canManageBusinessSettings
          ? "Disabled modules stop new actions while keeping historical records."
          : "Only the Owner can change business modules."}</p>
        {canManageBusinessSettings ? (
          <form action={saveBusinessModulesAction} className="module-config-form">
            {(["library", "guest_house", "course", "general"] as const).map((module) => (
              <label key={module}><input type="checkbox" name="modules" value={module} defaultChecked={enabledModules.has(module)} /> {module.replace("_", " ")}</label>
            ))}
            <button className="primary-button" type="submit">Save modules</button>
          </form>
        ) : (
          <p className="muted">Active: {[...enabledModules].map((module) => String(module).replace("_", " ")).join(", ") || "none"}</p>
        )}
      </section>

      {(context.accessMode !== "support" && isPrimaryOwner(context.membership?.role)) ? (
        <section className="admin-panel">
          <h2>Transfer ownership</h2>
          <p>The selected Manager becomes the Owner atomically, and you become a Manager.</p>
          <OwnershipTransferForm
            businessName={context.business.name}
            candidates={managers.map((membership) => ({
              profileId: membership.profile_id,
              label: profileMap.get(membership.profile_id)?.full_name ?? membership.profile_id,
            }))}
          />
        </section>
      ) : null}

    </main>
  );
}
