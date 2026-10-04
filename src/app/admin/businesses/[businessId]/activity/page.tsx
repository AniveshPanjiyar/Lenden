import { notFound } from "next/navigation";
import { INDIA_TIME_ZONE } from "@/lib/constants";
import { loadAdminBusiness, loadAdminBusinessActivity } from "../../admin-data";

const eventLabels: Record<string, string> = {
  business_created: "Business created",
  business_activated: "Business activated",
  business_active: "Business activated",
  business_suspended: "Business suspended",
  business_modules_updated: "Modules updated",
  membership_created: "Business user added",
  membership_reactivated: "Business access activated",
  membership_suspended: "Business access suspended",
  staff_permissions_updated: "Staff permissions updated",
  primary_owner_password_reset: "Owner temporary password generated",
  member_password_reset: "Member password reset",
  support_session_started: "Support session started",
  primary_ownership_transferred: "Ownership transferred",
  platform_primary_owner_recovery: "Ownership transferred by platform admin",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: INDIA_TIME_ZONE, dateStyle: "medium", timeStyle: "medium" }).format(new Date(value));
}

function safeAuditData(value: Record<string, unknown> | null) {
  if (!value) return null;
  const blocked = /(password|secret|token|credential)/i;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !blocked.test(key)));
}

export default async function BusinessActivityPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const [business, events] = await Promise.all([loadAdminBusiness(businessId), loadAdminBusinessActivity(businessId)]);
  if (!business) notFound();

  return (
    <section className="admin-content-card">
      <div className="admin-section-heading"><p className="eyebrow">Audit trail</p><h2>Activity</h2><p>Business creation, access, modules, support, password recovery, and ownership changes.</p></div>
      {events.length > 0 ? (
        <div className="admin-activity-list">
          {events.map((event) => {
            const before = safeAuditData(event.beforeData);
            const after = safeAuditData(event.afterData);
            const hasDetails = (before && Object.keys(before).length > 0) || (after && Object.keys(after).length > 0);
            return (
              <article key={event.id}>
                <div className="admin-activity-icon" aria-hidden="true">•</div>
                <div>
                  <header><strong>{eventLabels[event.eventType] ?? event.eventType.replaceAll("_", " ")}</strong><time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time></header>
                  <p>By {event.actor ? `${event.actor.fullName} · ${event.actor.email}` : "System or deleted administrator"}</p>
                  {event.reason ? <p><strong>Reason:</strong> {event.reason}</p> : null}
                  {hasDetails ? (
                    <details>
                      <summary>View recorded changes</summary>
                      <div className="admin-audit-data">
                        {before && Object.keys(before).length > 0 ? <div><strong>Before</strong><pre>{JSON.stringify(before, null, 2)}</pre></div> : null}
                        {after && Object.keys(after).length > 0 ? <div><strong>After</strong><pre>{JSON.stringify(after, null, 2)}</pre></div> : null}
                      </div>
                    </details>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : <div className="admin-empty-state"><h3>No activity recorded</h3><p>New admin actions for this business will appear here.</p></div>}
    </section>
  );
}
