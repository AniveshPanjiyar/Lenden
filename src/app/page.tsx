import { redirect } from "next/navigation";
import { loadAllBusinessAccesses, loadAvailableBusinesses, requireIdentity } from "@/lib/tenancy";

export default async function Home() {
  const { user, profile } = await requireIdentity();
  if (profile.must_change_password) redirect("/change-password");

  const available = await loadAvailableBusinesses(user.id);
  const last = available.find(({ business }) => business.id === profile.last_business_id);
  const destination = last ?? available[0];
  if (destination) redirect(`/b/${destination.business.slug}`);

  if (profile.platform_role === "platform_admin") redirect("/admin/businesses");

  const allAccess = await loadAllBusinessAccesses(user.id);
  const lastAccess = allAccess.find(({ business }) => business.id === profile.last_business_id);
  const inaccessible = lastAccess ?? allAccess[0];
  if (inaccessible) {
    const reason = inaccessible.business.status === "suspended" ? "business_suspended" : "membership_suspended";
    redirect(`/access-pending?reason=${reason}&business=${encodeURIComponent(inaccessible.business.name)}`);
  }

  redirect("/access-pending");
}
