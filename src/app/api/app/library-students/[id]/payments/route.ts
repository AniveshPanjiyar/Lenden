import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Payment } from "@/lib/types";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const virtualLibraryStudentPrefix = "roll:";

function isMissingDbSchemaError(error: { code?: string; message?: string } | null | undefined, identifiers: string[]) {
  const message = error?.message?.toLowerCase() ?? "";
  const mentionsIdentifier = identifiers.some((identifier) => message.includes(identifier));
  const hasMissingSchemaCode = error?.code === "PGRST204" || error?.code === "PGRST205" || error?.code === "42703" || error?.code === "42P01";

  return (
    mentionsIdentifier &&
    (hasMissingSchemaCode ||
      message.includes("schema cache") ||
      message.includes("could not find") ||
      message.includes("does not exist"))
  );
}

function isMissingLibraryStudentSchemaError(error: { code?: string; message?: string } | null | undefined) {
  return isMissingDbSchemaError(error, ["library_students", "library_student_id", "library_student_subscription_events"]);
}

function normalizeLibraryRollNumber(value: string | null | undefined) {
  const normalized = value?.trim().replace(/\.0+$/, "");
  return normalized || null;
}

function libraryPaymentSubscriptionSortKey(payment: Payment) {
  return [
    payment.end_date ?? "",
    payment.start_date ?? "",
    payment.payment_date,
    payment.created_at,
    payment.id,
  ].join("|");
}

function mergePaymentRows(...groups: Payment[][]) {
  const rows = new Map<string, Payment>();
  groups.flat().forEach((payment) => rows.set(payment.id, payment));

  return [...rows.values()].sort((a, b) =>
    libraryPaymentSubscriptionSortKey(b).localeCompare(libraryPaymentSubscriptionSortKey(a)),
  );
}

function rollNumberFromRouteId(id: string) {
  if (!id.startsWith(virtualLibraryStudentPrefix)) return null;
  const rawRollNumber = id.slice(virtualLibraryStudentPrefix.length);
  try {
    return normalizeLibraryRollNumber(decodeURIComponent(rawRollNumber));
  } catch {
    return normalizeLibraryRollNumber(rawRollNumber);
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const virtualRollNumber = rollNumberFromRouteId(id);
  if (!uuidPattern.test(id) && !virtualRollNumber) {
    return NextResponse.json({ message: "Invalid student id" }, { status: 400 });
  }

  const studentResult = uuidPattern.test(id)
    ? await supabase.from("library_students").select("id, roll_number").eq("id", id).maybeSingle()
    : { data: null, error: null };
  if (isMissingLibraryStudentSchemaError(studentResult.error)) {
    return NextResponse.json({ payments: [], events: [] });
  }
  if (studentResult.error) return NextResponse.json({ message: studentResult.error.message }, { status: 500 });
  if (uuidPattern.test(id) && !studentResult.data) return NextResponse.json({ message: "Library student not found" }, { status: 404 });

  const studentRollNumber = virtualRollNumber ?? normalizeLibraryRollNumber(studentResult.data?.roll_number);
  const [paymentsResult, rollPaymentsResult, eventsResult] = await Promise.all([
    uuidPattern.test(id)
      ? supabase
          .from("payments")
          .select("*")
          .eq("library_student_id", id)
          .order("payment_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
    studentRollNumber
      ? supabase
          .from("payments")
          .select("*")
          .eq("business_type", "library")
          .order("payment_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [], error: null }),
    uuidPattern.test(id)
      ? supabase
          .from("library_student_subscription_events")
          .select("*")
          .eq("library_student_id", id)
          .order("event_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(150)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (paymentsResult.error && !isMissingLibraryStudentSchemaError(paymentsResult.error)) {
    return NextResponse.json({ message: paymentsResult.error.message }, { status: 500 });
  }
  if (rollPaymentsResult.error) {
    return NextResponse.json({ message: rollPaymentsResult.error.message }, { status: 500 });
  }
  if (eventsResult.error && !isMissingLibraryStudentSchemaError(eventsResult.error)) {
    return NextResponse.json({ message: eventsResult.error.message }, { status: 500 });
  }

  return NextResponse.json({
    payments: mergePaymentRows(
      isMissingLibraryStudentSchemaError(paymentsResult.error) ? [] : (paymentsResult.data ?? []) as Payment[],
      ((rollPaymentsResult.data ?? []) as Payment[]).filter(
        (payment) => normalizeLibraryRollNumber(payment.roll_number) === studentRollNumber,
      ),
    ),
    events: isMissingLibraryStudentSchemaError(eventsResult.error) ? [] : eventsResult.data ?? [],
  });
}
