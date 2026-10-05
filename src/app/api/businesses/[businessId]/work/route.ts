import { NextResponse } from "next/server";
import { getWorkPage } from "@/lib/data";
import { BusinessAccessError, resolveBusinessReadContext } from "@/lib/tenancy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  try {
    const { businessId } = await params;
    const { context } = await resolveBusinessReadContext(businessId);
    const payload = await getWorkPage(context, new URL(request.url).searchParams.get("date"));
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
