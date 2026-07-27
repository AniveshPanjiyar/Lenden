import { NextResponse } from "next/server";
import { getDashboardData, getStudentRosterPage, operationalPagePayload } from "@/lib/data";
import { BusinessAccessError, resolveBusinessReadContext } from "@/lib/tenancy";
import { parseAppViewState, type AppTab } from "@/lib/view-state";

const pageTabs = {
  dashboard: "home",
  transactions: "payments",
  closing: "closing",
  students: "library_students",
  settings: "settings",
} as const satisfies Record<string, AppTab>;

function searchParamsToRecord(searchParams: URLSearchParams) {
  return Object.fromEntries(searchParams.entries());
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string; page: string }> },
) {
  const startedAt = performance.now();
  try {
    const { businessId, page } = await params;
    const tab = pageTabs[page as keyof typeof pageTabs];
    if (!tab) return NextResponse.json({ message: "Unknown operational page." }, { status: 404 });

    const accessStartedAt = performance.now();
    const { identity, context } = await resolveBusinessReadContext(businessId);
    const accessDuration = performance.now() - accessStartedAt;
    const url = new URL(request.url);
    const parsed = parseAppViewState(searchParamsToRecord(url.searchParams), identity.id, context.membership?.role);
    const viewState = { ...parsed, tab };

    const readStartedAt = performance.now();
    const payload = tab === "library_students"
      ? await getStudentRosterPage(context, viewState, {
          cursor: url.searchParams.get("cursor"),
          search: url.searchParams.get("studentSearch"),
          limit: Number.parseInt(url.searchParams.get("limit") ?? "100", 10) || 100,
        })
      : operationalPagePayload(tab, await getDashboardData(context, identity, viewState));
    const readDuration = performance.now() - readStartedAt;
    const serializationStartedAt = performance.now();
    const body = JSON.stringify(payload);
    const serializationDuration = performance.now() - serializationStartedAt;
    const totalDuration = performance.now() - startedAt;

    console.info("[lenden-api]", {
      route: `operational-${page}`,
      businessId,
      accessMs: Math.round(accessDuration),
      readMs: Math.round(readDuration),
      durationMs: Math.round(totalDuration),
    });

    const responseHeaders = new Headers({
      "Cache-Control": "private, no-store",
      "Content-Type": "application/json; charset=utf-8",
    });
    if (process.env.NODE_ENV === "development") {
      responseHeaders.set(
        "Server-Timing",
        [
          `access;dur=${accessDuration.toFixed(1)}`,
          `database;dur=${readDuration.toFixed(1)}`,
          `serialization;dur=${serializationDuration.toFixed(1)}`,
          `total;dur=${totalDuration.toFixed(1)}`,
        ].join(", "),
      );
    }
    return new NextResponse(body, { headers: responseHeaders });
  } catch (error) {
    if (error instanceof BusinessAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}
