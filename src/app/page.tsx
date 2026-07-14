import { redirect } from "next/navigation";
import { loadAvailableBusinesses, requireIdentity } from "@/lib/tenancy";

export default async function Home() {
  const { user, profile } = await requireIdentity();
  if (profile.must_change_password) redirect("/change-password");
  if (profile.platform_role === "platform_admin") redirect("/admin/businesses");

  const available = await loadAvailableBusinesses(user.id);
  const last = available.find(({ business }) => business.id === profile.last_business_id);
  const destination = last ?? available[0];
  if (destination) redirect(`/b/${destination.business.slug}`);

  redirect("/access-pending");
}
