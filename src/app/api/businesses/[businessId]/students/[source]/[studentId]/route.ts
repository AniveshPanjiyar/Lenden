import { NextResponse } from "next/server";
import { getStudentDetail } from "@/lib/data";
import {
  BusinessAccessError,
  isBusinessOwner,
  isBusinessSalesAgent,
  resolveBusinessReadContext,
} from "@/lib/tenancy";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ businessId: string; source: string; studentId: string }> },
) {
  const startedAt = performance.now();
  try {
    const { businessId, source, studentId } = await params;
    if (source !== "library" && source !== "course") {
      return NextResponse.json({ message: "Unknown student source." }, { status: 404 });
    }

    const { context } = await resolveBusinessReadContext(businessId);
    const role = context.membership?.role;
    const permission = source === "library" ? "collect_library" : "collect_course";
    const canRead = context.accessMode === "support"
      || (isBusinessOwner(role) && !isBusinessSalesAgent(role))
      || context.permissions.includes(permission);
    if (!canRead || !context.enabledModules.includes(source)) {
      throw new BusinessAccessError("You do not have access to this student record.");
    }

    const student = await getStudentDetail(context, source, studentId);
    const duration = performance.now() - startedAt;
    const headers = new Headers({ "Cache-Control": "private, no-store" });
    if (process.env.NODE_ENV === "development") {
      headers.set("Server-Timing", `total;dur=${duration.toFixed(1)}`);
    }
    return NextResponse.json(student, { headers });
  } catch (error) {
    if (error instanceof BusinessAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}
