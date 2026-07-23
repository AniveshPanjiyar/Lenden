import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions";
import { ReturnAwareLink } from "@/components/return-aware-link";
import { requireIdentity } from "@/lib/tenancy";
import AdminBackLink from "./admin-back-link";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireIdentity();
  if (profile.platform_role !== "platform_admin") redirect("/");

  return (
    <div className="platform-admin-shell">
      <header className="platform-admin-topbar">
        <AdminBackLink />
        <ReturnAwareLink className="platform-admin-brand" href="/admin/businesses" aria-label="Lenden platform admin home">
          <span aria-hidden="true">L</span>
          <strong>Lenden Admin</strong>
        </ReturnAwareLink>
        <nav aria-label="Platform admin">
          <ReturnAwareLink href="/admin/businesses">Businesses</ReturnAwareLink>
          <ReturnAwareLink href="/admin/businesses/requests">Requests</ReturnAwareLink>
        </nav>
        <div className="platform-admin-account">
          <ReturnAwareLink href="/settings?section=profile">{profile.full_name}</ReturnAwareLink>
          <form action={logoutAction}><button className="admin-link-button" type="submit">Sign out</button></form>
        </div>
      </header>
      {children}
    </div>
  );
}
