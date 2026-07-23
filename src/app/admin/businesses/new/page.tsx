import { ReturnAwareLink } from "@/components/return-aware-link";
import NewBusinessWizard from "../new-business-wizard";

export default function NewBusinessPage() {
  return (
    <main className="platform-admin-main narrow">
      <div className="admin-breadcrumbs"><ReturnAwareLink href="/admin/businesses">Businesses</ReturnAwareLink><span>/</span><span>New business</span></div>
      <header className="platform-admin-page-header">
        <div>
          <p className="eyebrow">Provision tenant</p>
          <h1>New business</h1>
          <p>Create the workspace, configure modules, and assign its first Owner in one reviewed flow.</p>
        </div>
      </header>
      <NewBusinessWizard />
    </main>
  );
}
