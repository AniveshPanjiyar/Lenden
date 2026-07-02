import { AppShell } from "@/components/app-shell";
import { getBootstrapData, getDashboardData, mergeAppData } from "@/lib/data";
import { parseAppViewState } from "@/lib/view-state";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const bootstrap = await getBootstrapData();
  const initialViewState = parseAppViewState(await searchParams, bootstrap.profile.id);
  const dashboard = await getDashboardData(initialViewState);
  const data = mergeAppData(bootstrap, dashboard);

  return <AppShell data={data} initialViewState={initialViewState} />;
}
