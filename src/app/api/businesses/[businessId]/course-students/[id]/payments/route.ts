import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  studentSubscriptionHistoryPage,
  type StudentSubscriptionHistoryRow,
} from "@/lib/student-subscription-history";
import { BusinessAccessError, resolveBusinessContext } from "@/lib/tenancy";

const pageSize = 10;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string; id: string }> },
) {
  try {
    const { businessId, id } = await params;
    const requestedPage = Number(new URL(request.url).searchParams.get("page") ?? "0");
    const page = Number.isInteger(requestedPage) && requestedPage >= 0 ? requestedPage : 0;
    const { context } = await resolveBusinessContext({ id: businessId });
    if (!context.enabledModules.includes("course")) {
      return NextResponse.json({ message: "Course access is not enabled for this business." }, { status: 403 });
    }

    const supabase = await createClient({ businessId: context.business.id });
    const studentResult = await supabase
      .from("course_students")
      .select("id")
      .eq("business_id", context.business.id)
      .eq("id", id)
      .maybeSingle();
    if (studentResult.error) return NextResponse.json({ message: studentResult.error.message }, { status: 500 });
    if (!studentResult.data) return NextResponse.json({ message: "Course student not found" }, { status: 404 });

    const historyResult = await supabase.rpc("lenden_student_subscription_history", {
      p_source: "course",
      p_student_id: id,
      p_roll_number: null,
      p_page: page,
      p_page_size: pageSize,
    });
    if (historyResult.error) {
      const missingFunction = historyResult.error.message.toLowerCase().includes("lenden_student_subscription_history");
      return NextResponse.json(
        {
          message: missingFunction
            ? "Apply the student subscription cycle migration before loading history."
            : historyResult.error.message,
        },
        { status: missingFunction ? 503 : 500 },
      );
    }

    return NextResponse.json(
      studentSubscriptionHistoryPage((historyResult.data ?? []) as StudentSubscriptionHistoryRow[], page, pageSize),
    );
  } catch (error) {
    if (error instanceof BusinessAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}
