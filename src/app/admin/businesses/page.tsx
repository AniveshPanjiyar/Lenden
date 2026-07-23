import { ReturnAwareLink } from "@/components/return-aware-link";
import { loadAdminBusinessDirectory } from "./admin-data";
import BusinessDirectoryClient from "./business-directory-client";

export default async function BusinessAdminPage() {
  const businesses = await loadAdminBusinessDirectory();

  return (
    <main className="platform-admin-main">
      <header className="platform-admin-page-header">
        <div>
          <p className="eyebrow">Platform workspace</p>
          <h1>Businesses</h1>
          <p>Open a business to manage its users, ownership, support access, modules, and activity.</p>
        </div>
        <ReturnAwareLink className="primary-button" href="/admin/businesses/new">New business</ReturnAwareLink>
      </header>
      <BusinessDirectoryClient businesses={businesses} />
    </main>
  );
}
