import { AppShell } from "@/components/app-shell";
import { getAppData } from "@/lib/data";
import { parseAppViewState } from "@/lib/view-state";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  const dashboardViewState = parseAppViewState(resolvedSearchParams, "");
  const data = await getAppData(dashboardViewState);
  const initialViewState = parseAppViewState(resolvedSearchParams, data.profile.id);

  return <AppShell data={data} initialViewState={initialViewState} />;
}
