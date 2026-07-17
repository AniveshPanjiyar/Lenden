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
    const dateKey = request.nextUrl.searchParams.get("dateKey") === "transaction" ? "transaction" : "approval";
    let paymentsQuery = client.from("payments").select("*").eq("business_id", businessId).eq("record_status", "active").order("payment_date", { ascending: false });
    let expensesQuery = client.from("expenses").select("*").eq("business_id", businessId).eq("record_status", "active").order("expense_date", { ascending: false });
    if (dateKey === "transaction") {
      if (from) { paymentsQuery = paymentsQuery.gte("payment_date", from); expensesQuery = expensesQuery.gte("expense_date", from); }
      if (to) { paymentsQuery = paymentsQuery.lte("payment_date", to); expensesQuery = expensesQuery.lte("expense_date", to); }
    } else {
      const paymentPostingFilters = [
        [from ? `cash_posted_on.gte.${from}` : null, to ? `cash_posted_on.lte.${to}` : null].filter(Boolean).join(","),
        [from ? `online_posted_on.gte.${from}` : null, to ? `online_posted_on.lte.${to}` : null].filter(Boolean).join(","),
      ].filter(Boolean);
      if (paymentPostingFilters.length > 0) {
        paymentsQuery = paymentsQuery.or(paymentPostingFilters.map((filter) => `and(${filter})`).join(","));
      }
      if (from) expensesQuery = expensesQuery.gte("posted_on", from);
      if (to) expensesQuery = expensesQuery.lte("posted_on", to);
    }
    const [paymentsResult, expensesResult] = await Promise.all([paymentsQuery, expensesQuery]);
    if (paymentsResult.error) throw new Error(paymentsResult.error.message);
    if (expensesResult.error) throw new Error(expensesResult.error.message);
    const payments = paymentsResult.data;
    const expenses = expensesResult.data;
    const inRange = (date: string | null | undefined) => Boolean(date && (!from || date >= from) && (!to || date <= to));
    const rows = [
      ...(payments ?? []).flatMap((payment) => {
        const base = {
          type: "payment",
          transaction_date: payment.payment_date,
          module: payment.business_type,
          description: payment.customer_name ?? payment.description ?? "",
          status: payment.approval_status,
          date_key: dateKey,
        };
        const cashAmount = payment.mode === "mixed" ? Number(payment.cash_collection ?? 0) : payment.mode === "cash" ? Number(payment.amount) : 0;
        const onlineAmount = payment.mode === "mixed" ? Number(payment.online_collection ?? 0) : payment.mode === "online" ? Number(payment.amount) : 0;
        const cashApproved = cashAmount > 0 && (payment.cash_approval_status ?? payment.approval_status) === "approved";
        const onlineApproved = onlineAmount > 0 && (payment.online_approval_status ?? payment.approval_status) === "approved";
        if (dateKey === "transaction") {
          if (cashApproved && onlineApproved) {
            return [{
              ...base,
              date: payment.payment_date,
              approval_date: [payment.cash_posted_on, payment.online_posted_on].filter(Boolean).sort().at(-1) ?? "",
              component: "mixed",
              amount: cashAmount + onlineAmount,
              mode: "mixed",
            }];
          }
          return [
            cashApproved
              ? { ...base, date: payment.payment_date, approval_date: payment.cash_posted_on ?? "", component: "cash", amount: cashAmount, mode: "cash" }
              : null,
            onlineApproved
              ? { ...base, date: payment.payment_date, approval_date: payment.online_posted_on ?? "", component: "online", amount: onlineAmount, mode: "online" }
              : null,
          ].filter((row): row is NonNullable<typeof row> => Boolean(row));
        }
        return [
          cashApproved && inRange(payment.cash_posted_on)
            ? { ...base, date: payment.cash_posted_on, approval_date: payment.cash_posted_on, component: "cash", amount: cashAmount, mode: "cash" }
            : null,
          onlineApproved && inRange(payment.online_posted_on)
            ? { ...base, date: payment.online_posted_on, approval_date: payment.online_posted_on, component: "online", amount: onlineAmount, mode: "online" }
            : null,
        ].filter((row): row is NonNullable<typeof row> => Boolean(row));
      }),
      ...(expenses ?? []).filter((expense) => expense.approval_status === "approved").map((expense) => ({
        type: "expense",
        date: dateKey === "transaction" ? expense.expense_date : expense.posted_on,
        transaction_date: expense.expense_date,
        approval_date: expense.posted_on ?? "",
        date_key: dateKey,
        component: expense.mode,
        module: expense.business_type ?? "",
        description: expense.description,
        amount: -Number(expense.amount),
        mode: expense.mode,
        status: expense.approval_status,
      })),
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
