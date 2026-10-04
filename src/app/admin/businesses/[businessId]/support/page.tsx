import { notFound } from "next/navigation";
import { INDIA_TIME_ZONE } from "@/lib/constants";
import { loadAdminBusiness, loadAdminSupportSessions } from "../../admin-data";
import SupportSessionForm from "./support-session-form";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: INDIA_TIME_ZONE, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function BusinessSupportPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const [business, sessions] = await Promise.all([loadAdminBusiness(businessId), loadAdminSupportSessions(businessId)]);
  if (!business) notFound();

  return (
    <div className="admin-detail-grid">
      <section className="admin-content-card">
        <div className="admin-section-heading"><p className="eyebrow">Audited access</p><h2>Start support session</h2><p>Support mode grants configuration access for no more than 30 minutes.</p></div>
        <div className="admin-info-callout"><strong>Scoped to this business</strong><p>The session is tied to your platform-admin identity and this business. It does not create a membership.</p></div>
        <SupportSessionForm businessId={business.id} businessName={business.name} disabled={business.status !== "active"} />
      </section>

      <section className="admin-content-card">
        <div className="admin-section-heading"><p className="eyebrow">Recent access</p><h2>Support sessions</h2></div>
        {sessions.length > 0 ? (
          <div className="admin-timeline">
            {sessions.map((session) => {
              const ended = Boolean(session.endedAt);
              return (
                <article key={session.id}>
                  <div className="admin-timeline-marker" aria-hidden="true" />
                  <div>
                    <header><strong>{session.admin?.fullName ?? "Platform administrator"}</strong><span className={`status-pill ${ended ? "suspended" : "active"}`}>{ended ? "Ended" : "Recorded"}</span></header>
                    <p>{session.reason}</p>
                    <span>{formatDate(session.startedAt)} → {formatDate(session.expiresAt)}</span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : <div className="admin-empty-state compact"><p>No support sessions have been recorded.</p></div>}
      </section>
    </div>
  );
}
