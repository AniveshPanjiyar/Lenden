import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BusinessAccessError, resolveBusinessReadContext } from "@/lib/tenancy";

function storageObjectPath(value: string) {
  if (!/^https?:\/\//i.test(value)) return value;
  try {
    const pathname = decodeURIComponent(new URL(value).pathname);
    const markers = ["/storage/v1/object/public/receipts/", "/storage/v1/object/sign/receipts/"];
    const marker = markers.find((item) => pathname.includes(item));
    return marker ? pathname.split(marker)[1] ?? value : value;
  } catch {
    return value;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ businessId: string; recordType: string; recordId: string }> },
) {
  try {
    const { businessId, recordType, recordId } = await params;
    if (recordType !== "payment" && recordType !== "expense") {
      return NextResponse.json({ message: "Unknown record type." }, { status: 404 });
    }

    await resolveBusinessReadContext(businessId);
    const supabase = await createClient({ businessId });
    const table = recordType === "payment" ? "payments" : "expenses";
    const { data: record, error } = await supabase
      .from(table)
      .select("photo_path")
      .eq("business_id", businessId)
      .eq("id", recordId)
      .single();
    if (error) throw new BusinessAccessError(error.message, error.code === "PGRST116" ? 404 : 500);
    if (!record.photo_path) return NextResponse.json({ url: null });

    const path = storageObjectPath(String(record.photo_path));
    if (/^https?:\/\//i.test(path)) return NextResponse.json({ url: path });
    const { data, error: signingError } = await supabase.storage.from("receipts").createSignedUrl(path, 3600);
    if (signingError) throw new BusinessAccessError(signingError.message, 500);
    return NextResponse.json({ url: data.signedUrl }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    if (error instanceof BusinessAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}
