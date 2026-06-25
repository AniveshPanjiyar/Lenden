import { todayIso } from "@/lib/constants";

export type AppTab = "home" | "payments" | "closing" | "transfers" | "settings";
export type DateRangePreset = "today" | "yesterday" | "this_month" | "custom";
export type TransactionFilter = "all" | "received" | "sent" | "deleted";
export type SettlementFilter = "all" | "received" | "sent";

export type DateRangeState = {
  preset: DateRangePreset;
  from: string;
  to: string;
};

export type AppViewState = {
  tab: AppTab;
  dateRange: DateRangeState;
  transactionProfileId: string;
  transactionFilter: TransactionFilter;
  settlementFilter: SettlementFilter;
};

type RawSearchParams = Record<string, string | string[] | undefined>;

const appTabs = ["home", "payments", "closing", "transfers", "settings"] as const;
const dateRangePresets = ["today", "yesterday", "this_month", "custom"] as const;
const transactionFilters = ["all", "received", "sent", "deleted"] as const;
const settlementFilters = ["all", "received", "sent"] as const;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function singleParam(params: RawSearchParams, name: string) {
  const value = params[name];
  return Array.isArray(value) ? value[0] : value;
}

function oneOf<T extends readonly string[]>(value: string | undefined, allowed: T, fallback: T[number]) {
  return allowed.includes(value ?? "") ? (value as T[number]) : fallback;
}

function validIsoDate(value: string | undefined) {
  return value && isoDatePattern.test(value) ? value : undefined;
}

function addDaysIso(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function startOfMonthIso(isoDate: string) {
  return `${isoDate.slice(0, 8)}01`;
}

export function rangeForPreset(preset: DateRangePreset, current?: DateRangeState): DateRangeState {
  const today = todayIso();
  if (preset === "yesterday") {
    const yesterday = addDaysIso(today, -1);
    return { preset, from: yesterday, to: yesterday };
  }
  if (preset === "this_month") {
    return { preset, from: startOfMonthIso(today), to: today };
  }
  if (preset === "custom") {
    return { preset, from: current?.from || today, to: current?.to || current?.from || today };
  }
  return { preset, from: today, to: today };
}

export function parseAppViewState(params: RawSearchParams, defaultProfileId: string): AppViewState {
  const tab = oneOf(singleParam(params, "tab"), appTabs, "home");
  const preset = oneOf(singleParam(params, "range"), dateRangePresets, "today");
  const from = validIsoDate(singleParam(params, "from"));
  const to = validIsoDate(singleParam(params, "to"));
  const customDateRange = from ? { preset: "custom" as const, from, to: to ?? from } : undefined;
  const dateRange = preset === "custom" && customDateRange ? customDateRange : rangeForPreset(preset);

  return {
    tab,
    dateRange: tab === "transfers" && dateRange.preset === "this_month" ? rangeForPreset("today") : dateRange,
    transactionProfileId: singleParam(params, "txUser") || defaultProfileId,
    transactionFilter: oneOf(singleParam(params, "txFilter"), transactionFilters, "all"),
    settlementFilter: oneOf(singleParam(params, "settlementFilter"), settlementFilters, "all"),
  };
}
