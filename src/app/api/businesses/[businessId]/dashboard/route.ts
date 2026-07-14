import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/data";
import { BusinessAccessError, resolveBusinessContext } from "@/lib/tenancy";
import { parseAppViewState } from "@/lib/view-state";

function searchParamsToRecord(searchParams: URLSearchParams) {
  return Object.fromEntries(searchParams.entries());
}

export async function GET(request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  try {
    const startedAt = performance.now();
    const { businessId } = await params;
    const { identity, context } = await resolveBusinessContext({ id: businessId });
    const url = new URL(request.url);
    const viewState = parseAppViewState(searchParamsToRecord(url.searchParams), "");
    const dashboard = await getDashboardData(context, identity, viewState);

    console.info("[lenden-api]", {
      route: "business-dashboard",
      businessId,
      durationMs: Math.round(performance.now() - startedAt),
      tab: viewState.tab,
    });
    return NextResponse.json(dashboard);
  } catch (error) {
    if (error instanceof BusinessAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}
