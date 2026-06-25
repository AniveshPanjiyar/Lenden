import { unparse } from "papaparse";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isOwnerish } from "@/lib/constants";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !isOwnerish(profile.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const date = request.nextUrl.searchParams.get("date");
  const from = request.nextUrl.searchParams.get("from") ?? date;
  const to = request.nextUrl.searchParams.get("to") ?? date;

  let paymentsQuery = supabase
    .from("payments")
    .select("*")
    .order("payment_date", { ascending: false });
  let expensesQuery = supabase
    .from("expenses")
    .select("*")
    .order("expense_date", { ascending: false });

  if (from) {
    paymentsQuery = paymentsQuery.gte("payment_date", from);
    expensesQuery = expensesQuery.gte("expense_date", from);
  }
  if (to) {
    paymentsQuery = paymentsQuery.lte("payment_date", to);
    expensesQuery = expensesQuery.lte("expense_date", to);
  }

  const [{ data: payments }, { data: expenses }] = await Promise.all([paymentsQuery, expensesQuery]);
  const rows = [
    ...(payments ?? []).map((payment) => ({
      type: "payment",
      date: payment.payment_date,
      business: payment.business_type,
      name: payment.customer_name ?? payment.description ?? "",
      amount: payment.amount,
      mode: payment.mode,
      cash_collection: payment.cash_collection ?? (payment.mode === "cash" ? payment.amount : 0),
      online_collection: payment.online_collection ?? (payment.mode === "online" ? payment.amount : 0),
      status: payment.approval_status,
      remark: payment.remark ?? "",
    })),
    ...(expenses ?? []).map((expense) => ({
      type: "expense",
      date: expense.expense_date,
      business: expense.business_type ?? "",
      name: expense.description,
      amount: -Number(expense.amount),
      mode: expense.mode,
      cash_collection: expense.mode === "cash" ? -Number(expense.amount) : 0,
      online_collection: expense.mode === "online" ? -Number(expense.amount) : 0,
      status: expense.approval_status,
      remark: expense.remark ?? "",
    })),
  ];

  return new Response(unparse(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"lenden-${from ?? "all"}-${to ?? "all"}.csv\"`,
    },
  });
}
