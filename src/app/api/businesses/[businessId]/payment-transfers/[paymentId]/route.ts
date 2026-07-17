import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BusinessAccessError, resolveBusinessContext } from "@/lib/tenancy";
import type { LedgerEntry, MoneyMovement, Payment, PaymentTransferMutationPatch } from "@/lib/types";

function receiptPath(value: string) {
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
  { params }: { params: Promise<{ businessId: string; paymentId: string }> },
) {
  try {
    const { businessId, paymentId } = await params;
    const { context } = await resolveBusinessContext({ id: businessId });
    const supabase = await createClient({ businessId: context.business.id });
    const [paymentResult, movementsResult] = await Promise.all([
      supabase.from("payments").select("*").eq("business_id", context.business.id).eq("id", paymentId).single(),
      supabase.from("money_movements").select("*").eq("business_id", context.business.id).eq("payment_id", paymentId).order("created_at", { ascending: false }).limit(30),
    ]);
    if (paymentResult.error || !paymentResult.data) {
      return NextResponse.json({ message: paymentResult.error?.message ?? "Payment not found" }, { status: 404 });
    }
    if (movementsResult.error) return NextResponse.json({ message: movementsResult.error.message }, { status: 500 });
    const movements = (movementsResult.data ?? []) as MoneyMovement[];
    const movementIds = movements.map((movement) => movement.id);
    const ledgerResult = movementIds.length > 0
      ? await supabase.from("ledger_entries").select("*").eq("business_id", context.business.id).eq("source_type", "transfer").in("source_id", movementIds)
      : { data: [], error: null };
    if (ledgerResult.error) return NextResponse.json({ message: ledgerResult.error.message }, { status: 500 });

    const payment = paymentResult.data as Payment;
    let signedReceipt = payment.photo_path;
    if (payment.photo_path) {
      const path = receiptPath(payment.photo_path);
      if (!/^https?:\/\//i.test(path)) {
        const { data } = await supabase.storage.from("receipts").createSignedUrl(path, 3600);
        signedReceipt = data?.signedUrl ?? null;
      }
    }
    const selectedMovement = movements[0];
    if (!selectedMovement) return NextResponse.json({ message: "Transfer movement not found" }, { status: 404 });
    const patch: PaymentTransferMutationPatch = {
      type: "payment-transfer",
      payment: { ...payment, photo_path: signedReceipt },
      movement: selectedMovement,
      ledgerEntries: ((ledgerResult.data ?? []) as LedgerEntry[]).filter((entry) => entry.source_id === selectedMovement.id),
    };
    return NextResponse.json({ patch });
  } catch (error) {
    if (error instanceof BusinessAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}
