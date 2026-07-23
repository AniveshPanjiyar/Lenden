import { NextResponse } from "next/server";
import { getStudentCollectionPage } from "@/lib/data";
import { BusinessAccessError, resolveBusinessReadContext } from "@/lib/tenancy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  try {
    const { businessId } = await params;
    const { context } = await resolveBusinessReadContext(businessId);
    const searchParams = new URL(request.url).searchParams;
    const sourceId = searchParams.get("source") ?? "";
    const intent = searchParams.get("intent") === "new_defaults" ? "new_defaults" : "existing";
    const payload = await getStudentCollectionPage(context, {
      sourceId,
      intent,
      cursor: searchParams.get("cursor"),
      search: searchParams.get("q"),
    });
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof BusinessAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}
