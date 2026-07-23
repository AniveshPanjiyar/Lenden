import { notFound } from "next/navigation";
import { ReturnAwareLink } from "@/components/return-aware-link";
import { loadAdminBusiness } from "../admin-data";
import BusinessDetailNav from "./business-detail-nav";

export default async function BusinessDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const business = await loadAdminBusiness(businessId);
  if (!business) notFound();

  return (
    <main className="platform-admin-main">
      <div className="admin-breadcrumbs"><ReturnAwareLink href="/admin/businesses">Businesses</ReturnAwareLink><span>/</span><span>{business.name}</span></div>
      <header className="admin-business-detail-header">
        <div>
          <div className="admin-title-status"><h1>{business.name}</h1><span className={`status-pill ${business.status}`}>{business.status}</span></div>
          <p>/{business.slug} · {business.currency} · {business.timezone}</p>
        </div>
        <ReturnAwareLink className="secondary-button" href={`/b/${business.slug}`}>Open business workspace</ReturnAwareLink>
      </header>
      <BusinessDetailNav businessId={business.id} />
      <div className="admin-detail-content">{children}</div>
    </main>
  );
}
