import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canManageBusinessMemberRole, isBusinessOwner, isPrimaryOwner, resolveBusinessContext } from "@/lib/tenancy";
import type { BusinessMembership, Profile } from "@/lib/types";
import {
  saveBusinessModulesAction,
  suspendBusinessMemberAction,
} from "./actions";
import { OwnershipTransferForm } from "./ownership-transfer-form";

export default async function BusinessManagePage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const { context } = await resolveBusinessContext({ slug: businessSlug });
  if (context.accessMode !== "support" && !isBusinessOwner(context.membership?.role)) {
    redirect(`/b/${businessSlug}`);
  }

  const client = await createClient({ businessId: context.business.id });
  const [{ data: memberships }, { data: profiles }, { data: modules }] = await Promise.all([
    client.from("business_memberships").select("id,business_id,profile_id,role,status,joined_at").eq("business_id", context.business.id).order("created_at"),
    client.from("profiles").select("id,email,full_name,avatar_url,platform_role,account_status,must_change_password,last_business_id,active").order("full_name"),
    client.from("business_modules").select("module,enabled").eq("business_id", context.business.id),
  ]);
  const profileMap = new Map(((profiles ?? []) as Array<Pick<Profile, "id" | "full_name" | "email" | "active">>).map((profile) => [profile.id, profile]));
  const memberRows = (memberships ?? []) as BusinessMembership[];
  const coOwners = memberRows.filter((membership) => membership.role === "co_owner" && membership.status === "active");
  const enabledModules = new Set((modules ?? []).filter((module) => module.enabled).map((module) => module.module));
  const canManageBusinessSettings = context.accessMode === "support" || isPrimaryOwner(context.membership?.role);

  return (
    <main className="business-manage-page">
      <header className="business-manage-header">
        <div><p className="eyebrow">{context.business.name}</p><h1>Business access & modules</h1><p>Membership changes and configuration events are audited.</p></div>
        <Link className="secondary-button" href={`/b/${businessSlug}`}>Back to app</Link>
      </header>

      {context.accessMode === "support" && context.supportSession ? (
        <div className="support-mode-banner"><strong>Audited support mode</strong><span>{context.supportSession.reason}</span><span>Expires {new Date(context.supportSession.expires_at).toLocaleString()}</span></div>
      ) : null}

      <section className="admin-panel">
        <h2>Enabled modules</h2>
        <p>{canManageBusinessSettings
          ? "Disabled modules stop new actions while keeping historical records."
          : "Only the primary owner can change business modules."}</p>
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

      <section className="admin-panel">
        <h2>User accounts</h2>
        <p>{isPrimaryOwner(context.membership?.role) || context.accessMode === "support"
          ? "Create co-owners, staff, and sales agents with a login email and temporary password."
          : "Create staff and sales agents with a login email and temporary password."}</p>
        <Link className="primary-button" href={`/b/${businessSlug}?tab=settings`}>Open user settings</Link>
      </section>

      {(context.accessMode !== "support" && isPrimaryOwner(context.membership?.role)) ? (
        <section className="admin-panel">
          <h2>Transfer primary ownership</h2>
          <p>The selected co-owner becomes primary owner atomically; you become a co-owner.</p>
          <OwnershipTransferForm
            businessName={context.business.name}
            candidates={coOwners.map((membership) => ({
              profileId: membership.profile_id,
              label: profileMap.get(membership.profile_id)?.full_name ?? membership.profile_id,
            }))}
          />
        </section>
      ) : null}

      <section className="admin-panel">
        <h2>Members</h2>
        <p>Removing access suspends the business membership and preserves historical records. The main owner cannot be removed.</p>
        <div className="member-list">{memberRows.map((membership) => {
          const member = profileMap.get(membership.profile_id);
          const canRemove = canManageBusinessMemberRole(context.membership?.role, membership.role, context.accessMode);
          return <article className="member-row" key={membership.id}>
            <div><strong>{member?.full_name ?? membership.profile_id}</strong><span>{member?.email}</span></div>
            <div><span className="status-pill">{membership.role.replace("_", " ")}</span><span className={`status-pill ${membership.status}`}>{membership.status}</span></div>
            {canRemove && membership.status === "active" ? <form action={suspendBusinessMemberAction}><input type="hidden" name="membership_id" value={membership.id} /><button className="text-button danger" type="submit">Remove access</button></form> : null}
          </article>;
        })}</div>
      </section>
    </main>
  );
}
