import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getAppData } from "@/lib/data";
import { BusinessAccessError, resolveBusinessContext } from "@/lib/tenancy";
import { parseAppViewState } from "@/lib/view-state";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function workspaceReturnPath(
  businessSlug: string,
  searchParams: Record<string, string | string[] | undefined>,
) {
  const params = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, value]) => {
    if (key === "tab" || key === "returnTo") return;
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value) params.set(key, value);
  });
  params.set("tab", "home");
  return `/b/${businessSlug}?${params.toString()}`;
}

export default async function BusinessHome({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ businessSlug }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  if (first(resolvedSearchParams.tab) === "settings") {
    const returnTo = workspaceReturnPath(businessSlug, resolvedSearchParams);
    redirect(`/settings?returnTo=${encodeURIComponent(returnTo)}`);
  }
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
