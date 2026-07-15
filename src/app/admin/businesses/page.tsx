import { logoutAction } from "@/app/actions";
import { createAdminClient } from "@/lib/supabase/server";
import { requireIdentity } from "@/lib/tenancy";
import { BusinessCreateForm } from "./business-admin-client";
import OwnerPasswordResetForm from "./owner-password-reset-form";
import { recoverPrimaryOwnerAction, setBusinessStatusAction, startSupportSessionAction } from "./actions";

export default async function BusinessAdminPage() {
  const { profile } = await requireIdentity();
  if (profile.platform_role !== "platform_admin") {
    return <main className="admin-console"><section className="admin-panel"><h1>Access denied</h1><p>Platform administrator access is required.</p></section></main>;
  }

  const admin = createAdminClient();
  const [{ data: businesses }, { data: memberships }, { data: profiles }] = await Promise.all([
    admin.from("businesses").select("id,name,slug,status,timezone,currency,created_at").order("created_at", { ascending: false }),
    admin.from("business_memberships").select("business_id,profile_id,role,status"),
    admin.from("profiles").select("id,full_name,email"),
  ]);
  const profileMap = new Map((profiles ?? []).map((item) => [item.id, item]));

  return (
    <main className="admin-console">
      <header className="admin-console-header">
        <div><p className="eyebrow">Lenden platform</p><h1>Businesses</h1><p>Create tenants, provision owners, and enter audited support mode.</p></div>
        <form action={logoutAction}><button className="secondary-button" type="submit">Sign out</button></form>
      </header>

      <section className="admin-panel">
        <h2>Create a business</h2>
        <BusinessCreateForm />
      </section>

      <section className="admin-business-grid" aria-label="Businesses">
        {(businesses ?? []).map((business) => {
          const businessMemberships = (memberships ?? []).filter((membership) => membership.business_id === business.id);
          const primary = businessMemberships.find((membership) => membership.role === "primary_owner" && membership.status === "active");
          const primaryProfile = primary ? profileMap.get(primary.profile_id) : null;
          const managers = businessMemberships.filter((membership) => membership.role === "co_owner" && membership.status === "active");
          return (
            <article className="admin-business-card" key={business.id}>
              <div className="admin-business-card-heading">
                <div><h2>{business.name}</h2><p>/{business.slug} · {business.currency} · {business.timezone}</p></div>
                <span className={`status-pill ${business.status}`}>{business.status}</span>
              </div>
              <dl>
                <div><dt>Owner</dt><dd>{primaryProfile ? `${primaryProfile.full_name} · ${primaryProfile.email}` : "Not assigned"}</dd></div>
                <div><dt>Active members</dt><dd>{businessMemberships.filter((membership) => membership.status === "active").length}</dd></div>
              </dl>
              <div className="admin-business-actions">
                {primary && primaryProfile ? (
                  <details className="owner-recovery-panel">
                    <summary>Owner login</summary>
                    <OwnerPasswordResetForm
                      businessId={business.id}
                      ownerName={primaryProfile.full_name}
                      profileId={primary.profile_id}
                    />
                  </details>
                ) : null}
                <form action={setBusinessStatusAction}>
                  <input type="hidden" name="business_id" value={business.id} />
                  <input type="hidden" name="status" value={business.status === "active" ? "suspended" : "active"} />
                  <button className="secondary-button" type="submit">{business.status === "active" ? "Suspend" : "Reactivate"}</button>
                </form>
                {business.status === "active" ? (
                  <form action={startSupportSessionAction} className="support-start-form">
                    <input type="hidden" name="business_id" value={business.id} />
                    <input type="hidden" name="business_slug" value={business.slug} />
                    <label>Support reason<input name="reason" minLength={5} placeholder="Customer ticket or reason" required /></label>
                    <button className="primary-button" type="submit">Start 30-minute support</button>
                  </form>
                ) : null}
                {managers.length > 0 ? (
                  <details className="owner-recovery-panel">
                    <summary>Owner recovery</summary>
                    <form action={recoverPrimaryOwnerAction} className="support-start-form">
                      <input type="hidden" name="business_id" value={business.id} />
                      <label>New Owner<select name="profile_id" required defaultValue=""><option value="" disabled>Choose Manager</option>{managers.map((membership) => {
                        const candidate = profileMap.get(membership.profile_id);
                        return <option key={membership.profile_id} value={membership.profile_id}>{candidate?.full_name ?? membership.profile_id}</option>;
                      })}</select></label>
                      <label>Recovery reason<input name="reason" minLength={10} required /></label>
                      <button className="danger-button" type="submit">Recover ownership</button>
                    </form>
                  </details>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
