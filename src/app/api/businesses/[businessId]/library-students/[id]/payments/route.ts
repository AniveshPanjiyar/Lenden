import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BusinessAccessError, resolveBusinessContext } from "@/lib/tenancy";
import type { Payment } from "@/lib/types";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const virtualLibraryStudentPrefix = "roll:";

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

function paymentSortKey(payment: Payment) {
  return [payment.end_date ?? "", payment.start_date ?? "", payment.payment_date, payment.created_at, payment.id].join("|");
}

function mergePayments(...groups: Payment[][]) {
  const rows = new Map<string, Payment>();
  groups.flat().forEach((payment) => rows.set(payment.id, payment));
  return [...rows.values()].sort((a, b) => paymentSortKey(b).localeCompare(paymentSortKey(a)));
}

function storagePath(value: string) {
  if (!/^https?:\/\//i.test(value)) return value;
  try {
    const pathname = decodeURIComponent(new URL(value).pathname);
    const marker = "/storage/v1/object/public/library-student-photos/";
    return pathname.includes(marker) ? pathname.split(marker)[1] ?? value : value;
  } catch {
    return value;
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
    const pageSize = 25;
    const { context } = await resolveBusinessContext({ id: businessId });
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
    const [linkedPayments, rollPayments, events] = await Promise.all([
      uuidPattern.test(id)
        ? supabase.from("payments").select("*").eq("business_id", context.business.id).eq("library_student_id", id).order("payment_date", { ascending: false }).limit(1000)
        : Promise.resolve({ data: [], error: null }),
      rollNumber
        ? supabase.from("payments").select("*").eq("business_id", context.business.id).eq("business_type", "library").order("payment_date", { ascending: false }).limit(5000)
        : Promise.resolve({ data: [], error: null }),
      uuidPattern.test(id)
        ? supabase.from("library_student_subscription_events").select("*").eq("business_id", context.business.id).eq("library_student_id", id).order("event_date", { ascending: false }).limit(150)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const queryError = linkedPayments.error ?? rollPayments.error ?? events.error;
    if (queryError) return NextResponse.json({ message: queryError.message }, { status: 500 });

    const payments = mergePayments(
        (linkedPayments.data ?? []) as Payment[],
        ((rollPayments.data ?? []) as Payment[]).filter((payment) => normalizeLibraryRollNumber(payment.roll_number) === rollNumber),
      );
    const total = payments.length;
    const start = page * pageSize;
    const pagePayments = payments.slice(start, start + pageSize);
    const signedPayments = await Promise.all(pagePayments.map(async (payment) => {
      const sign = async (value: string | null) => {
        if (!value) return null;
        const path = storagePath(value);
        if (/^https?:\/\//i.test(path)) return value;
        const { data } = await supabase.storage.from("library-student-photos").createSignedUrl(path, 3600);
        return data?.signedUrl ?? null;
      };
      return {
        ...payment,
        aadhar_photo_url: await sign(payment.aadhar_photo_url),
        aadhar_back_photo_url: await sign(payment.aadhar_back_photo_url),
      };
    }));

    return NextResponse.json({
      payments: signedPayments,
      events: events.data ?? [],
      nextPage: start + pageSize < total ? page + 1 : null,
      total,
    });
  } catch (error) {
    if (error instanceof BusinessAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}
