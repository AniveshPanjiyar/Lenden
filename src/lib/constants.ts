import type { BusinessType } from "@/lib/types";

export const permissionOptions = [
  { value: "collect_guest_house", label: "Guest house collection" },
  { value: "collect_library", label: "Library collection" },
  { value: "collect_course", label: "Course collection" },
  { value: "collect_general", label: "General payment" },
  { value: "add_expense", label: "Add expense" },
  { value: "transfer_money", label: "Transfer money" },
] as const;

export const businessLabels: Record<BusinessType, string> = {
  guest_house: "Guest House",
  library: "Library",
  course: "Shikshan Sansthan",
  general: "General",
};

export const businessPermissions: Record<BusinessType, string> = {
  guest_house: "collect_guest_house",
  library: "collect_library",
  course: "collect_course",
  general: "collect_general",
};

export const todayIso = () => new Date().toISOString().slice(0, 10);

export function addMonthsIso(date = new Date(), months = 1) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next.toISOString().slice(0, 10);
}

export function formatMoney(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(number);
}

export function isOwnerish(role: string) {
  return role === "admin" || role === "owner";
}

export function isSalesAgent(role: string) {
  return role === "sales_agent";
}
