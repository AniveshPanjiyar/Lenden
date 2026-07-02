import { NextResponse } from "next/server";
import { getBootstrapData, getDashboardData } from "@/lib/data";
import { parseAppViewState } from "@/lib/view-state";

function searchParamsToRecord(searchParams: URLSearchParams) {
  return Object.fromEntries(searchParams.entries());
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const url = new URL(request.url);
  const bootstrap = await getBootstrapData();
  const viewState = parseAppViewState(searchParamsToRecord(url.searchParams), bootstrap.profile.id);
  const dashboard = await getDashboardData(viewState);

  console.info("[lenden-api]", {
    route: "dashboard",
    durationMs: Math.round(performance.now() - startedAt),
    userId: bootstrap.profile.id,
    tab: viewState.tab,
    range: viewState.dateRange.preset,
  });

  return NextResponse.json(dashboard);
}
