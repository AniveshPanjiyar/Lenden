import { redirect } from "next/navigation";
import { loadAvailableBusinesses, requireIdentity } from "@/lib/tenancy";
import { applyAppViewStateToSearchParams, parseAppViewState } from "@/lib/view-state";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const { user, profile } = await requireIdentity();
  if (profile.must_change_password) redirect("/change-password");

  const available = await loadAvailableBusinesses(user.id);
  const last = available.find(({ business }) => business.id === profile.last_business_id);
  const destination = last ?? available[0];
  if (destination) {
    const viewState = parseAppViewState(resolvedSearchParams, user.id);
    const canonical = applyAppViewStateToSearchParams(
      new URLSearchParams(),
      viewState,
      { profileId: user.id, studentSourceId: "library" },
    ).toString();
    redirect(`/b/${destination.business.slug}${canonical ? `?${canonical}` : ""}`);
  }

  if (profile.platform_role === "platform_admin") redirect("/admin/businesses");
  redirect("/settings?section=businesses");
}
