import { todayIso } from "@/lib/constants";
import type { BusinessType, PaymentMode } from "@/lib/types";

export type AppTab = "home" | "payments" | "library_students" | "closing" | "settings";
export type DateRangePreset = "today" | "yesterday" | "this_month" | "custom";
export type DateFilterKey = "approval" | "transaction";
export type TransactionFilter = "all" | "cash_in" | "cash_out" | "pending" | "transactions";
export type TransactionRecordType = "all" | "payment" | "expense" | "transfer" | "agent_payout";
export type TransactionModeFilter = "all" | PaymentMode;
export type BusinessTypeFilter = "all" | BusinessType;
export type StudentStatusFilter = "active" | "live" | "inactive";

export type DateRangeState = {
  preset: DateRangePreset;
  from: string;
  to: string;
};

export type DashboardFilterState = {
  dateRange: DateRangeState;
  dateFilterKey: DateFilterKey;
  businessType: BusinessTypeFilter;
};

export type TransactionFilterState = {
  dateRange: DateRangeState;
  dateFilterKey: DateFilterKey;
  profileId: string;
  activity: TransactionFilter;
  recordType: TransactionRecordType;
  mode: TransactionModeFilter;
  businessType: BusinessTypeFilter;
};

export type ClosingFilterState = {
  date: string;
  dateFilterKey: DateFilterKey;
};

export type StudentFilterState = {
  sourceId: string;
  status: StudentStatusFilter;
};

export type AppViewState = {
  tab: AppTab;
  dashboardFilters: DashboardFilterState;
  transactionFilters: TransactionFilterState;
  closingFilters: ClosingFilterState;
  studentFilters: StudentFilterState;
};

type RawSearchParams = Record<string, string | string[] | undefined>;

const appTabs = ["home", "payments", "library_students", "closing", "settings"] as const;
const dateRangePresets = ["today", "yesterday", "this_month", "custom"] as const;
const dateFilterKeys = ["approval", "transaction"] as const;
const transactionFilters = ["all", "cash_in", "cash_out", "pending", "transactions"] as const;
const transactionRecordTypes = ["all", "payment", "expense", "transfer", "agent_payout"] as const;
const transactionModes = ["all", "cash", "online", "mixed"] as const;
const businessTypes = ["all", "guest_house", "library", "course", "general"] as const;
const studentStatuses = ["active", "live", "inactive"] as const;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const studentSourcePattern = /^(library|(?:course|skill):[0-9a-f-]{36})$/i;

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
  return { preset: "today", from: today, to: today };
}

export function defaultDashboardFilters(): DashboardFilterState {
  return { dateRange: rangeForPreset("today"), dateFilterKey: "approval", businessType: "all" };
}

export function defaultTransactionFilters(defaultProfileId: string): TransactionFilterState {
  return {
    dateRange: rangeForPreset("today"),
    dateFilterKey: "approval",
    profileId: defaultProfileId,
    activity: "all",
    recordType: "all",
    mode: "all",
    businessType: "all",
  };
}

export function defaultClosingFilters(): ClosingFilterState {
  return { date: todayIso(), dateFilterKey: "approval" };
}

export function defaultStudentFilters(defaultSourceId = "library"): StudentFilterState {
  return { sourceId: defaultSourceId, status: "active" };
}

function parseRange(
  params: RawSearchParams,
  names: { preset: string; from: string; to: string },
  legacy: DateRangeState | null,
) {
  const rawPreset = singleParam(params, names.preset);
  if (!rawPreset) return legacy ?? rangeForPreset("today");
  const preset = oneOf(rawPreset, dateRangePresets, "today");
  if (preset !== "custom") return rangeForPreset(preset);
  const from = validIsoDate(singleParam(params, names.from));
  const to = validIsoDate(singleParam(params, names.to));
  const end = to ?? from;
  return from && end && from <= end
    ? { preset: "custom" as const, from, to: end }
    : rangeForPreset("today");
}

function parseLegacyRange(params: RawSearchParams) {
  const preset = oneOf(singleParam(params, "range"), dateRangePresets, "today");
  if (preset !== "custom") return rangeForPreset(preset);
  const from = validIsoDate(singleParam(params, "from"));
  const to = validIsoDate(singleParam(params, "to"));
  const end = to ?? from;
  return from && end && from <= end
    ? { preset: "custom" as const, from, to: end }
    : rangeForPreset("today");
}

function normalizeTransactionActivity(value: string | undefined) {
  if (value === "collections") return "cash_in";
  if (value === "expenses") return "cash_out";
  if (value === "settlements" || value === "transferred" || value === "transfered") return "all";
  return value;
}

