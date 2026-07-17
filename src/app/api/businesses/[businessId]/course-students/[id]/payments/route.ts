import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BusinessAccessError, resolveBusinessContext } from "@/lib/tenancy";
import type { Payment } from "@/lib/types";

function storagePath(value: string) {
  if (!/^https?:\/\//i.test(value)) return value;
  try {
    const pathname = decodeURIComponent(new URL(value).pathname);
    const markers = [
      "/storage/v1/object/public/library-student-photos/",
      "/storage/v1/object/sign/library-student-photos/",
    ];
    const marker = markers.find((item) => pathname.includes(item));
    return marker ? pathname.split(marker)[1] ?? value : value;
  } catch {
    return value;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ businessId: string; id: string }> },
) {
  try {
    const { businessId, id } = await params;
    const { context } = await resolveBusinessContext({ id: businessId });
    const supabase = await createClient({ businessId: context.business.id });
    const studentResult = await supabase
      .from("course_students")
      .select("id")
      .eq("business_id", context.business.id)
      .eq("id", id)
      .maybeSingle();
    if (studentResult.error) return NextResponse.json({ message: studentResult.error.message }, { status: 500 });
    if (!studentResult.data) return NextResponse.json({ message: "Course student not found" }, { status: 404 });

    const paymentsResult = await supabase
      .from("payments")
      .select("*")
      .eq("business_id", context.business.id)
      .eq("course_student_id", id)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);
    if (paymentsResult.error) return NextResponse.json({ message: paymentsResult.error.message }, { status: 500 });

    const payments = await Promise.all(((paymentsResult.data ?? []) as Payment[]).map(async (payment) => {
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

    return NextResponse.json({ payments, events: [] });
  } catch (error) {
    if (error instanceof BusinessAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}
