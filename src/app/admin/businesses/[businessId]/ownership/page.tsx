import { ReturnAwareLink } from "@/components/return-aware-link";
import { notFound } from "next/navigation";
import { loadAdminBusiness } from "../../admin-data";
import OwnershipTransferForm from "./ownership-transfer-form";

export default async function BusinessOwnershipPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const business = await loadAdminBusiness(businessId);
  if (!business) notFound();
  const currentOwner = business.members.find((member) => member.role === "primary_owner" && member.status === "active") ?? null;
  const managers = business.members.filter((member) => member.role === "co_owner" && member.status === "active" && member.profile.active && member.profile.accountStatus === "active");

  return (
    <div className="admin-detail-grid">
      <section className="admin-content-card">
        <div className="admin-section-heading"><p className="eyebrow">Primary authority</p><h2>Current Owner</h2></div>
        {currentOwner ? (
          <div className="admin-owner-profile">
            <div className="admin-avatar" aria-hidden="true">{currentOwner.profile.fullName.slice(0, 1).toUpperCase()}</div>
            <div><strong>{currentOwner.profile.fullName}</strong><span>{currentOwner.profile.email}</span><span className="status-pill active">Owner · active</span></div>
          </div>
        ) : (
          <div className="admin-warning-callout">
            <strong>This legacy business has no active Owner</strong>
            <p>Add or reactivate an active Manager on the Users page, then assign ownership below.</p>
            <ReturnAwareLink className="secondary-button" href={`/admin/businesses/${business.id}/users`}>Manage users</ReturnAwareLink>
          </div>
        )}
        <div className="admin-role-note"><strong>Protected membership</strong><p>An active Owner cannot have business access suspended. Transfer ownership first.</p></div>
      </section>

      <section className="admin-content-card">
        <div className="admin-section-heading"><p className="eyebrow">Login security</p><h2>User-owned credentials</h2><p>Owners control their own Google identity or password. Platform administrators cannot generate or reset credentials.</p></div>
        <div className="admin-info-callout"><strong>Recovery path</strong><p>The Owner should use “Forgot password” on the Lenden sign-in page. Business access and login recovery remain separate.</p></div>
      </section>

      <section className="admin-content-card span-2">
        <div className="admin-section-heading"><p className="eyebrow">Atomic role change</p><h2>{currentOwner ? "Transfer ownership" : "Assign ownership"}</h2><p>Only an active Manager is eligible. A detailed admin reason is required.</p></div>
        <OwnershipTransferForm businessId={business.id} currentOwner={currentOwner} managers={managers} />
      </section>
    </div>
  );
}