export function parseAppViewState(params: RawSearchParams, defaultProfileId: string): AppViewState {
  const rawTab = singleParam(params, "tab");
  const tab = rawTab === "transfers" ? "payments" : oneOf(rawTab, appTabs, "home");
  const legacyRange = parseLegacyRange(params);
  const legacyDateKey = oneOf(singleParam(params, "dateKey"), dateFilterKeys, "approval");
  const dashboardLegacyRange = tab === "home" ? legacyRange : null;
  const transactionLegacyRange = tab === "payments" ? legacyRange : null;
  const closingLegacyDate = tab === "closing" ? legacyRange.to : null;
  const studentSource = singleParam(params, "studentSource");

  return {
    tab,
    dashboardFilters: {
      dateRange: parseRange(params, { preset: "dashRange", from: "dashFrom", to: "dashTo" }, dashboardLegacyRange),
      dateFilterKey: oneOf(singleParam(params, "dashDateKey") ?? (tab === "home" ? legacyDateKey : undefined), dateFilterKeys, "approval"),
      businessType: oneOf(singleParam(params, "dashBusiness"), businessTypes, "all"),
    },
    transactionFilters: {
      dateRange: parseRange(params, { preset: "txRange", from: "txFrom", to: "txTo" }, transactionLegacyRange),
      dateFilterKey: oneOf(singleParam(params, "txDateKey") ?? (tab === "payments" ? legacyDateKey : undefined), dateFilterKeys, "approval"),
      profileId: singleParam(params, "txUser") || defaultProfileId,
      activity: oneOf(normalizeTransactionActivity(singleParam(params, "txFilter")), transactionFilters, "all"),
      recordType: oneOf(singleParam(params, "txRecordType"), transactionRecordTypes, "all"),
      mode: oneOf(singleParam(params, "txMode"), transactionModes, "all"),
      businessType: oneOf(singleParam(params, "txBusiness"), businessTypes, "all"),
    },
    closingFilters: {
      date: validIsoDate(singleParam(params, "closingDate")) ?? closingLegacyDate ?? todayIso(),
      dateFilterKey: oneOf(singleParam(params, "closingDateKey") ?? (tab === "closing" ? legacyDateKey : undefined), dateFilterKeys, "approval"),
    },
    studentFilters: {
      sourceId: studentSource && studentSourcePattern.test(studentSource) ? studentSource : "library",
      status: oneOf(singleParam(params, "studentStatus"), studentStatuses, "active"),
    },
  };
}

function setRangeParams(params: URLSearchParams, prefix: "dash" | "tx", range: DateRangeState) {
  if (range.preset === "today") return;
  params.set(`${prefix}Range`, range.preset);
  if (range.preset === "custom") {
    params.set(`${prefix}From`, range.from);
    params.set(`${prefix}To`, range.to);
  }
}

export function applyAppViewStateToSearchParams(
  source: URLSearchParams,
  state: AppViewState,
  defaults: { profileId: string; studentSourceId: string },
) {
  const params = new URLSearchParams(source);
  [
    "range", "from", "to", "dateKey", "settlementFilter",
    "dashRange", "dashFrom", "dashTo", "dashDateKey", "dashBusiness",
    "txRange", "txFrom", "txTo", "txDateKey", "txUser", "txFilter", "txRecordType", "txMode", "txBusiness",
    "closingDate", "closingDateKey", "studentSource", "studentStatus",
  ].forEach((key) => params.delete(key));
  params.set("tab", state.tab);

  setRangeParams(params, "dash", state.dashboardFilters.dateRange);
  if (state.dashboardFilters.dateFilterKey !== "approval") params.set("dashDateKey", state.dashboardFilters.dateFilterKey);
  if (state.dashboardFilters.businessType !== "all") params.set("dashBusiness", state.dashboardFilters.businessType);

  setRangeParams(params, "tx", state.transactionFilters.dateRange);
  if (state.transactionFilters.dateFilterKey !== "approval") params.set("txDateKey", state.transactionFilters.dateFilterKey);
  if (state.transactionFilters.profileId && state.transactionFilters.profileId !== defaults.profileId) params.set("txUser", state.transactionFilters.profileId);
  if (state.transactionFilters.activity !== "all") params.set("txFilter", state.transactionFilters.activity);
  if (state.transactionFilters.recordType !== "all") params.set("txRecordType", state.transactionFilters.recordType);
  if (state.transactionFilters.mode !== "all") params.set("txMode", state.transactionFilters.mode);
  if (state.transactionFilters.businessType !== "all") params.set("txBusiness", state.transactionFilters.businessType);

  if (state.closingFilters.date !== todayIso()) params.set("closingDate", state.closingFilters.date);
  if (state.closingFilters.dateFilterKey !== "approval") params.set("closingDateKey", state.closingFilters.dateFilterKey);
  if (state.studentFilters.sourceId !== defaults.studentSourceId) params.set("studentSource", state.studentFilters.sourceId);
  if (state.studentFilters.status !== "active") params.set("studentStatus", state.studentFilters.status);

  return params;
}
