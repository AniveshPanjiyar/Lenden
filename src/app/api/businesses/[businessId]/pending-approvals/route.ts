import { NextResponse } from "next/server";
import { getPendingApprovals } from "@/lib/data";
import { BusinessAccessError, resolveBusinessReadContext } from "@/lib/tenancy";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  try {
    const { businessId } = await params;
    const { context } = await resolveBusinessReadContext(businessId);
    const payload = await getPendingApprovals(context);
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
