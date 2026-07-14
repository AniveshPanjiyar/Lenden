import { unparse } from "papaparse";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BusinessAccessError, isBusinessOwner, resolveBusinessContext } from "@/lib/tenancy";

export async function GET(request: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  try {
    const { businessId } = await params;
    const { context } = await resolveBusinessContext({ id: businessId });
    if (context.accessMode !== "support" && !isBusinessOwner(context.membership?.role)) {
      return new Response("Forbidden", { status: 403 });
    }
    const client = await createClient({ businessId: context.business.id });
    const from = request.nextUrl.searchParams.get("from") ?? request.nextUrl.searchParams.get("date");
    const to = request.nextUrl.searchParams.get("to") ?? request.nextUrl.searchParams.get("date");
    let paymentsQuery = client.from("payments").select("*").eq("business_id", businessId).order("payment_date", { ascending: false });
    let expensesQuery = client.from("expenses").select("*").eq("business_id", businessId).order("expense_date", { ascending: false });
    if (from) { paymentsQuery = paymentsQuery.gte("payment_date", from); expensesQuery = expensesQuery.gte("expense_date", from); }
    if (to) { paymentsQuery = paymentsQuery.lte("payment_date", to); expensesQuery = expensesQuery.lte("expense_date", to); }
    const [{ data: payments }, { data: expenses }] = await Promise.all([paymentsQuery, expensesQuery]);
    const rows = [
      ...(payments ?? []).map((payment) => ({ type: "payment", date: payment.payment_date, module: payment.business_type, description: payment.customer_name ?? payment.description ?? "", amount: payment.amount, mode: payment.mode, status: payment.approval_status })),
      ...(expenses ?? []).map((expense) => ({ type: "expense", date: expense.expense_date, module: expense.business_type ?? "", description: expense.description, amount: -Number(expense.amount), mode: expense.mode, status: expense.approval_status })),
    ];
    return new Response(unparse(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${context.business.slug}-${from ?? "all"}-${to ?? "all"}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof BusinessAccessError) return new Response(error.message, { status: error.status });
    throw error;
  }
}

