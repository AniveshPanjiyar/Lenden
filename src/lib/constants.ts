import type { BusinessType } from "@/lib/types";

export const permissionOptions = [
  { value: "collect_guest_house", label: "Guest house collection" },
  { value: "collect_library", label: "Library collection" },
  { value: "collect_course", label: "Course collection" },
  { value: "collect_general", label: "General payment" },
  { value: "add_expense", label: "Add expense" },
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

export const INDIA_TIME_ZONE = "Asia/Kolkata";

function zonedDateParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return { year: part("year"), month: part("month"), day: part("day") };
}

export function indiaDateIso(value: Date | string = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const { year, month, day } = zonedDateParts(date, INDIA_TIME_ZONE);
  return `${year}-${month}-${day}`;
}

export const todayIso = () => indiaDateIso();

export function addMonthsIso(date = new Date(), months = 1) {
  const indiaDate = indiaDateIso(date);
  const [year, month, day] = indiaDate.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + months, day));
  return next.toISOString().slice(0, 10);
}

export function formatIndiaTime(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: INDIA_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date).replace(/\b(am|pm)\b/gi, (period) => period.toUpperCase());
}

export function indiaMinuteOfDay(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: INDIA_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const hours = Number(parts.find((item) => item.type === "hour")?.value ?? 0);
  const minutes = Number(parts.find((item) => item.type === "minute")?.value ?? 0);
  return hours * 60 + minutes;
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
