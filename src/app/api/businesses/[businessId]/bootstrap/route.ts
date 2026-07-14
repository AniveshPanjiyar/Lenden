import { NextResponse } from "next/server";
import { getBootstrapData } from "@/lib/data";
import { BusinessAccessError, resolveBusinessContext } from "@/lib/tenancy";

export async function GET(_request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  try {
    const { businessId } = await params;
    const { identity, context } = await resolveBusinessContext({ id: businessId });
    return NextResponse.json(await getBootstrapData(context, identity));
  } catch (error) {
    if (error instanceof BusinessAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}
