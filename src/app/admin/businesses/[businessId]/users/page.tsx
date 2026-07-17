import { notFound } from "next/navigation";
import { loadAdminBusiness } from "../../admin-data";
import BusinessUsersClient from "./business-users-client";

export default async function BusinessUsersPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const business = await loadAdminBusiness(businessId);
  if (!business) notFound();

  const members = [...business.members].sort((left, right) => {
    const roleOrder = { primary_owner: 0, co_owner: 1, staff: 2, sales_agent: 3 };
    return roleOrder[left.role] - roleOrder[right.role] || left.profile.fullName.localeCompare(right.profile.fullName);
  });
  return <BusinessUsersClient businessId={business.id} members={members} />;
}
