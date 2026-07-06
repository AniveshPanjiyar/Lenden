import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/data";
import { parseAppViewState } from "@/lib/view-state";

function searchParamsToRecord(searchParams: URLSearchParams) {
  return Object.fromEntries(searchParams.entries());
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const url = new URL(request.url);
  const viewState = parseAppViewState(searchParamsToRecord(url.searchParams), "");
  const dashboard = await getDashboardData(viewState);

  console.info("[lenden-api]", {
    route: "dashboard",
    durationMs: Math.round(performance.now() - startedAt),
    tab: viewState.tab,
    range: viewState.dateRange.preset,
  });

  return NextResponse.json(dashboard);
}
