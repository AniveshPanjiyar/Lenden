import { logoutAction } from "@/app/actions";
import Link from "next/link";
import { Building2, CirclePause, LogOut } from "lucide-react";

export default async function AccessPendingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const reason = typeof params.reason === "string" ? params.reason : "";
  const businessName = typeof params.business === "string" && params.business.trim() ? params.business.trim() : "This business";
  const businessSuspended = reason === "business_suspended";
  const membershipSuspended = reason === "membership_suspended";

  return (
    <main className="auth-page business-inactive-page">
      <section className="auth-card business-inactive-card">
        <div className="business-inactive-icon" aria-hidden="true">
          {businessSuspended ? <Building2 size={38} /> : <CirclePause size={38} />}
        </div>
        <span className="business-inactive-status">{businessSuspended ? "BUSINESS INACTIVE" : membershipSuspended ? "ACCESS SUSPENDED" : "ACCESS PENDING"}</span>
        <p className="eyebrow">Lenden access</p>
        <h1>{businessSuspended ? `${businessName} is inactive` : membershipSuspended ? `Access to ${businessName} is suspended` : "Your account is ready"}</h1>
        <p>{businessSuspended
          ? "The business has been suspended by the platform administrator. Your Lenden account remains active and you can continue using any other active business."
          : membershipSuspended
            ? "Your account is still active, but your membership for this business has been suspended. Contact the Owner to reactivate it."
            : "You do not have active business access yet. Ask a business owner or platform administrator to create your membership."}</p>
        {(businessSuspended || membershipSuspended) ? <Link className="secondary-button" href="/">Open another business</Link> : null}
        <form action={logoutAction}>
          <button className="primary-button" type="submit"><LogOut size={18} /> Sign out</button>
        </form>
      </section>
    </main>
  );
}
