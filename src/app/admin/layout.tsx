import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions";
import { requireIdentity } from "@/lib/tenancy";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireIdentity();
  if (profile.platform_role !== "platform_admin") redirect("/");

  return (
    <div className="platform-admin-shell">
      <header className="platform-admin-topbar">
        <Link className="platform-admin-brand" href="/admin/businesses" aria-label="Lenden platform admin home">
          <span aria-hidden="true">L</span>
          <strong>Lenden Admin</strong>
        </Link>
        <nav aria-label="Platform admin">
          <Link href="/admin/businesses">Businesses</Link>
        </nav>
        <div className="platform-admin-account">
          <span>{profile.full_name}</span>
          <form action={logoutAction}><button className="admin-link-button" type="submit">Sign out</button></form>
        </div>
      </header>
      {children}
    </div>
  );
}
