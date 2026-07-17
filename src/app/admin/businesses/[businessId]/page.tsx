import { notFound } from "next/navigation";
import { businessLabels } from "@/lib/constants";
import { loadAdminBusiness } from "../admin-data";
import BusinessStatusAction from "../business-status-action";
import ModuleSettingsForm from "./module-settings-form";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function BusinessOverviewPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const business = await loadAdminBusiness(businessId);
  if (!business) notFound();

  return (
    <div className="admin-detail-grid">
      <section className="admin-content-card span-2">
        <div className="admin-section-heading"><p className="eyebrow">Business controls</p><h2>Status</h2></div>
        <div className="admin-impact-row">
          <div>
            <strong>{business.status === "active" ? "Business is active" : "Business is suspended"}</strong>
            <p>{business.status === "active" ? "Members can access this business according to their individual membership status." : "Every member is blocked from this business. Data and transaction history remain preserved."}</p>
          </div>
          <BusinessStatusAction businessId={business.id} businessName={business.name} status={business.status} />
        </div>
      </section>

      <section className="admin-content-card">
        <div className="admin-section-heading"><p className="eyebrow">Tenant record</p><h2>Business details</h2></div>
        <dl className="admin-fact-list">
          <div><dt>Name</dt><dd>{business.name}</dd></div>
          <div><dt>URL slug</dt><dd>{business.slug}</dd></div>
          <div><dt>Timezone</dt><dd>{business.timezone}</dd></div>
          <div><dt>Currency</dt><dd>{business.currency}</dd></div>
          <div><dt>Created</dt><dd>{formatDate(business.createdAt)}</dd></div>
          <div><dt>Last updated</dt><dd>{formatDate(business.updatedAt)}</dd></div>
        </dl>
      </section>

      <section className="admin-content-card">
        <div className="admin-section-heading"><p className="eyebrow">People</p><h2>Access summary</h2></div>
        <dl className="admin-fact-list">
          <div><dt>Owner</dt><dd>{business.owner?.fullName ?? "Not assigned"}</dd></div>
          <div><dt>Active users</dt><dd>{business.activeUserCount}</dd></div>
          <div><dt>Suspended users</dt><dd>{business.members.filter((member) => member.status === "suspended").length}</dd></div>
          <div><dt>Managers</dt><dd>{business.members.filter((member) => member.role === "co_owner" && member.status === "active").length}</dd></div>
        </dl>
      </section>

      <section className="admin-content-card span-2">
        <div className="admin-section-heading"><p className="eyebrow">Configuration</p><h2>Modules</h2><p>Enabled now: {business.enabledModules.map((module) => businessLabels[module]).join(", ") || "None"}</p></div>
        <ModuleSettingsForm businessId={business.id} enabledModules={business.enabledModules} />
      </section>
    </div>
  );
}
