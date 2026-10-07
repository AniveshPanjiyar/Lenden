import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  studentSubscriptionHistoryPage,
  type StudentSubscriptionHistoryRow,
} from "@/lib/student-subscription-history";
import { BusinessAccessError, resolveBusinessContext } from "@/lib/tenancy";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const virtualLibraryStudentPrefix = "roll:";
const pageSize = 10;

function normalizeLibraryRollNumber(value: string | null | undefined) {
  const normalized = value?.trim().replace(/\.0+$/, "");
  return normalized || null;
}

function rollNumberFromRouteId(id: string) {
  if (!id.startsWith(virtualLibraryStudentPrefix)) return null;
  try {
    return normalizeLibraryRollNumber(decodeURIComponent(id.slice(virtualLibraryStudentPrefix.length)));
  } catch {
    return normalizeLibraryRollNumber(id.slice(virtualLibraryStudentPrefix.length));
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string; id: string }> },
) {
  try {
    const { businessId, id } = await params;
    const requestedPage = Number(new URL(request.url).searchParams.get("page") ?? "0");
    const page = Number.isInteger(requestedPage) && requestedPage >= 0 ? requestedPage : 0;
    const { context } = await resolveBusinessContext({ id: businessId });
    if (!context.enabledModules.includes("library")) {
      return NextResponse.json({ message: "Library access is not enabled for this business." }, { status: 403 });
    }

    const supabase = await createClient({ businessId: context.business.id });
    const virtualRollNumber = rollNumberFromRouteId(id);
    if (!uuidPattern.test(id) && !virtualRollNumber) {
      return NextResponse.json({ message: "Invalid student id" }, { status: 400 });
    }

    const studentResult = uuidPattern.test(id)
      ? await supabase
          .from("library_students")
          .select("id,roll_number")
          .eq("business_id", context.business.id)
          .eq("id", id)
          .maybeSingle()
      : { data: null, error: null };
    if (studentResult.error) return NextResponse.json({ message: studentResult.error.message }, { status: 500 });
    if (uuidPattern.test(id) && !studentResult.data) {
      return NextResponse.json({ message: "Library student not found" }, { status: 404 });
    }

    const rollNumber = virtualRollNumber ?? normalizeLibraryRollNumber(studentResult.data?.roll_number);
    const historyResult = await supabase.rpc("lenden_student_subscription_history", {
      p_source: "library",
      p_student_id: uuidPattern.test(id) ? id : null,
      p_roll_number: rollNumber,
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

    const historyPage = studentSubscriptionHistoryPage((historyResult.data ?? []) as StudentSubscriptionHistoryRow[], page, pageSize);

    // Extra daily slots live in each payment's metadata; attach them to their subscription.
    const paymentIds = historyPage.items.flatMap((item) => item.transactions.map((transaction) => transaction.id));
    if (paymentIds.length > 0) {
      const slotsResult = await supabase.from("payments").select("id,metadata,record_status").in("id", paymentIds);
      if (!slotsResult.error) {
        const slotsByPayment = new Map(
          ((slotsResult.data ?? []) as Array<{ id: string; metadata: { extra_time_slots?: { start: string; end: string }[] } | null; record_status: string }>)
            .filter((row) => row.record_status === "active" && Array.isArray(row.metadata?.extra_time_slots))
            .map((row) => [row.id, row.metadata?.extra_time_slots ?? []]),
        );
        historyPage.items = historyPage.items.map((item) => {
          // The latest payment of the subscription carries its current slots.
          const withSlots = [...item.transactions]
            .filter((transaction) => slotsByPayment.has(transaction.id))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
          return withSlots ? { ...item, extraSlots: slotsByPayment.get(withSlots.id) } : item;
        });
      }
    }

    return NextResponse.json(historyPage);
  } catch (error) {
    if (error instanceof BusinessAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}
