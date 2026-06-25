import { AppShell } from "@/components/app-shell";
import { getAppData } from "@/lib/data";
import { parseAppViewState } from "@/lib/view-state";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const data = await getAppData();
  const initialViewState = parseAppViewState(await searchParams, data.profile.id);

  return <AppShell data={data} initialViewState={initialViewState} />;
}
