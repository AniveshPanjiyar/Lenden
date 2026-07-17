import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getAppData } from "@/lib/data";
import { BusinessAccessError, resolveBusinessContext } from "@/lib/tenancy";
import { parseAppViewState } from "@/lib/view-state";

export default async function BusinessHome({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ businessSlug }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  let data;
  let initialViewState;
  try {
    const { identity, context } = await resolveBusinessContext({ slug: businessSlug });
    const dashboardViewState = parseAppViewState(resolvedSearchParams, "");
    data = await getAppData(context, identity, dashboardViewState);
    initialViewState = parseAppViewState(
      resolvedSearchParams,
      identity.id,
    );
  } catch (error) {
    if (error instanceof BusinessAccessError && error.details) {
      redirect(`/access-pending?reason=${error.details.reason}&business=${encodeURIComponent(error.details.business.name)}`);
    }
    if (error instanceof BusinessAccessError && error.status === 403) notFound();
    throw error;
  }
  return <AppShell data={data} initialViewState={initialViewState} />;
}
