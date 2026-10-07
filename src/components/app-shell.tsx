"use client";

import { createContext, FormEvent, ReactNode, useCallback, useContext, useEffect, useId, useMemo, useReducer, useRef, useState, useSyncExternalStore, useTransition, WheelEvent, type Dispatch, type SetStateAction } from "react";
import { createPortal, useFormStatus } from "react-dom";
import Link from "next/link";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Banknote,
  Bell,
  BellRing,
  BookOpen,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Building2,
  ClipboardList,
  Crop,
  Copy,
  CreditCard,
  GraduationCap,
  Hotel,
  Images,
  Landmark,
  MessageCircle,
  RotateCw,
  Scale,
  LogOut,
  Mic,
  Minus,
  MoreHorizontal,
  Pencil,
  PhoneCall,
  Plus,
  ReceiptText,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
  WalletCards,
  X,
} from "lucide-react";
import {
  approveRecordAction,
  cancelRecordAction,
  checkInAction,
  checkOutAction,
  createAgentSettlementAction,
  createExpenseAction,
  createPaymentAction,
  createWorkTaskAction,
  deleteWorkUpdateAction,
  logoutAction,
  postWorkUpdateAction,
  setWorkTaskStatusAction,
  markNotificationsReadAction,
  requestPaymentTransferAction,
  saveCourseStudentAction,
  saveLibraryStudentAction,
  respondPaymentTransferAction,
  setStudentStatusAction,
  updateSubscriptionAction,
  refundStudentAdvanceAction,
  saveStudentPhotoAction,
  settleCashAction,
  updateRecordAction,
} from "@/app/actions";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import { pullRefreshCompleteEvent, pullRefreshEvent, showOfflineDialogEvent } from "@/lib/client-events";
import { clearPersistedQueryCache, QueryProvider } from "@/components/query-provider";
import { normalizeActionError } from "@/lib/action-errors";
import { addMonthsIso, businessLabels, businessPermissions, formatIndiaTime, formatMoney, INDIA_TIME_ZONE, indiaDateIso, indiaMinuteOfDay, isOwnerish, isSalesAgent, STAFF_TRANSACTION_TRANSFERS_ENABLED, todayIso } from "@/lib/constants";
import { buildDailyPostingEvents, financialActivityPostingEvents, postingEventDate, postingEventsForProfileDate, postingFlowTotals } from "@/lib/transaction-postings";
import type { ActionResult, AgentSettlement, AppData, AppNotification, ApprovalStatus, BootstrapPayload, BusinessType, Course, CourseStudent, DailyPostingEvent, DashboardPayload, DashboardSummary, Expense, FinancialActivity, LedgerEntry, LibraryStudent, ManagerUnitScope, MoneyMovement, MutationPatch, OperationalPagePayload, Payment, PaymentMode, PendingApprovalsPayload, StudentRosterFlag, Profile, ReferralCode, StaffUnitAssignment, StudentCollectionPage, StudentDetailPayload, StudentRosterPayload, StudentSubscriptionHistoryItem, StudentSubscriptionHistoryPage, StudentSubscriptionTransaction, TransactionJourneyLane, TransactionJourneyStep, WorkPage, WorkTask, WorkTaskStatus, WorkUpdate } from "@/lib/types";
import {
  applyAppViewStateToSearchParams,
  defaultClosingFilters,
  defaultDashboardFilters,
  defaultTransactionFilters,
  parseAppViewState,
  rangeForPreset,
  type AppTab,
  type AppViewState,
  type BusinessTypeFilter,
  type ClosingFilterState,
  type DashboardFilterState,
  type DateFilterKey,
  type DateRangePreset,
  type DateRangeState,
  type StudentFilterState,
  type TransactionFilter,
  type TransactionFilterState,
  type TransactionLens,
  type TransactionModeFilter,
  type TransactionRecordType,
} from "@/lib/view-state";

type Tab = AppTab;
type OperationalTab = Extract<Tab, "home" | "payments" | "closing">;
type Language = "en" | "hi";
type ToastNotice = ActionResult & { id: string };
type ActionModal = "positive" | "negative" | null;
type PositiveFlow = BusinessType | "receive_money";
type NegativeFlow = "expense" | "send_money" | "agent_settlement";
type ClientAction = (formData: FormData) => Promise<ActionResult>;
type MutationRefreshScope = "dashboard" | "bootstrap" | "dashboard-library" | "work" | "none";
type MutationRefreshDetail = {
  scope: MutationRefreshScope;
  savingMessageKey: string;
  patch?: MutationPatch;
};
type SettlementDirection = "received_from_user" | "sent_to_user";
type TransactionActionKind = "detail" | "transfer" | "edit" | "delete";
type LibraryMemberMode = "new" | "existing";
type LibraryStudentListMode = "active" | "live" | "inactive" | "all";
type StudentDrawerView = "details" | "history" | "subscription" | "refund";
type StudentRecordSource =
  | { id: "library"; type: "library"; label: string }
  | { id: string; type: "course"; label: string; course: Course };
type CourseStudentRecordSource = Extract<StudentRecordSource, { type: "course" }>;
type CourseStudentRecord = {
  id: string;
  pausedAt?: string | null;
  inactiveAt?: string | null;
  paymentId: string | null;
  identityKey: string;
  displayName: string;
  rollNumber: string | null;
  courseName: string;
  photoUrl: string | null;
  phoneNumber: string | null;
  address: string | null;
  aadharNumber: string | null;
  seatNumber: string | null;
  startTime: string | null;
  endTime: string | null;
  subscriptionStartDate: string | null;
  subscriptionEndDate: string | null;
  lastPaymentDate: string;
  feeAmount: number | null;
  paidAmount: number | null;
  duesAmount: number | null;
  advanceAmount: number | null;
  aadharPhotoUrl: string | null;
  aadharBackPhotoUrl: string | null;
  active: boolean;
};
type StudentRosterCardViewModel = {
  id: string;
  displayName: string;
  rollNumber: string;
  imageUrl: string | null;
  phoneNumber: string | null;
  meta: string;
  /** Shown bold after the meta line. */
  timing?: string | null;
  /** Shown as a "Seat: …" badge only when a seat is assigned. */
  seatNumber?: string | null;
  expiryLabel: string;
  expired: boolean;
};
type NormalizedDateRange = {
  from: string;
  to: string;
};

type UserClosingSummary = {
  profile: Profile;
  opening: number;
  collected: number;
  expenses: number;
  received: number;
  sent: number;
  adjustments: number;
  closing: number;
  dayEntries: LedgerEntry[];
  inCash: number;
  inOnline: number;
  outCash: number;
  outOnline: number;
};

type ClosingReviewFilter = "all" | "in" | "out" | "pending";
type ClosingReviewMode = "all" | "cash" | "online";

type ClosingPendingBreakdown = {
  totalAmount: number;
  totalRecordCount: number;
  onlineAmount: number;
  /** Cash collected / spent on the closing date that still awaits approval. */
  dayCashIn: number;
  dayCashOut: number;
};

type ClosingCardViewModel = {
  summary: UserClosingSummary;
  pending: ClosingPendingBreakdown;
};

type AgentIncentiveSummary = {
  earned: number;
  settled: number;
  pending: number;
  balance: number;
  count: number;
};
type AgentIncentiveBalance = { agent: Profile; balance: number };
type BusinessDashboardStatus = {
  business: BusinessType;
  collection: number;
  cashCollection: number;
  onlineCollection: number;
  expenses: number;
  settlement: number;
  pendingAmount: number;
  pendingCount: number;
};
type PendingReviewRecord = {
  id: string;
  recordType: "payment" | "expense";
  transactionType: string;
  staffName: string;
  serviceType: string;
  amount: number;
  cashAmount: number;
  onlineAmount: number;
  date: string;
  note: string;
  status: string;
  statusLabel: string;
  cashStatus?: ApprovalStatus | null;
  onlineStatus?: ApprovalStatus | null;
  hasPendingTransfer?: boolean;
  tone: "positive" | "negative";
  icon: ReactNode;
};
type PendingContextRecord = {
  id: string;
  transactionType: string;
  staffName: string;
  serviceType: string;
  amount: number;
  date: string;
  note: string;
  statusLabel: string;
  tone: "positive" | "negative" | "neutral";
  icon: ReactNode;
};

const actionIdempotencyField = "_action_idempotency_key";

function fallbackProfileImage(fullName: string) {
  const initials = fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.match(/[a-z0-9]/i)?.[0] ?? "")
    .join("")
    .toUpperCase() || "U";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" fill="#dce8dc"/><text x="80" y="88" text-anchor="middle" dominant-baseline="middle" fill="#173c32" font-family="Arial,sans-serif" font-size="58" font-weight="700">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getProfileImage(fullName: string, avatarUrl?: string | null) {
  const candidate = avatarUrl?.trim();
  if (candidate && /^(?:https?:\/\/|data:image\/|blob:|\/(?!\/))/i.test(candidate)) return candidate;
  return fallbackProfileImage(fullName);
}

function SafeAvatarImage({
  fullName,
  avatarUrl,
  alt,
  className,
}: {
  fullName: string;
  avatarUrl?: string | null;
  alt: string;
  className?: string;
}) {
  const preferredSource = getProfileImage(fullName, avatarUrl);
  const fallbackSource = fallbackProfileImage(fullName);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const source = failedSource === preferredSource ? fallbackSource : preferredSource;

  return (
    // Signed private-storage URLs and data-URL fallbacks are intentionally not
    // routed through the Next image optimizer.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      className={className}
      src={source}
      onError={() => {
        if (source !== fallbackSource) setFailedSource(preferredSource);
      }}
    />
  );
}

function getTabIcon(id: Tab) {
  switch (id) {
    case "home":
      return <Landmark size={21} />;
    case "payments":
      return <ReceiptText size={21} />;
    case "library_students":
      return <BookOpen size={21} />;
    case "closing":
      return <ClipboardList size={21} />;
    case "work":
      return <ClipboardCheck size={21} />;
    case "settings":
      return <Settings size={21} />;
    case "notifications":
      return <Bell size={21} />;
  }
}

const tabItems: { id: Tab; labelKey: string; icon: ReactNode }[] = [
  { id: "home", labelKey: "dashboard", icon: <Landmark size={17} /> },
  { id: "payments", labelKey: "transactions", icon: <ReceiptText size={17} /> },
  { id: "library_students", labelKey: "libraryStudents", icon: <BookOpen size={17} /> },
  { id: "closing", labelKey: "closing", icon: <ClipboardList size={17} /> },
  { id: "work", labelKey: "work", icon: <ClipboardCheck size={17} /> },
];

const paymentOptions: { type: BusinessType | "expense"; labelKey: string; icon: ReactNode }[] = [
  { type: "guest_house", labelKey: "roomBooking", icon: <Hotel size={18} /> },
  { type: "library", labelKey: "library", icon: <BookOpen size={18} /> },
  { type: "course", labelKey: "course", icon: <GraduationCap size={18} /> },
  { type: "general", labelKey: "collectMoney", icon: <WalletCards size={18} /> },
  { type: "expense", labelKey: "expense", icon: <Banknote size={18} /> },
];

const dateRangeOptions: { value: DateRangePreset; labelKey: string }[] = [
  { value: "today", labelKey: "today" },
  { value: "yesterday", labelKey: "yesterday" },
  { value: "this_month", labelKey: "thisMonth" },
  { value: "custom", labelKey: "customRange" },
];

const messages: Record<Language, Record<string, string>> = {
  en: {
    accept: "Accept",
    acceptTransfer: "Accept transfer",
    active: "Active",
    address: "Address",
    aadharCardPhoto: "Aadhar card photo",
    aadharFront: "Upload Aadhar front",
    aadharBack: "Upload Aadhar back",
    aadharPhotoPreview: "Aadhar card preview",
    aadharFrontPreview: "Aadhar front preview",
    aadharBackPreview: "Aadhar back preview",
    aadharNumber: "Aadhar number",
    addSubscription: "Add subscription",
    addCourse: "Add course",
    addExpense: "Add expense",
    addExpenseOrSettlement: "Add expense or settlement",
    addImage: "Add image",
    camera: "Camera",
    gallery: "Gallery",
    fullTime: "Full time",
    addSlot: "Add slot",
    removeSlot: "Remove slot",
    slotEndAfterStart: "Each slot must end after it starts.",
    slotsOverlap: "Time slots overlap. Change the times so they do not overlap.",
    pausedTag: "Paused",
    markPaused: "Mark paused",
    changeStatus: "Pause or mark inactive?",
    pauseOrInactiveHelp: "Paused: back within 45 days with no admission fee (after 45 days it becomes Inactive). Inactive: admission fee applies on return. Profile and history stay unchanged.",
    admissionFee: "Admission fee",
    admissionFeeWaived: "No admission fee: paused {days} days ago (within 45 days).",
    admissionFeeApplies: "Inactive student: admission fee applies.",
    newStartsToday: "Paused / inactive students start a new subscription from today.",
    savingPhoto: "Saving photo…",
    photoSaved: "Photo saved",
    photoSaveFailed: "Could not save the photo. It will be saved with the form.",
    photoRestored: "Photo restored from last time",
    remove: "Remove",
    returnAdvance: "Return advance",
    seatAssigned: "Seat assigned",
    lockerAssigned: "Locker assigned",
    expiringSoon: "Expiring soon",
    sortBy: "Sort by",
    sortExpiry: "Expiry",
    expiringSoonHelp: "Expiring soon = subscription ends within the next 7 days.",
    clearFilters: "Clear",
    students: "Students",
    returnAdvanceHelp: "Recorded as an expense of this unit and taken off the student's advance.",
    cropPhoto: "Crop photo",
    rotate: "Rotate",
    fullPhoto: "Full photo",
    addReferral: "Add referral",
    addRoom: "Add room",
    addStaff: "Add staff or sales agent",
    admin: "Admin",
    adminOnlySettings: "Settings are available to admin and owner only.",
    all: "All",
    allAccounts: "All accounts",
    allStaff: "All Staff",
    allTypes: "All types",
    advance: "Advance",
    agent: "Agent",
    agentAccessNote: "Read-only incentive access",
    agentCode: "Agent code",
    agentPayout: "Agent incentive payout",
    agentPayoutLower: "incentive payout",
    amount: "Amount",
    amountLeft: "Amount left",
    amountReceived: "Cash amount",
    approve: "Approve",
    approvedActivity: "Approved activity",
    approveCollection: "Approve collection",
    approveExpense: "Approve expense",
    approvalDate: "Approval date",
    awaitingOwnerApproval: "Awaiting owner approval",
    awaitingOwnerVerification: "Awaiting Owner verification",
    back: "Back",
    backlog: "Backlog",
    balanceIncentive: "Incentive due",
    business: "Business",
    cancel: "Cancel",
    cancelWrongEntry: "Cancel wrong entry",
    cancelledExcluded: "Cancelled · excluded from totals",
    cash: "Cash",
    cashAndOnline: "Cash and online",
    cashBalances: "Cash balances",
    cashCollection: "Cash collection",
    cashCustody: "Cash custody moved",
    cashExpenseReview: "Cash / expense review",
    cashIn: "IN",
    cashInHand: "Cash in hand",
    awaitingYourApproval: "Awaiting your approval",
    awaitingApproval: "Awaiting approval",
    pending: "Pending",
    pendingAllDates: "All dates · not yet approved",
    retry: "Retry",
    asOf: "As of",
    since: "since",
    allUnits: "All units",
    assignedUnits: "Assigned units",
    assignedUnit: "Assigned unit",
    total: "Total",
    totalCash: "Total cash",
    cashInCollected: "IN",
    cashOut: "OUT",
    cashOutExpenses: "OUT",
    cashTransfer: "CASH Transfer",
    cashWithStaff: "Cash with staff",
    remainingCashWithStaff: "Remaining cash in hand of staff",
    includesPendingStaffCash: "Includes pending cash held by staff",
    currentHolder: "Current holder",
    changeRequests: "Change requests",
    changePassword: "Change password",
    closing: "Closing",
    work: "Work",
    noCheckOut: "No check-out recorded",
    myDay: "My day",
    updates: "Updates",
    previousDay: "Previous day",
    nextDay: "Next day",
    todaysCash: "Today's cash",
    verifiedOnline: "Verified online",
    awaitingVerification: "Awaiting",
    date: "Date",
    member: "Member",
    loading: "Loading…",
    attendance: "Attendance",
    checkIn: "Check in",
    checkOut: "Check out",
    checkedInSince: "In since",
    notCheckedIn: "Not checked in",
    workedFor: "Worked",
    teamToday: "Team attendance",
    present: "Present",
    absent: "Not in",
    postUpdate: "Post update",
    whatDidYouDo: "What did you do today?",
    addPhoto: "Photo",
    recordVoice: "Voice note",
    stopRecording: "Stop",
    removeVoice: "Remove voice note",
    linkedTask: "Linked task",
    noLinkedTask: "No task",
    markTaskDone: "Mark this task done",
    tasks: "Tasks",
    addTask: "Add task",
    taskTitle: "Task",
    assignTo: "Assign to",
    dueDate: "Due date",
    taskNotes: "Notes",
    toDo: "To do",
    inProgress: "In progress",
    done: "Done",
    startTask: "Start",
    completeTask: "Complete",
    reopenTask: "Reopen",
    workLog: "Work log",
    noWorkUpdates: "No updates for this day yet.",
    noTasksHere: "No tasks here.",
    everyone: "Everyone",
    me: "Me",
    overdue: "Overdue",
    deleteUpdate: "Delete update",
    microphoneBlocked: "Allow microphone access to record a voice note.",
    voiceNotSupported: "Voice recording is not supported on this device.",
    completedTask: "completed",
    assignedBy: "by",
    closingBalance: "Closing balance",
    closingBalancePostingNote: "IN and OUT use transaction date. Opening, cash in hand, and closing balance remain based on approval/posting date.",
    closingCash: "Closing cash",
    closingCashInHand: "Closing cash in hand",
    code: "Code",
    closeNavigation: "Close navigation",
    closeModal: "Close modal",
    openProfileMenu: "Open profile menu",
    collectDue: "Collect due",
    collectPayment: "Collect payment",
    collectMoney: "Collect money",
    collections: "Collections",
    totalCollections: "Total collections",
    totalPaid: "Total paid",
    totalCollectionForBusiness: "Total collection for the business",
    collected: "Collected",
    copyReferralCode: "Copy code",
    confirmReceived: "Confirm received",
    confirmed: "Confirmed",
    confirmedPayouts: "Paid incentive",
    collectedByStaff: "Collected payment",
    businessStatus: "Business status",
    businessStatusHelp: "Total collection, OUT, and pending review by business.",
    cashImpact: "Cash impact",
    cashToSettle: "Cash to settle",
    course: "Course",
    courseName: "Course name",
    courses: "Courses",
    createAccount: "Create account",
    customRange: "Custom range",
    dailyClosing: "Daily closing",
    dailyTransactions: "Daily transactions",
    dashboard: "Dashboard",
    dateRange: "Date range",
    dateKey: "Filter date by",
    deleteTransaction: "Delete",
    deleteUser: "Delete user",
    deleted: "Deleted",
    description: "Description",
    direction: "Direction",
    discount: "Discount",
    discountAmount: "Discount amount",
    discountPercent: "Discount %",
    discountType: "Discount type",
    dues: "Dues",
    duesCollectionHelp: "This receipt will reduce the pending dues for the existing subscription only.",
    email: "Email",
    endDate: "End date",
    endTime: "End time",
    editTransaction: "Edit",
    expired: "Expired",
    expense: "Expense",
    expenseDate: "Expense date",
    expenses: "Expenses",
    exportCsv: "Export CSV",
    expiryNotSet: "Expiry not set",
    expiresIn: "Expires in",
    remainingSuffix: "remaining",
    expiresToday: "Expires today",
    finalizeAndSettle: "Finalize & Settle",
    fee: "Fee",
    filters: "Filters",
    filterResults: "Filter results",
    applyFilters: "Apply filters",
    resetFilters: "Reset",
    activeFilters: "Applied filters",
    businessModule: "Business module",
    allBusinesses: "All businesses",
    transactionType: "Transaction type",
    paymentMode: "Payment mode",
    paymentTransactions: "payments",
    partiallyVerified: "Partially verified",
    studentSource: "Student source",
    studentStatus: "Student status",
    cashTransfers: "Cash transfers",
    agentPayouts: "Agent payouts",
    filterDateError: "Choose a valid start and end date. The start date cannot be after the end date.",
    businessWideBalance: "Business-wide balance · module filter does not change this amount",
    filterPayments: "Filter payments",
    fullName: "Full name",
    from: "From",
    general: "General",
    guestHouse: "Guest House",
    hidden: "Hidden",
    incentive: "Incentive",
    incentiveAmount: "Incentive amount",
    incentiveEarned: "Incentive earned",
    incentivePayout: "Incentive payout",
    incentivePercent: "Incentive %",
    incentiveType: "Incentive type",
    in: "IN",
    inactive: "Inactive",
    label: "Label",
    language: "Language",
    languageHelp: "Choose the language used in this app.",
    languageSettings: "Language setting",
    ledger: "Ledger",
    ledgerEntry: "Ledger entry",
    library: "Library",
    libraryStudent: "Library student",
    libraryStudents: "Students",
    memberType: "Member type",
    existingMember: "Existing member",
    renewSubscription: "Renew subscription",
    studentDetails: "Student details",
    details: "Details",
    backToDetails: "Back to details",
    loadOlder: "Load older",
    notAdded: "Not added",
    studentRecords: "Student records",
    studentSearch: "Search student",
    clearSearch: "Clear search",
    showActiveStudents: "Show active students",
    activeStudents: "Active students",
    ago: "ago",
    day: "day",
    days: "days",
    liveStudents: "LIVE students",
    inactiveStudents: "Inactive students",
    inactiveTag: "Inactive",
    expiredSubscription: "Expired subscription",
    expiresOn: "Expires on",
    lastPayment: "Last payment",
    lockerNumber: "Locker number",
    markInactive: "Mark inactive",
    reactivate: "Reactivate",
    newStudent: "New student",
    newPassword: "New password",
    selectStudent: "Select student",
    studentPhoto: "Student photo",
    studentProfile: "Student profile",
    subscription: "Subscription",
    subscriptionHistory: "Subscription history",
    editSubscription: "Edit subscription",
    amountLockedAfterApproval: "Approved · amount and date locked",
    subscriptionPeriod: "Subscription",
    timing: "Timing",
    logout: "Logout",
    main: "Main",
    markSettled: "Mark settled",
    mixed: "Mixed",
    mode: "Mode",
    moneyIn: "Money in",
    moneyInOut: "Money in and out",
    moneyOut: "Money out",
    moreOptions: "More options",
    name: "Name",
    negativeEntry: "Negative entry",
    netBalance: "Net balance",
    netCashInHand: "Net cash in hand",
    netSettlement: "Net settlement",
    noAgent: "No agent",
    noNotifications: "No notifications yet.",
    noReferralCode: "No active code assigned",
    noReason: "No reason",
    noRecords: "No records found.",
    noRecordsForFilter: "No records found for this range and filter.",
    needsReconciliation: "Needs reconciliation",
    record: "record",
    records: "records",
    reviewed: "Reviewed",
    note: "Note",
    notifications: "Notifications",
    online: "Online",
    onlineCollection: "Online collection",
    onlineOwnerBankNote: "Online is verified against the Owner’s bank and does not affect cash in hand.",
    onlineIn: "Online IN",
    operationalAssignment: "Transaction assignment moved",
    onlinePart: "Online part",
    openNavigation: "Open navigation",
    openingCash: "Opening cash",
    openingBalance: "Opening balance",
    openingCashBalance: "Opening",
    optional: "Optional",
    out: "OUT",
    owner: "Owner",
    ownerOnlineVerification: "Online Collection verification",
    ownerOnly: "Owner only",
    primaryOwner: "Owner",
    coOwner: "Manager",
    ownerSettlement: "Owner Settlement",
    ownerSettlementLower: "Owner settlement",
    outflowsOnly: "Outflows only",
    paid: "Paid",
    password: "Password",
    paymentDate: "Payment date",
    paymentAmount: "Payment",
    paymentHistory: "Payment history",
    paymentType: "Payment type",
    payments: "Payments",
    paymentsFor: "Payments for",
    paymentsOnly: "Payments only",
    pendingCashInHand: "Pending cash in hand",
    pendingDues: "Pending dues",
    pendingReviewAmount: "Pending review amount",
    pendingReviewItems: "Pending review items",
    pendingPayout: "Pending incentive",
    pendingIncentive: "Pending incentive",
    pendingReview: "Pending review",
    photo: "Photo",
    photoPreview: "Photo preview",
    photoReady: "Photo ready to upload",
    compressingPhoto: "Compressing photo…",
    phone: "Phone",
    callStudent: "Call student",
    personalSummary: "Personal collection summary",
    quickActions: "Quick actions",
    rangeTo: "to",
    reasonOptional: "Reason optional",
    reasonRequired: "Reason required",
    referral: "Referral",
    referralCode: "Referral code",
    referralCodeCopied: "Referral code copied.",
    referralCodeUnavailable: "No referral code is assigned yet.",
    referralCodes: "Referral codes",
    referralTransactions: "Referral transactions",
    received: "Received",
    receivedStatus: "Received",
    receiveMoney: "Receive Cash",
    receivedFormTitle: "Receive Cash",
    reject: "Reject",
    rejectedTransfer: "Rejected transfer",
    rejectForReverification: "Reject for reverification",
    remaining: "Remaining",
    remark: "Remark",
    requestCancel: "Request cancel",
    requestTransfer: "Request transfer",
    acceptedTransfer: "Accepted transfer",
    incomingTransfer: "Incoming transfer",
    pendingTransfer: "Pending transfer",
    resolveTransferFirst: "Resolve transfer first",
    transferCashAmount: "Transfer cash",
    transferToStaff: "Transfer to staff",
    transferRequested: "Transfer requested",
    transferTransaction: "Transfer",
    viewPhoto: "View photo",
    reviewAndSettle: "Review",
    reviewToday: "Today",
    reviewPending: "Pending",
    reviewPendingButton: "Review pending",
    reviewPendingFirst: "Review pending first",
    reviewSettlementNotice: "Pending Collections and Expenses are reviewed separately from cash transfers.",
    settlementAmountHelp: "Enter the physical cash amount transferred between the selected users.",
    role: "Role",
    roll: "Roll",
    rollNumber: "Roll number",
    rollNumberAlreadyExist: "roll number already exist.",
    room: "Room",
    roomBooking: "Room Booking",
    roomNo: "Room no.",
    rooms: "Rooms",
    salesAgent: "Sales agent",
    save: "Save",
    saving: "Saving...",
    savingChanges: "Saving changes...",
    savingTransaction: "Saving transaction...",
    select: "Select",
    selectAgent: "Select agent",
    selectAnotherType: "Select another type",
    selectCourse: "Select course",
    selectRoom: "Select room",
    selectStaff: "Select staff",
    selectUser: "Select user",
    searchUser: "Search user",
    sendPayout: "Pay incentive",
    sendMoney: "Send Cash",
    sendFormTitle: "Send Cash",
    shareReferralCode: "Share code",
    sendMoneyLower: "send cash",
    sent: "Sent",
    sentToStaff: "Sent to staff",
    sentToUser: "Sent to user",
    seat: "Seat",
    seatNumber: "Seat number",
    settings: "Settings",
    settled: "Settled",
    settledAmount: "Settled",
    settlementDue: "Settlement due",
    settlementLikePending: "Pending cash movements",
    settlementActivity: "Settlement activity",
    settlementDate: "Settlement date",
    transferDate: "Transfer date",
    settlementHistory: "Settlement history",
    settlements: "Settlements",
    shikshanSansthan: "Shikshan Sansthan",
    slotHours: "Slot hours",
    staff: "Staff",
    staffBusinessStatus: "My service status",
    staffBusinessStatusHelp: "IN, OUT, and pending review by service.",
    staffDailyLedger: "Staff Daily Ledger",
    userDailyLedger: "User Daily Ledger",
    staffPermissions: "Staff permissions",
    spent: "Spent",
    startDate: "Start date",
    startTime: "Start time",
    status: "Status",
    to: "to",
    toEmployee: "To employee",
    today: "Today",
    transactionDate: "Transaction date",
    totalClosing: "Total closing",
    totalCollected: "Total collected",
    totalExpenses: "Total expenses",
    totalIn: "IN",
    totalOut: "OUT",
    totalCollection: "Total collection",
    ownerAccountCredit: "Owner account credit",
    pendingDateUsesTransaction: "Pending uses transaction date until approved.",
    totalOpening: "Total opening",
    totalRecorded: "Total recorded",
    tillDate: "Till date",
    transferCash: "Transfer cash",
    transferred: "Transferred",
    transferHistory: "Transfer history",
    transfers: "Transfers",
    paymentJourney: "Payment journey",
    journeyCollected: "Collected",
    journeyAccepted: "Accepted",
    journeyAwaitingAcceptance: "Waiting for acceptance",
    journeyRejected: "Rejected",
    journeyAwaitingApproval: "Waiting for approval",
    approvalPending: "Approval pending",
    approvedBy: "Approved by",
    transaction: "Transaction",
    transactionHistory: "Transaction history",
    transactionReview: "Transactions review",
    transactions: "Transactions",
    thisMonth: "This month",
    until: "Until",
    unknown: "Unknown",
    neutralized: "Neutralized",
    unreadNotifications: "Unread notifications",
    user: "User",
    verifyPayment: "Verify payment",
    verified: "Verified",
    verifiedByOwner: "Verified by Owner",
    verifyOnline: "Verify online",
    viewAll: "View all",
    yesterday: "Yesterday",
    receivedFromStaff: "Received from staff",
    receivedFromUser: "Received from user",
    receivedBy: "Received by",
    receiptPending: "Receipt pending",
    cashReceived: "Cash Received",
    cashSent: "Cash Sent",
    recordReceived: "Record received",
    recordSent: "Record sent",
    self: "Self",
    adjustments: "Adjustments",
  },
  hi: {
    accept: "मान लें",
    acceptTransfer: "ट्रांसफर मान लें",
    active: "चालू",
    address: "पता",
    aadharCardPhoto: "आधार कार्ड फोटो",
    aadharFront: "आधार का आगे वाला भाग अपलोड करें",
    aadharBack: "आधार का पीछे वाला भाग अपलोड करें",
    aadharPhotoPreview: "आधार कार्ड प्रीव्यू",
    aadharFrontPreview: "आधार आगे का प्रीव्यू",
    aadharBackPreview: "आधार पीछे का प्रीव्यू",
    aadharNumber: "आधार नंबर",
    addSubscription: "सब्सक्रिप्शन जोड़ें",
    addCourse: "कोर्स जोड़ें",
    addExpense: "खर्च जोड़ें",
    addExpenseOrSettlement: "खर्च या जमा जोड़ें",
    addImage: "फोटो जोड़ें",
    camera: "कैमरा",
    gallery: "गैलरी",
    fullTime: "पूरा समय",
    addSlot: "स्लॉट जोड़ें",
    removeSlot: "स्लॉट हटाएँ",
    slotEndAfterStart: "हर स्लॉट शुरू होने के बाद ही खत्म होना चाहिए।",
    slotsOverlap: "स्लॉट का समय आपस में टकरा रहा है। समय बदलें।",
    pausedTag: "रोका गया",
    markPaused: "रोकें (पॉज़)",
    changeStatus: "पॉज़ करें या बंद करें?",
    pauseOrInactiveHelp: "पॉज़: 45 दिन में लौटने पर एडमिशन फीस नहीं (45 दिन बाद बंद हो जाएगा)। बंद: लौटने पर एडमिशन फीस लगेगी। प्रोफाइल और हिसाब वैसा ही रहेगा।",
    admissionFee: "एडमिशन फीस",
    admissionFeeWaived: "एडमिशन फीस नहीं: {days} दिन पहले पॉज़ किया (45 दिन के अंदर)।",
    admissionFeeApplies: "बंद छात्र: एडमिशन फीस लगेगी।",
    newStartsToday: "पॉज़/बंद छात्र का नया सब्सक्रिप्शन आज से शुरू होगा।",
    savingPhoto: "फोटो सेव हो रही है…",
    photoSaved: "फोटो सेव हो गई",
    photoSaveFailed: "फोटो सेव नहीं हुई। फॉर्म के साथ सेव होगी।",
    photoRestored: "पिछली बार की फोटो वापस लाई गई",
    remove: "हटाएँ",
    returnAdvance: "एडवांस लौटाएँ",
    seatAssigned: "सीट मिली",
    lockerAssigned: "लॉकर मिला",
    expiringSoon: "जल्द खत्म",
    sortBy: "क्रम",
    sortExpiry: "खत्म होने की तारीख",
    expiringSoonHelp: "जल्द खत्म = अगले 7 दिनों में सब्सक्रिप्शन खत्म।",
    clearFilters: "हटाएँ",
    students: "छात्र",
    returnAdvanceHelp: "यह यूनिट के खर्च में दर्ज होगा और छात्र के एडवांस से घटेगा।",
    cropPhoto: "फोटो काटें",
    rotate: "घुमाएँ",
    fullPhoto: "पूरी फोटो",
    addReferral: "रेफरल जोड़ें",
    addRoom: "कमरा जोड़ें",
    addStaff: "स्टाफ या एजेंट जोड़ें",
    admin: "एडमिन",
    adminOnlySettings: "सेटिंग सिर्फ मालिक और एडमिन के लिए है।",
    all: "सब",
    allAccounts: "सारे अकाउंट",
    allStaff: "सारा स्टाफ",
    allTypes: "सब तरह",
    advance: "अधिक जमा",
    agent: "एजेंट",
    agentAccessNote: "सिर्फ कमिशन देखने का अधिकार",
    agentCode: "एजेंट कोड",
    agentPayout: "एजेंट कमिशन भुगतान",
    agentPayoutLower: "कमिशन भुगतान",
    amount: "रकम",
    amountLeft: "बाकी रकम",
    amountReceived: "नकद राशि",
    approve: "ठीक है",
    approvedActivity: "मंजूर गतिविधि",
    approveCollection: "कलेक्शन मंजूर करें",
    approveExpense: "खर्च मंजूर करें",
    approvalDate: "मंजूरी की तारीख",
    awaitingOwnerApproval: "मालिक की मंजूरी बाकी",
    awaitingOwnerVerification: "मालिक की पुष्टि बाकी",
    back: "वापस",
    backlog: "बैकलॉग",
    balanceIncentive: "कमिशन बाकी",
    business: "काम",
    cancel: "रद्द करें",
    cancelWrongEntry: "गलत एंट्री हटाएं",
    cancelledExcluded: "रद्द · कुल रकम में शामिल नहीं",
    cash: "नकद",
    cashAndOnline: "नकद और ऑनलाइन",
    cashBalances: "नकद बाकी",
    cashCollection: "नकद जमा",
    cashCustody: "नकद जिम्मेदारी बदली",
    cashExpenseReview: "नकद / खर्च जांच",
    cashIn: "IN",
    cashInHand: "हाथ में नकद",
    awaitingYourApproval: "आपकी मंजूरी बाकी",
    awaitingApproval: "मंजूरी बाकी",
    pending: "बाकी",
    pendingAllDates: "सभी तारीखें · अभी मंजूर नहीं",
    retry: "फिर कोशिश करें",
    asOf: "तक",
    since: "से",
    allUnits: "सभी यूनिट",
    assignedUnits: "दी गई यूनिट",
    assignedUnit: "दी गई यूनिट",
    total: "कुल",
    totalCash: "कुल नकद",
    cashInCollected: "IN",
    cashOut: "OUT",
    cashOutExpenses: "OUT",
    cashTransfer: "नकद ट्रांसफर",
    cashWithStaff: "स्टाफ के पास नकद",
    remainingCashWithStaff: "स्टाफ के पास बचा नकद",
    includesPendingStaffCash: "स्टाफ के पास बाकी मंजूरी वाला नकद भी शामिल है",
    currentHolder: "मौजूदा होल्डर",
    changeRequests: "बदलाव की मांग",
    changePassword: "पासवर्ड बदलें",
    closing: "दिन बंद",
    work: "काम",
    noCheckOut: "चेक आउट दर्ज नहीं",
    myDay: "मेरा दिन",
    updates: "अपडेट",
    previousDay: "पिछला दिन",
    nextDay: "अगला दिन",
    todaysCash: "आज का नकद",
    verifiedOnline: "सत्यापित ऑनलाइन",
    awaitingVerification: "बाकी",
    date: "तारीख",
    member: "सदस्य",
    loading: "लोड हो रहा है…",
    attendance: "हाज़िरी",
    checkIn: "चेक इन",
    checkOut: "चेक आउट",
    checkedInSince: "से मौजूद",
    notCheckedIn: "चेक इन नहीं किया",
    workedFor: "काम किया",
    teamToday: "टीम हाज़िरी",
    present: "मौजूद",
    absent: "मौजूद नहीं",
    postUpdate: "अपडेट डालें",
    whatDidYouDo: "आज आपने क्या किया?",
    addPhoto: "फ़ोटो",
    recordVoice: "वॉइस नोट",
    stopRecording: "रोकें",
    removeVoice: "वॉइस नोट हटाएँ",
    linkedTask: "जुड़ा काम",
    noLinkedTask: "कोई काम नहीं",
    markTaskDone: "इस काम को पूरा करें",
    tasks: "काम की सूची",
    addTask: "काम जोड़ें",
    taskTitle: "काम",
    assignTo: "किसे दें",
    dueDate: "अंतिम तारीख",
    taskNotes: "नोट्स",
    toDo: "करना है",
    inProgress: "चल रहा है",
    done: "पूरा",
    startTask: "शुरू करें",
    completeTask: "पूरा करें",
    reopenTask: "फिर खोलें",
    workLog: "काम का लेखा",
    noWorkUpdates: "इस दिन का कोई अपडेट नहीं।",
    noTasksHere: "यहाँ कोई काम नहीं।",
    everyone: "सभी",
    me: "मैं",
    overdue: "समय निकल गया",
    deleteUpdate: "अपडेट हटाएँ",
    microphoneBlocked: "वॉइस नोट के लिए माइक की अनुमति दें।",
    voiceNotSupported: "इस डिवाइस पर वॉइस रिकॉर्डिंग उपलब्ध नहीं है।",
    completedTask: "पूरा किया",
    assignedBy: "द्वारा",
    closingBalance: "बंद हिसाब",
    closingBalancePostingNote: "IN और OUT ट्रांजैक्शन तारीख से हैं। शुरुआती, हाथ में नकद और बंद हिसाब मंजूरी की तारीख से रहते हैं।",
    closingCash: "दिन के अंत का नकद",
    closingCashInHand: "बंद होते समय हाथ में नकद",
    code: "कोड",
    closeNavigation: "मेनू बंद करें",
    closeModal: "बंद करें",
    openProfileMenu: "प्रोफाइल मेनू खोलें",
    collectDue: "बाकी जमा करें",
    collectPayment: "पैसा जमा करें",
    collectMoney: "पैसा लें",
    collections: "कलेक्शन",
    totalCollections: "कुल कलेक्शन",
    totalPaid: "कुल जमा",
    totalCollectionForBusiness: "काम का कुल कलेक्शन",
    collected: "जमा",
    copyReferralCode: "कोड कॉपी करें",
    confirmReceived: "मिल गया",
    confirmed: "पक्का",
    confirmedPayouts: "दिया गया कमिशन",
    collectedByStaff: "जमा पैसा",
    businessStatus: "काम का स्टेटस",
    businessStatusHelp: "काम का कुल कलेक्शन, OUT और बाकी जांच।",
    cashImpact: "नकद असर",
    cashToSettle: "जमा करने की नकद",
    course: "कोर्स",
    courseName: "कोर्स नाम",
    courses: "कोर्स",
    createAccount: "खाता बनाएं",
    customRange: "कस्टम रेंज",
    dailyClosing: "आज का हिसाब",
    dailyTransactions: "आज की एंट्री",
    dashboard: "मुख्य पेज",
    dateRange: "तारीख रेंज",
    dateKey: "तारीख का आधार",
    deleteTransaction: "हटाएं",
    deleteUser: "यूजर हटाएं",
    deleted: "हटाए गए",
    description: "जानकारी",
    direction: "किस तरफ",
    discount: "छूट",
    discountAmount: "छूट रकम",
    discountPercent: "छूट %",
    discountType: "छूट प्रकार",
    dues: "बाकी",
    duesCollectionHelp: "यह भुगतान पुराने सब्सक्रिप्शन की बाकी रकम ही कम करेगा।",
    email: "ईमेल",
    endDate: "खत्म तारीख",
    endTime: "खत्म समय",
    editTransaction: "बदलें",
    expired: "खत्म",
    expense: "खर्च",
    expenseDate: "खर्च तारीख",
    expenses: "खर्च",
    exportCsv: "CSV निकालें",
    expiryNotSet: "खत्म तारीख नहीं है",
    expiresIn: "इतने दिन में खत्म",
    remainingSuffix: "बाकी",
    expiresToday: "आज खत्म",
    finalizeAndSettle: "फाइनल जमा करें",
    fee: "फीस",
    filters: "फ़िल्टर",
    filterResults: "नतीजे फ़िल्टर करें",
    applyFilters: "फ़िल्टर लागू करें",
    resetFilters: "रीसेट",
    activeFilters: "लागू फ़िल्टर",
    businessModule: "बिज़नेस मॉड्यूल",
    allBusinesses: "सभी बिज़नेस",
    transactionType: "लेन-देन प्रकार",
    paymentMode: "भुगतान माध्यम",
    paymentTransactions: "भुगतान",
    partiallyVerified: "आंशिक रूप से पक्का",
    studentSource: "छात्र स्रोत",
    studentStatus: "छात्र स्थिति",
    cashTransfers: "नकद ट्रांसफर",
    agentPayouts: "एजेंट भुगतान",
    filterDateError: "सही शुरू और समाप्ति तारीख चुनें। शुरू की तारीख समाप्ति तारीख के बाद नहीं हो सकती।",
    businessWideBalance: "पूरे बिज़नेस का बैलेंस · मॉड्यूल फ़िल्टर से यह राशि नहीं बदलती",
    filterPayments: "छांटें",
    fullName: "पूरा नाम",
    from: "से",
    general: "साधारण",
    guestHouse: "गेस्ट हाउस",
    hidden: "छुपा",
    incentive: "कमिशन",
    incentiveAmount: "कमिशन रकम",
    incentiveEarned: "बना कमिशन",
    incentivePayout: "कमिशन भुगतान",
    incentivePercent: "कमिशन %",
    incentiveType: "कमिशन प्रकार",
    in: "IN",
    inactive: "बंद",
    label: "लेबल",
    language: "भाषा",
    languageHelp: "ऐप में कौन सी भाषा दिखेगी।",
    languageSettings: "भाषा सेटिंग",
    ledger: "हिसाब",
    ledgerEntry: "हिसाब एंट्री",
    library: "लाइब्रेरी",
    libraryStudent: "लाइब्रेरी छात्र",
    libraryStudents: "छात्र",
    memberType: "सदस्य प्रकार",
    existingMember: "पुराना सदस्य",
    renewSubscription: "सब्सक्रिप्शन रिन्यू करें",
    studentDetails: "छात्र जानकारी",
    details: "जानकारी",
    backToDetails: "जानकारी पर वापस जाएं",
    loadOlder: "पुराना हिसाब दिखाएं",
    notAdded: "नहीं जोड़ा गया",
    studentRecords: "छात्र रिकॉर्ड",
    studentSearch: "छात्र खोजें",
    clearSearch: "खोज हटाएं",
    showActiveStudents: "चालू छात्र दिखाएं",
    activeStudents: "चालू छात्र",
    ago: "पहले",
    day: "दिन",
    days: "दिन",
    liveStudents: "LIVE छात्र",
    inactiveStudents: "बंद छात्र",
    inactiveTag: "बंद",
    expiredSubscription: "सब्सक्रिप्शन खत्म",
    expiresOn: "खत्म तारीख",
    lastPayment: "आखिरी भुगतान",
    lockerNumber: "लॉकर नंबर",
    markInactive: "बंद करें",
    reactivate: "फिर चालू करें",
    newStudent: "नया छात्र",
    newPassword: "नया पासवर्ड",
    selectStudent: "छात्र चुनें",
    studentPhoto: "छात्र फोटो",
    studentProfile: "छात्र प्रोफाइल",
    subscription: "सब्सक्रिप्शन",
    subscriptionHistory: "सब्सक्रिप्शन हिसाब",
    editSubscription: "सब्सक्रिप्शन बदलें",
    amountLockedAfterApproval: "पक्का हो चुका · रकम और तारीख नहीं बदलेगी",
    subscriptionPeriod: "सब्सक्रिप्शन",
    timing: "समय",
    logout: "लॉग आउट",
    main: "मुख्य",
    markSettled: "जमा हो गया",
    mixed: "दोनों",
    mode: "तरीका",
    moneyIn: "पैसा आया",
    moneyInOut: "आया और गया",
    moneyOut: "पैसा गया",
    moreOptions: "और विकल्प",
    name: "नाम",
    negativeEntry: "खर्च एंट्री",
    netBalance: "नेट बाकी",
    netCashInHand: "हाथ में नेट नकद",
    netSettlement: "नेट सेटलमेंट",
    noAgent: "एजेंट नहीं",
    noNotifications: "अभी कोई सूचना नहीं।",
    noReferralCode: "अभी कोई चालू कोड नहीं",
    noReason: "कारण नहीं",
    noRecords: "कोई एंट्री नहीं मिली।",
    noRecordsForFilter: "इस रेंज और छांट में कोई एंट्री नहीं मिली।",
    needsReconciliation: "मिलान आवश्यक",
    record: "रिकॉर्ड",
    records: "रिकॉर्ड",
    reviewed: "जांचा गया",
    note: "नोट",
    notifications: "सूचनाएं",
    online: "ऑनलाइन",
    onlineCollection: "ऑनलाइन जमा",
    onlineOwnerBankNote: "ऑनलाइन रकम मालिक के बैंक खाते से पक्की होती है और हाथ में नकद को नहीं बदलती।",
    onlineIn: "ऑनलाइन IN",
    operationalAssignment: "ट्रांजैक्शन जिम्मेदारी बदली",
    onlinePart: "ऑनलाइन हिस्सा",
    openNavigation: "मेनू खोलें",
    openingCash: "शुरू का नकद",
    openingBalance: "शुरू हिसाब",
    openingCashBalance: "शुरू",
    optional: "जरूरी नहीं",
    out: "OUT",
    owner: "मालिक",
    ownerOnlineVerification: "ऑनलाइन कलेक्शन की पुष्टि",
    ownerOnly: "सिर्फ मालिक",
    primaryOwner: "मालिक",
    coOwner: "मैनेजर",
    ownerSettlement: "मालिक को जमा",
    ownerSettlementLower: "मालिक को जमा",
    outflowsOnly: "सिर्फ खर्च",
    paid: "जमा",
    password: "पासवर्ड",
    paymentDate: "जमा तारीख",
    paymentAmount: "पेमेंट",
    paymentHistory: "पैसे का हिसाब",
    paymentType: "किस काम का पैसा",
    payments: "पैसा",
    paymentsFor: "इस तारीख का पैसा",
    paymentsOnly: "सिर्फ जमा पैसा",
    pendingCashInHand: "पेंडिंग हाथ की नकद",
    pendingDues: "बाकी रकम",
    pendingReviewAmount: "बाकी जांच रकम",
    pendingReviewItems: "बाकी जांच एंट्री",
    pendingPayout: "बाकी कमिशन",
    pendingIncentive: "बाकी कमिशन",
    pendingReview: "बाकी जांच",
    photo: "फोटो",
    photoPreview: "फोटो प्रीव्यू",
    photoReady: "फोटो अपलोड के लिए तैयार है",
    compressingPhoto: "फोटो को छोटा किया जा रहा है…",
    phone: "फोन",
    callStudent: "छात्र को कॉल करें",
    personalSummary: "मेरे कलेक्शन का हिसाब",
    quickActions: "जल्दी काम",
    rangeTo: "से",
    reasonOptional: "कारण जरूरी नहीं",
    reasonRequired: "कारण जरूरी",
    referral: "रेफरल",
    referralCode: "रेफरल कोड",
    referralCodeCopied: "रेफरल कोड कॉपी हो गया।",
    referralCodeUnavailable: "अभी कोई रेफरल कोड नहीं मिला।",
    referralCodes: "रेफरल कोड",
    referralTransactions: "रेफरल लेनदेन",
    received: "मिला",
    receivedStatus: "मिला",
    receiveMoney: "नकद प्राप्त करें",
    receivedFormTitle: "नकद प्राप्त करें",
    reject: "नहीं मानें",
    rejectedTransfer: "रिजेक्टेड ट्रांसफर",
    rejectForReverification: "फिर जांच के लिए लौटाएं",
    remaining: "बाकी",
    remark: "बात",
    requestCancel: "हटाने की मांग",
    requestTransfer: "भेजने की मांग",
    acceptedTransfer: "मान्य ट्रांसफर",
    incomingTransfer: "आया ट्रांसफर",
    pendingTransfer: "बाकी ट्रांसफर",
    resolveTransferFirst: "पहले ट्रांसफर पूरा करें",
    transferCashAmount: "नकद ट्रांसफर",
    transferToStaff: "स्टाफ को ट्रांसफर करें",
    transferRequested: "ट्रांसफर मांगा गया",
    transferTransaction: "ट्रांसफर",
    viewPhoto: "फोटो देखें",
    reviewAndSettle: "जांचें",
    reviewToday: "आज",
    reviewPending: "बाकी",
    reviewPendingButton: "बाकी जांचें",
    reviewPendingFirst: "पहले बाकी जांचें",
    reviewSettlementNotice: "बाकी कलेक्शन और खर्च की जांच नकद ट्रांसफर से अलग होती है।",
    settlementAmountHelp: "चुने गए यूजरों के बीच ट्रांसफर हुई नकद राशि दर्ज करें।",
    role: "काम",
    roll: "रोल",
    rollNumber: "रोल नंबर",
    rollNumberAlreadyExist: "यह रोल नंबर पहले से मौजूद है.",
    room: "कमरा",
    roomBooking: "कमरा बुकिंग",
    roomNo: "कमरा नं.",
    rooms: "कमरे",
    salesAgent: "सेल्स एजेंट",
    save: "सेव",
    saving: "सेव हो रहा है...",
    savingChanges: "बदलाव सेव हो रहे हैं...",
    savingTransaction: "लेनदेन सेव हो रहा है...",
    select: "चुनें",
    selectAgent: "एजेंट चुनें",
    selectAnotherType: "दूसरा प्रकार चुनें",
    selectCourse: "कोर्स चुनें",
    selectRoom: "कमरा चुनें",
    selectStaff: "स्टाफ चुनें",
    selectUser: "यूजर चुनें",
    searchUser: "यूजर खोजें",
    sendPayout: "कमिशन दें",
    sendMoney: "नकद भेजें",
    sendFormTitle: "नकद भेजें",
    shareReferralCode: "कोड शेयर करें",
    sendMoneyLower: "नकद भेजें",
    sent: "भेजा",
    sentToStaff: "स्टाफ को भेजा",
    sentToUser: "यूजर को भेजा",
    seat: "सीट",
    seatNumber: "सीट नंबर",
    settings: "सेटिंग",
    settled: "जमा हुआ",
    settledAmount: "जमा हुआ",
    settlementDue: "जमा बाकी",
    settlementLikePending: "बाकी नकद एंट्री",
    settlementActivity: "सेटलमेंट गतिविधि",
    settlementDate: "सेटलमेंट तारीख",
    transferDate: "ट्रांसफर तारीख",
    settlementHistory: "सेटलमेंट हिसाब",
    settlements: "सेटलमेंट",
    shikshanSansthan: "शिक्षण संस्थान",
    slotHours: "घंटा",
    staff: "स्टाफ",
    staffBusinessStatus: "मेरे काम का स्टेटस",
    staffBusinessStatusHelp: "काम के हिसाब से IN, OUT और बाकी जांच।",
    staffDailyLedger: "स्टाफ का दिन का हिसाब",
    userDailyLedger: "सभी यूजर का दिन का हिसाब",
    staffPermissions: "स्टाफ अधिकार",
    spent: "खर्च",
    startDate: "शुरू तारीख",
    startTime: "शुरू समय",
    status: "हाल",
    to: "को",
    toEmployee: "किस स्टाफ को",
    today: "आज",
    transactionDate: "ट्रांजैक्शन की तारीख",
    totalClosing: "कुल बंद हिसाब",
    totalCollected: "कुल जमा",
    totalExpenses: "कुल खर्च",
    totalIn: "IN",
    totalOut: "OUT",
    totalCollection: "कुल जमा",
    ownerAccountCredit: "मालिक खाते में जमा",
    pendingDateUsesTransaction: "मंजूरी तक बाकी एंट्री ट्रांजैक्शन तारीख से दिखाई जाती है।",
    totalOpening: "कुल शुरू हिसाब",
    totalRecorded: "कुल रिकॉर्ड",
    tillDate: "आज तक",
    transferCash: "नकद भेजें",
    transferred: "ट्रांसफर हुए",
    transferHistory: "भेजने का हिसाब",
    transfers: "पैसा भेजना",
    paymentJourney: "पेमेंट का सफर",
    journeyCollected: "जमा किया",
    journeyAccepted: "स्वीकार किया",
    journeyAwaitingAcceptance: "स्वीकार होने का इंतजार",
    journeyRejected: "अस्वीकार किया",
    journeyAwaitingApproval: "मंजूरी का इंतजार",
    approvalPending: "मंजूरी बाकी",
    approvedBy: "मंजूरी दी",
    transaction: "लेनदेन",
    transactionHistory: "लेनदेन हिसाब",
    transactionReview: "लेनदेन जांच",
    transactions: "लेनदेन",
    thisMonth: "इस महीने",
    until: "तक",
    unknown: "पता नहीं",
    neutralized: "क्लियर",
    unreadNotifications: "नई सूचनाएं",
    user: "यूजर",
    verifyPayment: "पैसा जांचें",
    verified: "पक्का",
    verifiedByOwner: "मालिक ने पक्का किया",
    verifyOnline: "ऑनलाइन पक्का करें",
    viewAll: "सब देखें",
    yesterday: "कल",
    receivedFromStaff: "स्टाफ से मिला",
    receivedFromUser: "यूजर से मिला",
    receivedBy: "इन्होंने प्राप्त किया",
    receiptPending: "प्राप्ति बाकी",
    cashReceived: "नकद मिला",
    cashSent: "नकद भेजा",
    recordReceived: "मिला हुआ जोड़ें",
    recordSent: "भेजा हुआ जोड़ें",
    self: "खुद",
    adjustments: "बदलाव",
  },
};

const businessLabelKeys: Record<BusinessType, string> = {
  guest_house: "guestHouse",
  library: "library",
  course: "shikshanSansthan",
  general: "general",
};

const membershipRoleLabelKeys: Record<Profile["membership_role"], string> = {
  primary_owner: "primaryOwner",
  co_owner: "coOwner",
  staff: "staff",
  sales_agent: "salesAgent",
};

function profileRoleLabel(profile: Profile, t: (key: string) => string) {
  return t(membershipRoleLabelKeys[profile.membership_role]);
}

const LanguageContext = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string) => string;
} | null>(null);

function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside AppShell.");
  return context;
}

function labelForBusiness(type: BusinessType, t: (key: string) => string) {
  return t(businessLabelKeys[type]);
}

function transactionBusinessTag(type: BusinessType | null, t: (key: string) => string) {
  if (type === "guest_house") return t("room");
  return type ? labelForBusiness(type, t) : t("general");
}

function labelForMode(mode: PaymentMode, t: (key: string) => string) {
  return t(mode);
}

function labelForStatus(status: string, t: (key: string) => string) {
  const key = status.replaceAll("_", "");
  const statusLabels: Record<string, string> = {
    all: "All",
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    cancelled: "Cancelled",
    accepted: "Accepted",
    cancelrequested: "Cancel requested",
    reapprovalrequired: "Needs check",
  };
  const hiStatusLabels: Record<string, string> = {
    all: "सब",
    pending: "बाकी",
    approved: "ठीक",
    rejected: "लौटा",
    cancelled: "हटा",
    accepted: "मान लिया",
    cancelrequested: "हटाने की मांग",
    reapprovalrequired: "फिर जांच",
  };
  return t("language") === messages.hi.language ? hiStatusLabels[key] ?? status.replaceAll("_", " ") : statusLabels[key] ?? status.replaceAll("_", " ");
}

function approvalStatusClass(status: string) {
  if (status === "approved" || status === "accepted") return "status-approved";
  if (status === "rejected" || status === "cancelled") return "status-rejected";
  return "status-pending";
}

const actionStartedEvent = "lenden:action-started";
const actionEndedEvent = "lenden:action-ended";
const mutationCommittedEvent = "lenden:mutation-committed";

function appIsOffline() {
  return typeof document !== "undefined" && document.body.dataset.lendenNetwork === "offline";
}

function showOfflineDialog() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(showOfflineDialogEvent));
}

const transactionRefreshActions = new Set<ClientAction>([
  approveRecordAction,
  cancelRecordAction,
  createAgentSettlementAction,
  createExpenseAction,
  createPaymentAction,
  requestPaymentTransferAction,
  respondPaymentTransferAction,
  settleCashAction,
  updateRecordAction,
]);

const libraryRefreshActions = new Set<ClientAction>([
  saveCourseStudentAction,
  saveLibraryStudentAction,
  setStudentStatusAction,
  updateSubscriptionAction,
  refundStudentAdvanceAction,
  saveStudentPhotoAction,
]);

const workRefreshActions = new Set<ClientAction>([
  checkInAction,
  checkOutAction,
  createWorkTaskAction,
  deleteWorkUpdateAction,
  postWorkUpdateAction,
  setWorkTaskStatusAction,
]);

function setDocumentAppBusy(busy: boolean) {
  if (typeof document === "undefined") return;
  if (busy) {
    document.body.dataset.lendenBusy = "true";
    return;
  }
  delete document.body.dataset.lendenBusy;
}

function documentAppBusy() {
  return typeof document !== "undefined" && document.body.dataset.lendenBusy === "true";
}

function mutationRefreshDetail(action: ClientAction, formData: FormData): MutationRefreshDetail {
  const isStudentPayment = action === createPaymentAction
    && (formData.get("business_type") === "library" || formData.get("business_type") === "course");
  if (libraryRefreshActions.has(action) || isStudentPayment) {
    return {
      scope: "dashboard-library",
      savingMessageKey: action === createPaymentAction ? "savingTransaction" : "savingChanges",
    };
  }

  if (transactionRefreshActions.has(action)) {
    return {
      scope: "dashboard",
      savingMessageKey: "savingTransaction",
    };
  }

  if (workRefreshActions.has(action)) {
    return {
      scope: "work",
      savingMessageKey: "savingChanges",
    };
  }

  return {
    scope: "none",
    savingMessageKey: "savingChanges",
  };
}

function replaceRowById<T extends { id: string }>(rows: T[], row: T, previousId?: string | null) {
  const withoutPrevious = previousId ? rows.filter((item) => item.id !== previousId) : rows;
  return withoutPrevious.some((item) => item.id === row.id)
    ? withoutPrevious.map((item) => item.id === row.id ? row : item)
    : [row, ...withoutPrevious];
}

function applyMutationPatch(
  current: DashboardPayload,
  patch: MutationPatch,
  viewerId: string,
  ownerish: boolean,
  rangeFrom: string,
  closingDate: string,
  dateFilterKey: DateFilterKey,
): DashboardPayload {
  if (patch.type === "student") {
    let payments = current.payments;
    if (patch.payment) {
      const approvalDates = [patch.payment.cash_posted_on, patch.payment.online_posted_on]
        .filter((value): value is string => Boolean(value));
      const displayDates = dateFilterKey === "transaction" || approvalDates.length === 0
        ? [patch.payment.payment_date]
        : approvalDates;
      const inRange = displayDates.some((date) => date >= rangeFrom && date <= closingDate) ||
        (isPendingReviewStatus(patch.payment.approval_status) && patch.payment.payment_date >= rangeFrom && patch.payment.payment_date <= closingDate);
      const visible = ownerish || patch.payment.assigned_profile_id === viewerId;
      payments = inRange && visible
        ? replaceRowById(payments, patch.payment)
        : payments.filter((payment) => payment.id !== patch.payment?.id);
    }
    if (patch.studentType === "library") {
      const incoming = patch.student as LibraryStudent;
      const existing = current.libraryStudents.find((student) => student.id === incoming.id);
      const student = existing ? {
        ...existing,
        ...incoming,
        photo_url: incoming.photo_url && !/^https?:\/\//i.test(incoming.photo_url) ? existing.photo_url : incoming.photo_url,
        aadhar_photo_url: incoming.aadhar_photo_url && !/^https?:\/\//i.test(incoming.aadhar_photo_url) ? existing.aadhar_photo_url : incoming.aadhar_photo_url,
        aadhar_back_photo_url: incoming.aadhar_back_photo_url && !/^https?:\/\//i.test(incoming.aadhar_back_photo_url) ? existing.aadhar_back_photo_url : incoming.aadhar_back_photo_url,
      } : incoming;
      return {
        ...current,
        payments,
        libraryStudents: replaceRowById(
          current.libraryStudents,
          student,
          patch.previousId,
        ),
      };
    }
    const incoming = patch.student as CourseStudent;
    const existing = current.courseStudents.find((student) => student.id === incoming.id);
    const student = existing ? {
      ...existing,
      ...incoming,
      photo_url: incoming.photo_url && !/^https?:\/\//i.test(incoming.photo_url) ? existing.photo_url : incoming.photo_url,
      aadhar_photo_url: incoming.aadhar_photo_url && !/^https?:\/\//i.test(incoming.aadhar_photo_url) ? existing.aadhar_photo_url : incoming.aadhar_photo_url,
      aadhar_back_photo_url: incoming.aadhar_back_photo_url && !/^https?:\/\//i.test(incoming.aadhar_back_photo_url) ? existing.aadhar_back_photo_url : incoming.aadhar_back_photo_url,
    } : incoming;
    return {
      ...current,
      payments,
      courseStudents: replaceRowById(current.courseStudents, student, patch.previousId),
    };
  }

  const paymentVisible = ownerish ||
    patch.payment.assigned_profile_id === viewerId ||
    (patch.movement.status === "pending" && patch.movement.to_profile_id === viewerId);
  const payments = paymentVisible
    ? replaceRowById(current.payments, patch.payment)
    : current.payments.filter((payment) => payment.id !== patch.payment.id);
  const movements = replaceRowById(current.movements, patch.movement);
  const oldTransferLedger = current.ledger.filter(
    (entry) => entry.source_type === "transfer" && entry.source_id === patch.movement.id,
  );
  const visibleNewLedger = patch.ledgerEntries.filter(
    (entry) => ownerish || entry.account_profile_id === viewerId,
  );
  const ledger = [
    ...current.ledger.filter((entry) => !(entry.source_type === "transfer" && entry.source_id === patch.movement.id)),
    ...visibleNewLedger,
  ];
  const changedProfileIds = new Set([
    ...oldTransferLedger.map((entry) => entry.account_profile_id),
    ...visibleNewLedger.map((entry) => entry.account_profile_id),
  ]);
  const closingSummaries = current.closingSummaries.map((summary) => {
    if (!changedProfileIds.has(summary.profile_id)) return summary;
    const oldEntries = oldTransferLedger.filter((entry) => entry.account_profile_id === summary.profile_id);
    const newEntries = visibleNewLedger.filter((entry) => entry.account_profile_id === summary.profile_id);
    const oldClosing = oldEntries
      .filter((entry) => entry.entry_date <= closingDate)
      .reduce((sum, entry) => sum + numberValue(entry.amount), 0);
    const nextClosing = newEntries
      .filter((entry) => entry.entry_date <= closingDate)
      .reduce((sum, entry) => sum + numberValue(entry.amount), 0);
    const oldDay = oldEntries.filter((entry) => entry.entry_date === closingDate);
    const nextDay = newEntries.filter((entry) => entry.entry_date === closingDate);
    const oldReceived = oldDay.filter((entry) => numberValue(entry.amount) > 0).reduce((sum, entry) => sum + numberValue(entry.amount), 0);
    const nextReceived = nextDay.filter((entry) => numberValue(entry.amount) > 0).reduce((sum, entry) => sum + numberValue(entry.amount), 0);
    const oldSent = oldDay.filter((entry) => numberValue(entry.amount) < 0).reduce((sum, entry) => sum + Math.abs(numberValue(entry.amount)), 0);
    const nextSent = nextDay.filter((entry) => numberValue(entry.amount) < 0).reduce((sum, entry) => sum + Math.abs(numberValue(entry.amount)), 0);
    const oldOpening = oldEntries.filter((entry) => entry.entry_date < closingDate).reduce((sum, entry) => sum + numberValue(entry.amount), 0);
    const nextOpening = newEntries.filter((entry) => entry.entry_date < closingDate).reduce((sum, entry) => sum + numberValue(entry.amount), 0);
    return {
      ...summary,
      opening: summary.opening - oldOpening + nextOpening,
      received: summary.received - oldReceived + nextReceived,
      sent: summary.sent - oldSent + nextSent,
      closing: summary.closing - oldClosing + nextClosing,
    };
  });

  return { ...current, payments, movements, ledger, closingSummaries };
}

function formValidationMessage(form: HTMLFormElement) {
  const invalid = form.querySelector(":invalid") as
    | (HTMLInputElement & { validationMessage?: string; reportValidity?: () => boolean })
    | null;
  invalid?.reportValidity?.();
  return invalid?.validationMessage || "Please fix the highlighted field and try again.";
}

function disableNumberInputWheelChange(event: WheelEvent<HTMLElement>) {
  const input = event.target;
  if (input instanceof HTMLInputElement && input.type === "number" && document.activeElement === input) {
    input.blur();
  }
}

function setFormSubmitting(form: HTMLFormElement, submitting: boolean) {
  form.dataset.submitting = submitting ? "true" : "false";
  form.setAttribute("aria-busy", submitting ? "true" : "false");
  const controls = form.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    "button, input, select, textarea",
  );

  controls.forEach((control) => {
    if (submitting) {
      if (!control.disabled) {
        control.dataset.submitDisabled = "true";
        control.disabled = true;
      }
      return;
    }

    if (control.dataset.submitDisabled === "true") {
      control.disabled = false;
      delete control.dataset.submitDisabled;
    }
  });
}

function createActionRequestKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `act_${crypto.randomUUID()}`;
  }
  return `act_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

const pendingFilePreparations = new WeakMap<HTMLInputElement, Promise<void>>();
const preparedPhotoFiles = new WeakMap<HTMLInputElement, File>();

async function waitForPendingFilePreparations(form: HTMLFormElement) {
  const preparations = [...form.querySelectorAll<HTMLInputElement>('input[type="file"]')]
    .map((input) => pendingFilePreparations.get(input))
    .filter((preparation): preparation is Promise<void> => Boolean(preparation));
  if (preparations.length > 0) await Promise.all(preparations);
}

function formDataWithIdempotencyKey(form: HTMLFormElement) {
  const existingKey = form.dataset.idempotencyKey;
  const key = existingKey && existingKey.trim() ? existingKey : createActionRequestKey();
  form.dataset.idempotencyKey = key;
  const formData = new FormData(form);
  applyPreparedPhotoFiles(form, formData);
  formData.set(actionIdempotencyField, key);
  return formData;
}

function applyPreparedPhotoFiles(form: HTMLFormElement, formData: FormData) {
  form.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach((input) => {
    const preparedFile = preparedPhotoFiles.get(input);
    if (input.name && preparedFile) formData.set(input.name, preparedFile);
  });
}

function clearFormIdempotencyKey(form: HTMLFormElement) {
  delete form.dataset.idempotencyKey;
}

function focusActionFieldError(form: HTMLFormElement, result: ActionResult) {
  form.querySelectorAll<HTMLElement>("[aria-invalid=true]").forEach((field) => {
    field.removeAttribute("aria-invalid");
  });
  if (result.ok || !result.fieldErrors) return;
  const firstName = Object.keys(result.fieldErrors)[0];
  if (!firstName) return;
  const field = Array.from(form.elements).find(
    (element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
      element instanceof HTMLElement && "name" in element && element.name === firstName,
  );
  if (!field) return;
  field.setAttribute("aria-invalid", "true");
  field.focus();
}

function submitWith(
  event: FormEvent<HTMLFormElement>,
  action: ClientAction,
  setNotice: (notice: ActionResult | null) => void,
  startTransition: ReturnType<typeof useTransition>[1],
  reset = true,
  onSuccess?: () => void,
) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.checkValidity()) {
    setNotice({ ok: false, message: formValidationMessage(form) });
    return;
  }
  if (appIsOffline()) {
    setNotice({ ok: false, message: "You are offline. Reconnect before submitting this action." });
    showOfflineDialog();
    return;
  }
  if (form.dataset.submitting === "true" || documentAppBusy()) return;
  const formData = formDataWithIdempotencyKey(form);
  const refreshDetail = mutationRefreshDetail(action, formData);
  setDocumentAppBusy(true);
  window.dispatchEvent(new CustomEvent<MutationRefreshDetail>(actionStartedEvent, { detail: refreshDetail }));
  setFormSubmitting(form, true);
  startTransition(async () => {
    try {
      await waitForPendingFilePreparations(form);
      applyPreparedPhotoFiles(form, formData);
      const result = await action(formData);
      clearFormIdempotencyKey(form);
      setNotice(result);
      focusActionFieldError(form, result);
      if (result.ok) {
        window.dispatchEvent(new CustomEvent<MutationRefreshDetail>(mutationCommittedEvent, {
          detail: { ...refreshDetail, patch: result.patch },
        }));
        if (reset) form.reset();
        form.closest("details.history-actions-menu")?.removeAttribute("open");
        onSuccess?.();
      } else {
        window.dispatchEvent(new CustomEvent(actionEndedEvent));
      }
    } catch (error) {
      setNotice({
        ok: false,
        ...normalizeActionError(error, {
          action: action.name || "client-action",
          fallback: "Could not complete this action.",
        }),
      });
      window.dispatchEvent(new CustomEvent(actionEndedEvent));
    } finally {
      setFormSubmitting(form, false);
    }
  });
}

function submitAndClose(
  event: FormEvent<HTMLFormElement>,
  action: ClientAction,
  setNotice: (notice: ActionResult | null) => void,
  startTransition: ReturnType<typeof useTransition>[1],
  onSuccess: () => void,
) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.checkValidity()) {
    setNotice({ ok: false, message: formValidationMessage(form) });
    return;
  }
  if (appIsOffline()) {
    setNotice({ ok: false, message: "You are offline. Reconnect before submitting this action." });
    showOfflineDialog();
    return;
  }
  if (form.dataset.submitting === "true" || documentAppBusy()) return;
  const formData = formDataWithIdempotencyKey(form);
  const refreshDetail = mutationRefreshDetail(action, formData);
  setDocumentAppBusy(true);
  window.dispatchEvent(new CustomEvent<MutationRefreshDetail>(actionStartedEvent, { detail: refreshDetail }));
  setFormSubmitting(form, true);
  startTransition(async () => {
    try {
      await waitForPendingFilePreparations(form);
      applyPreparedPhotoFiles(form, formData);
      const result = await action(formData);
      clearFormIdempotencyKey(form);
      setNotice(result);
      focusActionFieldError(form, result);
      if (result.ok) {
        window.dispatchEvent(new CustomEvent<MutationRefreshDetail>(mutationCommittedEvent, {
          detail: { ...refreshDetail, patch: result.patch },
        }));
        form.reset();
        onSuccess();
      } else {
        window.dispatchEvent(new CustomEvent(actionEndedEvent));
      }
    } catch (error) {
      setNotice({
        ok: false,
        ...normalizeActionError(error, {
          action: action.name || "client-action",
          fallback: "Could not complete this action.",
        }),
      });
      window.dispatchEvent(new CustomEvent(actionEndedEvent));
    } finally {
      setFormSubmitting(form, false);
    }
  });
}

function profileName(profiles: Profile[], id: string | null | undefined, t?: (key: string) => string) {
  if (!id) return t ? t("owner") : "Owner";
  return profiles.find((profile) => profile.id === id)?.full_name ?? (t ? t("unknown") : "Unknown");
}

function numberValue(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function paymentCashAmount(payment: Payment) {
  return payment.mode === "mixed" ? numberValue(payment.cash_collection) : payment.mode === "cash" ? numberValue(payment.amount) : 0;
}

function paymentOnlineAmount(payment: Payment) {
  return payment.mode === "mixed" ? numberValue(payment.online_collection) : payment.mode === "online" ? numberValue(payment.amount) : 0;
}

function paymentComponentStatus(payment: Payment, component: "cash" | "online") {
  const amount = component === "cash" ? paymentCashAmount(payment) : paymentOnlineAmount(payment);
  if (amount <= 0) return null;
  return (component === "cash" ? payment.cash_approval_status : payment.online_approval_status) ?? payment.approval_status;
}

function paymentHasApprovedComponent(payment: Payment) {
  return paymentComponentStatus(payment, "cash") === "approved" || paymentComponentStatus(payment, "online") === "approved";
}

function paymentPendingApprovalAmount(payment: Payment) {
  const pendingCash = paymentComponentStatus(payment, "cash") === "approved" ? 0 : paymentCashAmount(payment);
  const pendingOnline = paymentComponentStatus(payment, "online") === "approved" ? 0 : paymentOnlineAmount(payment);
  return pendingCash + pendingOnline;
}

function paymentPendingCashAmount(payment: Payment) {
  return paymentComponentStatus(payment, "cash") === "approved" ? 0 : paymentCashAmount(payment);
}

function paymentReviewProfileId(payment: Payment) {
  return payment.assigned_profile_id ?? payment.current_holder_id ?? payment.collected_by;
}

function paymentModeLabel(payment: Payment, t: (key: string) => string) {
  return labelForMode(payment.mode, t);
}

function paymentTransfers(movements: MoneyMovement[], paymentId: string) {
  return movements
    .filter((movement) => movement.type === "transfer" && movement.payment_id === paymentId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function pendingPaymentTransfer(movements: MoneyMovement[], paymentId: string) {
  return paymentTransfers(movements, paymentId).find((movement) => movement.status === "pending") ?? null;
}

function transferSummaryLines(transfers: MoneyMovement[], profiles: Profile[], t: (key: string) => string) {
  return transfers.map((movement) => {
    const from = profileName(profiles, movement.from_profile_id, t);
    const to = profileName(profiles, movement.to_profile_id, t);
    return `${from} → ${to}`;
  });
}

function paymentJourneyLanes(
  payment: Payment,
  transfers: MoneyMovement[],
  profiles: Profile[],
  t: (key: string) => string,
): TransactionJourneyLane[] {
  const collector = profiles.find((item) => item.id === payment.collected_by);
  const collectorName = collector?.full_name ?? profileName(profiles, payment.collected_by, t);
  const cashAmount = paymentCashAmount(payment);
  const onlineAmount = paymentOnlineAmount(payment);
  const components = [
    { component: "cash" as const, amount: cashAmount, approvedAt: payment.cash_approved_at, approvedBy: payment.cash_approved_by },
    { component: "online" as const, amount: onlineAmount, approvedAt: payment.online_approved_at, approvedBy: payment.online_approved_by },
  ].filter((item) => item.amount > 0);

  return components.map(({ component, amount, approvedAt, approvedBy }) => {
    const steps: TransactionJourneyStep[] = [{
      id: `${payment.id}-${component}-collected`,
      person: `${t("collectedByStaff")} · ${collectorName}`,
      action: formatMoney(amount),
      role: collector ? profileRoleLabel(collector, t) : null,
      state: "complete",
      timestamp: payment.created_at,
    }];

    transfers.forEach((movement) => {
      const requesterName = profileName(profiles, movement.requested_by ?? movement.from_profile_id, t);
      const recipientId = movement.responded_by ?? movement.to_profile_id;
      const recipient = profiles.find((item) => item.id === recipientId);
      const recipientName = recipient?.full_name ?? profileName(profiles, movement.to_profile_id, t);
      steps.push({
        id: `${movement.id}-${component}-requested`,
        person: `${requesterName} → ${profileName(profiles, movement.to_profile_id, t)}`,
        action: t("transferRequested"),
        role: null,
        state: "sent",
        timestamp: movement.created_at,
      });
      steps.push({
        id: `${movement.id}-${component}-response`,
        person: movement.status === "accepted"
          ? `${t("acceptTransfer")} · ${recipientName}`
          : movement.status === "rejected"
            ? `${t("reject")} · ${recipientName}`
            : `${t("approvalPending")} · ${recipientName}`,
        action: component === "cash" ? t("cashCustody") : t("operationalAssignment"),
        role: recipient ? profileRoleLabel(recipient, t) : null,
        state: movement.status === "accepted" ? "received" : movement.status === "rejected" ? "rejected" : "pending",
        timestamp: movement.responded_at,
      });
    });

    const status = paymentComponentStatus(payment, component) ?? "pending";
    const componentApproverId = approvedBy ?? payment.approved_by;
    const componentApprover = profiles.find((item) => item.id === componentApproverId);
    const componentApproved = status === "approved";
    const componentRejected = status === "rejected" || status === "cancelled";
    steps.push({
      id: `${payment.id}-${component}-approval`,
      person: componentApproved && componentApprover
        ? `${t("approvedBy")} ${componentApprover.full_name}`
        : labelForStatus(status, t),
      action: componentApproved ? t("verified") : t("journeyAwaitingApproval"),
      role: componentApprover ? profileRoleLabel(componentApprover, t) : null,
      state: componentApproved ? "verified" : componentRejected ? "rejected" : "pending",
      timestamp: componentApproved ? approvedAt ?? payment.approved_at : null,
    });

    return { component, amount, status, steps };
  });
}

function expenseJourneySteps(
  expense: Expense,
  profiles: Profile[],
  t: (key: string) => string,
): TransactionJourneyStep[] {
  const spender = profiles.find((item) => item.id === expense.spent_by);
  const ownerIds = ownerProfileIdSet(profiles);
  const approved = isEffectivelyApprovedExpense(expense, ownerIds);
  const ownerAuthored = ownerIds.has(expense.spent_by);
  const approver = profiles.find((item) => item.id === expense.approved_by) ?? (ownerAuthored ? spender : undefined);
  const approverRole = approver ? profileRoleLabel(approver, t) : null;

  return [
    {
      id: `${expense.id}-recorded`,
      person: spender?.full_name ?? profileName(profiles, expense.spent_by, t),
      action: t("expense"),
      role: spender ? profileRoleLabel(spender, t) : null,
      state: "complete",
      timestamp: expense.created_at,
    },
    {
      id: `${expense.id}-approval`,
      person: approved
        ? approver
          ? `${t("approvedBy")} ${approver.full_name} (${approverRole})`
          : labelForStatus("approved", t)
        : t("approvalPending"),
      action: approved ? "" : t("journeyAwaitingApproval"),
      role: null,
      state: approved ? "verified" : "pending",
      timestamp: approved ? expense.approved_at : null,
    },
  ];
}

function cashTransferJourneySteps(
  movement: MoneyMovement,
  profiles: Profile[],
  t: (key: string) => string,
  perspective: "cash_in" | "cash_out",
): TransactionJourneyStep[] {
  const sender = profiles.find((item) => item.id === movement.from_profile_id);
  const recipient = profiles.find((item) => item.id === movement.to_profile_id);
  const recipientName = recipient?.full_name ?? profileName(profiles, movement.to_profile_id, t);
  const recipientRole = recipient ? profileRoleLabel(recipient, t) : null;

  return [
    {
      id: `${movement.id}-${perspective}`,
      person: sender?.full_name ?? profileName(profiles, movement.from_profile_id, t),
      action: perspective === "cash_in" ? t("cashReceived") : t("cashSent"),
      role: sender ? profileRoleLabel(sender, t) : null,
      state: perspective === "cash_in" ? "received" : "sent",
      timestamp: perspective === "cash_in" ? movement.responded_at ?? movement.created_at : movement.created_at,
    },
    {
      id: `${movement.id}-received`,
      person: movement.status === "accepted"
        ? `${t("receivedBy")} ${recipientName}${recipientRole ? ` (${recipientRole})` : ""}`
        : recipientName,
      action: movement.status === "accepted"
        ? ""
        : movement.status === "rejected"
          ? t("journeyRejected")
          : t("receiptPending"),
      role: movement.status === "accepted" ? null : recipientRole,
      state: movement.status === "accepted" ? "verified" : movement.status === "rejected" ? "rejected" : "pending",
      timestamp: movement.responded_at,
    },
  ];
}

function agentPayoutJourneySteps(
  settlement: AgentSettlement,
  profiles: Profile[],
  t: (key: string) => string,
  perspective: "cash_in" | "cash_out",
): TransactionJourneyStep[] {
  const sender = profiles.find((item) => item.id === settlement.paid_by);
  const recipient = profiles.find((item) => item.id === settlement.agent_id);
  const recipientName = recipient?.full_name ?? profileName(profiles, settlement.agent_id, t);
  const recipientRole = recipient ? profileRoleLabel(recipient, t) : null;

  return [
    {
      id: `${settlement.id}-${perspective}`,
      person: sender?.full_name ?? profileName(profiles, settlement.paid_by, t),
      action: perspective === "cash_in" ? t("cashReceived") : t("cashSent"),
      role: sender ? profileRoleLabel(sender, t) : null,
      state: perspective === "cash_in" ? "received" : "sent",
      timestamp: perspective === "cash_in" ? settlement.responded_at ?? settlement.created_at : settlement.created_at,
    },
    {
      id: `${settlement.id}-received`,
      person: settlement.status === "accepted"
        ? `${t("receivedBy")} ${recipientName}${recipientRole ? ` (${recipientRole})` : ""}`
        : recipientName,
      action: settlement.status === "accepted"
        ? ""
        : settlement.status === "rejected"
          ? t("journeyRejected")
          : t("receiptPending"),
      role: settlement.status === "accepted" ? null : recipientRole,
      state: settlement.status === "accepted" ? "verified" : settlement.status === "rejected" ? "rejected" : "pending",
      timestamp: settlement.responded_at,
    },
  ];
}

function paymentDisplayTitle(payment: Payment, t: (key: string) => string) {
  return payment.customer_name || payment.room_number_snapshot || payment.description || transactionBusinessTag(payment.business_type, t);
}

function expenseDisplayTitle(expense: Expense) {
  return expense.description;
}

function normalizeDateRange(range: DateRangeState): NormalizedDateRange {
  const from = range.from || todayIso();
  const to = range.to || from;
  return from <= to ? { from, to } : { from: to, to: from };
}

function dateInRange(isoDate: string, range: NormalizedDateRange) {
  const date = isoDate.slice(0, 10);
  return date >= range.from && date <= range.to;
}

function ownerProfileIdSet(profiles: Profile[]) {
  return new Set(profiles.filter((profile) => isOwnerish(profile.role)).map((profile) => profile.id));
}

function effectivePaymentStatus(payment: Payment, ownerIds: Set<string>): ApprovalStatus {
  return ownerIds.has(payment.collected_by) ? "approved" : payment.approval_status;
}

function effectiveExpenseStatus(expense: Expense, ownerIds: Set<string>): ApprovalStatus {
  return ownerIds.has(expense.spent_by) ? "approved" : expense.approval_status;
}

function isEffectivelyApprovedPayment(payment: Payment, ownerIds: Set<string>) {
  return effectivePaymentStatus(payment, ownerIds) === "approved";
}

function isEffectivelyApprovedExpense(expense: Expense, ownerIds: Set<string>) {
  return effectiveExpenseStatus(expense, ownerIds) === "approved";
}

function isEffectivelyPendingPayment(payment: Payment, ownerIds: Set<string>) {
  return !ownerIds.has(payment.collected_by) && isPendingReviewStatus(payment.approval_status);
}

function isEffectivelyPendingExpense(expense: Expense, ownerIds: Set<string>) {
  return !ownerIds.has(expense.spent_by) && isPendingReviewStatus(expense.approval_status);
}

function isPendingReviewStatus(status: string) {
  return status !== "approved" && status !== "rejected" && status !== "cancelled";
}

function canApproveRecordStatus(status: string) {
  return status === "pending" || status === "reapproval_required";
}

function pendingRecordInScope(isoDate: string, range: NormalizedDateRange, preset: DateRangePreset) {
  const date = isoDate.slice(0, 10);
  return preset === "today" ? date <= range.to : dateInRange(date, range);
}

function belongsToClosingReview(recordDate: string, closingDate: string, status: string) {
  const date = recordDate.slice(0, 10);
  return date === closingDate || (date < closingDate && isPendingReviewStatus(status));
}

function paymentReference(payment: Payment, t: (key: string) => string) {
  const parts = [
    payment.customer_name,
    payment.roll_number ? `${t("roll")}: ${payment.roll_number}` : null,
    payment.room_number_snapshot ? `${t("room")}: ${payment.room_number_snapshot}` : null,
    payment.seat_number ? `${t("seat")}: ${payment.seat_number}` : null,
    payment.description,
    payment.remark,
  ].filter(Boolean);
  return parts.join(" · ") || t("noReason");
}

function expenseReference(expense: Expense, t: (key: string) => string) {
  return [expense.description, expense.remark].filter(Boolean).join(" · ") || t("noReason");
}

function formatDateRange(range: NormalizedDateRange, t: (key: string) => string) {
  if (range.from === range.to) return range.from;
  return `${range.from} ${t("rangeTo")} ${range.to}`;
}

function activePermissions(role: string, permissions: string[]) {
  if (isSalesAgent(role)) return [];
  if (isOwnerish(role)) return Object.values(businessPermissions).concat("add_expense", "transfer_money");
  return permissions;
}

function buildClosingSummary(profile: Profile, ledger: LedgerEntry[], date: string): UserClosingSummary {
  const profileEntries = ledger.filter((entry) => entry.account_profile_id === profile.id);
  const opening = profileEntries
    .filter((entry) => entry.entry_date < date)
    .reduce((sum, entry) => sum + numberValue(entry.amount), 0);
  const dayEntries = profileEntries.filter((entry) => entry.entry_date === date);
  const movementTypes = new Set(["transfer", "settlement"]);
  const collected = dayEntries
    .filter((entry) => entry.source_type === "payment" && numberValue(entry.amount) > 0)
    .reduce((sum, entry) => sum + numberValue(entry.amount), 0);
  const expenses = dayEntries
    .filter((entry) => entry.source_type === "expense" && numberValue(entry.amount) < 0)
    .reduce((sum, entry) => sum + Math.abs(numberValue(entry.amount)), 0);
  const received = dayEntries
    .filter((entry) => movementTypes.has(entry.source_type) && numberValue(entry.amount) > 0)
    .reduce((sum, entry) => sum + numberValue(entry.amount), 0);
  const sent = dayEntries
    .filter((entry) => movementTypes.has(entry.source_type) && numberValue(entry.amount) < 0)
    .reduce((sum, entry) => sum + Math.abs(numberValue(entry.amount)), 0);
  const adjustments = dayEntries
    .filter((entry) => entry.source_type === "adjustment")
    .reduce((sum, entry) => sum + numberValue(entry.amount), 0);
  const closing = opening + dayEntries.reduce((sum, entry) => sum + numberValue(entry.amount), 0);

  return {
    profile,
    opening,
    collected,
    expenses,
    received,
    sent,
    adjustments,
    closing,
    dayEntries,
    inCash: collected + received,
    inOnline: 0,
    outCash: expenses + sent,
    outOnline: 0,
  };
}

function roleBadge(profile: Profile) {
  if (profile.role === "sales_agent") return "A";
  if (profile.role === "staff") return "S";
  return "O";
}

function bootstrapFromAppData(data: AppData): BootstrapPayload {
  return {
    businessContext: data.businessContext,
    profile: data.profile,
    permissions: data.permissions,
    allPermissions: data.allPermissions,
    managerUnitScopes: data.managerUnitScopes,
    staffUnitAssignments: data.staffUnitAssignments,
    profiles: data.profiles,
    rooms: data.rooms,
    courses: data.courses,
    referrals: data.referrals,
    notifications: data.notifications,
  };
}

function emptyDashboardPayload(): DashboardPayload {
  return {
    libraryStudents: [],
    courseStudents: [],
    studentPayments: [],
    payments: [],
    expenses: [],
    movements: [],
    ledger: [],
    closingSummaries: [],
    cashBalances: [],
    dashboardSummary: null,
    financialActivity: [],
    changeRequests: [],
    agentSettlements: [],
    notifications: [],
  };
}

function dashboardFromOperationalPage(payload: OperationalPagePayload): DashboardPayload {
  const empty = emptyDashboardPayload();
  if (payload.page === "dashboard") return { ...empty, ...payload };
  if (payload.page === "transactions") return { ...empty, ...payload };
  if (payload.page === "closing") return { ...empty, ...payload };
  if (payload.page === "students") return {
    ...empty,
    libraryStudents: payload.libraryStudents,
    courseStudents: payload.courseStudents,
    payments: payload.payments,
    notifications: payload.notifications,
  };
  return { ...empty, changeRequests: payload.changeRequests, notifications: payload.notifications };
}

function mergeCachedAppData(bootstrap: BootstrapPayload, dashboard: DashboardPayload): AppData {
  return {
    ...bootstrap,
    ...dashboard,
    notifications: bootstrap.notifications ?? [],
  };
}

function dashboardDataSearchParams(
  tab: AppTab,
  dashboardFilters: DashboardFilterState,
  transactionFilters: TransactionFilterState,
  closingFilters: ClosingFilterState,
  studentFilters: StudentFilterState,
) {
  const params = new URLSearchParams();
  const dateRange = tab === "payments"
    ? transactionFilters.dateRange
    : tab === "closing"
      ? { preset: "custom" as const, from: closingFilters.date, to: closingFilters.date }
      : dashboardFilters.dateRange;
  const dateFilterKey = tab === "payments"
    ? transactionFilters.dateFilterKey
    : tab === "closing"
      ? closingFilters.dateFilterKey
      : dashboardFilters.dateFilterKey;
  params.set("tab", tab);
  params.set("range", dateRange.preset);
  params.set("dateKey", dateFilterKey);
  if (dateRange.preset === "custom") {
    params.set("from", dateRange.from);
    params.set("to", dateRange.to);
  }
  if (tab === "home" && dashboardFilters.businessType !== "all") params.set("dashBusiness", dashboardFilters.businessType);
  if (tab === "payments") {
    if (transactionFilters.businessType !== "all") params.set("txBusiness", transactionFilters.businessType);
    if (transactionFilters.mode !== "all") params.set("txMode", transactionFilters.mode);
  }
  if (tab === "closing") {
    params.set("closingDate", closingFilters.date);
    params.set("closingDateKey", closingFilters.dateFilterKey);
  }
  if (tab === "library_students") {
    params.set("studentSource", studentFilters.sourceId);
    params.set("studentStatus", studentFilters.status);
  }
  return params;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new OperationalRequestError(body?.message ?? `Request failed (${response.status})`, response.status);
  }
  return response.json() as Promise<T>;
}

class OperationalRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "OperationalRequestError";
  }
}

function operationalPageName(tab: AppTab) {
  if (tab === "payments") return "transactions";
  if (tab === "closing") return "closing";
  if (tab === "library_students") return "students";
  if (tab === "settings") return "settings";
  return "dashboard";
}

function isOperationalTab(tab: Tab): tab is OperationalTab {
  return tab === "home" || tab === "payments" || tab === "closing";
}

const subscribeToHydration = () => () => {};
const hydratedClientSnapshot = () => true;
const serverSnapshot = () => false;

function useHasHydrated() {
  return useSyncExternalStore(subscribeToHydration, hydratedClientSnapshot, serverSnapshot);
}

type WorkspaceViewState = {
  tab: Tab;
  lastOperationalTab: OperationalTab;
  dashboardFilters: DashboardFilterState;
  transactionFilters: TransactionFilterState;
  closingFilters: ClosingFilterState;
  studentFilters: StudentFilterState;
};

type WorkspaceViewAction =
  | { type: "replace"; value: AppViewState }
  | { type: "tab"; value: SetStateAction<Tab> }
  | { type: "last-operational-tab"; value: OperationalTab }
  | { type: "dashboard"; value: SetStateAction<DashboardFilterState> }
  | { type: "transactions"; value: SetStateAction<TransactionFilterState> }
  | { type: "closing"; value: SetStateAction<ClosingFilterState> }
  | { type: "students"; value: SetStateAction<StudentFilterState> };

function applyStateUpdate<T>(current: T, update: SetStateAction<T>) {
  return typeof update === "function" ? (update as (value: T) => T)(current) : update;
}

function workspaceViewReducer(state: WorkspaceViewState, action: WorkspaceViewAction): WorkspaceViewState {
  if (action.type === "replace") {
    return {
      ...action.value,
      lastOperationalTab: isOperationalTab(action.value.tab) ? action.value.tab : state.lastOperationalTab,
    };
  }
  if (action.type === "tab") {
    const tab = applyStateUpdate(state.tab, action.value);
    return { ...state, tab, lastOperationalTab: isOperationalTab(tab) ? tab : state.lastOperationalTab };
  }
  if (action.type === "last-operational-tab") return { ...state, lastOperationalTab: action.value };
  if (action.type === "dashboard") return { ...state, dashboardFilters: applyStateUpdate(state.dashboardFilters, action.value) };
  if (action.type === "transactions") return { ...state, transactionFilters: applyStateUpdate(state.transactionFilters, action.value) };
  if (action.type === "closing") return { ...state, closingFilters: applyStateUpdate(state.closingFilters, action.value) };
  return { ...state, studentFilters: applyStateUpdate(state.studentFilters, action.value) };
}

function LogoutButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <>
      {pending ? (
        <div className="action-lock" role="status" aria-live="polite" aria-label={`${label}...`}>
          <div className="action-lock-card">
            <span className="toast-icon saving-dot" />
            <strong>{label}...</strong>
          </div>
        </div>
      ) : null}
      <button
        className="app-logout-button flex items-center gap-3 px-4 py-3 text-error m-2 p-2 rounded-lg hover:bg-error-container/50 transition-all duration-200 w-full text-left cursor-pointer border-0"
        type="submit"
        disabled={pending}
        onClick={() => {
          clearPersistedQueryCache();
        }}
      >
        <LogOut size={20} />
        <span className="font-body text-body-md">{pending ? `${label}...` : label}</span>
      </button>
    </>
  );
}

// The query client lives with its consumers: providing it from the root layout let the
// webpack dev server's first compile hand the layout and page separate React Query instances.
export function AppShell(props: { data: AppData; initialViewState: AppViewState }) {
  return (
    <QueryProvider>
      <AppShellContent {...props} />
    </QueryProvider>
  );
}

function AppShellContent({ data, initialViewState }: { data: AppData; initialViewState: AppViewState }) {
  const hasHydrated = useHasHydrated();
  const businessId = data.businessContext.business.id;
  const cacheScope = `${data.profile.id}:${businessId}`;
  const initialUserIsSalesAgent = isSalesAgent(data.profile.role);
  const initialTab = initialUserIsSalesAgent && (initialViewState.tab === "closing" || initialViewState.tab === "settings" || initialViewState.tab === "library_students")
    ? "home"
    : initialViewState.tab;
  const initialEnabledModules = new Set(data.businessContext.enabledModules);
  const initialScopedBusinessTypes = data.businessContext.accessMode === "support"
    || data.profile.membership_role === "primary_owner"
    ? new Set(data.businessContext.enabledModules)
    : data.profile.membership_role === "co_owner"
      ? new Set(
          data.managerUnitScopes
            .filter((scope) => scope.manager_profile_id === data.profile.id)
            .map((scope) => scope.business_type),
        )
      : new Set(
          data.staffUnitAssignments
            .filter((assignment) => assignment.staff_profile_id === data.profile.id)
            .map((assignment) => assignment.business_type),
        );
  const initialAvailableBusinessTypes = (Object.keys(businessLabels) as BusinessType[]).filter((businessType) =>
    initialEnabledModules.has(businessType) && initialScopedBusinessTypes.has(businessType),
  );
  const initialTransactionProfileId = initialViewState.transactionFilters.profileId === "all"
    ? (initialViewState.transactionFilters.lens === "business" ? "all" : data.profile.id)
    : data.profiles.some((profile) => profile.id === initialViewState.transactionFilters.profileId)
    ? initialViewState.transactionFilters.profileId
    : data.profile.id;
  const initialTransactionFilters = {
    ...initialViewState.transactionFilters,
    profileId: initialTransactionProfileId,
    businessType: initialViewState.transactionFilters.businessType === "all" || initialAvailableBusinessTypes.includes(initialViewState.transactionFilters.businessType)
      ? initialViewState.transactionFilters.businessType
      : "all" as const,
  };
  const initialStudentSourceIds = [
    ...(initialAvailableBusinessTypes.includes("library") ? ["library"] : []),
    ...(initialAvailableBusinessTypes.includes("course")
      ? data.courses.filter((course) => course.active).map(studentRecordSourceId)
      : []),
  ];
  const initialStudentSourceId = initialStudentSourceIds.includes(initialViewState.studentFilters.sourceId)
    ? initialViewState.studentFilters.sourceId
    : initialStudentSourceIds[0] ?? "library";
  const initialStudentFilters = { ...initialViewState.studentFilters, sourceId: initialStudentSourceId };
  const [workspaceView, dispatchWorkspaceView] = useReducer(workspaceViewReducer, {
    tab: initialTab,
    lastOperationalTab: isOperationalTab(initialTab) ? initialTab : "home",
    dashboardFilters: {
      ...initialViewState.dashboardFilters,
      businessType: initialViewState.dashboardFilters.businessType === "all" || initialAvailableBusinessTypes.includes(initialViewState.dashboardFilters.businessType)
        ? initialViewState.dashboardFilters.businessType
        : "all",
    },
    transactionFilters: initialTransactionFilters,
    closingFilters: initialViewState.closingFilters,
    studentFilters: initialStudentFilters,
  });
  const { tab, lastOperationalTab, dashboardFilters, transactionFilters, closingFilters, studentFilters } = workspaceView;
  const [historyShouldPush, setHistoryShouldPush] = useState(false);
  const setTab = useCallback<Dispatch<SetStateAction<Tab>>>((value) => {
    setHistoryShouldPush(true);
    dispatchWorkspaceView({ type: "tab", value });
  }, [dispatchWorkspaceView, setHistoryShouldPush]);
  const setDashboardFilters = useCallback<Dispatch<SetStateAction<DashboardFilterState>>>((value) => {
    setHistoryShouldPush(true);
    dispatchWorkspaceView({ type: "dashboard", value });
  }, [dispatchWorkspaceView, setHistoryShouldPush]);
  const setTransactionFilters = useCallback<Dispatch<SetStateAction<TransactionFilterState>>>((value) => {
    setHistoryShouldPush(true);
    dispatchWorkspaceView({ type: "transactions", value });
  }, [dispatchWorkspaceView, setHistoryShouldPush]);
  const setClosingFilters = useCallback<Dispatch<SetStateAction<ClosingFilterState>>>((value) => {
    setHistoryShouldPush(true);
    dispatchWorkspaceView({ type: "closing", value });
  }, [dispatchWorkspaceView, setHistoryShouldPush]);
  const setStudentFilters = useCallback<Dispatch<SetStateAction<StudentFilterState>>>((value) => {
    setHistoryShouldPush(true);
    dispatchWorkspaceView({ type: "students", value });
  }, [dispatchWorkspaceView, setHistoryShouldPush]);
  const [language, setLanguageState] = useState<Language>("en");
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastNotice[]>([]);
  const [notificationOverrides, setNotificationOverrides] = useState<AppNotification[] | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const [actionModal, setActionModal] = useState<ActionModal>(null);
  const [selectedPositive, setSelectedPositive] = useState<PositiveFlow | null>(null);
  const [selectedNegative, setSelectedNegative] = useState<NegativeFlow | null>(null);
  const [pending, startTransition] = useTransition();
  const [actionBusyMessageKey, setActionBusyMessageKey] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const initialBootstrapData = useMemo(() => bootstrapFromAppData(data), [data]);
  const dashboardParams = useMemo(
    () => dashboardDataSearchParams(tab, dashboardFilters, transactionFilters, closingFilters, studentFilters).toString(),
    [closingFilters, dashboardFilters, studentFilters, tab, transactionFilters],
  );
  const activeOperationalPage = operationalPageName(tab);
  const lastOperationalTabStorageKey = `lenden:last-operational-tab:${cacheScope}`;
  const bootstrapQuery = useQuery({
    queryKey: ["bootstrap", cacheScope],
    queryFn: ({ signal }) => fetchJson<BootstrapPayload>(`/api/businesses/${businessId}/bootstrap`, signal),
    initialData: initialBootstrapData,
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });
  const dashboardQuery = useQuery({
    queryKey: ["operational", cacheScope, activeOperationalPage, dashboardParams],
    queryFn: async ({ signal }) => dashboardFromOperationalPage(await fetchJson<OperationalPagePayload>(
      `/api/businesses/${businessId}/operational/${activeOperationalPage}?${dashboardParams}`,
      signal,
    )),
    placeholderData: (previousDashboard, previousQuery) =>
      previousQuery?.queryKey[2] === activeOperationalPage ? previousDashboard : undefined,
    staleTime: activeOperationalPage === "students" ? 300_000 : 30_000,
    enabled: tab !== "notifications" && tab !== "library_students" && tab !== "work",
  });
  const prefetchOperationalFilters = useCallback((
    nextTab: AppTab,
    nextDashboardFilters: DashboardFilterState,
    nextTransactionFilters: TransactionFilterState,
    nextClosingFilters: ClosingFilterState,
  ) => {
    const page = operationalPageName(nextTab);
    const params = dashboardDataSearchParams(
      nextTab,
      nextDashboardFilters,
      nextTransactionFilters,
      nextClosingFilters,
      studentFilters,
    ).toString();
    return queryClient
      .cancelQueries({ queryKey: ["operational", cacheScope, page], type: "inactive" })
      .then(() => queryClient.prefetchQuery({
        queryKey: ["operational", cacheScope, page, params],
        queryFn: async ({ signal }) => dashboardFromOperationalPage(await fetchJson<OperationalPagePayload>(
          `/api/businesses/${businessId}/operational/${page}?${params}`,
          signal,
        )),
        staleTime: page === "students" ? 300_000 : 30_000,
      }));
  }, [businessId, cacheScope, queryClient, studentFilters]);
  const emptyOperationalData = useMemo(() => emptyDashboardPayload(), []);
  const appData = useMemo(
    () => mergeCachedAppData(
      hasHydrated ? bootstrapQuery.data : initialBootstrapData,
      hasHydrated ? dashboardQuery.data ?? emptyOperationalData : emptyOperationalData,
    ),
    [bootstrapQuery.data, dashboardQuery.data, emptyOperationalData, hasHydrated, initialBootstrapData],
  );
  const t = useMemo(() => (key: string) => messages[language][key] ?? messages.en[key] ?? key, [language]);
  const notifications = notificationOverrides ?? appData.notifications ?? [];
  const notificationsRef = useRef(appData.notifications ?? []);
  const unreadNotifications = notifications.filter((notification) => !notification.read_at).length;
  const currentUserIsSalesAgent = isSalesAgent(appData.profile.role);
  const owner = isOwnerish(appData.profile.role);
  const primaryOwner = appData.profile.membership_role === "primary_owner";
  const manager = appData.profile.membership_role === "co_owner";
  const supportMode = appData.businessContext.accessMode === "support";
  // Header pending badge: every record awaiting approval, independent of page filters.
  const pendingApprover = owner || supportMode;
  const [pendingSheetOpen, setPendingSheetOpen] = useState(false);
  const pendingApprovalsQuery = useQuery({
    queryKey: ["pending-approvals", cacheScope],
    queryFn: ({ signal }) => fetchJson<PendingApprovalsPayload>(`/api/businesses/${businessId}/pending-approvals`, signal),
    enabled: !currentUserIsSalesAgent,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const pendingApprovals = useMemo(() => {
    const payload = pendingApprovalsQuery.data ?? { payments: [], expenses: [] };
    // Staff see only their own pending records; approvers see everything they can review.
    if (pendingApprover) return payload;
    return {
      payments: payload.payments.filter((payment) => payment.collected_by === appData.profile.id),
      expenses: payload.expenses.filter((expense) => expense.spent_by === appData.profile.id),
    };
  }, [appData.profile.id, pendingApprovalsQuery.data, pendingApprover]);
  const pendingApprovalCount = pendingApprovals.payments.length + pendingApprovals.expenses.length;
  const enabledModules = useMemo(() => new Set(appData.businessContext.enabledModules), [appData.businessContext.enabledModules]);
  const permissions = useMemo(() => activePermissions(appData.profile.role, appData.permissions).filter((permission) => {
    const moduleType = (Object.keys(businessPermissions) as BusinessType[]).find((key) => businessPermissions[key] === permission);
    return !moduleType || enabledModules.has(moduleType);
  }), [appData.permissions, appData.profile.role, enabledModules]);
  const scopedBusinessTypes = useMemo(() => {
    if (supportMode || primaryOwner) return new Set(appData.businessContext.enabledModules);
    if (manager) {
      return new Set(
        appData.managerUnitScopes
          .filter((scope) => scope.manager_profile_id === appData.profile.id)
          .map((scope) => scope.business_type),
      );
    }
    return new Set(
      appData.staffUnitAssignments
        .filter((assignment) => assignment.staff_profile_id === appData.profile.id)
        .map((assignment) => assignment.business_type),
    );
  }, [appData.businessContext.enabledModules, appData.managerUnitScopes, appData.profile.id, appData.staffUnitAssignments, manager, primaryOwner, supportMode]);
  const canViewLibraryStudents = !currentUserIsSalesAgent && scopedBusinessTypes.has("library") && permissions.includes("collect_library");
  const canViewCourseStudents = !currentUserIsSalesAgent && scopedBusinessTypes.has("course") && permissions.includes("collect_course");
  const canViewStudentRecords = canViewLibraryStudents || canViewCourseStudents;
  const studentFilterSources = useMemo(
    () => studentRecordSources(appData.courses, t, canViewLibraryStudents, canViewCourseStudents),
    [appData.courses, canViewCourseStudents, canViewLibraryStudents, t],
  );
  const defaultStudentSourceId = studentFilterSources[0]?.id ?? "library";
  const effectiveStudentSourceId = studentFilterSources.some((source) => source.id === studentFilters.sourceId)
    ? studentFilters.sourceId
    : defaultStudentSourceId;
  const effectiveStudentFilters = { sourceId: effectiveStudentSourceId, status: studentFilters.status };
  const availableBusinessTypes = useMemo(
    () => (Object.keys(businessLabels) as BusinessType[]).filter((businessType) =>
      enabledModules.has(businessType) && scopedBusinessTypes.has(businessType),
    ),
    [enabledModules, scopedBusinessTypes],
  );
  const visibleTabItems = useMemo(() => currentUserIsSalesAgent
    ? tabItems.filter((item) => item.id === "home" || item.id === "payments" || item.id === "work")
    : tabItems.filter((item) => item.id !== "library_students" || canViewStudentRecords),
  [canViewStudentRecords, currentUserIsSalesAgent]);
  const bottomTabItems = useMemo(
    () => visibleTabItems.filter((item) => item.id === "home" || item.id === "payments" || item.id === "closing" || item.id === "work"),
    [visibleTabItems],
  );

  const pushNotice = useCallback((notice: ActionResult | null) => {
    if (!notice?.message) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current.slice(-3), { ...notice, id }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, notice.ok ? 5200 : 7600);
  }, [setToasts]);

  useEffect(() => {
    const accessError = [bootstrapQuery.error, dashboardQuery.error]
      .find((error): error is OperationalRequestError => error instanceof OperationalRequestError && (error.status === 401 || error.status === 403));
    if (!accessError) return;
    clearPersistedQueryCache();
    queryClient.clear();
    window.location.assign(`/settings?section=businesses&error=${encodeURIComponent(accessError.message)}`);
  }, [bootstrapQuery.error, dashboardQuery.error, queryClient]);

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem("lenden-language");
    if (savedLanguage === "en" || savedLanguage === "hi") {
      queueMicrotask(() => setLanguageState(savedLanguage));
    }
  }, []);

  useEffect(() => {
    if (!isOperationalTab(tab)) {
      const savedTab = window.sessionStorage.getItem(lastOperationalTabStorageKey);
      if (savedTab === "home" || savedTab === "payments" || savedTab === "closing") {
        dispatchWorkspaceView({ type: "last-operational-tab", value: savedTab });
      }
    }
  }, [lastOperationalTabStorageKey, tab]);

  useEffect(() => {
    window.sessionStorage.setItem(lastOperationalTabStorageKey, lastOperationalTab);
  }, [lastOperationalTab, lastOperationalTabStorageKey]);

  useEffect(() => {
    if (!sidebarOpen || !window.matchMedia("(max-width: 767px)").matches) return;
    const panel = sidebarRef.current as HTMLElement | null;
    const origin = navigationTriggerRef.current;
    if (!panel) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusableSelector = "a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const focusable = () => [...panel.querySelectorAll<HTMLElement>(focusableSelector)];
    (focusable()[0] ?? panel).focus();

    function handleNavigationKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setSidebarOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      if (controls.length === 0) {
        event.preventDefault();
        panel?.focus();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleNavigationKeydown);
    return () => {
      document.removeEventListener("keydown", handleNavigationKeydown);
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => origin?.focus());
    };
  }, [sidebarOpen]);

  useEffect(() => {
    const expiresAt = data.businessContext.supportSession?.expires_at;
    if (data.businessContext.accessMode !== "support" || !expiresAt) return;
    const remaining = new Date(expiresAt).getTime() - Date.now();
    if (remaining <= 0) {
      window.location.replace("/admin/businesses");
      return;
    }
    const timeout = window.setTimeout(() => window.location.replace("/admin/businesses"), remaining);
    return () => window.clearTimeout(timeout);
  }, [data.businessContext.accessMode, data.businessContext.supportSession?.expires_at]);

  useEffect(() => {
    function startBusy(event: Event) {
      const detail = (event as CustomEvent<MutationRefreshDetail>).detail;
      setDocumentAppBusy(true);
      setActionBusyMessageKey(detail?.savingMessageKey ?? "savingChanges");
    }

    function endBusy() {
      setActionBusyMessageKey(null);
      setDocumentAppBusy(false);
    }

    function refreshStudentCaches(refetchType: "active" | "none" = "active") {
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ["student-roster", cacheScope], refetchType }),
        queryClient.invalidateQueries({ queryKey: ["student-picker", cacheScope], refetchType }),
        queryClient.invalidateQueries({ queryKey: ["student-collection-defaults", cacheScope], refetchType: "none" }),
        queryClient.invalidateQueries({ queryKey: ["student-detail", cacheScope], refetchType }),
        queryClient.invalidateQueries({ queryKey: ["library-student-history", cacheScope], refetchType }),
        queryClient.invalidateQueries({ queryKey: ["course-student-history", cacheScope], refetchType }),
      ]);
    }

    async function refreshCachedData(detail: MutationRefreshDetail) {
      const refreshes: Promise<unknown>[] = [];
      if (detail.scope === "dashboard" || detail.scope === "dashboard-library" || detail.scope === "bootstrap") {
        refreshes.push(
          queryClient.refetchQueries({
            queryKey: ["operational", cacheScope, activeOperationalPage, dashboardParams],
            exact: true,
            type: "active",
          }),
        );
      }
      if (detail.scope === "bootstrap") {
        refreshes.push(
          queryClient.refetchQueries({
            queryKey: ["bootstrap", cacheScope],
            exact: true,
            type: "active",
          }),
        );
      }
      if (detail.scope === "dashboard-library") {
        refreshes.push(refreshStudentCaches());
      }
      if (detail.scope === "work") {
        refreshes.push(queryClient.invalidateQueries({ queryKey: ["work", cacheScope] }));
      }
      await Promise.all(refreshes);
    }

    function applyPatchToCachedRanges(patch: MutationPatch) {
      const cachedDashboards = queryClient.getQueriesData<DashboardPayload>({
        queryKey: ["operational", cacheScope],
      });
      let reconciled = false;
      cachedDashboards.forEach(([queryKey, current]) => {
        if (!current) return;
        const params = new URLSearchParams(String(queryKey[3] ?? ""));
        const preset = params.get("range") as DateRangePreset | null;
        const presetRange = rangeForPreset(preset ?? "today");
        const rangeFrom = params.get("from") ?? presetRange.from;
        const closingDate = params.get("to") ?? presetRange.to;
        const cachedDateFilterKey = params.get("dateKey") === "transaction" ? "transaction" : "approval";
        queryClient.setQueryData<DashboardPayload>(queryKey, applyMutationPatch(
          current,
          patch,
          appData.profile.id,
          owner || supportMode,
          rangeFrom,
          closingDate,
          cachedDateFilterKey,
        ));
        reconciled = true;
      });
      return reconciled;
    }

    function commitMutation(event: Event) {
      const detail = (event as CustomEvent<MutationRefreshDetail>).detail ?? {
        scope: "none",
        savingMessageKey: "savingChanges",
      };
      // Approvals, new payments and edits all change what is pending.
      void queryClient.invalidateQueries({ queryKey: ["pending-approvals", cacheScope] });
      if (detail.patch && applyPatchToCachedRanges(detail.patch)) {
        if (detail.patch.type === "student" || detail.scope === "dashboard-library") {
          void refreshStudentCaches().then(endBusy, endBusy);
          return;
        }
        endBusy();
        return;
      }
      void refreshCachedData(detail).then(endBusy, endBusy);
    }

    window.addEventListener(actionStartedEvent, startBusy);
    window.addEventListener(actionEndedEvent, endBusy);
    window.addEventListener(mutationCommittedEvent, commitMutation);
    return () => {
      window.removeEventListener(actionStartedEvent, startBusy);
      window.removeEventListener(actionEndedEvent, endBusy);
      window.removeEventListener(mutationCommittedEvent, commitMutation);
      setDocumentAppBusy(false);
    };
  }, [activeOperationalPage, appData.profile.id, cacheScope, dashboardParams, owner, queryClient, supportMode]);

  useEffect(() => {
    async function handlePullRefresh(event: Event) {
      event.preventDefault();
      if (appIsOffline()) {
        pushNotice({ ok: false, message: "You are offline. Saved data is still available." });
        showOfflineDialog();
        window.dispatchEvent(new CustomEvent(pullRefreshCompleteEvent));
        return;
      }

      try {
        await Promise.all([
          queryClient.refetchQueries({ queryKey: ["bootstrap", cacheScope], exact: true, type: "active" }),
          queryClient.refetchQueries({ queryKey: ["operational", cacheScope, activeOperationalPage, dashboardParams], exact: true, type: "active" }),
          queryClient.invalidateQueries({ queryKey: ["student-roster", cacheScope] }),
          queryClient.invalidateQueries({ queryKey: ["student-picker", cacheScope], refetchType: "none" }),
          queryClient.invalidateQueries({ queryKey: ["student-detail", cacheScope] }),
          queryClient.invalidateQueries({ queryKey: ["library-student-history", cacheScope] }),
          queryClient.invalidateQueries({ queryKey: ["course-student-history", cacheScope] }),
          queryClient.invalidateQueries({ queryKey: ["work", cacheScope] }),
        ]);
      } catch (error) {
        pushNotice({
          ok: false,
          message: error instanceof Error ? error.message : "Could not refresh app data.",
        });
      } finally {
        window.dispatchEvent(new CustomEvent(pullRefreshCompleteEvent));
      }
    }

    window.addEventListener(pullRefreshEvent, handlePullRefresh);
    return () => window.removeEventListener(pullRefreshEvent, handlePullRefresh);
  }, [activeOperationalPage, cacheScope, dashboardParams, pushNotice, queryClient]);

  useEffect(() => {
    notificationsRef.current = appData.notifications ?? [];
  }, [appData.notifications]);

  useEffect(() => {
    const params = applyAppViewStateToSearchParams(
      new URLSearchParams(window.location.search),
      {
        tab,
        dashboardFilters,
        transactionFilters,
        closingFilters,
        studentFilters: { sourceId: effectiveStudentSourceId, status: studentFilters.status },
      },
      { profileId: appData.profile.id, studentSourceId: defaultStudentSourceId },
    );

    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      const method = historyShouldPush ? "pushState" : "replaceState";
      window.history[method](null, "", nextUrl);
    }
    if (historyShouldPush) queueMicrotask(() => setHistoryShouldPush(false));
  }, [appData.profile.id, closingFilters, dashboardFilters, defaultStudentSourceId, effectiveStudentSourceId, historyShouldPush, setHistoryShouldPush, studentFilters.status, tab, transactionFilters]);

  useEffect(() => {
    function restoreHistoryState() {
      const parsed = parseAppViewState(
        Object.fromEntries(new URLSearchParams(window.location.search)),
        appData.profile.id,
      );
      const nextTab = currentUserIsSalesAgent && (parsed.tab === "closing" || parsed.tab === "settings" || parsed.tab === "library_students")
        ? "home"
        : parsed.tab === "library_students" && !canViewStudentRecords
          ? "home"
          : parsed.tab;
      const nextProfileId = parsed.transactionFilters.profileId === appData.profile.id
        || appData.profiles.some((profile) => profile.id === parsed.transactionFilters.profileId)
        ? parsed.transactionFilters.profileId
        : appData.profile.id;
      const nextDashboardBusiness = parsed.dashboardFilters.businessType === "all"
        || availableBusinessTypes.includes(parsed.dashboardFilters.businessType)
        ? parsed.dashboardFilters.businessType
        : "all";
      const nextTransactionBusiness = parsed.transactionFilters.businessType === "all"
        || availableBusinessTypes.includes(parsed.transactionFilters.businessType)
        ? parsed.transactionFilters.businessType
        : "all";
      const nextStudentSource = studentFilterSources.some((source) => source.id === parsed.studentFilters.sourceId)
        ? parsed.studentFilters.sourceId
        : defaultStudentSourceId;

      setHistoryShouldPush(false);
      dispatchWorkspaceView({
        type: "replace",
        value: {
          tab: nextTab,
          dashboardFilters: { ...parsed.dashboardFilters, businessType: nextDashboardBusiness },
          transactionFilters: {
            ...parsed.transactionFilters,
            profileId: nextProfileId,
            businessType: nextTransactionBusiness,
          },
          closingFilters: parsed.closingFilters,
          studentFilters: { ...parsed.studentFilters, sourceId: nextStudentSource },
        },
      });
    }

    window.addEventListener("popstate", restoreHistoryState);
    return () => window.removeEventListener("popstate", restoreHistoryState);
  }, [appData.profile.id, appData.profile.membership_role, appData.profiles, availableBusinessTypes, canViewStudentRecords, currentUserIsSalesAgent, defaultStudentSourceId, setHistoryShouldPush, studentFilterSources]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const dispatchRemotePatch = (patch: MutationPatch) => {
      window.dispatchEvent(new CustomEvent<MutationRefreshDetail>(mutationCommittedEvent, {
        detail: { scope: "none", savingMessageKey: "savingChanges", patch },
      }));
    };
    const reconcileTransferNotification = async (notification: AppNotification) => {
      if (notification.category !== "transfer") return;
      const paymentId = typeof notification.metadata?.payment_id === "string" ? notification.metadata.payment_id : null;
      if (!paymentId) return;
      try {
        const result = await fetchJson<{ patch: MutationPatch }>(
          `/api/businesses/${businessId}/payment-transfers/${encodeURIComponent(paymentId)}`,
        );
        dispatchRemotePatch(result.patch);
      } catch {
        const assignedProfileId = typeof notification.metadata?.assigned_profile_id === "string"
          ? notification.metadata.assigned_profile_id
          : null;
        if (assignedProfileId && assignedProfileId !== appData.profile.id && !owner && !supportMode) {
          queryClient.setQueriesData<DashboardPayload>(
            { queryKey: ["operational", cacheScope] },
            (current) => current ? {
              ...current,
              payments: current.payments.filter((payment) => payment.id !== paymentId),
            } : current,
          );
        }
      }
    };
    const channel = supabase
      .channel(`app-notifications-${appData.profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "app_notifications",
          filter: `recipient_id=eq.${appData.profile.id}`,
        },
        (payload) => {
          const notification = payload.new as AppNotification;
          setNotificationOverrides((current) => {
            const source = current ?? notificationsRef.current;
            return [notification, ...source.filter((item) => item.id !== notification.id)];
          });
          pushNotice({ ok: true, message: `${notification.title}: ${notification.body}` });
          void reconcileTransferNotification(notification);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "library_students",
          filter: `business_id=eq.${businessId}`,
        },
        (payload) => {
          const before = payload.old as Partial<LibraryStudent>;
          const student = payload.new as LibraryStudent;
          if (before.active === student.active) return;
          dispatchRemotePatch({ type: "student", studentType: "library", student });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "course_students",
          filter: `business_id=eq.${businessId}`,
        },
        (payload) => {
          const before = payload.old as Partial<CourseStudent>;
          const student = payload.new as CourseStudent;
          if (before.active === student.active) return;
          dispatchRemotePatch({ type: "student", studentType: "course", student });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "business_modules",
          filter: `business_id=eq.${businessId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["bootstrap", cacheScope] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "business_memberships",
          filter: `profile_id=eq.${appData.profile.id}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["bootstrap", cacheScope] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [appData.profile.id, businessId, cacheScope, owner, pushNotice, queryClient, supportMode]);

  function setLanguage(nextLanguage: Language) {
    setLanguageState(nextLanguage);
    window.localStorage.setItem("lenden-language", nextLanguage);
  }

  function handleInvalid(event: FormEvent<HTMLElement>) {
    const field = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (field.validationMessage) {
      pushNotice({ ok: false, message: field.validationMessage });
    }
  }

  function openNotificationsPage() {
    setTab("notifications");
    setFilterDrawerOpen(false);
    setSidebarOpen(false);
    if (unreadNotifications === 0) return;

    const notificationsBeforeRead = notifications;
    const readAt = new Date().toISOString();
    setNotificationOverrides(
      notifications.map((notification) =>
        notification.read_at ? notification : { ...notification, read_at: readAt },
      ),
    );

    if (appIsOffline()) return;
    void markNotificationsReadAction()
      .then((result) => {
        if (!result.ok) {
          setNotificationOverrides(notificationsBeforeRead);
          pushNotice(result);
        }
      })
      .catch((error) => {
        setNotificationOverrides(notificationsBeforeRead);
        pushNotice({
          ok: false,
          message: error instanceof Error ? error.message : "Could not update notifications.",
        });
      });
  }

  const agentReferralCodes = appData.referrals.filter(
    (referral) => referral.active && referral.agent_id === appData.profile.id,
  );
  const canViewSharedBusinessHistory =
    !currentUserIsSalesAgent && (owner || scopedBusinessTypes.size > 0);
  const activeCourses = appData.courses.filter((course) => course.active);
  const activeRooms = appData.rooms.filter((room) => room.active);
  const salesAgents = appData.profiles.filter((profile) => profile.active && profile.membership_status === "active" && profile.role === "sales_agent");
  const receiveMoneyProfiles = appData.profiles.filter((item) => {
    if (currentUserIsSalesAgent || !item.active || item.membership_status !== "active" || item.id === appData.profile.id) return false;
    if (primaryOwner) return ["co_owner", "staff", "sales_agent"].includes(item.membership_role);
    if (manager) return item.membership_role === "staff" || item.membership_role === "sales_agent";
    return false;
  });
  const sendMoneyProfiles = appData.profiles.filter((item) => {
    if (currentUserIsSalesAgent || !item.active || item.membership_status !== "active" || item.id === appData.profile.id) return false;
    if (primaryOwner) return ["co_owner", "staff", "sales_agent"].includes(item.membership_role);
    if (manager) return item.membership_role === "staff" || item.membership_role === "sales_agent";
    return false;
  });
  const permissionsByProfile = useMemo(() => {
    return appData.profiles.reduce<Record<string, string[]>>((acc, profile) => {
      acc[profile.id] = appData.allPermissions
        .filter((permission) => permission.profile_id === profile.id)
        .map((permission) => permission.permission);
      return acc;
    }, {});
  }, [appData.allPermissions, appData.profiles]);

  const dashboardDateRange = normalizeDateRange(dashboardFilters.dateRange);
  const dashboardDateRangeLabel = formatDateRange(dashboardDateRange, t);
  const transactionDateRange = normalizeDateRange(transactionFilters.dateRange);
  const transactionDateRangeLabel = formatDateRange(transactionDateRange, t);
  const closingDate = closingFilters.date;
  const appOwnerProfileIds = useMemo(() => ownerProfileIdSet(appData.profiles), [appData.profiles]);
  const postingEvents = useMemo(
    () => buildDailyPostingEvents({
      payments: appData.payments,
      expenses: appData.expenses,
      movements: appData.movements,
      agentSettlements: appData.agentSettlements,
      ledger: appData.ledger,
      profiles: appData.profiles,
      timezone: appData.businessContext.business.timezone,
    }),
    [appData.agentSettlements, appData.businessContext.business.timezone, appData.expenses, appData.ledger, appData.movements, appData.payments, appData.profiles],
  );
  const transactionPostingEvents = useMemo(
    () => appData.financialActivity.length > 0
      ? [
          ...financialActivityPostingEvents(appData.financialActivity, transactionFilters.lens),
          ...postingEvents.filter((event) => event.source_type === "agent_settlement"),
        ]
      : postingEvents,
    [appData.financialActivity, postingEvents, transactionFilters.lens],
  );
  const selectedBusiness = dashboardFilters.businessType;
  const dashboardPaymentBusinesses = new Map(appData.payments.map((payment) => [payment.id, payment.business_type]));
  const dashboardExpenseBusinesses = new Map(appData.expenses.map((expense) => [expense.id, expense.business_type ?? "general"]));
  const selectedPostingEvents = postingEvents.filter((event) => {
    if (!dateInRange(postingEventDate(event, dashboardFilters.dateFilterKey), dashboardDateRange)) return false;
    if (selectedBusiness === "all") return true;
    if (event.source_type === "payment") return dashboardPaymentBusinesses.get(event.source_id) === selectedBusiness;
    if (event.source_type === "expense") return dashboardExpenseBusinesses.get(event.source_id) === selectedBusiness;
    return false;
  });
  const transactionUserId = canViewSharedBusinessHistory ? transactionFilters.profileId : appData.profile.id;
  const closingProfiles = useMemo(() => appData.profiles.filter((profile) => profile.active), [appData.profiles]);
  const closingSummaries = useMemo(
    () => {
      const withPostingFlow = (summary: UserClosingSummary) => ({
        ...summary,
        ...postingFlowTotals(postingEventsForProfileDate(postingEvents, summary.profile.id, closingDate, closingFilters.dateFilterKey)),
      });
      if (appData.closingSummaries.length > 0) {
        return appData.closingSummaries
          .map((summary) => {
            const profile = appData.profiles.find((item) => item.id === summary.profile_id);
            if (!profile) return null;
            const dayEntries = appData.ledger.filter(
              (entry) => entry.account_profile_id === summary.profile_id && entry.entry_date === closingDate,
            );

            return withPostingFlow({
              profile,
              opening: numberValue(summary.opening),
              collected: numberValue(summary.collected),
              expenses: numberValue(summary.expenses),
              received: numberValue(summary.received),
              sent: numberValue(summary.sent),
              adjustments: numberValue(summary.adjustments),
              closing: numberValue(summary.closing),
              dayEntries,
              inCash: 0,
              inOnline: 0,
              outCash: 0,
              outOnline: 0,
            });
          })
          .filter((summary): summary is UserClosingSummary => Boolean(summary));
      }

      return closingProfiles.map((profile) =>
        withPostingFlow(buildClosingSummary(profile, appData.ledger, closingDate)),
      );
    },
    [appData.closingSummaries, appData.ledger, appData.profiles, closingDate, closingFilters.dateFilterKey, closingProfiles, postingEvents],
  );
  const agentIncentiveSummary = useMemo<AgentIncentiveSummary>(() => {
    const agentPayments = appData.payments.filter(
      (payment) =>
        payment.referral_agent_id === appData.profile.id &&
        payment.record_status === "active" &&
        isEffectivelyApprovedPayment(payment, appOwnerProfileIds),
    );
    const earned = agentPayments.reduce((sum, payment) => sum + numberValue(payment.incentive_amount), 0);
    const settled = appData.agentSettlements
      .filter((settlement) => settlement.agent_id === appData.profile.id && settlement.status === "accepted")
      .reduce((sum, settlement) => sum + numberValue(settlement.amount), 0);
    const pending = appData.agentSettlements
      .filter((settlement) => settlement.agent_id === appData.profile.id && settlement.status === "pending")
      .reduce((sum, settlement) => sum + numberValue(settlement.amount), 0);

    return {
      earned,
      settled,
      pending,
      balance: Math.max(earned - settled - pending, 0),
      count: agentPayments.length,
    };
  }, [appData.agentSettlements, appData.payments, appData.profile.id, appOwnerProfileIds]);

  const agentIncentiveBalances = useMemo<AgentIncentiveBalance[]>(() => {
    return salesAgents
      .map((agent) => {
        const earned = appData.payments
          .filter(
            (payment) =>
              payment.referral_agent_id === agent.id &&
              payment.record_status === "active" &&
              isEffectivelyApprovedPayment(payment, appOwnerProfileIds),
          )
          .reduce((sum, payment) => sum + numberValue(payment.incentive_amount), 0);
        const committed = appData.agentSettlements
          .filter((settlement) => settlement.agent_id === agent.id && (settlement.status === "pending" || settlement.status === "accepted"))
          .reduce((sum, settlement) => sum + numberValue(settlement.amount), 0);
        return { agent, balance: Math.max(earned - committed, 0) };
      })
      .filter((item) => item.balance > 0);
  }, [appData.agentSettlements, appData.payments, appOwnerProfileIds, salesAgents]);

  const paymentEvents = selectedPostingEvents.filter((event) => event.source_type === "payment");
  const expenseEvents = selectedPostingEvents.filter((event) => event.source_type === "expense");
  const paymentsById = new Map(appData.payments.map((payment) => [payment.id, payment]));
  const expensesById = new Map(appData.expenses.map((expense) => [expense.id, expense]));
  const totals = {
    total: paymentEvents.reduce((sum, event) => sum + event.amount, 0),
    cash: paymentEvents.reduce((sum, event) => sum + event.cash_amount, 0),
    online: paymentEvents.reduce((sum, event) => sum + event.online_amount, 0),
    expense: expenseEvents.reduce((sum, event) => sum + event.amount, 0),
    byBusiness: Object.fromEntries(
      Object.keys(businessLabels).map((business) => [
        business,
        paymentEvents
          .filter((event) => paymentsById.get(event.source_id)?.business_type === business)
          .reduce((sum, event) => sum + event.amount, 0),
      ]),
    ) as Record<BusinessType, number>,
    expenseByBusiness: Object.fromEntries(
      Object.keys(businessLabels).map((business) => [
        business,
        expenseEvents
          .filter((event) => (expensesById.get(event.source_id)?.business_type ?? "general") === business)
          .reduce((sum, event) => sum + event.amount, 0),
      ]),
    ) as Record<BusinessType, number>,
  };

  const cashBalances = useMemo(() => {
    if (appData.cashBalances.length > 0) {
      const balancesByProfile = appData.cashBalances.reduce<Map<string, number>>((balances, summary) => {
        balances.set(
          summary.profile_id,
          (balances.get(summary.profile_id) ?? 0) + numberValue(summary.balance),
        );
        return balances;
      }, new Map());
      return appData.profiles
        .filter((profile) => balancesByProfile.has(profile.id))
        .map((profile) => ({ profile, balance: balancesByProfile.get(profile.id) ?? 0 }));
    }

    if (closingSummaries.length > 0) {
      return closingSummaries.map((summary) => ({
        profile: summary.profile,
        balance: summary.closing,
      }));
    }

    return appData.profiles.map((profile) => ({
      profile,
      balance: appData.ledger
        .filter((entry) => entry.account_profile_id === profile.id)
        .reduce((sum, entry) => sum + numberValue(entry.amount), 0),
    }));
  }, [appData.cashBalances, appData.ledger, appData.profiles, closingSummaries]);
  const transactionSelectableProfiles = (() => {
    if (currentUserIsSalesAgent) return [];
    if (primaryOwner) return appData.profiles.filter((item) => item.active);
    if (manager) {
      const visibleProfileIds = new Set<string>([appData.profile.id]);
      appData.profiles
        .filter((item) => item.membership_role === "primary_owner")
        .forEach((item) => visibleProfileIds.add(item.id));
      appData.staffUnitAssignments
        .filter((assignment) => assignment.manager_profile_id === appData.profile.id)
        .forEach((assignment) => visibleProfileIds.add(assignment.staff_profile_id));
      return appData.profiles.filter((item) => item.active && visibleProfileIds.has(item.id));
    }
    const visibleProfileIds = new Set<string>([appData.profile.id]);
    appData.payments.forEach((payment) => visibleProfileIds.add(paymentReviewProfileId(payment)));
    appData.expenses.forEach((expense) => visibleProfileIds.add(expense.spent_by));
    appData.staffUnitAssignments
      .filter((mine) => mine.staff_profile_id === appData.profile.id)
      .forEach((mine) => {
        appData.staffUnitAssignments
          .filter((peer) =>
            peer.business_type === mine.business_type
            && peer.manager_profile_id === mine.manager_profile_id,
          )
          .forEach((peer) => visibleProfileIds.add(peer.staff_profile_id));
        if (mine.manager_profile_id) visibleProfileIds.add(mine.manager_profile_id);
      });
    visibleProfileIds.add(transactionUserId);
    return appData.profiles.filter((item) => item.active && visibleProfileIds.has(item.id));
  })();

  function canUsePayment(type: BusinessType | "expense") {
    if (currentUserIsSalesAgent) return false;
    if (type === "expense") return permissions.includes("add_expense") && availableBusinessTypes.length > 0;
    return availableBusinessTypes.includes(type) && permissions.includes(businessPermissions[type]);
  }

  function changeTab(nextTab: Tab) {
    if (currentUserIsSalesAgent && (nextTab === "closing" || nextTab === "settings" || nextTab === "library_students")) {
      setTab("home");
    } else if (nextTab === "library_students" && !canViewStudentRecords) {
      setTab("home");
    } else {
      setTab(nextTab);
    }
    setFilterDrawerOpen(false);
    setSidebarOpen(false);
  }

  function openTransactions(
    lens: TransactionLens,
    activity: TransactionFilter,
    target?: {
      businessType?: BusinessTypeFilter;
      mode?: TransactionModeFilter;
      dateRange?: DateRangeState;
      dateFilterKey?: DateFilterKey;
    },
  ) {
    setTransactionFilters((current) => ({
      ...current,
      dateRange: target?.dateRange ?? dashboardFilters.dateRange,
      dateFilterKey: target?.dateFilterKey ?? dashboardFilters.dateFilterKey,
      lens,
      activity,
      profileId: lens === "personal" ? appData.profile.id : "all",
      recordType: "all",
      mode: target?.mode ?? "all",
      businessType: target?.businessType ?? dashboardFilters.businessType,
    }));
    changeTab("payments");
  }

  function leaveFocusedPage() {
    changeTab(lastOperationalTab);
  }

  function openAction(nextModal: Exclude<ActionModal, null>) {
    setSelectedPositive(null);
    setSelectedNegative(null);
    setActionModal(nextModal);
  }

  function closeAction() {
    setActionModal(null);
    setSelectedPositive(null);
    setSelectedNegative(null);
  }

  const showQuickActions = tab === "home" && !currentUserIsSalesAgent && !supportMode;
  const focusedPage = tab === "library_students" || tab === "notifications";
  const showOperationalFilters = tab === "home" || tab === "payments" || tab === "closing";
  const currentPageTitle = tab === "notifications"
    ? t("notifications")
    : t(visibleTabItems.find((item) => item.id === tab)?.labelKey ?? "dashboard");
  const dateBasisLabel = (key: DateFilterKey) => key === "approval" ? t("approvalDate") : t("transactionDate");
  const transactionActivityLabel = (activity: TransactionFilter) => {
    if (activity === "collections") return t("collections");
    if (activity === "expenses") return t("expenses");
    if (activity === "cash_in") return t("cashIn");
    if (activity === "cash_out") return t("cashOut");
    if (activity === "pending") return t("pending");
    return t("all");
  };
  const transactionRecordLabel = (recordType: TransactionRecordType) => {
    if (recordType === "payment") return t("payments");
    if (recordType === "expense") return t("expenses");
    if (recordType === "transfer") return t("cashTransfers");
    if (recordType === "agent_payout") return t("agentPayouts");
    return t("allTypes");
  };
  const transactionModeLabel = (mode: TransactionModeFilter) => mode === "all" ? t("all") : mode === "mixed" ? t("mixed") : mode === "cash" ? t("cash") : t("online");
  const scopeRangeLabel = (range: DateRangeState, formattedRange: string) => {
    if (range.preset === "custom") return formattedRange;
    const option = dateRangeOptions.find((item) => item.value === range.preset);
    return option ? t(option.labelKey) : formattedRange;
  };
  const activeScopeLabel = tab === "home"
    ? `${scopeRangeLabel(dashboardFilters.dateRange, dashboardDateRangeLabel)} · ${dateBasisLabel(dashboardFilters.dateFilterKey)}`
    : tab === "payments"
      ? `${scopeRangeLabel(transactionFilters.dateRange, transactionDateRangeLabel)} · ${dateBasisLabel(transactionFilters.dateFilterKey)}`
      : `${closingDate} · ${dateBasisLabel(closingFilters.dateFilterKey)}`;
  const activeFilterChips: { key: string; label: string; clear: () => void }[] = [];
  if (tab === "home") {
    if (dashboardFilters.dateRange.preset !== "today") activeFilterChips.push({ key: "date", label: dashboardDateRangeLabel, clear: () => setDashboardFilters((current) => ({ ...current, dateRange: rangeForPreset("today") })) });
    if (dashboardFilters.dateFilterKey !== "approval") activeFilterChips.push({ key: "date-key", label: dateBasisLabel(dashboardFilters.dateFilterKey), clear: () => setDashboardFilters((current) => ({ ...current, dateFilterKey: "approval" })) });
    if (dashboardFilters.businessType !== "all") activeFilterChips.push({ key: "business", label: labelForBusiness(dashboardFilters.businessType, t), clear: () => setDashboardFilters((current) => ({ ...current, businessType: "all" })) });
  } else if (tab === "payments") {
    if (transactionFilters.dateRange.preset !== "today") activeFilterChips.push({ key: "date", label: transactionDateRangeLabel, clear: () => setTransactionFilters((current) => ({ ...current, dateRange: rangeForPreset("today") })) });
    if (transactionFilters.dateFilterKey !== "approval") activeFilterChips.push({ key: "date-key", label: dateBasisLabel(transactionFilters.dateFilterKey), clear: () => setTransactionFilters((current) => ({ ...current, dateFilterKey: "approval" })) });
    if (transactionFilters.lens === "business" && transactionFilters.profileId !== "all") activeFilterChips.push({ key: "person", label: profileName(appData.profiles, transactionFilters.profileId, t), clear: () => setTransactionFilters((current) => ({ ...current, profileId: "all" })) });
    if (transactionFilters.activity !== "all") activeFilterChips.push({ key: "activity", label: transactionActivityLabel(transactionFilters.activity), clear: () => setTransactionFilters((current) => ({ ...current, activity: "all" })) });
    if (transactionFilters.recordType !== "all") activeFilterChips.push({ key: "type", label: transactionRecordLabel(transactionFilters.recordType), clear: () => setTransactionFilters((current) => ({ ...current, recordType: "all" })) });
    if (transactionFilters.mode !== "all") activeFilterChips.push({ key: "mode", label: transactionModeLabel(transactionFilters.mode), clear: () => setTransactionFilters((current) => ({ ...current, mode: "all" })) });
    if (transactionFilters.businessType !== "all") activeFilterChips.push({ key: "business", label: labelForBusiness(transactionFilters.businessType, t), clear: () => setTransactionFilters((current) => ({ ...current, businessType: "all" })) });
  } else if (tab === "closing") {
    if (closingFilters.date !== todayIso()) activeFilterChips.push({ key: "date", label: closingFilters.date, clear: () => setClosingFilters((current) => ({ ...current, date: todayIso() })) });
    if (closingFilters.dateFilterKey !== "approval") activeFilterChips.push({ key: "date-key", label: dateBasisLabel(closingFilters.dateFilterKey), clear: () => setClosingFilters((current) => ({ ...current, dateFilterKey: "approval" })) });
  }
  const busyMessage = actionBusyMessageKey
    ? t(actionBusyMessageKey)
    : pending
      ? t("saving")
      : null;
  const pageUsesOperationalQuery = tab !== "notifications" && tab !== "library_students" && tab !== "work";
  const operationalPagePending = pageUsesOperationalQuery && (
    !hasHydrated
    || (dashboardQuery.isPending && !dashboardQuery.data)
  );
  const operationalPageRefreshing = pageUsesOperationalQuery && hasHydrated && dashboardQuery.isFetching && !operationalPagePending;
  const operationalPageBusy = hasHydrated && (operationalPagePending || operationalPageRefreshing);
  const workspaceReturnParams = applyAppViewStateToSearchParams(
    new URLSearchParams(),
    {
      tab,
      dashboardFilters,
      transactionFilters,
      closingFilters,
      studentFilters: effectiveStudentFilters,
    },
    {
      profileId: appData.profile.id,
      studentSourceId: defaultStudentSourceId,
    },
  );
  const workspaceReturnQuery = workspaceReturnParams.toString();
  const workspaceReturnHref = `/b/${appData.businessContext.business.slug}${workspaceReturnQuery ? `?${workspaceReturnQuery}` : ""}`;
  const settingsHref = `/settings?section=profile&returnTo=${encodeURIComponent(workspaceReturnHref)}`;
  const businessSettingsHref = `/b/${appData.businessContext.business.slug}/manage?returnTo=${encodeURIComponent(workspaceReturnHref)}`;
  const adminHref = `/admin/businesses?returnTo=${encodeURIComponent(workspaceReturnHref)}`;

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
    <div
      className={`app-root bg-surface text-on-surface antialiased min-h-screen flex flex-col selection:bg-primary-container selection:text-on-primary-container ${focusedPage ? "focused-page-root" : "pb-24 md:pb-0"}`}
      onWheelCapture={disableNumberInputWheelChange}
    >
      {!focusedPage ? <header className="app-header flex justify-between items-center px-4 py-3 w-full sticky top-0 z-40" id="main-header">
        <div className="app-header-brand flex items-center gap-3">
          <button
            ref={navigationTriggerRef}
            type="button"
            aria-label={t("openProfileMenu")}
            aria-controls="app-navigation-menu"
            aria-expanded={sidebarOpen}
            className="mobile-menu-button profile-menu-trigger rounded-full overflow-hidden border border-outline-variant/30 shadow-soft focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface md:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <SafeAvatarImage alt="" className="w-full h-full object-cover" fullName={appData.profile.full_name} avatarUrl={appData.profile.avatar_url} />
            {!currentUserIsSalesAgent && unreadNotifications > 0 ? <span className="profile-unread-dot" aria-hidden="true" /> : null}
          </button>
          <img className="app-logo-image" src="/icon-192.png" alt="Lenden logo" />
          <span className="app-brand-title font-headline text-xl font-bold text-primary dark:text-inverse-primary">Lenden</span>
        </div>
        <div className="app-header-title hidden md:flex items-center gap-3">
          <label className="sr-only" htmlFor="business-switcher">Business</label>
          <select
            id="business-switcher"
            className="business-switcher"
            value={appData.businessContext.business.slug}
            onChange={(event) => {
              window.location.assign(`/b/${encodeURIComponent(event.target.value)}`);
            }}
          >
            {appData.businessContext.availableBusinesses.map(({ business }) => (
              <option key={business.id} value={business.slug}>{business.name}</option>
            ))}
            {supportMode ? (
              <option value={appData.businessContext.business.slug}>{appData.businessContext.business.name} · Support</option>
            ) : null}
          </select>
          <span className="font-headline text-headline-sm font-semibold tracking-tight text-primary dark:text-inverse-primary">
            {currentPageTitle}
          </span>
        </div>
        <div className="app-header-actions flex items-center gap-3">
          {showOperationalFilters ? (
            <button
              type="button"
              className="header-icon-button header-filter-trigger text-on-surface-variant hover:bg-surface-container-low transition-colors rounded-full p-2 cursor-pointer"
              onClick={() => setFilterDrawerOpen(true)}
              aria-label={`${t("filters")}: ${activeScopeLabel}`}
              title={`${t("filters")} · ${activeScopeLabel}`}
            >
              <SlidersHorizontal size={22} />
              {activeFilterChips.length > 0 ? (
                <span className="header-filter-count">{activeFilterChips.length}</span>
              ) : null}
            </button>
          ) : null}
          {currentUserIsSalesAgent ? (
            <button
              type="button"
              className="header-icon-button notification-trigger text-on-surface-variant hover:bg-surface-container-low transition-colors rounded-full p-2 relative cursor-pointer"
              onClick={openNotificationsPage}
              aria-label={t("notifications")}
            >
              {unreadNotifications > 0 ? <BellRing size={22} /> : <Bell size={22} />}
              {unreadNotifications > 0 ? (
                <span className="absolute top-2 right-2.5 w-2 h-2 bg-error rounded-full border-2 border-surface"></span>
              ) : null}
            </button>
          ) : (
            <button
              type="button"
              className="header-icon-button pending-trigger text-on-surface-variant hover:bg-surface-container-low transition-colors rounded-full p-2 relative cursor-pointer"
              onClick={() => {
                setPendingSheetOpen(true);
                void pendingApprovalsQuery.refetch();
              }}
              aria-label={`${t("pending")}: ${pendingApprovalCount}`}
              title={t("pending")}
            >
              <ClipboardList size={22} />
              {pendingApprovalCount > 0 ? (
                <span className="header-pending-count">{pendingApprovalCount > 99 ? "99+" : pendingApprovalCount}</span>
              ) : null}
            </button>
          )}
        </div>
      </header> : null}

      {supportMode && appData.businessContext.supportSession ? (
        <div className="support-mode-banner" role="status">
          <strong>Audited support mode</strong>
          <span>Configuration access only · Financial changes are blocked · Expires {formatIndiaTime(appData.businessContext.supportSession.expires_at)}</span>
          <span>Reason: {appData.businessContext.supportSession.reason}</span>
        </div>
      ) : null}

      <div className={`app-shell-body flex flex-1 overflow-hidden relative w-full mx-auto ${focusedPage ? "focused-shell-body" : "max-w-7xl"}`}>
        {!focusedPage ? <>
        {sidebarOpen && (
          <button
            className="app-sidebar-scrim fixed inset-0 z-45 bg-black/40 backdrop-blur-xs md:hidden border-0 cursor-pointer"
            aria-label={t("closeNavigation")}
            type="button"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside
          aria-label={t("main")}
          aria-modal={sidebarOpen ? true : undefined}
          className={`app-sidebar fixed inset-y-0 left-0 z-50 flex flex-col bg-surface-container-low dark:bg-surface-container-lowest h-full w-80 shadow-2xl py-6 overflow-y-auto transition-transform duration-300 md:sticky md:top-[64px] md:h-[calc(100vh-64px)] md:shadow-xl md:rounded-r-xl ${sidebarOpen ? 'is-open translate-x-0' : 'is-closed -translate-x-full md:translate-x-0 md:flex'}`}
          id="app-navigation-menu"
          ref={sidebarRef}
          role={sidebarOpen ? "dialog" : undefined}
          tabIndex={-1}
        >
          <button className="app-sidebar-close grid md:hidden" type="button" aria-label={t("closeNavigation")} onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
          <div className="app-sidebar-profile px-6 mb-8 flex items-center gap-4">
            <SafeAvatarImage alt="User profile" className="w-12 h-12 rounded-full object-cover shadow-sm" fullName={appData.profile.full_name} avatarUrl={appData.profile.avatar_url} />
            <div>
              <h2 className="font-headline text-lg font-bold text-primary">{appData.profile.full_name}</h2>
              <p className="font-body text-body-md text-on-surface-variant">{profileRoleLabel(appData.profile, t)}</p>
              <p className="app-sidebar-business-name">{appData.businessContext.business.name}</p>
            </div>
          </div>
          <div className="px-6 mb-4 md:hidden">
            <label className="sr-only" htmlFor="mobile-business-switcher">Business</label>
            <select
              id="mobile-business-switcher"
              className="business-switcher w-full"
              value={appData.businessContext.business.slug}
              onChange={(event) => window.location.assign(`/b/${encodeURIComponent(event.target.value)}`)}
            >
              {appData.businessContext.availableBusinesses.map(({ business }) => <option key={business.id} value={business.slug}>{business.name}</option>)}
              {supportMode ? <option value={appData.businessContext.business.slug}>{appData.businessContext.business.name} · Support</option> : null}
            </select>
          </div>
          <nav className="app-sidebar-nav flex-1 px-4 space-y-1" aria-label={t("main")}>
            {visibleTabItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => changeTab(item.id)}
                className={`app-sidebar-button flex items-center gap-3 px-4 py-3 m-2 p-2 rounded-lg transition-all duration-200 w-full text-left cursor-pointer border-0 ${tab === item.id ? 'active bg-primary-container text-on-primary-container font-bold shadow-xs' : 'text-on-surface-variant dark:text-on-surface-variant hover:bg-surface-variant/50 dark:hover:bg-surface-variant/20'}`}
              >
                {getTabIcon(item.id)}
                <span className="font-body text-body-md">{t(item.labelKey)}</span>
              </button>
            ))}
          </nav>
          {!currentUserIsSalesAgent ? (
            <div className="px-4">
              <button
                type="button"
                onClick={openNotificationsPage}
                className="app-sidebar-button flex items-center gap-3 px-4 py-3 m-2 rounded-lg w-full text-left cursor-pointer border-0 text-on-surface-variant hover:bg-surface-variant/50"
              >
                {unreadNotifications > 0 ? <BellRing size={20} /> : <Bell size={20} />}
                <span>{t("notifications")}</span>
                {unreadNotifications > 0 ? <span className="sidebar-unread-count">{unreadNotifications}</span> : null}
              </button>
            </div>
          ) : null}
          <div className="px-4">
            <Link className="app-sidebar-button flex items-center gap-3 px-4 py-3 m-2 rounded-lg text-on-surface-variant hover:bg-surface-variant/50" href={settingsHref}>
              <UserCheck size={20} />
              <span>Settings</span>
            </Link>
          </div>
          {(owner || supportMode) ? (
            <div className="px-4">
              <Link className="app-sidebar-button flex items-center gap-3 px-4 py-3 m-2 rounded-lg text-on-surface-variant hover:bg-surface-variant/50" href={businessSettingsHref}>
                <Settings size={20} />
                <span>Business settings</span>
              </Link>
            </div>
          ) : null}
          {appData.profile.platform_role === "platform_admin" ? (
            <div className="px-4">
              <Link className="app-sidebar-button flex items-center gap-3 px-4 py-3 m-2 rounded-lg text-on-surface-variant hover:bg-surface-variant/50" href={adminHref}>
                <ShieldCheck size={20} />
                <span>Admin console</span>
              </Link>
            </div>
          ) : null}
          <div className="px-4 mt-auto">
            <form
              action={logoutAction}
              onSubmit={(event) => {
                if (!appIsOffline()) return;
                event.preventDefault();
                pushNotice({ ok: false, message: "You are offline. Reconnect before logging out." });
                showOfflineDialog();
              }}
            >
              <LogoutButton label={t("logout")} />
            </form>
          </div>
        </aside>
        </> : null}

        <main
          className={`app-main flex-1 overflow-y-auto w-full ${focusedPage ? "focused-page-main" : "px-4 py-6 md:px-8 md:py-8"}`}
          aria-busy={operationalPageBusy}
          onInvalidCapture={handleInvalid}
        >
          {focusedPage ? (
            <header className="focused-page-header">
              <button type="button" className="focused-page-back" onClick={leaveFocusedPage}>
                <ArrowLeft size={20} />
                <span>{t("back")}</span>
              </button>
              <div>
                <p>{appData.businessContext.business.name}</p>
                <h1>{currentPageTitle}</h1>
              </div>
            </header>
          ) : null}
          <div className={`app-main-inner mx-auto space-y-8 ${focusedPage ? "focused-page-content" : "max-w-4xl"}`}>
            {operationalPageRefreshing ? (
              <div className="operational-page-progress" role="status" aria-label="Updating results">
                <span />
              </div>
            ) : null}

            {showQuickActions ? (
              <BottomActions
                canAddPositive={(Object.keys(businessPermissions) as BusinessType[]).some((type) => canUsePayment(type)) || receiveMoneyProfiles.length > 0}
                canAddNegative={canUsePayment("expense") || sendMoneyProfiles.length > 0 || (primaryOwner && agentIncentiveBalances.length > 0)}
                onPositive={() => openAction("positive")}
                onNegative={() => openAction("negative")}
              />
            ) : null}

            {pendingSheetOpen && typeof document !== "undefined" ? createPortal(
              <div className="pending-page" role="dialog" aria-modal="true" aria-label={t("pending")}>
                <section className="pending-page-body">
                  <header className="closing-review-header pending-page-header">
                    <button className="icon-button" type="button" aria-label={t("back")} onClick={() => setPendingSheetOpen(false)}>
                      <ArrowLeft size={18} />
                    </button>
                    <div>
                      <p className="eyebrow">{pendingApprover ? t("awaitingYourApproval") : t("awaitingApproval")}</p>
                      <h2>{t("pending")} · {pendingApprovalCount}</h2>
                      <small>{t("pendingAllDates")}</small>
                    </div>
                  </header>
                  {pendingApprovalsQuery.isPending ? (
                    <div className="student-picker-loading" role="status" aria-label={t("loading")}><span /><span /><span /></div>
                  ) : pendingApprovalsQuery.isError ? (
                    <button className="secondary-button" type="button" onClick={() => void pendingApprovalsQuery.refetch()}>{t("retry")}</button>
                  ) : (
                    <TransactionsView
                      pendingOnly
                      businessId={businessId}
                      cacheScope={cacheScope}
                      dateLabel={t("pendingAllDates")}
                      dateRange={{ from: "2000-01-01", to: "9999-12-31" }}
                      dateFilterKey="transaction"
                      transactionLens={pendingApprover ? "business" : "personal"}
                      transactionFilter="pending"
                      transactionProfileId={pendingApprover ? "all" : appData.profile.id}
                      recordTypeFilter="all"
                      modeFilter="all"
                      businessTypeFilter="all"
                      onSelectLens={() => undefined}
                      onSelectActivity={() => undefined}
                      payments={pendingApprovals.payments}
                      expenses={pendingApprovals.expenses}
                      movements={appData.movements}
                      ledger={[]}
                      agentSettlements={[]}
                      financialActivity={[]}
                      postingEvents={[]}
                      profiles={appData.profiles}
                      profile={appData.profile}
                      owner={owner}
                      canVerifyOnlineCollections={primaryOwner || supportMode}
                      sharedBusinessHistory={canViewSharedBusinessHistory}
                      agentIncentiveSummary={agentIncentiveSummary}
                      agentReferralCodes={agentReferralCodes}
                      permissionsByProfile={permissionsByProfile}
                      staffUnitAssignments={appData.staffUnitAssignments}
                      setNotice={pushNotice}
                      startTransition={startTransition}
                    />
                  )}
                </section>
              </div>,
              document.body,
            ) : null}

            <ToastStack toasts={toasts} pending={false} savingLabel={busyMessage ?? t("saving")} dismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
            {busyMessage ? (
              <div className="action-lock" role="status" aria-live="polite" aria-label={busyMessage}>
                <div className="action-lock-card">
                  <span className="toast-icon saving-dot" aria-hidden="true" />
                  <strong>{busyMessage}</strong>
                </div>
              </div>
            ) : null}
            {filterDrawerOpen && showOperationalFilters ? (
              <OperationalFilterDrawer
                key={tab}
                tab={tab}
                dashboardFilters={dashboardFilters}
                transactionFilters={transactionFilters}
                closingFilters={closingFilters}
                businessTypes={availableBusinessTypes}
                transactionProfiles={transactionSelectableProfiles}
                showTransactionProfile={!currentUserIsSalesAgent && canViewSharedBusinessHistory}
                salesAgent={currentUserIsSalesAgent}
                defaultProfileId={appData.profile.id}
                onApplyDashboard={setDashboardFilters}
                onApplyTransactions={setTransactionFilters}
                onApplyClosing={setClosingFilters}
                onPrefetch={prefetchOperationalFilters}
                onClose={() => setFilterDrawerOpen(false)}
              />
            ) : null}

            {operationalPagePending ? <OperationalPageSkeleton page={activeOperationalPage} /> : null}

            {!operationalPagePending && tab === "home" ? (
              <HomeView
                totals={totals}
                cashBalances={cashBalances}
                owner={owner}
                data={appData}
                postingEvents={selectedPostingEvents}
                dateFilterKey={dashboardFilters.dateFilterKey}
                dateRange={dashboardDateRange}
                dateRangePreset={dashboardFilters.dateRange.preset}
                dateLabel={dashboardDateRangeLabel}
                businessTypeFilter={dashboardFilters.businessType}
                agentIncentiveSummary={agentIncentiveSummary}
                agentReferralCodes={agentReferralCodes}
                changeTab={changeTab}
                openTransactions={openTransactions}
                setNotice={pushNotice}
                startTransition={startTransition}
              />
            ) : null}

            {!operationalPagePending && tab === "payments" ? (
              <TransactionsView
                businessId={businessId}
                cacheScope={cacheScope}
                dateLabel={transactionDateRangeLabel}
                dateRange={transactionDateRange}
                dateFilterKey={transactionFilters.dateFilterKey}
                transactionLens={transactionFilters.lens}
                transactionFilter={transactionFilters.activity}
                transactionProfileId={transactionUserId}
                recordTypeFilter={transactionFilters.recordType}
                modeFilter={transactionFilters.mode}
                businessTypeFilter={transactionFilters.businessType}
                onSelectLens={(lens) => setTransactionFilters((current) => ({
                  ...current,
                  lens,
                  activity: "all",
                  profileId: lens === "personal" ? appData.profile.id : "all",
                }))}
                onSelectActivity={(activity) => setTransactionFilters((current) => ({ ...current, activity }))}
                payments={appData.payments}
                expenses={appData.expenses}
                movements={appData.movements}
                ledger={appData.ledger}
                agentSettlements={appData.agentSettlements}
                financialActivity={appData.financialActivity}
                postingEvents={transactionPostingEvents}
                profiles={appData.profiles}
                profile={appData.profile}
                owner={owner}
                canVerifyOnlineCollections={primaryOwner || supportMode}
                sharedBusinessHistory={canViewSharedBusinessHistory}
                agentIncentiveSummary={agentIncentiveSummary}
                agentReferralCodes={agentReferralCodes}
                permissionsByProfile={permissionsByProfile}
                staffUnitAssignments={appData.staffUnitAssignments}
                setNotice={pushNotice}
                startTransition={startTransition}
              />
            ) : null}

            {!operationalPagePending && tab === "library_students" && canViewStudentRecords ? (
              <LibraryStudentsView
                businessId={businessId}
                cacheScope={cacheScope}
                students={appData.libraryStudents}
                courseStudentRows={appData.courseStudents}
                courses={appData.courses}
                studentSources={studentFilterSources}
                selectedSourceId={effectiveStudentFilters.sourceId}
                setSelectedSourceId={(sourceId) => setStudentFilters((current) => ({ ...current, sourceId }))}
                listMode={effectiveStudentFilters.status}
                setListMode={(status) => setStudentFilters((current) => ({ ...current, status }))}
                setNotice={pushNotice}
                startTransition={startTransition}
              />
            ) : null}

            {tab === "work" ? (
              <WorkView
                businessId={businessId}
                cacheScope={cacheScope}
                profileId={appData.profile.id}
                setNotice={pushNotice}
                startTransition={startTransition}
              />
            ) : null}

            {tab === "notifications" ? (
              <NotificationsView
                notifications={notifications}
                profiles={appData.profiles}
              />
            ) : null}

            {!operationalPagePending && tab === "closing" ? (
              <ClosingView
                key={`${closingDate}-${closingFilters.dateFilterKey}`}
                date={closingDate}
                dateFilterKey={closingFilters.dateFilterKey}
                owner={owner}
                canVerifyOnlineCollections={primaryOwner || supportMode}
                profile={appData.profile}
                summaries={closingSummaries}
                payments={appData.payments}
                expenses={appData.expenses}
                movements={appData.movements}
                agentSettlements={appData.agentSettlements}
                postingEvents={postingEvents}
                profiles={appData.profiles}
                managerUnitScopes={appData.managerUnitScopes}
                staffUnitAssignments={appData.staffUnitAssignments}
                setNotice={pushNotice}
                startTransition={startTransition}
              />
            ) : null}

          </div>
        </main>
      </div>

      {!focusedPage ? <nav
        className="mobile-bottom-nav md:hidden fixed bottom-0 left-0 w-full flex justify-around items-center pt-2 pb-safe-bottom bg-surface-container dark:bg-surface-container-highest z-45 border-t border-outline-variant/10 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]"
        style={{ gridTemplateColumns: `repeat(${bottomTabItems.length}, minmax(0, 1fr))` }}
        aria-label={t("main")}
      >
        {bottomTabItems.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-label={t(item.labelKey)}
            onClick={() => changeTab(item.id)}
            className={`mobile-bottom-button flex flex-col items-center justify-center px-3 py-1.5 active:scale-90 transition-all w-16 cursor-pointer border-0 ${tab === item.id ? 'active bg-primary-fixed text-on-primary-fixed rounded-xl mb-1' : 'text-on-surface-variant dark:text-on-surface-variant hover:text-primary dark:hover:text-inverse-primary'}`}
          >
            {getTabIcon(item.id)}
            <span className="font-label text-[10px] font-medium truncate w-full text-center mt-1">{item.id === "payments" ? t("transaction") : t(item.labelKey)}</span>
          </button>
        ))}
      </nav> : null}

      {actionModal && !currentUserIsSalesAgent ? (
        <ActionSheet
          businessId={businessId}
          cacheScope={cacheScope}
          actionModal={actionModal}
          selectedPositive={selectedPositive}
          selectedNegative={selectedNegative}
          setSelectedPositive={setSelectedPositive}
          setSelectedNegative={setSelectedNegative}
          canUsePayment={canUsePayment}
          businessTypes={availableBusinessTypes}
          rooms={activeRooms}
          courses={activeCourses}
          referrals={appData.referrals}
          courseStudents={appData.courseStudents}
          libraryStudents={appData.libraryStudents}
          receiveMoneyProfiles={receiveMoneyProfiles}
          sendMoneyProfiles={sendMoneyProfiles}
          settlementDate={dashboardFilters.dateRange.to}
          agentIncentiveBalances={agentIncentiveBalances}
          canPayAgentIncentive={primaryOwner}
          closeAction={closeAction}
          setNotice={pushNotice}
          startTransition={startTransition}
        />
      ) : null}

    </div>
    </LanguageContext.Provider>
  );
}

function OperationalPageSkeleton({ page }: { page: ReturnType<typeof operationalPageName> }) {
  const cards = page === "dashboard" ? 4 : page === "students" ? 6 : 5;
  return (
    <section className={`operational-page-skeleton operational-page-skeleton-${page}`} aria-label={`Loading ${page}`}>
      <div className="operational-skeleton-heading" />
      <div className="operational-skeleton-grid">
        {Array.from({ length: cards }, (_, index) => (
          <div className="operational-skeleton-card" key={index}>
            <span />
            <strong />
            <small />
          </div>
        ))}
      </div>
    </section>
  );
}

function ToastStack({
  toasts,
  pending,
  savingLabel,
  dismiss,
}: {
  toasts: ToastNotice[];
  pending: boolean;
  savingLabel: string;
  dismiss: (id: string) => void;
}) {
  if (!pending && toasts.length === 0) return null;

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {pending ? (
        <div className="toast toast-info">
          <span className="toast-icon saving-dot" />
          <strong>{savingLabel}</strong>
        </div>
      ) : null}
      {toasts.map((toast) => (
        <div className={toast.ok ? toast.warning ? "toast toast-warning" : "toast toast-success" : "toast toast-error"} key={toast.id}>
          <span className="toast-icon">
            {toast.ok && !toast.warning ? <Check size={18} /> : <AlertCircle size={18} />}
          </span>
          <strong>
            {toast.message}
            {toast.warning ? ` ${toast.warning}` : ""}
            {toast.errorId ? ` Error ID: ${toast.errorId}.` : ""}
          </strong>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(toast.id)}>
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: INDIA_TIME_ZONE,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function NotificationsView({
  notifications,
  profiles,
}: {
  notifications: AppNotification[];
  profiles: Profile[];
}) {
  const { t } = useLanguage();

  return (
    <section className="notifications-page" aria-label={t("notifications")}>
      <header className="notifications-page-heading">
        <div>
          <p className="eyebrow">{t("unreadNotifications")}</p>
          <h2>{t("notifications")}</h2>
        </div>
        <span>{notifications.length}</span>
      </header>
      <div className="notification-list">
        {notifications.length > 0 ? (
          notifications.map((notification) => (
            <article
              className={`notification-item tone-${notification.tone} ${notification.read_at ? "read" : "unread"}`}
              key={notification.id}
            >
              <span className="notification-dot" />
              <div>
                <strong>{notification.title}</strong>
                <p>{notification.body}</p>
                <small>
                  {profileName(profiles, notification.actor_id, t)} · {formatNotificationTime(notification.created_at)}
                </small>
              </div>
            </article>
          ))
        ) : (
          <div className="operational-filter-empty">
            <Bell size={26} />
            <p className="muted">{t("noNotifications")}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone?: "total" | "cash" | "online" | "expense" | "guest" | "library" | "course" | "general" | "neutral";
}) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <span>{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function PendingReviewSheet({
  records,
  contextRecords,
  canVerifyOnlineCollections,
  close,
  setNotice,
  startTransition,
}: {
  records: PendingReviewRecord[];
  contextRecords: PendingContextRecord[];
  canVerifyOnlineCollections: boolean;
  close: () => void;
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const { t } = useLanguage();
  const sortedRecords = [...records].sort((a, b) => `${b.date}-${b.id}`.localeCompare(`${a.date}-${a.id}`));
  const sortedContextRecords = [...contextRecords].sort((a, b) => `${b.date}-${b.id}`.localeCompare(`${a.date}-${a.id}`));
  const totalAmount =
    records.reduce((sum, record) => sum + Math.abs(record.amount), 0) +
    contextRecords.reduce((sum, record) => sum + Math.abs(record.amount), 0);

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label={t("pendingReview")}>
      <button className="modal-backdrop" aria-label={t("closeModal")} type="button" onClick={close} />
      <section className="action-sheet pending-review-sheet">
        <header className="sheet-header">
          <div>
            <p className="eyebrow">{t("tillDate")}</p>
            <h2>{t("pendingReview")}</h2>
            <span className="pending-review-total">{records.length + contextRecords.length} {t("pending")} · {formatMoney(totalAmount)}</span>
          </div>
          <button className="icon-button" type="button" aria-label={t("closeModal")} onClick={close}>
            <X size={18} />
          </button>
        </header>

        <div className="pending-review-list">
          {sortedRecords.length > 0 ? sortedRecords.map((record) => {
            const canReview = canApproveRecordStatus(record.status);
            return (
              <article className={`pending-review-card ${record.tone}`} key={`${record.recordType}-${record.id}`}>
                <div className="pending-review-icon">{record.icon}</div>
                <div className="pending-review-main">
                  <div className="pending-review-title-row">
                    <strong>{record.transactionType}</strong>
                    <span className={`status-chip status-${record.status}`}>{record.statusLabel}</span>
                  </div>
                  <p>{record.staffName} · {record.serviceType} · {record.date}</p>
                  <div className="pending-review-split">
                    <span>{t("cash")} {formatMoney(record.cashAmount)}</span>
                    <span>{t("online")} {formatMoney(record.onlineAmount)}</span>
                  </div>
                  <p>{record.note}</p>
                </div>
                <strong className="pending-review-amount">
                  {record.amount < 0 ? "-" : ""}{formatMoney(Math.abs(record.amount))}
                </strong>
                {canReview ? (
                  <div className="pending-review-actions">
                    {record.recordType === "expense" ? (
                      <>
                        <MiniAction
                          hidden={{ record_type: record.recordType, id: record.id, decision: "rejected" }}
                          label={t("reject")}
                          tone="reject"
                          icon={<X size={18} />}
                          action={approveRecordAction}
                          setNotice={setNotice}
                          startTransition={startTransition}
                        />
                        <MiniAction
                          hidden={{ record_type: record.recordType, id: record.id, decision: "approved" }}
                          label={t("approve")}
                          tone="approve"
                          icon={<Check size={18} />}
                          action={approveRecordAction}
                          setNotice={setNotice}
                          startTransition={startTransition}
                        />
                      </>
                    ) : (
                      <>
                        {record.cashStatus !== null && record.cashStatus !== undefined ? (
                          record.cashStatus === "approved" ? (
                            <span className="component-approved"><Check size={15} /> {t("cash")} {labelForStatus("approved", t)}</span>
                          ) : record.hasPendingTransfer ? (
                            <button className="mini-action icon-mini-action tone-approve" type="button" disabled title={t("resolveTransferFirst")} aria-label={t("resolveTransferFirst")}>
                              <Check size={18} />
                            </button>
                          ) : (
                            <MiniAction
                              hidden={{ record_type: record.recordType, id: record.id, decision: "approved", payment_component: "cash" }}
                              label={`${t("approve")} ${t("cash")}`}
                              tone="approve"
                              icon={<Banknote size={17} />}
                              action={approveRecordAction}
                              setNotice={setNotice}
                              startTransition={startTransition}
                            />
                          )
                        ) : null}
                        {record.onlineStatus !== null && record.onlineStatus !== undefined ? (
                          record.onlineStatus === "approved" ? (
                            <span className="component-owner-verification verified"><Landmark size={15} /> {t("verifiedByOwner")}</span>
                          ) : canVerifyOnlineCollections && !record.hasPendingTransfer ? (
                            <MiniAction
                              hidden={{ record_type: record.recordType, id: record.id, decision: "approved", payment_component: "online" }}
                              label={t("verifyOnline")}
                              tone="approve"
                              icon={<Landmark size={17} />}
                              action={approveRecordAction}
                              setNotice={setNotice}
                              startTransition={startTransition}
                            />
                          ) : (
                            <span className="component-owner-verification pending"><Landmark size={15} /> {t("awaitingOwnerVerification")}</span>
                          )
                        ) : null}
                      </>
                    )}
                  </div>
                ) : (
                  <span className="pending-review-note">{record.statusLabel}</span>
                )}
              </article>
            );
          }) : null}

          {sortedContextRecords.length > 0 ? (
            <div className="pending-context-group">
              <h3>{t("settlementLikePending")}</h3>
              {sortedContextRecords.map((record) => (
                <article className={`pending-review-card context ${record.tone}`} key={record.id}>
                  <div className="pending-review-icon">{record.icon}</div>
                  <div className="pending-review-main">
                    <div className="pending-review-title-row">
                      <strong>{record.transactionType}</strong>
                      <span className="status-chip status-pending">{record.statusLabel}</span>
                    </div>
                    <p>{record.staffName} · {record.serviceType} · {record.date}</p>
                    <p>{record.note}</p>
                  </div>
                  <strong className="pending-review-amount">
                    {record.amount < 0 ? "-" : ""}{formatMoney(Math.abs(record.amount))}
                  </strong>
                </article>
              ))}
            </div>
          ) : null}

          {sortedRecords.length === 0 && sortedContextRecords.length === 0 ? (
            <p className="muted">{t("noRecords")}</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function FilterDateRangeFields({
  value,
  onChange,
}: {
  value: DateRangeState;
  onChange: (value: DateRangeState) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="operational-filter-section">
      <div className="operational-filter-section-heading">
        <CalendarDays size={18} />
        <strong>{t("dateRange")}</strong>
      </div>
      <label className="operational-filter-field">
        <span>{t("dateRange")}</span>
        <select
          value={value.preset}
          onChange={(event) => onChange(rangeForPreset(event.target.value as DateRangePreset, value))}
        >
          {dateRangeOptions.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
        </select>
      </label>
      {value.preset === "custom" ? (
        <div className="operational-filter-date-grid">
          <label className="operational-filter-field">
            <span>{t("startDate")}</span>
            <input type="date" value={value.from} onChange={(event) => onChange({ ...value, from: event.target.value })} />
          </label>
          <label className="operational-filter-field">
            <span>{t("endDate")}</span>
            <input type="date" value={value.to} onChange={(event) => onChange({ ...value, to: event.target.value })} />
          </label>
        </div>
      ) : null}
    </div>
  );
}

function FilterDateBasisFields({
  value,
  onChange,
}: {
  value: DateFilterKey;
  onChange: (value: DateFilterKey) => void;
}) {
  const { t } = useLanguage();
  return (
    <fieldset className="operational-filter-section">
      <legend>{t("dateKey")}</legend>
      <div className="operational-filter-choice-grid">
        {(["approval", "transaction"] as DateFilterKey[]).map((option) => (
          <label className={value === option ? "selected" : ""} key={option}>
            <input type="radio" name="filter-date-basis" value={option} checked={value === option} onChange={() => onChange(option)} />
            <span>{option === "approval" ? t("approvalDate") : t("transactionDate")}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function OperationalFilterDrawer({
  tab,
  dashboardFilters,
  transactionFilters,
  closingFilters,
  businessTypes,
  transactionProfiles,
  showTransactionProfile,
  salesAgent,
  defaultProfileId,
  onApplyDashboard,
  onApplyTransactions,
  onApplyClosing,
  onPrefetch,
  onClose,
}: {
  tab: AppTab;
  dashboardFilters: DashboardFilterState;
  transactionFilters: TransactionFilterState;
  closingFilters: ClosingFilterState;
  businessTypes: BusinessType[];
  transactionProfiles: Profile[];
  showTransactionProfile: boolean;
  salesAgent: boolean;
  defaultProfileId: string;
  onApplyDashboard: (filters: DashboardFilterState) => void;
  onApplyTransactions: (filters: TransactionFilterState) => void;
  onApplyClosing: (filters: ClosingFilterState) => void;
  onPrefetch: (
    tab: AppTab,
    dashboardFilters: DashboardFilterState,
    transactionFilters: TransactionFilterState,
    closingFilters: ClosingFilterState,
  ) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [dashboardDraft, setDashboardDraft] = useState(dashboardFilters);
  const [transactionDraft, setTransactionDraft] = useState(transactionFilters);
  const [closingDraft, setClosingDraft] = useState(closingFilters);
  const [error, setError] = useState("");
  const mountDialog = useCallback((node: HTMLDialogElement | null) => {
    dialogRef.current = node;
    if (node && !node.open) node.showModal();
  }, []);
  const close = () => dialogRef.current?.close();
  const pageTitle = t(tabItems.find((item) => item.id === tab)?.labelKey ?? "dashboard");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void onPrefetch(tab, dashboardDraft, transactionDraft, closingDraft);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [closingDraft, dashboardDraft, onPrefetch, tab, transactionDraft]);

  function dateRangeIsValid(range: DateRangeState) {
    return range.preset !== "custom" || Boolean(range.from && range.to && range.from <= range.to);
  }

  function resetDraft() {
    setError("");
    if (tab === "home") setDashboardDraft(defaultDashboardFilters());
    if (tab === "payments") setTransactionDraft(defaultTransactionFilters(defaultProfileId));
    if (tab === "closing") setClosingDraft(defaultClosingFilters());
  }

  function applyDraft() {
    const range = tab === "home" ? dashboardDraft.dateRange : tab === "payments" ? transactionDraft.dateRange : null;
    if (range && !dateRangeIsValid(range)) {
      setError(t("filterDateError"));
      return;
    }
    close();
    window.requestAnimationFrame(() => {
      if (tab === "home") onApplyDashboard(dashboardDraft);
      if (tab === "payments") onApplyTransactions({
        ...transactionDraft,
        profileId: transactionDraft.lens === "personal"
          ? defaultProfileId
          : showTransactionProfile
            ? transactionDraft.profileId
            : defaultProfileId,
      });
      if (tab === "closing") onApplyClosing(closingDraft);
    });
  }

  const activityOptions = transactionDraft.lens === "business"
    ? (["all", "collections", "expenses", "pending"] as TransactionFilter[])
    : (["all", "cash_in", "cash_out", "pending"] as TransactionFilter[]);
  const recordTypeOptions = salesAgent
    ? (["all", "agent_payout"] as TransactionRecordType[])
    : (["all", "payment", "expense", "transfer", "agent_payout"] as TransactionRecordType[]);
  const activityLabel = (activity: TransactionFilter) => activity === "collections"
    ? t("collections")
    : activity === "expenses"
      ? t("expenses")
      : activity === "cash_in"
        ? t("cashIn")
        : activity === "cash_out"
          ? t("cashOut")
          : activity === "pending"
            ? t("pending")
            : t("all");
  const recordTypeLabel = (recordType: TransactionRecordType) => recordType === "payment" ? t("payments") : recordType === "expense" ? t("expenses") : recordType === "transfer" ? t("cashTransfers") : recordType === "agent_payout" ? t("agentPayouts") : t("allTypes");

  return (
    <dialog
      aria-labelledby="operational-filter-title"
      className="operational-filter-dialog"
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
      onClose={onClose}
      ref={mountDialog}
    >
      <div className="operational-filter-drawer">
        <header>
          <div>
            <p className="eyebrow">{pageTitle}</p>
            <h2 id="operational-filter-title">{t("filterResults")}</h2>
          </div>
          <button type="button" onClick={close} aria-label={t("closeModal")}><X size={20} /></button>
        </header>
        <div className="operational-filter-body">
          {tab === "home" ? (
            <>
              <FilterDateRangeFields value={dashboardDraft.dateRange} onChange={(dateRange) => setDashboardDraft((current) => ({ ...current, dateRange }))} />
              <FilterDateBasisFields value={dashboardDraft.dateFilterKey} onChange={(dateFilterKey) => setDashboardDraft((current) => ({ ...current, dateFilterKey }))} />
              <label className="operational-filter-field operational-filter-section">
                <span>{t("businessModule")}</span>
                <select value={dashboardDraft.businessType} onChange={(event) => setDashboardDraft((current) => ({ ...current, businessType: event.target.value as BusinessTypeFilter }))}>
                  <option value="all">{t("allBusinesses")}</option>
                  {businessTypes.map((businessType) => <option key={businessType} value={businessType}>{labelForBusiness(businessType, t)}</option>)}
                </select>
              </label>
            </>
          ) : null}
          {tab === "payments" ? (
            <>
              <FilterDateRangeFields value={transactionDraft.dateRange} onChange={(dateRange) => setTransactionDraft((current) => ({ ...current, dateRange }))} />
              <FilterDateBasisFields value={transactionDraft.dateFilterKey} onChange={(dateFilterKey) => setTransactionDraft((current) => ({ ...current, dateFilterKey }))} />
              <label className="operational-filter-field operational-filter-section">
                <span>View</span>
                <select
                  value={transactionDraft.lens}
                  onChange={(event) => {
                    const lens = event.target.value as TransactionLens;
                    setTransactionDraft((current) => ({
                      ...current,
                      lens,
                      activity: "all",
                      profileId: lens === "personal" ? defaultProfileId : "all",
                    }));
                  }}
                >
                  <option value="personal">My activity</option>
                  <option value="business">Business activity</option>
                </select>
              </label>
              {showTransactionProfile && transactionDraft.lens === "business" ? (
                <label className="operational-filter-field operational-filter-section">
                  <span>Person or team</span>
                  <select value={transactionDraft.profileId} onChange={(event) => setTransactionDraft((current) => ({ ...current, profileId: event.target.value }))}>
                    <option value="all">All accessible people</option>
                    {transactionProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.id === defaultProfileId ? `${profile.full_name} (${t("self")})` : profile.full_name}</option>)}
                  </select>
                </label>
              ) : null}
              <label className="operational-filter-field operational-filter-section">
                <span>{t("direction")}</span>
                <select value={transactionDraft.activity} onChange={(event) => setTransactionDraft((current) => ({ ...current, activity: event.target.value as TransactionFilter }))}>
                  {activityOptions.map((activity) => <option key={activity} value={activity}>{activityLabel(activity)}</option>)}
                </select>
              </label>
              <label className="operational-filter-field operational-filter-section">
                <span>{t("transactionType")}</span>
                <select value={transactionDraft.recordType} onChange={(event) => setTransactionDraft((current) => ({ ...current, recordType: event.target.value as TransactionRecordType }))}>
                  {recordTypeOptions.map((recordType) => <option key={recordType} value={recordType}>{recordTypeLabel(recordType)}</option>)}
                </select>
              </label>
              <label className="operational-filter-field operational-filter-section">
                <span>{t("paymentMode")}</span>
                <select value={transactionDraft.mode} onChange={(event) => setTransactionDraft((current) => ({ ...current, mode: event.target.value as TransactionModeFilter }))}>
                  <option value="all">{t("all")}</option><option value="cash">{t("cash")}</option><option value="online">{t("online")}</option><option value="mixed">{t("mixed")}</option>
                </select>
              </label>
              {businessTypes.length > 0 && !salesAgent ? (
                <label className="operational-filter-field operational-filter-section">
                  <span>{t("businessModule")}</span>
                  <select value={transactionDraft.businessType} onChange={(event) => setTransactionDraft((current) => ({ ...current, businessType: event.target.value as BusinessTypeFilter }))}>
                    <option value="all">{t("allBusinesses")}</option>
                    {businessTypes.map((businessType) => <option key={businessType} value={businessType}>{labelForBusiness(businessType, t)}</option>)}
                  </select>
                </label>
              ) : null}
            </>
          ) : null}
          {tab === "closing" ? (
            <>
              <label className="operational-filter-field operational-filter-section">
                <span>{t("settlementDate")}</span>
                <input type="date" value={closingDraft.date} onChange={(event) => setClosingDraft((current) => ({ ...current, date: event.target.value || todayIso() }))} />
              </label>
              <FilterDateBasisFields value={closingDraft.dateFilterKey} onChange={(dateFilterKey) => setClosingDraft((current) => ({ ...current, dateFilterKey }))} />
            </>
          ) : null}
          {error ? <p className="operational-filter-error" role="alert">{error}</p> : null}
        </div>
        <footer>
          <button className="operational-filter-reset" type="button" onClick={resetDraft}>{t("resetFilters")}</button>
          <div>
            <button className="secondary-button" type="button" onClick={close}>{t("cancel")}</button>
            <button className="primary-button" type="button" onClick={applyDraft}>{t("applyFilters")}</button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}

function RoleDashboardView({
  summary,
  dateLabel,
  dateFilterKey,
  asOfDate,
  openTransactions,
  openClosing,
}: {
  openClosing: () => void;
  summary: DashboardSummary;
  dateLabel: string;
  dateFilterKey: DateFilterKey;
  asOfDate: string;
  openTransactions: (
    lens: TransactionLens,
    activity: TransactionFilter,
    target?: {
      businessType?: BusinessTypeFilter;
      mode?: TransactionModeFilter;
      dateRange?: DateRangeState;
      dateFilterKey?: DateFilterKey;
    },
  ) => void;
}) {
  const { t } = useLanguage();
  const [lens, setLens] = useState<TransactionLens>("personal");
  const primaryOwner = summary.role === "primary_owner";
  const staff = summary.role === "staff";
  const dateBasisLabel = dateFilterKey === "transaction" ? t("transactionDate") : t("approvalDate");

  // Cash in hand: staff see their own cash (pending collections included); managers also see their
  // Staff's cash; the Owner sees cash still with Managers + Staff.
  const cashSelfPending = summary.cashSelfPending ?? 0;
  const cashSelfTotal = summary.cashSelf + cashSelfPending;
  const cashInHandRow = (
    <div className={`flow-row tone-custody${primaryOwner || staff ? " single" : ""}`}>
      <span className="flow-row-label"><WalletCards size={16} />{t("cashInHand")}</span>
      {!primaryOwner ? (
        <FlowCell
          className="custody"
          label={staff ? `${t("cashInHand")} · ${t("self")}` : t("self")}
          value={formatMoney(cashSelfTotal)}
          note={[
            cashSelfPending !== 0 ? `${t("awaitingVerification")} ${formatMoney(cashSelfPending)}` : null,
            summary.cashSelfSince && cashSelfTotal !== 0 ? `${t("since")} ${summary.cashSelfSince}` : null,
          ].filter(Boolean).join(" · ") || null}
          // Every cash IN / OUT since the balance last stood at zero adds up to this figure.
          onClick={() => openTransactions("personal", "all", {
            mode: "cash",
            dateFilterKey: "approval",
            dateRange: { preset: "custom", from: summary.cashSelfSince ?? asOfDate, to: asOfDate },
          })}
        />
      ) : null}
      {!staff ? (
        <FlowCell
          className="custody"
          label={t("cashWithStaff")}
          value={formatMoney(summary.cashWithStaff)}
          note={`${t("asOf")} ${asOfDate}`}
          // Closing lists each person's cash in hand.
          onClick={openClosing}
        />
      ) : null}
    </div>
  );

  const personalPending = summary.personalPending ?? (staff ? summary.pending : { amount: 0, count: 0 });

  type BusinessCard = {
    key: string;
    title: string;
    icon: ReactNode;
    businessType?: BusinessType;
    cash: number;
    online: number;
    cashExpenses: number;
    onlineExpenses: number;
    pendingCashIn: number;
    pendingOnlineIn: number;
    pendingCashOut: number;
    pendingAmount: number;
    pendingCount: number;
  };
  const businessPending = summary.businessPending ?? { cashIn: 0, onlineIn: 0, cashOut: 0, onlineOut: 0 };
  const overallCard: BusinessCard = {
    key: "all",
    title: primaryOwner ? t("allUnits") : summary.role === "co_owner" ? t("assignedUnits") : t("assignedUnit"),
    icon: <Building2 size={16} />,
    cash: summary.collections.cash,
    online: summary.collections.online,
    cashExpenses: summary.expenses.cash,
    onlineExpenses: summary.expenses.online,
    pendingCashIn: businessPending.cashIn,
    pendingOnlineIn: businessPending.onlineIn,
    pendingCashOut: businessPending.cashOut,
    pendingAmount: summary.pending.amount,
    pendingCount: summary.pending.count,
  };
  const unitCards: BusinessCard[] = summary.businessUnits
    .filter((unit) => unit.businessType !== "general"
      || unit.collections + unit.expenses + unit.pendingAmount > 0)
    .map((unit) => ({
      key: unit.businessType,
      title: labelForBusiness(unit.businessType, t),
      icon: unit.businessType === "guest_house" ? <Hotel size={16} /> : unit.businessType === "library" ? <BookOpen size={16} /> : unit.businessType === "course" ? <GraduationCap size={16} /> : <WalletCards size={16} />,
      businessType: unit.businessType,
      cash: unit.cashCollections,
      online: unit.onlineCollections,
      cashExpenses: unit.cashExpenses,
      onlineExpenses: unit.onlineExpenses,
      pendingCashIn: unit.pendingCashCollections ?? 0,
      pendingOnlineIn: unit.pendingOnlineCollections ?? 0,
      pendingCashOut: unit.pendingCashExpenses ?? 0,
      pendingAmount: unit.pendingAmount,
      pendingCount: unit.pendingCount,
    }));
  // One unit only: the overall card already says everything.
  const businessCards = unitCards.length > 1 ? [overallCard, ...unitCards] : [overallCard];

  const businessCard = (card: BusinessCard, index: number) => {
    const target = card.businessType ? { businessType: card.businessType } : undefined;
    // Totals are approved figures; pending stays in its own row.
    const total = card.cash + card.online - card.cashExpenses - card.onlineExpenses;
    const totalCash = card.cash - card.cashExpenses;
    const signedMoney = (value: number) => `${value < 0 ? "-" : ""}${formatMoney(Math.abs(value))}`;
    return (
      <section className="history-summary-panel dashboard-flow-card" key={card.key}>
        <div className="history-summary-context">
          <span className="dashboard-flow-card-title">{card.icon}{card.title}</span>
          {businessCards.length > 1 ? <strong>{index + 1}/{businessCards.length}</strong> : null}
        </div>
        <FlowBreakdown
          leadingRows={(
            <>
              <div className={`flow-row tone-total single${total < 0 ? " negative" : ""}`}>
                <span className="flow-row-label"><Scale size={16} />{t("total")}</span>
                <FlowCell className="total" label={`${t("collections")} − ${t("expenses")}`} value={signedMoney(total)} />
              </div>
              <div className={`flow-row tone-total single${totalCash < 0 ? " negative" : ""}`}>
                <span className="flow-row-label"><Banknote size={16} />{t("totalCash")}</span>
                <FlowCell className="total" label={`${t("cash")} ${t("collections")} − ${t("expenses")}`} value={signedMoney(totalCash)} />
              </div>
            </>
          )}
          inLabel={t("collections")}
          outLabel={t("expenses")}
          cashIn={card.cash + card.pendingCashIn}
          cashInApproved={card.cash}
          cashOut={card.cashExpenses + card.pendingCashOut}
          cashOutApproved={card.cashExpenses}
          onlineIn={card.online + card.pendingOnlineIn}
          onlineVerified={card.online}
          onlineOut={card.onlineExpenses}
          onCashIn={() => openTransactions("business", "collections", { ...target, mode: "cash" })}
          onCashOut={() => openTransactions("business", "expenses", target)}
          onOnline={() => openTransactions("business", "collections", { ...target, mode: "online" })}
          trailingRows={(
            <FlowPendingRow
              amount={card.pendingAmount}
              count={card.pendingCount}
              onClick={() => openTransactions(staff ? "personal" : "business", "pending", target)}
            />
          )}
        />
      </section>
    );
  };

  return (
    <div className={`view-stack mobile-clean transaction-history-view dashboard-flow-view lens-${lens}`}>
      <nav className="transaction-primary-filters">
        <div className="transaction-lens-tabs" role="tablist" aria-label="Dashboard view">
          <button aria-selected={lens === "personal"} className={lens === "personal" ? "active" : ""} onClick={() => setLens("personal")} role="tab" type="button">
            My activity
          </button>
          <button aria-selected={lens === "business"} className={lens === "business" ? "active" : ""} onClick={() => setLens("business")} role="tab" type="button">
            Business
          </button>
        </div>
      </nav>

      {lens === "personal" ? (
        <section className="history-summary-panel dashboard-flow-card">
          <div className="history-summary-context">
            <span>{dateLabel}</span>
            <strong>{dateBasisLabel}</strong>
          </div>
          <FlowBreakdown
            leadingRows={cashInHandRow}
            inLabel={t("cashIn")}
            outLabel={t("cashOut")}
            cashIn={summary.personalIn.cash + (summary.personalCashPending ?? 0)}
            cashInApproved={summary.personalIn.cash}
            cashOut={summary.personalOut.cash + (summary.personalCashOutPending ?? 0)}
            cashOutApproved={summary.personalOut.cash}
            onlineIn={summary.personalIn.online + (summary.personalOnlinePending ?? 0)}
            onlineVerified={summary.personalIn.online}
            onlineOut={summary.personalOut.online}
            onCashIn={() => openTransactions("personal", "cash_in", { mode: "cash" })}
            onCashOut={() => openTransactions("personal", "cash_out", { mode: "cash" })}
            onOnline={() => openTransactions("personal", "cash_in", { mode: "online" })}
            trailingRows={(
              <FlowPendingRow
                amount={personalPending.amount}
                count={personalPending.count}
                onClick={() => openTransactions("personal", "pending")}
              />
            )}
          />
        </section>
      ) : (
        <>
          <p className="dashboard-flow-range">{dateLabel} · {dateBasisLabel}</p>
          <div className="dashboard-business-cards">
            {businessCards.map(businessCard)}
          </div>
        </>
      )}
    </div>
  );
}

function HomeView({
  totals,
  cashBalances,
  owner,
  data,
  postingEvents,
  dateFilterKey,
  dateRange,
  dateRangePreset,
  dateLabel,
  businessTypeFilter,
  agentIncentiveSummary,
  agentReferralCodes,
  changeTab,
  openTransactions,
  setNotice,
  startTransition,
}: {
  totals: {
    total: number;
    cash: number;
    online: number;
    expense: number;
    byBusiness: Record<BusinessType, number>;
    expenseByBusiness: Record<BusinessType, number>;
  };
  cashBalances: { profile: Profile; balance: number }[];
  owner: boolean;
  data: AppData;
  postingEvents: DailyPostingEvent[];
  dateFilterKey: DateFilterKey;
  dateRange: NormalizedDateRange;
  dateRangePreset: DateRangePreset;
  dateLabel: string;
  businessTypeFilter: BusinessTypeFilter;
  agentIncentiveSummary: AgentIncentiveSummary;
  agentReferralCodes: ReferralCode[];
  changeTab: (tab: AppTab) => void;
  openTransactions: (
    lens: TransactionLens,
    activity: TransactionFilter,
    target?: {
      businessType?: BusinessTypeFilter;
      mode?: TransactionModeFilter;
      dateRange?: DateRangeState;
      dateFilterKey?: DateFilterKey;
    },
  ) => void;
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const { t } = useLanguage();
  const [pendingReviewOpen, setPendingReviewOpen] = useState(false);
  const rangedPostingEvents = postingEvents.filter((event) => dateInRange(postingEventDate(event, dateFilterKey), dateRange));
  const dashboardBusinessTypes = (Object.keys(businessLabels) as BusinessType[]).filter((business) => businessTypeFilter === "all" || business === businessTypeFilter);
  const paymentMatchesBusiness = (payment: Payment) => businessTypeFilter === "all" || payment.business_type === businessTypeFilter;
  const expenseMatchesBusiness = (expense: Expense) => businessTypeFilter === "all" || (expense.business_type ?? "general") === businessTypeFilter;

  // Outline: Calculate pending amounts and render either a personalized staff dashboard or owner business status.
  if (isSalesAgent(data.profile.role)) {
    const referralPayments = data.payments
      .filter((payment) => payment.record_status === "active")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 5);

    return (
      <div className="view-stack agent-home-view">
        <AgentCodePanel profile={data.profile} referrals={agentReferralCodes} setNotice={setNotice} />
        <AgentIncentivePanel summary={agentIncentiveSummary} />
        <section className="agent-activity-panel">
          <div className="agent-activity-heading">
            <div>
              <p className="eyebrow">{t("referralTransactions")}</p>
              <h2>{t("transactions")}</h2>
            </div>
            <button type="button" onClick={() => changeTab("payments")}>
              {t("viewAll")} <ChevronRight size={16} />
            </button>
          </div>
          <div className="agent-activity-list">
            {referralPayments.length > 0 ? referralPayments.map((payment) => (
              <article className="agent-activity-row" key={payment.id}>
                <div>
                  <strong>{payment.referral_code_snapshot || t("referralCode")}</strong>
                  <p>{paymentDisplayTitle(payment, t)} · {labelForBusiness(payment.business_type, t)}</p>
                </div>
                <span>{formatMoney(payment.incentive_amount)}</span>
              </article>
            )) : (
              <p className="muted">{t("noRecordsForFilter")}</p>
            )}
          </div>
        </section>
      </div>
    );
  }

  if (data.dashboardSummary) {
    return (
      <RoleDashboardView
        summary={data.dashboardSummary}
        dateLabel={dateLabel}
        dateFilterKey={dateFilterKey}
        asOfDate={dateRange.to}
        openTransactions={openTransactions}
        openClosing={() => changeTab("closing")}
      />
    );
  }

  if (!owner) {
    const profileId = data.profile.id;
    const pendingInScope = (isoDate: string) => pendingRecordInScope(isoDate, dateRange, dateRangePreset);
    const myLedgerBalance = cashBalances.find((cb) => cb.profile.id === data.profile.id)?.balance ?? 0;
    const myPendingPayments = data.payments.filter(
      (payment) =>
        payment.record_status === "active" &&
        paymentMatchesBusiness(payment) &&
        isPendingReviewStatus(payment.approval_status) &&
        pendingInScope(payment.payment_date) &&
        paymentReviewProfileId(payment) === profileId,
    );
    const myPendingExpenses = data.expenses.filter(
      (expense) =>
        expense.record_status === "active" &&
        expenseMatchesBusiness(expense) &&
        isPendingReviewStatus(expense.approval_status) &&
        pendingInScope(expense.expense_date) &&
        expense.spent_by === profileId,
    );
    const myPendingCash = myPendingPayments.reduce((sum, payment) => sum + paymentPendingCashAmount(payment), 0);
    const myBalance = myLedgerBalance + myPendingCash;
    const myPostingEvents = rangedPostingEvents.filter((event) => event.profile_id === profileId);
    const myFlow = postingFlowTotals(myPostingEvents);
    const rangedPaymentSourceIds = new Set(rangedPostingEvents.filter((event) => event.source_type === "payment").map((event) => event.source_id));
    const rangedExpenseSourceIds = new Set(myPostingEvents.filter((event) => event.source_type === "expense").map((event) => event.source_id));
    const myPayments = data.payments.filter((payment) =>
      payment.record_status === "active" &&
      (rangedPaymentSourceIds.has(payment.id) || myPendingPayments.some((pendingPayment) => pendingPayment.id === payment.id)) &&
      paymentReviewProfileId(payment) === profileId,
    );
    const myExpenses = data.expenses.filter((expense) =>
      expense.record_status === "active" &&
      (rangedExpenseSourceIds.has(expense.id) || myPendingExpenses.some((pendingExpense) => pendingExpense.id === expense.id)) &&
      expense.spent_by === profileId,
    );
    const myInCash = myFlow.inCash;
    const myInOnline = myFlow.inOnline;
    const myInAmount = myInCash + myInOnline;
    const myOutCash = myFlow.outCash;
    const myOutOnline = myFlow.outOnline;
    const myPendingAmount =
      myPendingPayments.reduce((sum, payment) => sum + paymentPendingApprovalAmount(payment), 0) +
      myPendingExpenses.reduce((sum, expense) => sum + numberValue(expense.amount), 0);
    const myPendingCount = myPendingPayments.length + myPendingExpenses.length;
    const myBusinessStatus = dashboardBusinessTypes.map((business): BusinessDashboardStatus => {
      const businessPaymentEvents = myPostingEvents.filter(
        (event) => event.source_type === "payment" && data.payments.find((payment) => payment.id === event.source_id)?.business_type === business,
      );
      const businessExpenseEvents = myPostingEvents.filter(
        (event) => event.source_type === "expense" && (data.expenses.find((expense) => expense.id === event.source_id)?.business_type ?? "general") === business,
      );
      const pendingBusinessPayments = myPendingPayments.filter((payment) => payment.business_type === business);
      const pendingBusinessExpenses = myPendingExpenses.filter((expense) => (expense.business_type ?? "general") === business);
      const cashCollection = businessPaymentEvents.reduce((sum, event) => sum + event.cash_amount, 0);
      const onlineCollection = businessPaymentEvents.reduce((sum, event) => sum + event.online_amount, 0);
      const expenses = businessExpenseEvents.reduce((sum, event) => sum + event.amount, 0);
      const pendingAmount =
        pendingBusinessPayments.reduce((sum, payment) => sum + numberValue(payment.amount), 0) +
        pendingBusinessExpenses.reduce((sum, expense) => sum + numberValue(expense.amount), 0);

      return {
        business,
        collection: cashCollection + onlineCollection,
        cashCollection,
        onlineCollection,
        expenses,
        settlement: cashCollection - expenses,
        pendingAmount,
        pendingCount: pendingBusinessPayments.length + pendingBusinessExpenses.length,
      };
    });

    return (
      <div className="space-y-8">
        <div>
          <h2 className="font-headline text-2xl font-bold text-on-surface mb-2">
            {data.profile.full_name}
          </h2>
          <p className="text-on-surface-variant text-body-md">
            {t("personalSummary")} · {dateLabel}
          </p>
        </div>

        <section className="dashboard-stat-grid dashboard-five-card-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="dashboard-top-card dashboard-compact-card bg-primary-container/20 rounded-xl p-6 shadow-soft flex flex-col justify-between relative overflow-hidden group">
            <div className="dashboard-card-main">
              <div className="dashboard-card-title-row">
                <WalletCards size={20} className="text-primary" />
                <h3 className="font-label text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t("cashInHand")}</h3>
              </div>
            </div>
            <div>
              <p className="dashboard-card-value font-headline text-3xl font-bold text-primary">{formatMoney(myBalance)}</p>
              <p className="dashboard-card-note text-xs text-on-surface-variant font-medium mt-1">
                {t("confirmed")}: {formatMoney(myLedgerBalance)} · {t("pendingCashInHand")}: {formatMoney(myPendingCash)}
              </p>
            </div>
          </div>

          <div className="dashboard-top-card dashboard-compact-card bg-surface-container-low border border-primary/20 rounded-xl p-6 shadow-soft flex flex-col justify-between relative overflow-hidden group">
            <div className="dashboard-card-main">
              <div className="dashboard-card-title-row">
                <ReceiptText size={20} className="text-primary" />
                <h3 className="font-label text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t("cashIn")}</h3>
              </div>
            </div>
            <div>
              <p className="dashboard-card-value font-headline text-3xl font-bold text-primary">{formatMoney(myInAmount)}</p>
              <p className="dashboard-card-note text-xs text-on-surface-variant font-medium mt-1">
                {t("cash")} {formatMoney(myInCash)} · {t("online")} {formatMoney(myInOnline)}
              </p>
            </div>
          </div>

          <div className="dashboard-top-card dashboard-compact-card bg-error-container/40 rounded-xl p-6 shadow-soft flex flex-col justify-between relative overflow-hidden group">
            <div className="dashboard-card-main">
              <div className="dashboard-card-title-row">
                <Banknote size={20} className="text-error" />
                <h3 className="font-label text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t("cashOut")}</h3>
              </div>
            </div>
            <div>
              <p className="dashboard-card-value font-headline text-3xl font-bold text-on-error-container">{formatMoney(myOutCash + myOutOnline)}</p>
              <p className="dashboard-card-note text-xs text-error font-medium mt-1">{t("cash")} {formatMoney(myOutCash)} · {t("online")} {formatMoney(myOutOnline)}</p>
            </div>
          </div>

          <div className="dashboard-top-card dashboard-compact-card bg-tertiary-container/20 rounded-xl p-6 shadow-soft flex flex-col justify-between relative overflow-hidden group">
            <div className="dashboard-card-main">
              <div className="dashboard-card-title-row">
                <ClipboardList size={20} className="text-tertiary" />
                <h3 className="font-label text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t("pendingReview")}</h3>
              </div>
            </div>
            <div>
              <p className="dashboard-card-value font-headline text-3xl font-bold text-on-tertiary-container">{formatMoney(myPendingAmount)}</p>
              <p className="dashboard-card-note text-xs text-tertiary font-medium mt-1">
                {myPendingCount} {t("pending")} · {t("awaitingOwnerApproval")}
              </p>
            </div>
          </div>
        </section>

        <section className="business-status-panel">
          <div className="business-status-heading">
            <div>
              <h3>{t("staffBusinessStatus")}</h3>
              <p>{t("staffBusinessStatusHelp")}</p>
            </div>
            <button onClick={() => changeTab("payments")} className="text-primary text-sm font-medium hover:underline flex items-center gap-1 cursor-pointer border-0 bg-transparent">
              {t("viewAll")} <ChevronRight size={16} />
            </button>
          </div>
          <div className="business-status-grid">
            {myBusinessStatus.map((item) => (
              <article className={`business-status-card tone-${item.business}`} key={item.business}>
                <div className="business-status-title">
                  <span>
                    {item.business === "guest_house" ? <Hotel size={20} /> : item.business === "library" ? <BookOpen size={20} /> : item.business === "course" ? <GraduationCap size={20} /> : <WalletCards size={20} />}
                  </span>
                  <strong>{labelForBusiness(item.business, t)}</strong>
                </div>
                <div className="business-status-main">
                  <span>{t("cashIn")}</span>
                  <strong>{formatMoney(item.collection)}</strong>
                </div>
                <div className="business-status-parts">
                  <span>
                    <small>{t("cash")}</small>
                    <strong>{formatMoney(item.cashCollection)}</strong>
                  </span>
                  <span>
                    <small>{t("online")}</small>
                    <strong>{formatMoney(item.onlineCollection)}</strong>
                  </span>
                  <span className="negative">
                    <small>{t("cashOut")}</small>
                    <strong>{formatMoney(item.expenses)}</strong>
                  </span>
                </div>
                <div className={item.pendingCount > 0 ? "business-pending warning" : "business-pending"}>
                  <span>{t("pendingReview")}{item.pendingCount > 0 ? ` · ${item.pendingCount}` : ""}</span>
                  <strong>{formatMoney(item.pendingAmount)}</strong>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="bg-surface-bright rounded-2xl p-6 shadow-soft border border-outline-variant/20">
          <h3 className="font-headline text-xl font-bold text-on-surface mb-4">{t("transactionHistory")}</h3>
          <div className="divide-y divide-outline-variant/10">
            {[...myPayments, ...myExpenses]
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .slice(0, 5)
              .map((item) => {
                const isPayment = 'collected_by' in item;
                return (
                  <div key={item.id} className="flex justify-between items-center py-3">
                    <div>
                      <p className="font-bold text-on-surface text-md">
                        {isPayment ? labelForBusiness((item as Payment).business_type, t) : item.description}
                      </p>
                      <p className="text-xs text-on-surface-variant">
                        {isPayment ? t("collected") : t("spent")} · {indiaDateIso(item.created_at)}
                      </p>
                    </div>
                    <p className={`font-headline font-bold text-lg ${isPayment ? 'text-primary' : 'text-error'}`}>
                      {isPayment ? '+' : '-'}{formatMoney(item.amount)}
                    </p>
                  </div>
                );
              })}
            {myPayments.length === 0 && myExpenses.length === 0 ? (
              <p className="text-on-surface-variant text-sm py-4 text-center">{t("noRecordsForFilter")}</p>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  const pendingInScope = (isoDate: string) => pendingRecordInScope(isoDate, dateRange, dateRangePreset);
  const ownerProfileIds = ownerProfileIdSet(data.profiles);
  const activePayments = data.payments.filter((payment) => payment.record_status === "active" && paymentMatchesBusiness(payment));
  const activeExpenses = data.expenses.filter((expense) => expense.record_status === "active" && expenseMatchesBusiness(expense));
  const pendingPayments = activePayments.filter(
    (payment) => isEffectivelyPendingPayment(payment, ownerProfileIds) && pendingInScope(payment.payment_date),
  );
  const pendingExpenses = activeExpenses.filter(
    (expense) => isEffectivelyPendingExpense(expense, ownerProfileIds) && pendingInScope(expense.expense_date),
  );
  const ownerPostingEvents = rangedPostingEvents.filter((event) => ownerProfileIds.has(event.profile_id));
  const ownerFlow = postingFlowTotals(ownerPostingEvents);
  const ownerInCash = ownerFlow.inCash;
  const ownerInOnline = ownerFlow.inOnline;
  const ownerInAmount = ownerInCash + ownerInOnline;
  const ownerOutCash = ownerFlow.outCash;
  const ownerOutOnline = ownerFlow.outOnline;
  const pendingAgentSettlements = businessTypeFilter === "all" ? data.agentSettlements.filter(
    (settlement) => settlement.status === "pending" && pendingInScope(indiaDateIso(settlement.created_at)),
  ) : [];
  const pendingReviewRecords: PendingReviewRecord[] = [
    ...pendingPayments.map((payment): PendingReviewRecord => ({
      id: payment.id,
      recordType: "payment",
      transactionType: t("payments"),
      staffName: profileName(data.profiles, paymentReviewProfileId(payment), t),
      serviceType: labelForBusiness(payment.business_type, t),
      amount: paymentPendingApprovalAmount(payment),
      cashAmount: paymentPendingCashAmount(payment),
      onlineAmount: paymentComponentStatus(payment, "online") === "approved" ? 0 : paymentOnlineAmount(payment),
      date: payment.payment_date,
      note: paymentReference(payment, t),
      status: payment.approval_status,
      statusLabel: labelForStatus(payment.approval_status, t),
      cashStatus: paymentComponentStatus(payment, "cash"),
      onlineStatus: paymentComponentStatus(payment, "online"),
      hasPendingTransfer: Boolean(pendingPaymentTransfer(data.movements, payment.id)),
      tone: "positive",
      icon: payment.business_type === "guest_house" ? <Hotel size={22} /> : payment.business_type === "library" ? <BookOpen size={22} /> : payment.business_type === "course" ? <GraduationCap size={22} /> : <WalletCards size={22} />,
    })),
    ...pendingExpenses.map((expense): PendingReviewRecord => ({
      id: expense.id,
      recordType: "expense",
      transactionType: t("expenses"),
      staffName: profileName(data.profiles, expense.spent_by, t),
      serviceType: labelForBusiness(expense.business_type ?? "general", t),
      amount: -numberValue(expense.amount),
      cashAmount: numberValue(expense.amount),
      onlineAmount: 0,
      date: expense.expense_date,
      note: expenseReference(expense, t),
      status: expense.approval_status,
      statusLabel: labelForStatus(expense.approval_status, t),
      tone: "negative",
      icon: <ReceiptText size={22} />,
    })),
  ];
  const pendingContextRecords: PendingContextRecord[] = [
    ...pendingAgentSettlements.map((settlement): PendingContextRecord => ({
      id: `agent-${settlement.id}`,
      transactionType: t("pendingIncentive"),
      staffName: profileName(data.profiles, settlement.agent_id, t),
      serviceType: t("agentPayoutLower"),
      amount: -numberValue(settlement.amount),
      date: indiaDateIso(settlement.created_at),
      note: settlement.note ?? t("noReason"),
      statusLabel: labelForStatus(settlement.status, t),
      tone: "negative",
      icon: <WalletCards size={22} />,
    })),
  ];
  const pendingAmount =
    pendingReviewRecords.reduce((sum, record) => sum + Math.abs(record.amount), 0) +
    pendingContextRecords.reduce((sum, record) => sum + Math.abs(record.amount), 0);
  const pendingCount = pendingReviewRecords.length + pendingContextRecords.length;
  const staffProfileIds = new Set(
    data.profiles.filter((item) => item.active && item.role === "staff").map((item) => item.id),
  );
  const confirmedStaffCash = cashBalances
    .filter(({ profile: item }) => staffProfileIds.has(item.id))
    .reduce((sum, item) => sum + Math.max(numberValue(item.balance), 0), 0);
  const pendingStaffCash = pendingPayments
    .filter((payment) => staffProfileIds.has(paymentReviewProfileId(payment)))
    .reduce((sum, payment) => sum + paymentPendingCashAmount(payment), 0);
  const remainingStaffCash = confirmedStaffCash + pendingStaffCash;
  const businessStatus = dashboardBusinessTypes.map((business): BusinessDashboardStatus => {
    const businessPaymentEvents = rangedPostingEvents.filter(
      (event) => event.source_type === "payment" && data.payments.find((payment) => payment.id === event.source_id)?.business_type === business,
    );
    const businessExpenseEvents = rangedPostingEvents.filter(
      (event) => event.source_type === "expense" && (data.expenses.find((expense) => expense.id === event.source_id)?.business_type ?? "general") === business,
    );
    const pendingBusinessPayments = pendingPayments.filter((payment) => payment.business_type === business);
    const pendingBusinessExpenses = pendingExpenses.filter((expense) => (expense.business_type ?? "general") === business);
    const cashCollection = businessPaymentEvents.reduce((sum, event) => sum + event.cash_amount, 0);
    const onlineCollection = businessPaymentEvents.reduce((sum, event) => sum + event.online_amount, 0);
    const expenses = businessExpenseEvents.reduce((sum, event) => sum + event.amount, 0);
    const pendingBusinessAmount =
      pendingBusinessPayments.reduce((sum, payment) => sum + paymentPendingApprovalAmount(payment), 0) +
      pendingBusinessExpenses.reduce((sum, expense) => sum + numberValue(expense.amount), 0);

    return {
      business,
      collection: cashCollection + onlineCollection,
      cashCollection,
      onlineCollection,
      expenses,
      settlement: cashCollection - expenses,
      pendingAmount: pendingBusinessAmount,
      pendingCount: pendingBusinessPayments.length + pendingBusinessExpenses.length,
    };
  });

  return (
    <div className="space-y-8">
      <section className="dashboard-stat-grid dashboard-five-card-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="dashboard-top-card dashboard-compact-card bg-primary-container/20 rounded-xl p-6 shadow-soft flex flex-col justify-between relative overflow-hidden group">
          <div className="dashboard-card-main relative z-10">
            <div className="dashboard-card-title-row">
              <WalletCards size={20} className="text-primary" />
              <h3 className="font-label text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t("totalCollections")}</h3>
            </div>
          </div>
          <div>
            <p className="dashboard-card-value font-headline text-3xl font-bold text-on-primary-container">{formatMoney(totals.total)}</p>
            <p className="dashboard-card-note text-xs text-primary font-medium mt-1">
              {t("cash")} {formatMoney(totals.cash)} · {t("online")} {formatMoney(totals.online)}
            </p>
          </div>
        </div>

        <div className="dashboard-top-card dashboard-compact-card bg-surface-container-low border border-primary/20 rounded-xl p-6 shadow-soft flex flex-col justify-between relative overflow-hidden group">
          <div className="dashboard-card-main relative z-10">
            <div className="dashboard-card-title-row">
              <Landmark size={20} className="text-primary" />
              <h3 className="font-label text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t("remainingCashWithStaff")}</h3>
            </div>
          </div>
          <div>
            <p className="dashboard-card-value font-headline text-3xl font-bold text-primary">{formatMoney(remainingStaffCash)}</p>
            <p className="dashboard-card-note text-xs text-on-surface-variant font-medium mt-1">{businessTypeFilter === "all" ? t("includesPendingStaffCash") : t("businessWideBalance")}</p>
          </div>
        </div>

        <div className="dashboard-top-card dashboard-compact-card bg-primary-container/20 rounded-xl p-6 shadow-soft flex flex-col justify-between relative overflow-hidden group">
          <div className="dashboard-card-main relative z-10">
            <div className="dashboard-card-title-row">
              <ArrowDown size={20} className="text-primary" />
              <h3 className="font-label text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t("cashIn")}</h3>
            </div>
          </div>
          <div>
            <p className="dashboard-card-value font-headline text-3xl font-bold text-on-primary-container">{formatMoney(ownerInAmount)}</p>
            <p className="dashboard-card-note text-xs text-primary font-medium mt-1">
              {t("cash")} {formatMoney(ownerInCash)} · {t("online")} {formatMoney(ownerInOnline)}
            </p>
          </div>
        </div>

        <div className="dashboard-top-card dashboard-compact-card bg-error-container/40 rounded-xl p-6 shadow-soft flex flex-col justify-between relative overflow-hidden group">
          <div className="dashboard-card-main relative z-10">
            <div className="dashboard-card-title-row">
              <ReceiptText size={20} className="text-error" />
              <h3 className="font-label text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t("cashOut")}</h3>
            </div>
          </div>
          <div>
            <p className="dashboard-card-value font-headline text-3xl font-bold text-on-error-container">{formatMoney(ownerOutCash + ownerOutOnline)}</p>
            <p className="dashboard-card-note text-xs text-error font-medium mt-1">{t("cash")} {formatMoney(ownerOutCash)} · {t("online")} {formatMoney(ownerOutOnline)}</p>
          </div>
        </div>

        <div className="dashboard-top-card dashboard-compact-card bg-tertiary-container/20 rounded-xl p-6 shadow-soft flex flex-col justify-between relative overflow-hidden group">
          <div className="dashboard-card-main">
            <div className="dashboard-card-title-row">
              <ClipboardList size={20} className="text-tertiary" />
              <h3 className="font-label text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t("pending")}</h3>
            </div>
          </div>
          <div>
            <p className="dashboard-card-value font-headline text-3xl font-bold text-on-tertiary-container">{formatMoney(pendingAmount)}</p>
            <p className="dashboard-card-note text-xs text-tertiary font-medium mt-1">{pendingCount} {t("pending")} · {dateRangePreset === "today" ? t("tillDate") : dateLabel}</p>
            <button className="dashboard-card-action" type="button" onClick={() => setPendingReviewOpen(true)}>
              {t("reviewPendingButton")}
            </button>
          </div>
        </div>
      </section>

      {pendingReviewOpen ? (
        <PendingReviewSheet
          records={pendingReviewRecords}
          contextRecords={pendingContextRecords}
          canVerifyOnlineCollections={data.profile.membership_role === "primary_owner" || data.businessContext.accessMode === "support"}
          close={() => setPendingReviewOpen(false)}
          setNotice={setNotice}
          startTransition={startTransition}
        />
      ) : null}

      <section className="business-status-panel">
        <div className="business-status-heading">
          <div>
            <h3>{t("businessStatus")}</h3>
            <p>{t("businessStatusHelp")}</p>
          </div>
          <button onClick={() => changeTab("closing")} className="text-primary text-sm font-medium hover:underline flex items-center gap-1 cursor-pointer border-0 bg-transparent">
            {t("viewAll")} <ChevronRight size={16} />
          </button>
        </div>
        <div className="business-status-grid">
          {businessStatus.map((item) => (
            <article className={`business-status-card tone-${item.business}`} key={item.business}>
              <div className="business-status-title">
                <span>
                  {item.business === "guest_house" ? <Hotel size={20} /> : item.business === "library" ? <BookOpen size={20} /> : item.business === "course" ? <GraduationCap size={20} /> : <WalletCards size={20} />}
                </span>
                <strong>{labelForBusiness(item.business, t)}</strong>
              </div>
              <div className="business-status-main">
                <span>{t("totalCollectionForBusiness")}</span>
                <strong>{formatMoney(item.collection)}</strong>
              </div>
              <div className="business-status-parts">
                <span>
                  <small>{t("cash")}</small>
                  <strong>{formatMoney(item.cashCollection)}</strong>
                </span>
                <span>
                  <small>{t("online")}</small>
                  <strong>{formatMoney(item.onlineCollection)}</strong>
                </span>
                <span className="negative">
                  <small>{t("cashOut")}</small>
                  <strong>{formatMoney(item.expenses)}</strong>
                </span>
              </div>
              <div className={item.pendingCount > 0 ? "business-pending warning" : "business-pending"}>
                <span>{t("pendingReview")}{item.pendingCount > 0 ? ` · ${item.pendingCount}` : ""}</span>
                <strong>{formatMoney(item.pendingAmount)}</strong>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function TransactionJourney({
  steps = [],
  lanes = [],
  amount,
  children,
}: {
  steps?: TransactionJourneyStep[];
  lanes?: TransactionJourneyLane[];
  amount: number;
  children?: ReactNode;
}) {
  const { t } = useLanguage();
  const allSteps = lanes.length > 0 ? lanes.flatMap((lane) => lane.steps) : steps;
  const tone = allSteps.some((step) => step.state === "rejected")
    ? "rejected"
    : allSteps.some((step) => step.state === "pending")
      ? "pending"
      : amount < 0
        ? "negative"
        : amount > 0
          ? "positive"
          : "neutral";

  return (
    <div
      className={`transaction-journey ${lanes.length > 1 ? "has-lanes" : ""} ${lanes.some((lane) => lane.component) ? "has-component-lanes" : ""} ${tone}`}
      aria-label={t("paymentJourney")}
    >
      <div className="transaction-journey-lanes">
        {(lanes.length > 0 ? lanes : [{ component: null, amount, status: "approved" as ApprovalStatus, steps }]).map((lane) => (
          <section
            className={`transaction-journey-lane ${lane.component ?? "single"}`}
            key={lane.component ?? "single"}
            aria-label={lane.component ? `${t(lane.component)} ${formatMoney(lane.amount)}` : undefined}
          >
            {lane.component ? (
              <header>
                <span>
                  {lane.component === "cash" ? <Banknote size={16} /> : <CreditCard size={16} />}
                  {t(lane.component)}
                </span>
                <strong>{formatMoney(lane.amount)}</strong>
              </header>
            ) : null}
            <div className="transaction-journey-track" role="list">
              {lane.steps.map((step, index) => (
                <div className="transaction-journey-segment" key={step.id}>
                  {index > 0 ? <ChevronRight className="transaction-journey-arrow" size={16} aria-hidden="true" /> : null}
                  <div className={`transaction-journey-step ${step.state}`} role="listitem">
                    <span className="transaction-journey-icon" aria-hidden="true">
                      {step.state === "verified" ? <ShieldCheck size={16} /> : step.state === "rejected" ? <X size={15} /> : step.state === "pending" ? <MoreHorizontal size={16} /> : step.state === "sent" ? <ArrowUp size={15} /> : step.state === "received" ? <ArrowDown size={15} /> : <Check size={15} />}
                    </span>
                    <span className="transaction-journey-copy">
                      <strong>{step.person}</strong>
                      {step.action || step.role ? <small>{step.action}{step.role ? ` · ${step.role}` : ""}</small> : null}
                      {step.timestamp ? (
                        <time dateTime={step.timestamp}>
                          {indiaDateIso(step.timestamp)} · {formatIndiaTime(step.timestamp)}
                        </time>
                      ) : null}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      {children}
    </div>
  );
}

function PaymentAmountSplit({
  cashAmount,
  onlineAmount,
  totalAmount,
}: {
  cashAmount: number;
  onlineAmount: number;
  totalAmount?: number;
}) {
  const { t } = useLanguage();
  const hasCash = cashAmount > 0;
  const hasOnline = onlineAmount > 0;
  const showEquation = hasCash && hasOnline && totalAmount !== undefined;

  if (!hasCash && !hasOnline) return null;

  return (
    <div className="history-payment-split" aria-label={hasCash && hasOnline ? `${t("cash")} / ${t("online")}` : hasCash ? t("cash") : t("online")}>
      {hasCash ? (
        <span className="history-payment-split-part cash" title={t("cash")}>
          <Banknote size={14} aria-hidden="true" />
          <span>{formatMoney(cashAmount)}</span>
        </span>
      ) : null}
      {hasCash && hasOnline ? <span className="history-payment-split-operator">+</span> : null}
      {hasOnline ? (
        <span className="history-payment-split-part online" title={t("online")}>
          <CreditCard size={14} aria-hidden="true" />
          <span>{formatMoney(onlineAmount)}</span>
        </span>
      ) : null}
      {showEquation ? (
        <>
          <span className="history-payment-split-operator">=</span>
          <strong className="history-payment-split-total">{formatMoney(totalAmount)}</strong>
        </>
      ) : null}
    </div>
  );
}

function TransactionCardAmount({
  amount,
  cashAmount,
  onlineAmount,
  tone,
}: {
  amount: number;
  cashAmount: number;
  onlineAmount: number;
  tone: "positive" | "negative" | "neutral" | "online-approved";
}) {
  const hasCash = cashAmount > 0;
  const hasOnline = onlineAmount > 0;
  const mixed = hasCash && hasOnline;
  const displayTone = amount > 0 ? "positive" : amount < 0 ? "negative" : tone;

  return (
    <>
      <strong className={`history-card-total ${displayTone}`}>
        {!mixed && hasCash ? <Banknote className="history-card-total-icon cash" size={19} aria-hidden="true" /> : null}
        {!mixed && hasOnline ? <CreditCard className="history-card-total-icon online" size={19} aria-hidden="true" /> : null}
        <span>{amount === 0 ? "" : amount > 0 ? "+" : "-"}{formatMoney(Math.abs(amount))}</span>
      </strong>
      {mixed ? <PaymentAmountSplit cashAmount={cashAmount} onlineAmount={onlineAmount} totalAmount={Math.abs(amount)} /> : null}
    </>
  );
}

function TransactionsView({
  businessId,
  cacheScope,
  dateLabel,
  dateRange,
  dateFilterKey,
  transactionLens,
  transactionFilter,
  transactionProfileId,
  recordTypeFilter,
  modeFilter,
  businessTypeFilter,
  onSelectLens,
  onSelectActivity,
  payments,
  expenses,
  movements,
  ledger,
  agentSettlements,
  financialActivity,
  postingEvents,
  profiles,
  profile,
  owner,
  canVerifyOnlineCollections,
  sharedBusinessHistory,
  agentIncentiveSummary,
  agentReferralCodes,
  permissionsByProfile,
  staffUnitAssignments,
  setNotice,
  startTransition,
  pendingOnly = false,
}: {
  /** Pending approvals side page: hides the lens tabs and activity chips. */
  pendingOnly?: boolean;
  businessId: string;
  cacheScope: string;
  dateLabel: string;
  dateRange: NormalizedDateRange;
  dateFilterKey: DateFilterKey;
  transactionLens: TransactionLens;
  transactionFilter: TransactionFilter;
  transactionProfileId: string;
  recordTypeFilter: TransactionRecordType;
  modeFilter: TransactionModeFilter;
  businessTypeFilter: BusinessTypeFilter;
  onSelectLens: (lens: TransactionLens) => void;
  onSelectActivity: (activity: TransactionFilter) => void;
  payments: Payment[];
  expenses: Expense[];
  movements: MoneyMovement[];
  ledger: LedgerEntry[];
  agentSettlements: AgentSettlement[];
  financialActivity: FinancialActivity[];
  postingEvents: DailyPostingEvent[];
  profiles: Profile[];
  profile: Profile;
  owner: boolean;
  canVerifyOnlineCollections: boolean;
  sharedBusinessHistory: boolean;
  agentIncentiveSummary: AgentIncentiveSummary;
  agentReferralCodes: ReferralCode[];
  permissionsByProfile: Record<string, string[]>;
  staffUnitAssignments: StaffUnitAssignment[];
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const { t } = useLanguage();
  const [transactionAction, setTransactionAction] = useState<{
    kind: TransactionActionKind;
    recordKey: string;
  } | null>(null);
  const [transactionActionNotice, setTransactionActionNotice] = useState<ActionResult | null>(null);
  const [transactionSearch, setTransactionSearch] = useState("");
  const transactionSearchKey = transactionSearch.trim().toLowerCase();
  useEffect(() => {
    const closeMenuOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      document.querySelectorAll<HTMLElement>("details.history-actions-menu[open]").forEach((menu) => {
        if (target instanceof Node && !menu.contains(target)) menu.removeAttribute("open");
      });
    };
    document.addEventListener("pointerdown", closeMenuOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeMenuOnOutsideClick);
  }, []);
  const currentUserIsSalesAgent = isSalesAgent(profile.role);
  const canUseProfileFilter = !currentUserIsSalesAgent && (owner || sharedBusinessHistory);
  // Pending records have no approval date yet, so the date filter always applies to their
  // transaction date. (Every pending record regardless of dates lives behind the header button.)
  const pendingAwaitingInScope = useCallback((isoDate: string) => dateInRange(isoDate.slice(0, 10), dateRange), [dateRange]);
  const pendingInSelectedDates = useCallback((record: { date: string }) => dateInRange(record.date.slice(0, 10), dateRange), [dateRange]);
  const allTransactionRecords = useMemo(() => {
    type HistoryRecordFilter = Exclude<TransactionFilter, "all" | "pending">;
    type HistoryRecord = {
      id: string;
      kind: "collection" | "expense" | "settlement" | "agent_payout";
      recordCategory: Exclude<TransactionRecordType, "all">;
      businessType: BusinessType | null;
      filter: HistoryRecordFilter;
      date: string;
      sortAt: string;
      amount: number;
      cashAmount: number;
      onlineAmount: number;
      amountTone?: "positive" | "negative" | "neutral" | "online-approved";
      title: string;
      meta: string;
      status: string;
      statusTone: string;
      modeLabel?: string;
      recordStatus: "active" | "cancelled";
      ownerId: string;
      description: string;
      remark: string;
      reason: string | null;
      businessLabel?: string;
      rollNumber?: string;
      icon: ReactNode;
      recordType?: "payment" | "expense";
      editDate?: string;
      editAmount?: number;
      canEdit?: boolean;
      canDelete?: boolean;
      transferLines?: string[];
      journey?: TransactionJourneyStep[];
      journeyLanes?: TransactionJourneyLane[];
      transferRecipients?: Profile[];
      canRequestTransfer?: boolean;
      incomingTransferId?: string | null;
      pendingApproval?: boolean;
      canApprove?: boolean;
      approvalBlockedByTransfer?: boolean;
      cashApprovalStatus?: ApprovalStatus | null;
      onlineApprovalStatus?: ApprovalStatus | null;
      isMixedPayment?: boolean;
      sourceId?: string;
      transactionDate?: string;
      approvalDate?: string;
    };
    const selectedUserId = transactionLens === "personal"
      ? profile.id
      : canUseProfileFilter
        ? transactionProfileId
        : profile.id;
    const userMatches = (userId: string | null | undefined) => selectedUserId === "all" || userId === selectedUserId;
    const eventMatchesSelectedUser = (event: DailyPostingEvent) =>
      transactionLens === "business" || selectedUserId === "all" || event.profile_id === selectedUserId;
    const visibleSourceEvents = (sourceType: DailyPostingEvent["source_type"], sourceId: string) =>
      postingEvents.filter((event) =>
        event.source_type === sourceType &&
        event.source_id === sourceId &&
        eventMatchesSelectedUser(event) &&
        dateInRange(postingEventDate(event, dateFilterKey), dateRange),
      );
    const groupEventsByDisplayDate = (events: DailyPostingEvent[]) => {
      const groups = new Map<string, DailyPostingEvent[]>();
      events.forEach((event) => {
        const date = postingEventDate(event, dateFilterKey);
        groups.set(date, [...(groups.get(date) ?? []), event]);
      });
      return [...groups.entries()];
    };
    const collectionStatus = (payment: Payment) => {
      const cashStatus = paymentComponentStatus(payment, "cash");
      const onlineStatus = paymentComponentStatus(payment, "online");
      if (
        paymentCashAmount(payment) > 0
        && paymentOnlineAmount(payment) > 0
        && [cashStatus, onlineStatus].filter((status) => status === "approved").length === 1
      ) {
        return t("partiallyVerified");
      }
      if (payment.approval_status !== "approved") return labelForStatus(payment.approval_status, t);
      return labelForStatus(payment.approval_status, t);
    };
    const collectionStatusTone = (payment: Payment) => {
      if (
        paymentCashAmount(payment) > 0
        && paymentOnlineAmount(payment) > 0
        && [paymentComponentStatus(payment, "cash"), paymentComponentStatus(payment, "online")]
          .filter((status) => status === "approved").length === 1
      ) {
        return "reapproval_required";
      }
      return payment.approval_status === "approved" && paymentOnlineAmount(payment) > 0 && paymentCashAmount(payment) === 0
        ? "approved"
        : payment.approval_status;
    };
    const ownerProfileIds = ownerProfileIdSet(profiles);
    const isOwnerProfile = (profileId: string | null | undefined) => Boolean(profileId && ownerProfileIds.has(profileId));
    const paymentMatchesSelectedProfile = (payment: Payment) => userMatches(payment.collected_by);

    const paymentRows = currentUserIsSalesAgent ? [] : payments
      .filter((payment) => payment.record_status === "active")
      .flatMap((payment): HistoryRecord[] => {
        const linkedTransfers = paymentTransfers(movements, payment.id);
        const matchesActivityProfile = paymentMatchesSelectedProfile(payment);
        const cashImpact = paymentCashAmount(payment);
        const onlineImpact = paymentOnlineAmount(payment);
        const ownerAuthoredPayment = isOwnerProfile(payment.collected_by);
        const effectivePaymentApproved = isEffectivelyApprovedPayment(payment, ownerProfileIds);
        const effectivePaymentPending = isEffectivelyPendingPayment(payment, ownerProfileIds);
        const pendingCashAmount = paymentComponentStatus(payment, "cash") === "approved" ? 0 : cashImpact;
        const pendingOnlineAmount = paymentComponentStatus(payment, "online") === "approved" ? 0 : onlineImpact;
        const pendingAmount = pendingCashAmount + pendingOnlineAmount;
        const hasApprovedComponent = paymentHasApprovedComponent(payment);
        const paymentStatus = ownerAuthoredPayment ? t("receivedStatus") : collectionStatus(payment);
        const paymentStatusTone = ownerAuthoredPayment ? "approved" : collectionStatusTone(payment);
        const reviewProfileId = paymentReviewProfileId(payment);
        const pendingTransfer = linkedTransfers.find((movement) => movement.status === "pending") ?? null;
        const activeTransfer = linkedTransfers.some((movement) => movement.status === "pending" || movement.status === "accepted");
        const requiredPermission = businessPermissions[payment.business_type];
        const assignee = profiles.find((item) => item.id === reviewProfileId);
        const assigneeUnitAssignment = staffUnitAssignments.find((assignment) =>
          assignment.staff_profile_id === reviewProfileId
          && assignment.business_type === payment.business_type,
        );
        const currentStaffAssignment = staffUnitAssignments.find((assignment) =>
          assignment.staff_profile_id === profile.id
          && assignment.business_type === payment.business_type,
        );
        const transferRecipients = requiredPermission
          ? profiles.filter((item) =>
              item.active &&
              item.membership_status === "active" &&
              item.id !== reviewProfileId &&
              item.role === "staff" &&
              (permissionsByProfile[item.id] ?? []).includes(requiredPermission) &&
              staffUnitAssignments.some((assignment) =>
                assignment.staff_profile_id === item.id
                && assignment.business_type === payment.business_type
                && (
                  profile.membership_role === "primary_owner"
                  || (profile.membership_role === "co_owner" && assignment.manager_profile_id === profile.id)
                  || (
                    profile.membership_role === "staff"
                    && assignment.manager_profile_id === currentStaffAssignment?.manager_profile_id
                  )
                ),
              ),
            )
          : [];
        const assigneeCanTransfer = assignee?.membership_role !== "staff"
          || (permissionsByProfile[reviewProfileId] ?? []).includes("transfer_money");
        const canRequestTransfer =
          STAFF_TRANSACTION_TRANSFERS_ENABLED &&
          (owner || reviewProfileId === profile.id) &&
          (owner || (permissionsByProfile[profile.id] ?? []).includes("transfer_money")) &&
          assigneeCanTransfer &&
          (profile.membership_role !== "co_owner" || reviewProfileId === profile.id || assigneeUnitAssignment?.manager_profile_id === profile.id) &&
          (effectivePaymentPending || (profile.membership_role === "primary_owner" && effectivePaymentApproved)) &&
          (profile.membership_role === "primary_owner" || !hasApprovedComponent) &&
          !pendingTransfer;
        const incomingTransferId = STAFF_TRANSACTION_TRANSFERS_ENABLED && pendingTransfer?.to_profile_id === profile.id
          ? pendingTransfer.id
          : null;
        const baseRecord = {
          sourceId: payment.id,
          recordCategory: "payment" as const,
          businessType: payment.business_type,
          title: paymentDisplayTitle(payment, t),
          businessLabel: transactionBusinessTag(payment.business_type, t),
          rollNumber: (payment.business_type === "library" || payment.business_type === "course") && payment.roll_number
            ? payment.roll_number
            : undefined,
          status: paymentStatus,
          statusTone: paymentStatusTone,
          modeLabel: paymentModeLabel(payment, t),
          recordStatus: payment.record_status,
          ownerId: reviewProfileId,
          description: payment.description ?? "",
          remark: payment.remark ?? "",
          reason: payment.cancel_reason,
          recordType: "payment" as const,
          editDate: payment.payment_date,
          editAmount: numberValue(payment.amount),
          canEdit: (owner || reviewProfileId === profile.id) && effectivePaymentPending && !hasApprovedComponent && !activeTransfer,
          canDelete: owner,
          transferLines: transferSummaryLines(linkedTransfers, profiles, t),
          journeyLanes: paymentJourneyLanes(payment, linkedTransfers, profiles, t),
          transferRecipients,
          canRequestTransfer,
          incomingTransferId,
          pendingApproval: false,
          canApprove: owner && effectivePaymentPending && !pendingTransfer,
          approvalBlockedByTransfer: owner && effectivePaymentPending && Boolean(pendingTransfer),
          cashApprovalStatus: paymentComponentStatus(payment, "cash"),
          onlineApprovalStatus: paymentComponentStatus(payment, "online"),
          isMixedPayment: cashImpact > 0 && onlineImpact > 0,
          icon: payment.business_type === "guest_house"
            ? <Hotel size={24} />
            : payment.business_type === "library"
              ? <BookOpen size={24} />
              : payment.business_type === "course"
                ? <GraduationCap size={24} />
                : <WalletCards size={24} />,
        };

        const rows: HistoryRecord[] = [];
        const approvedPaymentEvents = matchesActivityProfile
          ? visibleSourceEvents("payment", payment.id)
          : [];
        groupEventsByDisplayDate(approvedPaymentEvents).forEach(([displayDate, events]) => {
          const amount = events.reduce((sum, event) => sum + event.amount, 0);
          const cashAmount = events.reduce((sum, event) => sum + event.cash_amount, 0);
          const onlineAmount = events.reduce((sum, event) => sum + event.online_amount, 0);
          const approvedAt = events.map((event) => event.approved_at).filter((value): value is string => Boolean(value)).sort().at(-1) ?? payment.created_at;
          rows.push({
            ...baseRecord,
            id: `${payment.id}-${displayDate}`,
            kind: "collection",
            filter: transactionLens === "business" ? "collections" : "cash_in",
            date: displayDate,
            sortAt: approvedAt,
            amount,
            cashAmount,
            onlineAmount,
            amountTone: onlineAmount > 0 && cashAmount === 0 ? "online-approved" : "positive",
            status: labelForStatus("approved", t),
            statusTone: "approved",
            meta: `${profileName(profiles, payment.collected_by, t)} · ${labelForBusiness(payment.business_type, t)}`,
            pendingApproval: false,
            canApprove: false,
            approvalBlockedByTransfer: false,
            transactionDate: payment.payment_date,
            approvalDate: events.map((event) => event.approval_date).sort().at(-1),
          });
        });

        if (transactionLens === "personal" && incomingTransferId && pendingAwaitingInScope(payment.payment_date)) {
          rows.push({
            ...baseRecord,
            id: `${payment.id}-transfer-pending`,
            kind: "collection",
            filter: "cash_in",
            date: payment.payment_date,
            sortAt: pendingTransfer?.created_at ?? payment.created_at,
            amount: numberValue(payment.amount),
            cashAmount: cashImpact,
            onlineAmount: onlineImpact,
            amountTone: "neutral",
            status: `Transfer request pending with ${profileName(profiles, pendingTransfer?.to_profile_id, t)}`,
            statusTone: "pending",
            meta: `${profileName(profiles, reviewProfileId, t)} · ${labelForBusiness(payment.business_type, t)}`,
            pendingApproval: true,
            canApprove: false,
            approvalBlockedByTransfer: false,
            transactionDate: payment.payment_date,
            approvalDate: undefined,
          });
        }

        if (!incomingTransferId && matchesActivityProfile && pendingAmount > 0 && pendingAwaitingInScope(payment.payment_date)) {
          rows.push({
            ...baseRecord,
            id: `${payment.id}-pending`,
            kind: "collection",
            filter: transactionLens === "business" ? "collections" : "cash_in",
            date: payment.payment_date,
            sortAt: payment.created_at,
            amount: pendingAmount,
            cashAmount: pendingCashAmount,
            onlineAmount: pendingOnlineAmount,
            amountTone: "neutral",
            meta: `${profileName(profiles, reviewProfileId, t)} · ${labelForBusiness(payment.business_type, t)}`,
            pendingApproval: true,
            transactionDate: payment.payment_date,
            approvalDate: undefined,
          });
        }

        return rows;
      });
    const expenseRows = currentUserIsSalesAgent ? [] : expenses
      .filter((expense) => expense.record_status === "active")
      .flatMap((expense): HistoryRecord[] => {
        if (!userMatches(expense.spent_by)) return [];
        const expenseEffectiveStatus = effectiveExpenseStatus(expense, ownerProfileIds);
        const pendingApproval = isEffectivelyPendingExpense(expense, ownerProfileIds);
        const baseRecord = {
          sourceId: expense.id,
          recordCategory: "expense" as const,
          businessType: expense.business_type ?? "general",
          title: expenseDisplayTitle(expense),
          meta: `${profileName(profiles, expense.spent_by, t)}${expense.spent_by === profile.id ? ` (${t("self")})` : ""}`,
          status: labelForStatus(expenseEffectiveStatus, t),
          statusTone: expenseEffectiveStatus,
          modeLabel: labelForMode(expense.mode, t),
          recordStatus: expense.record_status,
          ownerId: expense.spent_by,
          description: expense.description,
          remark: expense.remark ?? "",
          reason: expense.cancel_reason,
          recordType: "expense" as const,
          editDate: expense.expense_date,
          editAmount: numberValue(expense.amount),
          canEdit: pendingApproval && (owner || expense.spent_by === profile.id),
          canDelete: owner,
          pendingApproval: false,
          canApprove: owner && pendingApproval,
          businessLabel: transactionBusinessTag(expense.business_type, t),
          journey: expenseJourneySteps(expense, profiles, t),
          icon: <ReceiptText size={24} />,
        };
        const rows: HistoryRecord[] = [];

        visibleSourceEvents("expense", expense.id).forEach((event) => {
          const displayDate = postingEventDate(event, dateFilterKey);
          rows.push({
            ...baseRecord,
            id: `${expense.id}-${displayDate}`,
            kind: "expense",
            filter: transactionLens === "business" ? "expenses" : "cash_out",
            date: displayDate,
            sortAt: event.approved_at ?? expense.created_at,
            amount: -event.amount,
            cashAmount: event.cash_amount,
            onlineAmount: event.online_amount,
            amountTone: "negative",
            pendingApproval: false,
            transactionDate: expense.expense_date,
            approvalDate: event.approval_date,
          });
        });

        if (pendingApproval && userMatches(expense.spent_by) && pendingAwaitingInScope(expense.expense_date)) {
          rows.push({
            ...baseRecord,
            id: `${expense.id}-pending`,
            kind: "expense",
            filter: transactionLens === "business" ? "expenses" : "cash_out",
            date: expense.expense_date,
            sortAt: expense.created_at,
            amount: -numberValue(expense.amount),
            cashAmount: expense.mode === "online" ? 0 : numberValue(expense.amount),
            onlineAmount: expense.mode === "online" ? numberValue(expense.amount) : 0,
            amountTone: "neutral",
            pendingApproval: true,
            transactionDate: expense.expense_date,
            approvalDate: undefined,
          });
        }

        return rows;
      });
    const settlementRows = currentUserIsSalesAgent ? [] : movements.flatMap((movement): HistoryRecord[] => {
      if (transactionLens === "business") return [];
      if (movement.status !== "accepted") return [];
      const movementChain = `${profileName(profiles, movement.from_profile_id, t)} → ${profileName(profiles, movement.to_profile_id, t)}`;
      return visibleSourceEvents(movement.type, movement.id).map((event) => {
        const incoming = event.direction === "in";
        const entry = ledger.find((item) =>
          item.source_id === movement.id &&
          item.source_type === movement.type &&
          item.account_profile_id === event.profile_id,
        );
        return {
          id: `movement-${movement.id}-${event.direction}`,
          sourceId: movement.id,
          kind: incoming ? "collection" as const : "settlement" as const,
          recordCategory: "transfer" as const,
          businessType: event.business_type,
          filter: incoming ? "cash_in" as const : "cash_out" as const,
          date: postingEventDate(event, dateFilterKey),
          sortAt: movement.responded_at ?? movement.created_at,
          amount: incoming ? event.amount : -event.amount,
          cashAmount: event.cash_amount,
          onlineAmount: event.online_amount,
          title: incoming ? t("cashReceived") : t("cashSent"),
          meta: `${incoming ? t("from") : t("to")}: ${profileName(profiles, event.counterparty_profile_id, t)}${movement.note ? ` · ${movement.note}` : ""}`,
          status: t("verified"),
          statusTone: movement.status,
          modeLabel: labelForMode(movement.mode, t),
          recordStatus: "active" as const,
          ownerId: event.profile_id,
          description: entry?.description ?? "",
          remark: movement.note ?? "",
          reason: null,
          businessLabel: t("cashTransfer"),
          transferLines: [movementChain],
          journey: cashTransferJourneySteps(movement, profiles, t, incoming ? "cash_in" : "cash_out"),
          pendingApproval: false,
          transactionDate: event.transaction_date,
          approvalDate: event.approval_date,
          icon: incoming ? <ArrowDown size={24} /> : <ArrowUp size={24} />,
        };
      });
    });
    const agentRows = transactionLens === "business" ? [] : agentSettlements.flatMap((settlement): HistoryRecord[] => {
      if (settlement.status === "rejected") return [];
      const amount = numberValue(settlement.amount);
      const transactionDate = indiaDateIso(settlement.created_at);
      if (settlement.status === "pending") {
        const pendingProfileId = selectedUserId === "all" ? settlement.paid_by : selectedUserId;
        const incoming = pendingProfileId === settlement.agent_id;
        const outgoing = pendingProfileId === settlement.paid_by;
        if ((!incoming && !outgoing) || !pendingAwaitingInScope(transactionDate)) return [];
        return [{
          id: `agent-${settlement.id}-pending`,
          sourceId: settlement.id,
          kind: "agent_payout",
          recordCategory: "agent_payout",
          businessType: null,
          filter: incoming ? "cash_in" : "cash_out",
          date: transactionDate,
          sortAt: settlement.created_at,
          amount: incoming ? amount : -amount,
          cashAmount: amount,
          onlineAmount: 0,
          amountTone: "neutral",
          title: t("pendingIncentive"),
          meta: `${incoming ? t("from") : t("to")}: ${profileName(profiles, incoming ? settlement.paid_by : settlement.agent_id, t)}${settlement.note ? ` · ${settlement.note}` : ""}`,
          status: labelForStatus(settlement.status, t),
          statusTone: settlement.status,
          modeLabel: incoming ? t("cashIn") : t("agentPayoutLower"),
          recordStatus: "active",
          ownerId: pendingProfileId,
          description: "",
          remark: settlement.note ?? "",
          reason: null,
          businessLabel: t("cashTransfer"),
          journey: agentPayoutJourneySteps(settlement, profiles, t, incoming ? "cash_in" : "cash_out"),
          pendingApproval: true,
          transactionDate,
          approvalDate: undefined,
          icon: <WalletCards size={24} />,
        }];
      }

      return visibleSourceEvents("agent_settlement", settlement.id).map((event) => {
        const incoming = event.direction === "in";
        return {
          id: `agent-${settlement.id}-${event.direction}`,
          sourceId: settlement.id,
          kind: "agent_payout" as const,
          recordCategory: "agent_payout" as const,
          businessType: null,
          filter: incoming ? "cash_in" as const : "cash_out" as const,
          date: postingEventDate(event, dateFilterKey),
          sortAt: settlement.responded_at ?? settlement.created_at,
          amount: incoming ? amount : -amount,
          cashAmount: event.cash_amount,
          onlineAmount: event.online_amount,
          amountTone: incoming ? "positive" as const : "negative" as const,
          title: incoming ? t("incentivePayout") : t("agentPayout"),
          meta: `${incoming ? t("from") : t("to")}: ${profileName(profiles, event.counterparty_profile_id, t)}${settlement.note ? ` · ${settlement.note}` : ""}`,
          status: labelForStatus(settlement.status, t),
          statusTone: settlement.status,
          modeLabel: incoming ? t("cashIn") : t("agentPayoutLower"),
          recordStatus: "active" as const,
          ownerId: event.profile_id,
          description: "",
          remark: settlement.note ?? "",
          reason: null,
          businessLabel: t("cashTransfer"),
          journey: agentPayoutJourneySteps(settlement, profiles, t, incoming ? "cash_in" : "cash_out"),
          pendingApproval: false,
          transactionDate: event.transaction_date,
          approvalDate: event.approval_date,
          icon: <WalletCards size={24} />,
        };
      });
    });

    // The canonical server feed is intentionally uncapped. Keep the rich
    // source-backed cards when a source row is loaded, and render a read-only
    // feed card for older rows beyond the operational detail window.
    const loadedPaymentIds = new Set(payments.map((payment) => payment.id));
    const loadedExpenseIds = new Set(expenses.map((expense) => expense.id));
    const loadedMovementIds = new Set(movements.map((movement) => movement.id));
    const unloadedActivityGroups = new Map<string, FinancialActivity[]>();
    financialActivity
      .filter((activity) => {
        if (activity.lens !== transactionLens) return false;
        if (
          transactionLens === "business"
          && selectedUserId !== "all"
          && activity.actor_profile_id !== selectedUserId
        ) return false;
        if (activity.source_type === "payment") return !loadedPaymentIds.has(activity.source_id);
        if (activity.source_type === "expense") return !loadedExpenseIds.has(activity.source_id);
        return !loadedMovementIds.has(activity.source_id);
      })
      .forEach((activity) => {
        const displayDate = activity.approval_date ?? activity.transaction_date;
        const key = `${activity.source_type}:${activity.source_id}:${activity.category}:${displayDate}`;
        unloadedActivityGroups.set(key, [...(unloadedActivityGroups.get(key) ?? []), activity]);
      });
    const feedFallbackRows = [...unloadedActivityGroups.values()].map((activities): HistoryRecord => {
      const activity = activities[0];
      const pendingApproval = activity.category === "pending";
      const amountValue = activities.reduce((sum, item) => sum + numberValue(item.amount), 0);
      const cashAmount = activities.reduce((sum, item) => sum + numberValue(item.cash_amount), 0);
      const onlineAmount = activities.reduce((sum, item) => sum + numberValue(item.online_amount), 0);
      const incoming = activity.category === "collection"
        || activity.category === "in"
        || (pendingApproval && activity.source_type === "payment");
      const actorId = activity.flow_profile_id ?? activity.actor_profile_id;
      const kind = activity.source_type === "expense"
        ? "expense" as const
        : incoming
          ? "collection" as const
          : "settlement" as const;
      const recordCategory = activity.source_type === "payment"
        ? "payment" as const
        : activity.source_type === "expense"
          ? "expense" as const
          : "transfer" as const;
      const filter = transactionLens === "business"
        ? activity.source_type === "expense" ? "expenses" as const : "collections" as const
        : incoming ? "cash_in" as const : "cash_out" as const;
      const title = activity.source_type === "payment"
        ? "Collection"
        : activity.source_type === "expense"
          ? "Expense"
          : incoming
            ? t("cashReceived")
            : t("cashSent");
      const displayDate = activity.approval_date ?? activity.transaction_date;
      return {
        id: `feed-${activity.source_id}-${activity.category}-${displayDate}`,
        sourceId: activity.source_id,
        kind,
        recordCategory,
        businessType: activity.business_type,
        filter,
        date: displayDate,
        sortAt: activities.map((item) => item.created_at).sort().at(-1) ?? `${displayDate}T00:00:00.000Z`,
        amount: incoming ? amountValue : -amountValue,
        cashAmount,
        onlineAmount,
        amountTone: pendingApproval ? "neutral" : incoming ? "positive" : "negative",
        title,
        meta: `${profileName(profiles, actorId, t)} · ${activity.business_type ? labelForBusiness(activity.business_type, t) : t("cashTransfer")}`,
        status: labelForStatus(activity.status, t),
        statusTone: activity.status,
        modeLabel: cashAmount > 0 && onlineAmount > 0
          ? t("mixed")
          : onlineAmount > 0
            ? t("online")
            : t("cash"),
        recordStatus: "active",
        ownerId: actorId,
        description: "",
        remark: "",
        reason: null,
        businessLabel: activity.business_type
          ? transactionBusinessTag(activity.business_type, t)
          : t("cashTransfer"),
        recordType: activity.source_type === "payment" || activity.source_type === "expense"
          ? activity.source_type
          : undefined,
        pendingApproval,
        canApprove: false,
        canEdit: false,
        canDelete: false,
        transactionDate: activity.transaction_date,
        approvalDate: activity.approval_date ?? undefined,
        icon: activity.source_type === "payment"
          ? <WalletCards size={24} />
          : activity.source_type === "expense"
            ? <ReceiptText size={24} />
            : incoming
              ? <ArrowDown size={24} />
              : <ArrowUp size={24} />,
      };
    });

    return [...paymentRows, ...expenseRows, ...settlementRows, ...agentRows, ...feedFallbackRows]
      .sort((a, b) => `${b.date}-${b.sortAt}-${b.id}`.localeCompare(`${a.date}-${a.sortAt}-${a.id}`));
  }, [agentSettlements, canUseProfileFilter, currentUserIsSalesAgent, dateFilterKey, dateRange, expenses, financialActivity, ledger, movements, owner, payments, pendingAwaitingInScope, permissionsByProfile, postingEvents, profile.id, profile.membership_role, profiles, staffUnitAssignments, t, transactionLens, transactionProfileId]);
  const selectedTransactionActionRecord = transactionAction
    ? allTransactionRecords.find((record) => `${record.kind}-${record.id}` === transactionAction.recordKey) ?? null
    : null;
  const selectedPayment = selectedTransactionActionRecord?.recordType === "payment"
    ? payments.find((payment) => payment.id === (selectedTransactionActionRecord.sourceId ?? selectedTransactionActionRecord.id)) ?? null
    : null;
  const selectedExpense = selectedTransactionActionRecord?.recordType === "expense"
    ? expenses.find((expense) => expense.id === (selectedTransactionActionRecord.sourceId ?? selectedTransactionActionRecord.id)) ?? null
    : null;
  const selectedTransactionSourceId = selectedTransactionActionRecord?.sourceId ?? selectedTransactionActionRecord?.id ?? "";
  const attachmentRecord = selectedPayment?.photo_path
    ? { type: "payment" as const, id: selectedPayment.id }
    : selectedExpense?.photo_path
      ? { type: "expense" as const, id: selectedExpense.id }
      : null;
  const attachmentQuery = useQuery({
    queryKey: ["record-attachment", cacheScope, attachmentRecord?.type ?? "none", attachmentRecord?.id ?? ""],
    queryFn: ({ signal }) => fetchJson<{ url: string | null }>(
      `/api/businesses/${businessId}/records/${attachmentRecord?.type}/${encodeURIComponent(attachmentRecord?.id ?? "")}/attachment`,
      signal,
    ),
    enabled: transactionAction?.kind === "detail" && Boolean(attachmentRecord),
    staleTime: 300_000,
  });
  const closeTransactionAction = () => {
    setTransactionAction(null);
    setTransactionActionNotice(null);
  };
  const openTransactionAction = (kind: TransactionActionKind, recordKey: string, trigger: HTMLButtonElement) => {
    trigger.closest("details")?.removeAttribute("open");
    setTransactionActionNotice(null);
    setTransactionAction({ kind, recordKey });
  };
  const setTransactionNotice = (notice: ActionResult | null) => {
    setTransactionActionNotice(notice);
    setNotice(notice);
  };
  const matchesSecondaryFilters = useCallback((record: (typeof allTransactionRecords)[number]) => {
    if (
      transactionSearchKey
      && !record.title.toLowerCase().includes(transactionSearchKey)
      && !(record.rollNumber ?? "").toLowerCase().includes(transactionSearchKey)
    ) return false;
    if (recordTypeFilter !== "all" && record.recordCategory !== recordTypeFilter) return false;
    // Cash handovers between members belong to no business unit, so a unit filter must not hide them.
    const unitlessTransfer = record.recordCategory === "transfer" && !record.businessType;
    if (businessTypeFilter !== "all" && !unitlessTransfer && record.businessType !== businessTypeFilter) return false;
    if (modeFilter !== "all") {
      const cash = numberValue(record.cashAmount);
      const online = numberValue(record.onlineAmount);
      const recordMode: TransactionModeFilter = cash > 0 && online > 0 ? "mixed" : online > 0 ? "online" : "cash";
      if (recordMode !== modeFilter) return false;
    }
    return true;
  }, [businessTypeFilter, modeFilter, recordTypeFilter, transactionSearchKey]);
  const transactionRecords = useMemo(() => allTransactionRecords.filter((record) => {
    if (!matchesSecondaryFilters(record)) return false;
    if (transactionFilter === "all") return !record.pendingApproval || pendingInSelectedDates(record);
    if (transactionFilter === "pending") return Boolean(record.pendingApproval);
    return record.filter === transactionFilter && !record.pendingApproval;
  }), [allTransactionRecords, matchesSecondaryFilters, pendingInSelectedDates, transactionFilter]);
  const totalTransactionRecords = allTransactionRecords.filter((record) =>
    !record.pendingApproval && matchesSecondaryFilters(record),
  );
  const inCashTotal = totalTransactionRecords
    .filter((record) => numberValue(record.amount) > 0)
    .reduce((sum, record) => sum + numberValue(record.cashAmount), 0);
  const inOnlineTotal = totalTransactionRecords
    .filter((record) => numberValue(record.amount) > 0)
    .reduce((sum, record) => sum + numberValue(record.onlineAmount), 0);
  const positiveTotal = inCashTotal + inOnlineTotal;
  const groupedRecords = transactionRecords.reduce<{ date: string; records: typeof transactionRecords }[]>((groups, record) => {
    const lastGroup = groups.at(-1);
    if (lastGroup?.date === record.date) {
      lastGroup.records.push(record);
      return groups;
    }
    groups.push({ date: record.date, records: [record] });
    return groups;
  }, []);
  const activityOptions: { value: TransactionFilter; label: string }[] = transactionLens === "business"
    ? [
        { value: "all", label: t("all") },
        { value: "collections", label: t("collections") },
        { value: "expenses", label: t("expenses") },
        { value: "pending", label: t("pending") },
      ]
    : [
        { value: "all", label: t("all") },
        { value: "cash_in", label: "IN" },
        { value: "cash_out", label: "OUT" },
        { value: "pending", label: t("pending") },
      ];

  return (
    <div className={`view-stack mobile-clean transaction-history-view lens-${transactionLens} activity-${transactionFilter}`}>
      {currentUserIsSalesAgent ? (
        <>
          <AgentCodePanel profile={profile} referrals={agentReferralCodes} setNotice={setNotice} />
          <AgentIncentivePanel summary={agentIncentiveSummary} />
        </>
      ) : null}

      {!currentUserIsSalesAgent && !pendingOnly ? (
        <nav className="transaction-primary-filters" aria-label="Transaction classification">
          <div className="transaction-lens-tabs" role="tablist" aria-label="Transaction lens">
            <button
              aria-selected={transactionLens === "personal"}
              className={transactionLens === "personal" ? "active" : ""}
              onClick={() => onSelectLens("personal")}
              role="tab"
              type="button"
            >
              My activity
            </button>
            <button
              aria-selected={transactionLens === "business"}
              className={transactionLens === "business" ? "active" : ""}
              onClick={() => onSelectLens("business")}
              role="tab"
              type="button"
            >
              Business
            </button>
          </div>
          <div className="transaction-activity-chips" aria-label={transactionLens === "business" ? "Business activity filters" : "My activity filters"}>
            {activityOptions.map((option) => (
              <button
                aria-pressed={transactionFilter === option.value}
                className={transactionFilter === option.value ? "active" : ""}
                key={option.value}
                onClick={() => onSelectActivity(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </nav>
      ) : null}

      <label className="transaction-search">
        <span className="input-with-icon">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={transactionSearch}
            onChange={(event) => setTransactionSearch(event.target.value)}
            placeholder={`${t("name")} / ${t("rollNumber")}`}
            aria-label="Search transactions"
          />
        </span>
      </label>

      {transactionFilter === "pending" && !pendingOnly ? (
        <p className="date-filter-note">{t("pendingDateUsesTransaction")}</p>
      ) : null}

      {/* Totals live on the Dashboard; Sales agents keep their incentive total here. */}
      {currentUserIsSalesAgent ? (
        <section className="history-summary-panel">
          <div className="history-summary-context">
            <span>{dateLabel}</span>
            <strong>{transactionRecords.length} {t("transactions")}</strong>
          </div>
          <div className="agent-history-total">
            <span>{t("cashIn")}</span>
            <strong>{formatMoney(positiveTotal)}</strong>
            <small className="history-total-breakdown">{t("cash")} {formatMoney(inCashTotal)} · {t("online")} {formatMoney(inOnlineTotal)}</small>
          </div>
        </section>
      ) : null}

      <section className="history-list-section">
        {groupedRecords.length > 0 ? (
          groupedRecords.map((group) => (
            <div className="history-day-group" key={group.date}>
              <h3>{group.date === todayIso() ? t("today") : group.date}</h3>
              <div className="history-card-list">
                {group.records.map((record) => (
                  <article
                    className={`history-card ${record.amountTone ?? (record.amount === 0 ? "neutral" : record.amount > 0 ? "positive" : "negative")}${record.pendingApproval ? " pending" : ""}`}
                    key={`${record.kind}-${record.id}`}
                  >
                    <div className="history-card-icon">{record.icon}</div>
                    <div className="history-card-main">
                      <strong>{record.title}</strong>
                      {record.businessLabel ? (
                        <span className="history-card-badges">
                          <span className="history-business-badge">{record.businessLabel}</span>
                          {record.rollNumber ? <span className="history-business-badge history-roll-badge">{t("roll")} {record.rollNumber}</span> : null}
                        </span>
                      ) : <p>{record.meta}</p>}
                      {record.transactionDate && record.approvalDate && record.transactionDate !== record.approvalDate ? (
                        <small className="history-date-context">
                          {t("transactionDate")} {record.transactionDate} · {t("approvalDate")} {record.approvalDate}
                        </small>
                      ) : null}
                    </div>
                    <div className="history-card-side">
                      <TransactionCardAmount
                        amount={record.amount}
                        cashAmount={record.cashAmount}
                        onlineAmount={record.onlineAmount}
                        tone={record.amountTone ?? (record.amount === 0 ? "neutral" : record.amount > 0 ? "positive" : "negative")}
                      />
                      {(!record.journey || record.journey.length === 0) && (!record.journeyLanes || record.journeyLanes.length === 0) ? (
                        <time className="history-transaction-time" dateTime={record.sortAt}>{formatIndiaTime(record.sortAt)}</time>
                      ) : null}
                    </div>
                    <details className="history-actions-menu">
                      <summary aria-label={t("moreOptions")}>
                        <MoreHorizontal size={18} />
                      </summary>
                      <div className="details-menu transaction-options-menu">
                        <button className="transaction-option-button" type="button" onClick={(event) => openTransactionAction("detail", `${record.kind}-${record.id}`, event.currentTarget)}>
                          <ReceiptText size={18} />
                          <span>View details</span>
                        </button>
                        {record.recordType && record.canEdit ? (
                          <button className="transaction-option-button" type="button" onClick={(event) => openTransactionAction("edit", `${record.kind}-${record.id}`, event.currentTarget)}>
                            <Pencil size={18} />
                            <span>{t("editTransaction")}</span>
                          </button>
                        ) : null}
                        {record.recordType && record.canRequestTransfer ? (
                          <button className="transaction-option-button" type="button" onClick={(event) => openTransactionAction("transfer", `${record.kind}-${record.id}`, event.currentTarget)}>
                            <ArrowUp size={18} />
                            <span>{t("transferTransaction")}</span>
                          </button>
                        ) : null}
                        {record.recordType && record.canDelete ? (
                          <button className="transaction-option-button danger" type="button" onClick={(event) => openTransactionAction("delete", `${record.kind}-${record.id}`, event.currentTarget)}>
                            <Trash2 size={18} />
                            <span>{t("deleteTransaction")}</span>
                          </button>
                        ) : null}
                      </div>
                    </details>
                    {(record.journey && record.journey.length > 0) || (record.journeyLanes && record.journeyLanes.length > 0) ? (
                      <div className="history-card-flow">
                        <TransactionJourney steps={record.journey} lanes={record.journeyLanes} amount={record.amount}>
                          {record.incomingTransferId ? (
                            <div className="history-transfer-actions journey-action-row">
                              <MiniAction
                                hidden={{ movement_id: record.incomingTransferId, decision: "accepted" }}
                                label={t("acceptTransfer")}
                                tone="approve"
                                action={respondPaymentTransferAction}
                                setNotice={setNotice}
                                startTransition={startTransition}
                              />
                              <MiniAction
                                hidden={{ movement_id: record.incomingTransferId, decision: "rejected" }}
                                label={t("reject")}
                                tone="reject"
                                action={respondPaymentTransferAction}
                                setNotice={setNotice}
                                startTransition={startTransition}
                              />
                            </div>
                          ) : null}
                          {record.recordType && record.canApprove ? (
                            <div className="journey-action-row" aria-label={t("approve")}>
                              {record.recordType === "payment" ? (
                                <>
                                  {record.cashApprovalStatus !== null && record.cashApprovalStatus !== undefined ? (
                                    record.cashApprovalStatus === "approved" ? (
                                      <span className="component-approved"><Check size={16} /> {t("cash")} {labelForStatus("approved", t)}</span>
                                    ) : canApproveRecordStatus(record.cashApprovalStatus) ? (
                                      <MiniAction
                                        hidden={{ record_type: record.recordType, id: record.sourceId ?? record.id, decision: "approved", payment_component: "cash" }}
                                        label={`${t("approve")} ${t("cash")}`}
                                        tone="approve"
                                        action={approveRecordAction}
                                        setNotice={setNotice}
                                        startTransition={startTransition}
                                      />
                                    ) : null
                                  ) : null}
                                  {record.onlineApprovalStatus !== null && record.onlineApprovalStatus !== undefined ? (
                                    record.onlineApprovalStatus === "approved" ? (
                                      <span className="component-owner-verification verified"><Landmark size={15} /> {t("verifiedByOwner")}</span>
                                    ) : canVerifyOnlineCollections && canApproveRecordStatus(record.onlineApprovalStatus) ? (
                                      <MiniAction
                                        hidden={{ record_type: record.recordType, id: record.sourceId ?? record.id, decision: "approved", payment_component: "online" }}
                                        label={t("verifyOnline")}
                                        tone="approve"
                                        action={approveRecordAction}
                                        setNotice={setNotice}
                                        startTransition={startTransition}
                                      />
                                    ) : (
                                      <span className="component-owner-verification pending"><Landmark size={15} /> {t("awaitingOwnerVerification")}</span>
                                    )
                                  ) : null}
                                </>
                              ) : (
                                <MiniAction
                                  hidden={{ record_type: record.recordType, id: record.sourceId ?? record.id, decision: "approved" }}
                                  label={t("approveExpense")}
                                  tone="approve"
                                  action={approveRecordAction}
                                  setNotice={setNotice}
                                  startTransition={startTransition}
                                />
                              )}
                            </div>
                          ) : record.recordType && record.approvalBlockedByTransfer ? (
                            <div className="journey-action-row">
                              <button className="mini-action tone-approve" type="button" disabled title={t("resolveTransferFirst")}>{t("resolveTransferFirst")}</button>
                            </div>
                          ) : null}
                        </TransactionJourney>
                      </div>
                    ) : record.transferLines && record.transferLines.length > 0 ? (
                      <div className="history-card-flow">
                        <div className="history-transfer-panel">
                          {record.transferLines.map((line, index) => (
                            <span key={`${line}-${index}`}>{line}</span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="operational-filter-empty">
            <p className="muted">{t("noRecordsForFilter")}</p>
          </div>
        )}
      </section>

      {transactionAction && selectedTransactionActionRecord ? (
        <div
          className="modal-layer"
          role="dialog"
          aria-modal="true"
          aria-label={transactionAction.kind === "detail" ? "Transaction details" : transactionAction.kind === "transfer" ? t("transferTransaction") : transactionAction.kind === "edit" ? t("editTransaction") : t("deleteTransaction")}
        >
          <button className="modal-backdrop" aria-label={t("closeModal")} type="button" onClick={closeTransactionAction} />
          <section className="action-sheet transaction-action-sheet">
            <header className="sheet-header">
              <div>
                <p className="eyebrow">{selectedTransactionActionRecord.title}</p>
                <h2>
                  {transactionAction.kind === "detail"
                    ? "Transaction details"
                    : transactionAction.kind === "transfer"
                    ? t("transferTransaction")
                    : transactionAction.kind === "edit"
                      ? t("editTransaction")
                      : t("deleteTransaction")}
                </h2>
                <span>{selectedTransactionActionRecord.meta} · {formatMoney(Math.abs(selectedTransactionActionRecord.amount))}</span>
              </div>
              <button className="icon-button" type="button" aria-label={t("closeModal")} onClick={closeTransactionAction}>
                <X size={18} />
              </button>
            </header>

            {transactionAction.kind === "detail" ? (
              <div className="transaction-detail-page">
                <section className="transaction-detail-summary">
                  <span>{selectedTransactionActionRecord.businessLabel ?? selectedTransactionActionRecord.meta}</span>
                  <strong className={selectedTransactionActionRecord.amount > 0 ? "positive" : selectedTransactionActionRecord.amount < 0 ? "negative" : "neutral"}>
                    {selectedTransactionActionRecord.amount >= 0 ? "+" : "-"}{formatMoney(Math.abs(selectedTransactionActionRecord.amount))}
                  </strong>
                  {selectedPayment ? <PaymentAmountSplit cashAmount={paymentCashAmount(selectedPayment)} onlineAmount={paymentOnlineAmount(selectedPayment)} /> : null}
                </section>
                <dl className="transaction-detail-grid">
                  <div><dt>Made by</dt><dd>{profileName(profiles, selectedTransactionActionRecord.ownerId, t)}</dd></div>
                  <div><dt>Date and time</dt><dd>{selectedTransactionActionRecord.date} · {formatIndiaTime(selectedTransactionActionRecord.sortAt)}</dd></div>
                  {selectedPayment?.customer_name ? <div><dt>For</dt><dd>{selectedPayment.customer_name}</dd></div> : null}
                  {selectedPayment?.roll_number ? <div><dt>Roll number</dt><dd>{selectedPayment.roll_number}</dd></div> : null}
                  {selectedPayment?.room_number_snapshot ? <div><dt>Room</dt><dd>{selectedPayment.room_number_snapshot}</dd></div> : null}
                  {selectedPayment?.seat_number ? <div><dt>Seat</dt><dd>{selectedPayment.seat_number}</dd></div> : null}
                  {selectedPayment?.description || selectedExpense?.description ? <div className="full"><dt>Purpose</dt><dd>{selectedPayment?.description ?? selectedExpense?.description}</dd></div> : null}
                  {selectedPayment?.remark || selectedExpense?.remark ? <div className="full"><dt>Note</dt><dd>{selectedPayment?.remark ?? selectedExpense?.remark}</dd></div> : null}
                </dl>
                {selectedTransactionActionRecord.journey?.length || selectedTransactionActionRecord.journeyLanes?.length ? (
                  <section>
                    <h3>Transaction flow</h3>
                    <TransactionJourney
                      steps={selectedTransactionActionRecord.journey}
                      lanes={selectedTransactionActionRecord.journeyLanes}
                      amount={selectedTransactionActionRecord.amount}
                    />
                  </section>
                ) : null}
                {selectedTransactionActionRecord.transferLines?.length ? <section><h3>Transfer activity</h3><div className="history-transfer-panel">{selectedTransactionActionRecord.transferLines.map((line, index) => <span key={`${line}-${index}`}>{line}</span>)}</div></section> : null}
                {attachmentRecord ? (
                  <section>
                    <h3>Attachment</h3>
                    {attachmentQuery.data?.url ? (
                      <a className="transaction-attachment" href={attachmentQuery.data.url} target="_blank" rel="noreferrer">Open attachment</a>
                    ) : attachmentQuery.isPending ? (
                      <p className="muted">Preparing attachment…</p>
                    ) : (
                      <p className="muted">Attachment is unavailable.</p>
                    )}
                  </section>
                ) : null}
              </div>
            ) : null}

            {transactionAction.kind === "transfer" ? (
              <form
                className="form-grid"
                onSubmit={(event) => submitAndClose(event, requestPaymentTransferAction, setTransactionNotice, startTransition, closeTransactionAction)}
              >
                {transactionActionNotice ? (
                  <p
                    className={transactionActionNotice.ok ? transactionActionNotice.warning ? "form-warning full-span" : "form-success full-span" : "form-error full-span"}
                    role={transactionActionNotice.ok ? "status" : "alert"}
                    aria-live={transactionActionNotice.ok ? "polite" : "assertive"}
                  >
                    {transactionActionNotice.message}
                    {transactionActionNotice.warning ? ` ${transactionActionNotice.warning}` : ""}
                    {transactionActionNotice.errorId ? ` Error ID: ${transactionActionNotice.errorId}.` : ""}
                  </p>
                ) : null}
                <input type="hidden" name="payment_id" value={selectedTransactionSourceId} />
                <SearchableProfileSelect
                  label={t("transferToStaff")}
                  name="to_profile_id"
                  profiles={selectedTransactionActionRecord.transferRecipients ?? []}
                />
                <label className="full-span">
                  {t("note")}
                  <input name="note" placeholder={t("optional")} />
                </label>
                <button className="primary-button full-span" type="submit">{t("transferTransaction")}</button>
              </form>
            ) : null}

            {transactionAction.kind === "edit" ? (
              <form
                className="form-grid"
                onSubmit={(event) => submitAndClose(event, updateRecordAction, setTransactionNotice, startTransition, closeTransactionAction)}
              >
                {transactionActionNotice ? (
                  <p className={transactionActionNotice.ok ? "form-success full-span" : "form-error full-span"} role={transactionActionNotice.ok ? "status" : "alert"}>
                    {transactionActionNotice.message}{transactionActionNotice.errorId ? ` Error ID: ${transactionActionNotice.errorId}.` : ""}
                  </p>
                ) : null}
                <input type="hidden" name="record_type" value={selectedTransactionActionRecord.recordType} />
                <input type="hidden" name="id" value={selectedTransactionSourceId} />
                <label>
                  {t("amount")}
                  <input name="amount" type="number" min="1" step="0.01" defaultValue={selectedTransactionActionRecord.editAmount} required />
                </label>
                <label>
                  {selectedTransactionActionRecord.recordType === "payment" ? t("paymentDate") : t("expenseDate")}
                  <input name="date" type="date" defaultValue={selectedTransactionActionRecord.editDate} required />
                </label>
                <label className="full-span">
                  {t("description")}
                  <input
                    name="description"
                    defaultValue={selectedTransactionActionRecord.description}
                    required={selectedTransactionActionRecord.recordType === "expense"}
                  />
                </label>
                <label className="full-span">
                  {t("remark")}
                  <input name="remark" defaultValue={selectedTransactionActionRecord.remark} />
                </label>
                <button className="primary-button full-span" type="submit">{t("editTransaction")}</button>
              </form>
            ) : null}

            {transactionAction.kind === "delete" ? (
              <form
                className="form-grid"
                onSubmit={(event) => submitAndClose(event, cancelRecordAction, setTransactionNotice, startTransition, closeTransactionAction)}
              >
                {transactionActionNotice ? (
                  <p className={transactionActionNotice.ok ? "form-success full-span" : "form-error full-span"} role={transactionActionNotice.ok ? "status" : "alert"}>
                    {transactionActionNotice.message}{transactionActionNotice.errorId ? ` Error ID: ${transactionActionNotice.errorId}.` : ""}
                  </p>
                ) : null}
                <input type="hidden" name="record_type" value={selectedTransactionActionRecord.recordType} />
                <input type="hidden" name="id" value={selectedTransactionSourceId} />
                <label className="full-span">
                  {t("reasonRequired")}
                  <input name="reason" placeholder={t("reasonRequired")} required />
                </label>
                <button className="primary-button danger full-span" type="submit">{t("deleteTransaction")}</button>
              </form>
            ) : null}
          </section>
        </div>
      ) : null}

    </div>
  );
}

async function copyReferralCode(code: string | null, setNotice: (notice: ActionResult | null) => void, t: (key: string) => string) {
  if (!code) {
    setNotice({ ok: false, message: t("referralCodeUnavailable") });
    return;
  }

  try {
    await navigator.clipboard.writeText(code);
    setNotice({ ok: true, message: t("referralCodeCopied") });
  } catch {
    setNotice({ ok: false, message: t("referralCodeUnavailable") });
  }
}

async function shareReferralCode(code: string | null, setNotice: (notice: ActionResult | null) => void, t: (key: string) => string) {
  if (!code) {
    setNotice({ ok: false, message: t("referralCodeUnavailable") });
    return;
  }

  const text = `Lenden referral code: ${code}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: "Lenden", text });
      return;
    }
    await copyReferralCode(code, setNotice, t);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    await copyReferralCode(code, setNotice, t);
  }
}

function AgentCodePanel({
  profile,
  referrals,
  setNotice,
}: {
  profile: Profile;
  referrals: ReferralCode[];
  setNotice: (notice: ActionResult | null) => void;
}) {
  const { t } = useLanguage();
  const activeCodes = referrals.filter((referral) => referral.active);

  return (
    <section className="agent-code-panel">
      <div className="agent-code-header">
        <div className="agent-code-brand">
          <img src="/icon-192.png" alt="Lenden logo" />
          <div>
            <p className="eyebrow">{t("salesAgent")}</p>
            <h2>{profile.full_name}</h2>
          </div>
        </div>
        <span className="agent-code-brand-name">Lenden</span>
      </div>
      <div className="agent-code-grid">
        {activeCodes.length > 0 ? activeCodes.map((referral) => (
          <article className="agent-code-card" key={referral.id}>
            <div>
              <p>{t("agentCode")}</p>
              <strong>{referral.code}</strong>
            </div>
            <div className="agent-code-actions">
              <button
                type="button"
                aria-label={t("copyReferralCode")}
                title={t("copyReferralCode")}
                onClick={() => void copyReferralCode(referral.code, setNotice, t)}
              >
                <Copy size={17} />
              </button>
              <button
                type="button"
                aria-label={t("shareReferralCode")}
                title={t("shareReferralCode")}
                onClick={() => void shareReferralCode(referral.code, setNotice, t)}
              >
                <Share2 size={17} />
              </button>
            </div>
          </article>
        )) : (
          <article className="agent-code-card agent-code-empty">
            <div>
              <p>{t("agentCode")}</p>
              <strong>{t("noReferralCode")}</strong>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}

function AgentIncentivePanel({ summary }: { summary: AgentIncentiveSummary }) {
  const { t } = useLanguage();

  return (
    <section className="agent-summary">
      <StatCard label={t("incentiveEarned")} value={formatMoney(summary.earned)} icon={<WalletCards size={20} />} tone="total" />
      <StatCard label={t("confirmedPayouts")} value={formatMoney(summary.settled)} icon={<ShieldCheck size={20} />} tone="cash" />
      <StatCard label={t("pendingPayout")} value={formatMoney(summary.pending)} icon={<ReceiptText size={20} />} tone="online" />
      <StatCard label={t("balanceIncentive")} value={formatMoney(summary.balance)} icon={<Banknote size={20} />} tone="general" />
    </section>
  );
}

function BottomActions({
  canAddPositive,
  canAddNegative,
  onPositive,
  onNegative,
}: {
  canAddPositive: boolean;
  canAddNegative: boolean;
  onPositive: () => void;
  onNegative: () => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="quick-actions fixed bottom-24 md:bottom-8 right-4 md:right-8 flex flex-col gap-3 z-50" aria-label={t("quickActions")}>
      <button
        className="quick-action-button quick-action-positive flex items-center gap-2 bg-primary text-on-primary px-5 py-3 rounded-full shadow-soft hover:scale-105 transition-all active:scale-95 font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        type="button"
        aria-label={t("moneyIn")}
        disabled={!canAddPositive}
        onClick={onPositive}
      >
        <Plus size={19} />
      </button>
      <button
        className="quick-action-button quick-action-negative flex items-center gap-2 bg-error text-on-error px-5 py-3 rounded-full shadow-soft hover:scale-105 transition-all active:scale-95 font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        type="button"
        aria-label={t("moneyOut")}
        disabled={!canAddNegative}
        onClick={onNegative}
      >
        <Minus size={19} />
      </button>
    </div>
  );
}


function displayTime(value: string | null) {
  return value ? value.slice(0, 5) : "";
}

function timeToMinutes(value: string | null | undefined) {
  const match = value?.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function currentMinuteOfDay() {
  return indiaMinuteOfDay();
}

function isTimeRangeLiveNow(startTime: string | null | undefined, endTime: string | null | undefined, minuteOfDay: number) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null || start === end) return false;
  if (start < end) return minuteOfDay >= start && minuteOfDay < end;
  return minuteOfDay >= start || minuteOfDay < end;
}

function isLibraryStudentLiveNow(student: LibraryStudent, minuteOfDay: number) {
  return isTimeRangeLiveNow(student.start_time, student.end_time, minuteOfDay)
    || (student.extra_time_slots ?? []).some((slot) => isTimeRangeLiveNow(slot.start, slot.end, minuteOfDay));
}

function displayDate(value: string | null | undefined) {
  if (!value) return "-";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function displayDateRange(startDate: string | null | undefined, endDate: string | null | undefined, t: (key: string) => string) {
  if (startDate && endDate) return `${displayDate(startDate)} - ${displayDate(endDate)}`;
  if (endDate) return `${t("until")} ${displayDate(endDate)}`;
  if (startDate) return `${t("from")} ${displayDate(startDate)}`;
  return "-";
}

function isoDateUtcMs(value: string | null | undefined) {
  const dateText = value?.slice(0, 10);
  if (!dateText || !/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;
  const [year, month, day] = dateText.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function daysBetweenIsoDates(from: string, to: string | null | undefined) {
  const fromMs = isoDateUtcMs(from);
  const toMs = isoDateUtcMs(to);
  if (fromMs === null || toMs === null) return null;
  return Math.round((toMs - fromMs) / 86400000);
}

function subscriptionExpiryStatusLabel(endDate: string | null | undefined, today: string, t: (key: string) => string) {
  const dayDelta = daysBetweenIsoDates(today, endDate);
  if (dayDelta === null) return t("expiryNotSet");
  const dayCount = Math.abs(dayDelta);
  const dayLabel = dayCount === 1 ? t("day") : t("days");
  if (dayDelta < 0) return `${t("expired")} ${dayCount} ${dayLabel} ${t("ago")}`;
  if (dayDelta === 0) return t("expiresToday");
  return `${dayDelta} ${dayLabel} ${t("remainingSuffix")}`;
}

function libraryExpiryStatusLabel(student: LibraryStudent, today: string, t: (key: string) => string) {
  return subscriptionExpiryStatusLabel(student.subscription_end_date, today, t);
}

function displayTimeRange(startTime: string | null, endTime: string | null) {
  const asTwelveHourTime = (value: string | null) => {
    const normalized = displayTime(value);
    const minutes = timeToMinutes(normalized);
    if (minutes === null) return "";
    const hours = Math.floor(minutes / 60);
    const minuteText = String(minutes % 60).padStart(2, "0");
    return `${hours % 12 || 12}:${minuteText} ${hours < 12 ? "AM" : "PM"}`;
  };
  const start = asTwelveHourTime(startTime);
  const end = asTwelveHourTime(endTime);
  if (start && end) return `${start}-${end}`;
  return start || end || "-";
}

function displayTextValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "-";
  const text = String(value).trim();
  return text || "-";
}

const libraryRenewalReminderMessage =
  "आपका लाइब्रेरी का सब्सक्रिप्शन समाप्त हो गया है। लाइब्रेरी जारी रखने के लिए अपना सब्सक्रिप्शन रिन्यू करवाएँ। "
  + "या सब्सक्रिप्शन पॉज़ या बंद करने के लिए संस्थान को सूचित करें।";

/** Opens the student's WhatsApp chat with the renewal reminder prefilled (Indian numbers get +91). */
function studentWhatsAppHref(phoneNumber: string | null | undefined, message: string) {
  let digits = phoneNumber?.replace(/\D/g, "") ?? "";
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 11) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Search is mostly by roll number: exact roll, then roll prefix, then roll contains, then the rest. */
function rollSearchRank(rollNumber: string | null | undefined, search: string) {
  const roll = (rollNumber ?? "").trim().replace(/\.0+$/, "").toLowerCase();
  const term = search.trim().toLowerCase();
  if (!term || !roll) return 3;
  if (roll === term) return 0;
  if (roll.startsWith(term)) return 1;
  if (roll.includes(term)) return 2;
  return 3;
}

function studentPhoneHref(phoneNumber: string | null | undefined) {
  const normalized = phoneNumber?.trim().replace(/[^\d+]/g, "");
  return normalized ? `tel:${normalized}` : null;
}

function displayMoneyValue(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : formatMoney(value);
}

function rollSortValue(value: string | null | undefined) {
  const normalized = normalizeLibraryRollNumberForView(value);
  if (!normalized) return { numeric: null, text: "" };
  return /^\d+$/.test(normalized)
    ? { numeric: Number(normalized), text: normalized.padStart(12, "0") }
    : { numeric: null, text: normalized.toLowerCase() };
}

function compareLibraryRollNumbers(a: string | null | undefined, b: string | null | undefined) {
  const left = rollSortValue(a);
  const right = rollSortValue(b);
  if (left.numeric !== null && right.numeric !== null && left.numeric !== right.numeric) {
    return left.numeric - right.numeric;
  }
  if (left.numeric !== null && right.numeric === null) return -1;
  if (left.numeric === null && right.numeric !== null) return 1;
  return left.text.localeCompare(right.text, undefined, { numeric: true, sensitivity: "base" });
}

function compareLibraryStudentsByExpiry(a: LibraryStudent, b: LibraryStudent, t: (key: string) => string) {
  const aExpiry = isoDateUtcMs(a.subscription_end_date);
  const bExpiry = isoDateUtcMs(b.subscription_end_date);
  if (aExpiry !== null && bExpiry !== null && aExpiry !== bExpiry) return aExpiry - bExpiry;
  if (aExpiry !== null && bExpiry === null) return -1;
  if (aExpiry === null && bExpiry !== null) return 1;

  return (
    compareLibraryRollNumbers(studentDisplayRollNumber(a), studentDisplayRollNumber(b)) ||
    studentDisplayName(a, t).localeCompare(studentDisplayName(b, t), undefined, { sensitivity: "base" })
  );
}

function isExpiredLibraryStudent(student: LibraryStudent, today: string) {
  return student.active && !student.placeholder && Boolean(student.subscription_end_date && student.subscription_end_date < today);
}

function studentDisplayName(student: LibraryStudent, t: (key: string) => string) {
  if (studentHasSwappedRollAndName(student)) return student.roll_number;
  return student.student_name || `${t("roll")} ${student.roll_number}`;
}

function normalizeLibraryRollNumberForView(value: string | null | undefined) {
  const normalized = value?.trim().replace(/\.0+$/, "");
  return normalized || null;
}

function libraryRollKey(value: string | null | undefined) {
  return normalizeLibraryRollNumberForView(value)?.toLowerCase() ?? null;
}

function libraryStudentRollKey(student: LibraryStudent) {
  return libraryRollKey(studentDisplayRollNumber(student));
}

function isNumericLibraryRoll(value: string | null | undefined) {
  const normalized = normalizeLibraryRollNumberForView(value);
  return Boolean(normalized && /^\d+$/.test(normalized));
}

function studentHasSwappedRollAndName(student: LibraryStudent) {
  const rollNumber = normalizeLibraryRollNumberForView(student.roll_number);
  const studentName = student.student_name?.trim() ?? "";
  return Boolean(rollNumber && studentName && !isNumericLibraryRoll(rollNumber) && isNumericLibraryRoll(studentName) && /[a-z]/i.test(rollNumber));
}

function studentDisplayRollNumber(student: LibraryStudent) {
  return studentHasSwappedRollAndName(student) ? student.student_name?.trim() ?? student.roll_number : student.roll_number;
}

function StudentAvatar({
  displayName,
  imageUrl,
  className = "",
}: {
  displayName: string;
  imageUrl?: string | null;
  className?: string;
}) {
  return (
    <span className={`library-student-photo ${className}`}>
      <SafeAvatarImage
        alt={`${displayName} photo`}
        className="library-student-photo-image"
        fullName={displayName}
        avatarUrl={imageUrl}
      />
    </span>
  );
}

function StudentPhoto({
  student,
  displayName,
  className = "",
}: {
  student: LibraryStudent;
  displayName: string;
  className?: string;
}) {
  return <StudentAvatar displayName={displayName} imageUrl={student.photo_url} className={className} />;
}

async function compressUploadImage(file: File) {
  if (!file.type.startsWith("image/")) return file;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const maxDimension = 1280;
    const scale = Math.min(maxDimension / bitmap.width, maxDimension / bitmap.height, 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    let compressedBlob: Blob | null = null;
    for (const quality of [0.82, 0.72, 0.62]) {
      compressedBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (compressedBlob && compressedBlob.size <= 1024 * 1024) break;
    }
    if (!compressedBlob || compressedBlob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "student-photo";
    return new File([compressedBlob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}

type CropRect = { x: number; y: number; w: number; h: number };
type CropDrag = { mode: "move" | "nw" | "ne" | "sw" | "se"; startX: number; startY: number; start: CropRect };

function loadImageElement(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read the photo."));
    image.src = url;
  });
}

function canvasToFile(canvas: HTMLCanvasElement, name: string) {
  return new Promise<File | null>((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob ? new File([blob], name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : null),
      "image/jpeg",
      0.92,
    );
  });
}

/** Crop (and rotate) a freshly taken or picked photo before it is compressed and uploaded. */
function ImageCropDialog({
  file,
  square,
  onCancel,
  onConfirm,
}: {
  file: File;
  square: boolean;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}) {
  const { t } = useLanguage();
  // The object URL is released when the photo is replaced or the dialog closes (not in an
  // effect: a development remount would revoke it before the image loads).
  const [source, setSource] = useState(() => ({ file, url: URL.createObjectURL(file) }));
  const sourceFile = source.file;
  const sourceUrl = source.url;

  const [rect, setRect] = useState<CropRect>({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
  const [busy, setBusy] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<CropDrag | null>(null);

  const close = (result: File | null) => {
    URL.revokeObjectURL(sourceUrl);
    if (result) onConfirm(result);
    else onCancel();
  };

  function startFrame(image: HTMLImageElement) {
    // Student photos start as a centred square; documents start at nearly the whole image.
    if (!square) {
      setRect({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
      return;
    }
    const aspect = image.naturalWidth / Math.max(image.naturalHeight, 1);
    const w = aspect >= 1 ? 0.9 / aspect : 0.9;
    const h = aspect >= 1 ? 0.9 : 0.9 * aspect;
    setRect({ x: (1 - w) / 2, y: (1 - h) / 2, w, h });
  }

  function beginDrag(mode: CropDrag["mode"], event: React.PointerEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = { mode, startX: event.clientX, startY: event.clientY, start: rect };
  }

  function moveDrag(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    const frame = frameRef.current;
    if (!drag || !frame) return;
    const bounds = frame.getBoundingClientRect();
    const dx = (event.clientX - drag.startX) / Math.max(bounds.width, 1);
    const dy = (event.clientY - drag.startY) / Math.max(bounds.height, 1);
    const minSize = 0.08;
    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
    const start = drag.start;
    if (drag.mode === "move") {
      setRect({ ...start, x: clamp(start.x + dx, 0, 1 - start.w), y: clamp(start.y + dy, 0, 1 - start.h) });
      return;
    }
    let { x, y, w, h } = start;
    if (drag.mode.includes("w")) {
      const nextX = clamp(start.x + dx, 0, start.x + start.w - minSize);
      w = start.w + (start.x - nextX);
      x = nextX;
    } else {
      w = clamp(start.w + dx, minSize, 1 - start.x);
    }
    if (drag.mode.includes("n")) {
      const nextY = clamp(start.y + dy, 0, start.y + start.h - minSize);
      h = start.h + (start.y - nextY);
      y = nextY;
    } else {
      h = clamp(start.h + dy, minSize, 1 - start.y);
    }
    if (square) {
      // Keep the frame square on screen: follow the larger change, within the image.
      const pxW = w * bounds.width;
      const pxH = h * bounds.height;
      const side = Math.min(Math.max(pxW, pxH), drag.mode.includes("w") ? (start.x + start.w) * bounds.width : (1 - start.x) * bounds.width,
        drag.mode.includes("n") ? (start.y + start.h) * bounds.height : (1 - start.y) * bounds.height);
      w = side / bounds.width;
      h = side / bounds.height;
      if (drag.mode.includes("w")) x = start.x + start.w - w;
      if (drag.mode.includes("n")) y = start.y + start.h - h;
    }
    setRect({ x, y, w, h });
  }

  function endDrag() {
    dragRef.current = null;
  }

  async function rotate() {
    if (!sourceUrl || busy) return;
    setBusy(true);
    try {
      const image = await loadImageElement(sourceUrl);
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalHeight;
      canvas.height = image.naturalWidth;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.translate(canvas.width, 0);
      context.rotate(Math.PI / 2);
      context.drawImage(image, 0, 0);
      const rotated = await canvasToFile(canvas, sourceFile.name);
      if (rotated) {
        URL.revokeObjectURL(sourceUrl);
        setSource({ file: rotated, url: URL.createObjectURL(rotated) });
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!sourceUrl || busy) return;
    setBusy(true);
    try {
      const fullFrame = rect.x <= 0.001 && rect.y <= 0.001 && rect.w >= 0.999 && rect.h >= 0.999;
      if (fullFrame) {
        close(sourceFile);
        return;
      }
      const image = await loadImageElement(sourceUrl);
      const sx = Math.round(rect.x * image.naturalWidth);
      const sy = Math.round(rect.y * image.naturalHeight);
      const sw = Math.max(1, Math.round(rect.w * image.naturalWidth));
      const sh = Math.max(1, Math.round(rect.h * image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const context = canvas.getContext("2d");
      if (!context) {
        close(sourceFile);
        return;
      }
      context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
      const cropped = await canvasToFile(canvas, sourceFile.name);
      close(cropped ?? sourceFile);
    } finally {
      setBusy(false);
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="image-crop-layer" role="dialog" aria-modal="true" aria-label={t("cropPhoto")}>
      <header className="image-crop-header">
        <button className="image-crop-text-button" type="button" onClick={() => close(null)}>{t("cancel")}</button>
        <strong>{t("cropPhoto")}</strong>
        <button className="image-crop-text-button primary" type="button" onClick={() => void confirm()} disabled={busy || !sourceUrl}>
          {t("done")}
        </button>
      </header>
      <div className="image-crop-stage">
        {sourceUrl ? (
          <div
            className="image-crop-frame"
            ref={frameRef}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sourceUrl} alt="" draggable={false} onLoad={(event) => startFrame(event.currentTarget)} />
            <div
              className="image-crop-rect"
              style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
              onPointerDown={(event) => beginDrag("move", event)}
            >
              {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                <span
                  key={corner}
                  className={`image-crop-handle ${corner}`}
                  onPointerDown={(event) => beginDrag(corner, event)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <footer className="image-crop-footer">
        <button className="image-crop-tool" type="button" onClick={() => void rotate()} disabled={busy}>
          <RotateCw size={18} /> {t("rotate")}
        </button>
        <button className="image-crop-tool" type="button" onClick={() => setRect({ x: 0, y: 0, w: 1, h: 1 })} disabled={busy}>
          <Crop size={18} /> {t("fullPhoto")}
        </button>
      </footer>
    </div>,
    document.body,
  );
}

const rosterExpiringSoonDays = 7;
const studentPauseGraceDays = 45;

/** Paused = inactive but may return within 45 days without an admission fee. */
function studentPauseState(active: boolean, pausedAt: string | null | undefined) {
  if (active) return { state: "active" as const, daysLeft: 0 };
  if (!pausedAt) return { state: "inactive" as const, daysLeft: 0 };
  const elapsedDays = Math.floor((Date.now() - new Date(pausedAt).getTime()) / 86400000);
  const daysLeft = studentPauseGraceDays - elapsedDays;
  return daysLeft > 0 ? { state: "paused" as const, daysLeft } : { state: "inactive" as const, daysLeft: 0 };
}

/** Inactive tab default order: paused first (latest pause on top), then inactive (longest inactive first). */
function comparePausedThenInactive(
  a: { active: boolean; pausedAt?: string | null; inactiveAt?: string | null },
  b: { active: boolean; pausedAt?: string | null; inactiveAt?: string | null },
) {
  const aPaused = studentPauseState(a.active, a.pausedAt).state === "paused";
  const bPaused = studentPauseState(b.active, b.pausedAt).state === "paused";
  if (aPaused !== bPaused) return aPaused ? -1 : 1;
  if (aPaused) return (b.pausedAt ?? "").localeCompare(a.pausedAt ?? "");
  if (!a.inactiveAt || !b.inactiveAt) return a.inactiveAt ? -1 : b.inactiveAt ? 1 : 0;
  return a.inactiveAt.localeCompare(b.inactiveAt);
}

function rosterFlagLabel(flag: StudentRosterFlag, t: (key: string) => string) {
  if (flag === "full_time") return t("fullTime");
  if (flag === "seat") return t("seatAssigned");
  if (flag === "locker") return t("lockerAssigned");
  return t("expiringSoon");
}

type StudentRosterSortKey = "expiry" | "roll" | "name" | "seat";
const studentRosterNaturalCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** Text that holds numbers (roll, seat) in number order: "2" before "10"; blanks last. */
function compareNaturalText(left: string | null | undefined, right: string | null | undefined) {
  const a = left?.trim() ?? "";
  const b = right?.trim() ?? "";
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  return studentRosterNaturalCollator.compare(a, b);
}

function StudentRosterFilterSheet({
  flags,
  sort,
  library,
  onApply,
  onClose,
}: {
  flags: StudentRosterFlag[];
  sort: StudentRosterSortKey;
  library: boolean;
  onApply: (flags: StudentRosterFlag[], sort: StudentRosterSortKey) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<StudentRosterFlag[]>(flags);
  const [draftSort, setDraftSort] = useState<StudentRosterSortKey>(sort);
  // Seat order applies to library students only.
  const sortOptions: { value: StudentRosterSortKey; label: string }[] = [
    { value: "expiry", label: t("sortExpiry") },
    { value: "roll", label: t("rollNumber") },
    { value: "name", label: t("name") },
    ...(library ? [{ value: "seat" as const, label: t("seatNumber") }] : []),
  ];
  // Seats and lockers exist only for library students.
  const options: StudentRosterFlag[] = library ? ["full_time", "seat", "locker", "expiring"] : ["full_time", "expiring"];
  const toggle = (flag: StudentRosterFlag) =>
    setDraft((current) => current.includes(flag) ? current.filter((item) => item !== flag) : [...current, flag]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label={t("filters")}>
      <button className="modal-backdrop" aria-label={t("closeModal")} type="button" onClick={onClose} />
      <section className="action-sheet student-filter-sheet">
        <header className="sheet-header">
          <div>
            <p className="eyebrow">{t("students")}</p>
            <h2>{t("filters")}</h2>
          </div>
          <button className="icon-button" type="button" aria-label={t("closeModal")} onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="student-filter-chips">
          {options.map((flag) => (
            <button
              key={flag}
              type="button"
              aria-pressed={draft.includes(flag)}
              className={`filter-chip ${draft.includes(flag) ? "active" : ""}`}
              onClick={() => toggle(flag)}
            >
              {draft.includes(flag) ? <Check size={14} aria-hidden="true" /> : null}
              {rosterFlagLabel(flag, t)}
            </button>
          ))}
        </div>
        <p className="date-filter-note">{t("expiringSoonHelp")}</p>
        <h3 className="student-filter-heading">{t("sortBy")}</h3>
        <div className="student-filter-chips" role="radiogroup" aria-label={t("sortBy")}>
          {sortOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={draftSort === option.value}
              className={`filter-chip ${draftSort === option.value ? "active" : ""}`}
              onClick={() => setDraftSort(option.value)}
            >
              {draftSort === option.value ? <Check size={14} aria-hidden="true" /> : null}
              {option.label}
            </button>
          ))}
        </div>
        <div className="student-subscription-edit-actions">
          <button className="secondary-button" type="button" onClick={() => { setDraft([]); setDraftSort("expiry"); }}>{t("clearFilters")}</button>
          <button className="primary-button" type="button" onClick={() => onApply(draft, draftSort)}>{t("applyFilters")}</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

// New-student photos are kept on the device until the student is saved, so closing the app
// does not lose them. Drafts expire after a day so an old photo never lands on a new student.
const photoDraftDbName = "lenden-photo-drafts";
const photoDraftMaxAgeMs = 24 * 60 * 60 * 1000;

function openPhotoDraftDb() {
  return new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = indexedDB.open(photoDraftDbName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("drafts");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function photoDraftRequest<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openPhotoDraftDb();
  if (!db) return null;
  return new Promise<T | null>((resolve) => {
    try {
      const request = run(db.transaction("drafts", mode).objectStore("drafts"));
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  }).finally(() => db.close());
}

function savePhotoDraft(key: string, file: File) {
  return photoDraftRequest("readwrite", (store) => store.put({ file, name: file.name, type: file.type, savedAt: Date.now() }, key));
}

async function loadPhotoDraft(key: string) {
  const draft = await photoDraftRequest<{ file: Blob; name: string; type: string; savedAt: number }>("readonly", (store) => store.get(key));
  if (!draft) return null;
  if (Date.now() - draft.savedAt > photoDraftMaxAgeMs) {
    void deletePhotoDraft(key);
    return null;
  }
  return new File([draft.file], draft.name || "photo.jpg", { type: draft.type || "image/jpeg" });
}

function deletePhotoDraft(key: string) {
  return photoDraftRequest("readwrite", (store) => store.delete(key));
}

const studentRecordIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TimeSlotValue = { start: string; end: string };

function clockMinutes(value: string | null | undefined) {
  const [hours, minutes] = (value ?? "").slice(0, 5).split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : 0;
}

/** Slots must each end after they start and must not overlap one another. */
function timeSlotsProblem(slots: TimeSlotValue[], t: (key: string) => string) {
  if (slots.some((slot) => !slot.start || !slot.end || clockMinutes(slot.end) <= clockMinutes(slot.start))) {
    return t("slotEndAfterStart");
  }
  const sorted = [...slots].sort((a, b) => clockMinutes(a.start) - clockMinutes(b.start));
  for (let index = 1; index < sorted.length; index += 1) {
    if (clockMinutes(sorted[index].start) < clockMinutes(sorted[index - 1].end)) return t("slotsOverlap");
  }
  return null;
}

/** A one-hour slot right after the latest booked slot (capped at 10 PM). */
function nextFreeSlot(slots: TimeSlotValue[]): TimeSlotValue {
  const latestEnd = Math.max(...slots.map((slot) => clockMinutes(slot.end)), 6 * 60);
  const start = Math.min(latestEnd, 21 * 60);
  const toClock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return { start: toClock(start), end: toClock(Math.min(start + 60, 22 * 60)) };
}

/** First slot plus any extra slots, e.g. "7:00 AM-10:00 AM, 4:00 PM-8:00 PM". */
function displayTimeSlots(startTime: string | null | undefined, endTime: string | null | undefined, extra: TimeSlotValue[] | null | undefined) {
  return [displayTimeRange(startTime ?? null, endTime ?? null), ...(extra ?? []).map((slot) => displayTimeRange(slot.start, slot.end))]
    .filter((value) => value && value !== "-")
    .join(", ") || "-";
}

/** Subscription edit: first slot plus (library) extra slots, kept free of overlaps. */
function SubscriptionSlotsFields({
  startTime: initialStart,
  endTime: initialEnd,
  extraSlots: initialExtras,
}: {
  startTime: string;
  endTime: string;
  /** null = course (single slot only). */
  extraSlots: TimeSlotValue[] | null;
}) {
  const { t } = useLanguage();
  const [startTime, setStartTime] = useState(initialStart);
  const [endTime, setEndTime] = useState(initialEnd);
  const [extras, setExtras] = useState<TimeSlotValue[]>(
    (initialExtras ?? []).map((slot) => ({ start: slot.start.slice(0, 5), end: slot.end.slice(0, 5) })),
  );
  const problem = timeSlotsProblem([{ start: startTime, end: endTime }, ...extras], t);
  const validityRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    validityRef.current?.setCustomValidity(problem ?? "");
  }, [problem]);
  const updateExtra = (index: number, key: "start" | "end", value: string) =>
    setExtras((current) => current.map((slot, slotIndex) => slotIndex === index ? { ...slot, [key]: value } : slot));

  return (
    <>
      <label>
        {t("startTime")}
        <input type="time" name="start_time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
      </label>
      <label>
        {t("endTime")}
        <input type="time" name="end_time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required />
      </label>
      {initialExtras !== null ? (
        <div className="extra-slots full-span">
          {extras.map((slot, index) => (
            <div className="extra-slot-row" key={index}>
              <label>
                {t("startTime")} {index + 2}
                <input type="time" value={slot.start} onChange={(event) => updateExtra(index, "start", event.target.value)} required />
              </label>
              <label>
                {t("endTime")} {index + 2}
                <input type="time" value={slot.end} onChange={(event) => updateExtra(index, "end", event.target.value)} required />
              </label>
              <button
                className="icon-button extra-slot-remove"
                type="button"
                aria-label={t("removeSlot")}
                onClick={() => setExtras((current) => current.filter((_, slotIndex) => slotIndex !== index))}
              >
                <X size={16} />
              </button>
            </div>
          ))}
          <button className="secondary-button extra-slot-add" type="button" onClick={() => setExtras((current) => [...current, nextFreeSlot([{ start: startTime, end: endTime }, ...current])])}>
            <Plus size={16} /> {t("addSlot")}
          </button>
          {problem ? <p className="form-error">{problem}</p> : null}
          <input type="hidden" name="extra_time_slots" value={JSON.stringify(extras)} />
          <input ref={validityRef} className="slot-validity" tabIndex={-1} aria-hidden="true" value={problem ? "" : "ok"} onChange={() => undefined} />
        </div>
      ) : null}
    </>
  );
}

const libraryFullTimeStart = "07:00";
const libraryFullTimeEnd = "22:00";

function CompressedImageInput({
  inputName,
  label,
  previewLabel,
  displayName = "",
  initialImageUrl,
  variant,
  autoSave = null,
  draftKey,
}: {
  inputName: "student_photo" | "aadhar_photo" | "aadhar_back_photo" | "photo";
  label: string;
  previewLabel: string;
  displayName?: string;
  initialImageUrl?: string | null;
  variant: "student" | "document";
  /** Existing student: save each chosen photo to their record straight away. */
  autoSave?: { studentType: "library" | "course"; studentId: string } | null;
  /** New-student forms: keep the chosen photo on the device until the form is submitted. */
  draftKey?: string;
}) {
  const { t } = useLanguage();
  const autoSaveTarget = autoSave && studentRecordIdPattern.test(autoSave.studentId) ? autoSave : null;
  const draftStorageKey = draftKey ? `${draftKey}:${inputName}` : null;
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "restored" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  // The named input is the one submitted (Gallery). Android opens only the gallery for a plain
  // file input, so a separate capture input takes the photo and hands it over to the named one.
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState(initialImageUrl ?? null);
  const [preparing, setPreparing] = useState(false);
  const [hasSelectedPhoto, setHasSelectedPhoto] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);

  function releaseObjectUrl() {
    if (!objectUrlRef.current) return;
    URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }

  function showFilePreview(file: File) {
    releaseObjectUrl();
    const nextUrl = URL.createObjectURL(file);
    objectUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
  }

  useEffect(() => {
    const input = inputRef.current;
    const form = input?.form;
    const resetPreview = () => {
      releaseObjectUrl();
      setPreviewUrl(initialImageUrl ?? null);
      setPreparing(false);
      setHasSelectedPhoto(false);
      setSaveState("idle");
      if (input) preparedPhotoFiles.delete(input);
      // A submitted (reset) form no longer needs its photo draft.
      if (draftStorageKey) void deletePhotoDraft(draftStorageKey);
    };
    form?.addEventListener("reset", resetPreview);
    return () => {
      form?.removeEventListener("reset", resetPreview);
      releaseObjectUrl();
    };
  }, [draftStorageKey, initialImageUrl]);


  async function autoSavePhoto(file: File, input: HTMLInputElement) {
    if (!autoSaveTarget || appIsOffline()) return;
    setSaveState("saving");
    setSaveError(null);
    const formData = new FormData();
    formData.set("student_type", autoSaveTarget.studentType);
    formData.set("student_id", autoSaveTarget.studentId);
    formData.set("field", inputName);
    formData.set("photo", file);
    formData.set(actionIdempotencyField, crypto.randomUUID());
    try {
      const result = await saveStudentPhotoAction(formData);
      if (!result.ok) {
        setSaveState("error");
        setSaveError(result.message);
        return;
      }
      setSaveState("saved");
      // Already on the student record: the form must not upload it a second time.
      if (input.files?.[0] && (input.files[0] === file || preparedPhotoFiles.get(input) === file)) {
        input.value = "";
        preparedPhotoFiles.delete(input);
      }
      window.dispatchEvent(new CustomEvent<MutationRefreshDetail>(mutationCommittedEvent, {
        detail: { scope: "dashboard-library", savingMessageKey: "savingChanges", patch: result.patch },
      }));
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : t("photoSaveFailed"));
    }
  }

  function removePhoto() {
    const input = inputRef.current;
    if (input) {
      input.value = "";
      preparedPhotoFiles.delete(input);
    }
    releaseObjectUrl();
    setPreviewUrl(initialImageUrl ?? null);
    setHasSelectedPhoto(false);
    setSaveState("idle");
    if (draftStorageKey) void deletePhotoDraft(draftStorageKey);
  }

  // Every new photo (camera or gallery) goes through the crop step first.
  function handleCameraPhoto(cameraInput: HTMLInputElement) {
    const file = cameraInput.files?.[0];
    cameraInput.value = "";
    if (file) setCropFile(file);
  }

  function handleGalleryPhoto(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) {
      handlePhotoChange(input);
      return;
    }
    setCropFile(file);
  }

  function useCroppedPhoto(file: File) {
    setCropFile(null);
    const input = inputRef.current;
    if (!input) return;
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
    } catch {
      return;
    }
    handlePhotoChange(input);
  }

  function cancelCrop() {
    setCropFile(null);
    const input = inputRef.current;
    // Keep any photo chosen earlier; drop only the one that was being cropped.
    if (input && !hasSelectedPhoto) input.value = "";
  }

  function handlePhotoChange(input: HTMLInputElement, options: { restored?: boolean } = {}) {
    const file = input.files?.[0];
    if (!file) {
      preparedPhotoFiles.delete(input);
      releaseObjectUrl();
      setPreviewUrl(initialImageUrl ?? null);
      setHasSelectedPhoto(false);
      setSaveState("idle");
      return;
    }

    showFilePreview(file);
    preparedPhotoFiles.delete(input);
    setHasSelectedPhoto(true);
    setSaveState(options.restored ? "restored" : "idle");
    setPreparing(true);
    const preparation = compressUploadImage(file)
      .then((preparedFile) => {
        if (input.files?.[0] !== file) return;
        if (preparedFile !== file) {
          preparedPhotoFiles.set(input, preparedFile);
          showFilePreview(preparedFile);
        }
        const finalFile = preparedFile ?? file;
        if (autoSaveTarget) void autoSavePhoto(finalFile, input);
        else if (draftStorageKey && !options.restored) void savePhotoDraft(draftStorageKey, finalFile);
      })
      .finally(() => {
        if (pendingFilePreparations.get(input) === preparation) {
          pendingFilePreparations.delete(input);
          setPreparing(false);
        }
      });
    pendingFilePreparations.set(input, preparation);
  }

  // Restore a photo chosen before the app was closed (new-student forms only).
  useEffect(() => {
    if (!draftStorageKey) return;
    let cancelled = false;
    void loadPhotoDraft(draftStorageKey).then((file) => {
      const input = inputRef.current;
      if (cancelled || !file || !input || input.files?.length) return;
      try {
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
      } catch {
        return;
      }
      handlePhotoChange(input, { restored: true });
    });
    return () => {
      cancelled = true;
    };
    // Runs once per draft key; handlePhotoChange is stable enough for a one-off restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftStorageKey]);

  return (
    <div className={`image-upload-preview-field full-span ${previewUrl ? "has-preview" : "without-preview"}`}>
      {previewUrl ? (
        <div className="image-upload-preview-card">
          {variant === "student" ? (
            <StudentAvatar
              displayName={displayName || t("libraryStudent")}
              imageUrl={previewUrl}
              className="upload-preview"
            />
          ) : (
            <span
              className="document-upload-preview has-image"
              role="img"
              aria-label={previewLabel}
              style={{ backgroundImage: `url("${previewUrl.replace(/"/g, "%22")}")` }}
            />
          )}
          <div>
            <strong>{previewLabel}</strong>
            <span className={saveState === "error" ? "image-save-error" : saveState === "saved" ? "image-save-ok" : undefined}>
              {preparing
                ? t("compressingPhoto")
                : saveState === "saving"
                  ? t("savingPhoto")
                  : saveState === "saved"
                    ? t("photoSaved")
                    : saveState === "error"
                      ? saveError ?? t("photoSaveFailed")
                      : saveState === "restored"
                        ? t("photoRestored")
                        : hasSelectedPhoto ? t("photoReady") : label}
            </span>
            {hasSelectedPhoto && saveState !== "saved" && saveState !== "saving" ? (
              <button className="image-remove-button" type="button" onClick={removePhoto}>{t("remove")}</button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="image-source-field">
        <span className="image-source-label">{label}</span>
        <div className="image-source-buttons">
          <label className="camera-field">
            <Camera size={16} />
            {t("camera")}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              aria-label={`${label} · ${t("camera")}`}
              onChange={(event) => handleCameraPhoto(event.currentTarget)}
            />
          </label>
          <label className="camera-field">
            <Images size={16} />
            {t("gallery")}
            <input
              ref={inputRef}
              name={inputName}
              type="file"
              accept="image/*"
              aria-label={`${label} · ${t("gallery")}`}
              onChange={(event) => handleGalleryPhoto(event.currentTarget)}
            />
          </label>
        </div>
      </div>
      {cropFile ? (
        <ImageCropDialog
          key={`${cropFile.name}-${cropFile.lastModified}-${cropFile.size}`}
          file={cropFile}
          square={variant === "student"}
          onCancel={cancelCrop}
          onConfirm={useCroppedPhoto}
        />
      ) : null}
    </div>
  );
}

function studentNameInputValue(student: LibraryStudent) {
  return studentHasSwappedRollAndName(student) ? student.roll_number : student.student_name ?? "";
}

function StudentDocumentPreview({ imageUrl, previewLabel }: { imageUrl: string | null | undefined; previewLabel: string }) {
  const { t } = useLanguage();
  if (!imageUrl) return <strong>{displayTextValue(null)}</strong>;

  return (
    <a
      className="library-document-preview-link"
      href={imageUrl}
      target="_blank"
      rel="noreferrer"
      aria-label={`${t("viewPhoto")}: ${previewLabel}`}
    >
      <span
        className="document-upload-preview has-image"
        role="img"
        aria-label={previewLabel}
        style={{ backgroundImage: `url("${imageUrl.replace(/"/g, "%22")}")` }}
      />
      <small>{t("viewPhoto")}</small>
    </a>
  );
}

function libraryStudentPrefill(student: LibraryStudent, t: (key: string) => string) {
  return {
    id: student.id,
    name: studentNameInputValue(student),
    rollNumber: studentDisplayRollNumber(student),
    phoneNumber: student.phone_number ?? "",
    address: student.address ?? "",
    seatNumber: student.seat_number ?? "",
    lockerNumber: student.locker_number ?? "",
    startTime: (student.start_time ?? "06:00").slice(0, 5),
    endTime: (student.end_time ?? "07:00").slice(0, 5),
    extraSlots: (student.extra_time_slots ?? []).map((slot) => ({ start: slot.start.slice(0, 5), end: slot.end.slice(0, 5) })),
    fee: student.fee_amount ? String(student.fee_amount) : "",
    searchLabel: `${studentDisplayRollNumber(student)} · ${studentDisplayName(student, t)}`,
  };
}

function addDaysIsoDate(value: string, days: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function subscriptionRenewalDateRange(previousEndDate: string | null | undefined, continuesPrevious = true) {
  // Active students continue from their last end date; paused / inactive ones start today.
  if (!previousEndDate || !continuesPrevious) {
    return { startDate: todayIso(), endDate: addMonthsIso() };
  }

  const startDate = addDaysIsoDate(previousEndDate, 1);
  const monthEndBase = startDate ? addMonthsIso(new Date(`${startDate}T00:00:00.000Z`)) : null;
  const endDate = monthEndBase ? addDaysIsoDate(monthEndBase, -1) : null;
  return {
    startDate: startDate ?? todayIso(),
    endDate: endDate ?? addMonthsIso(),
  };
}

function libraryRenewalDateRange(student: LibraryStudent | null | undefined) {
  return subscriptionRenewalDateRange(student?.subscription_end_date, student?.active !== false);
}

function courseRenewalDateRange(record: CourseStudentRecord | null | undefined) {
  return subscriptionRenewalDateRange(record?.subscriptionEndDate, record?.active !== false);
}

function rollNumberFromVirtualLibraryStudentId(value: string) {
  if (!value.startsWith("roll:")) return null;
  const rawRollNumber = value.slice("roll:".length);
  try {
    return normalizeLibraryRollNumberForView(decodeURIComponent(rawRollNumber));
  } catch {
    return normalizeLibraryRollNumberForView(rawRollNumber);
  }
}

function libraryStudentMatchesSelection(student: LibraryStudent, selectedId: string) {
  if (!selectedId) return false;
  if (student.id === selectedId) return true;
  const selectedRollNumber = rollNumberFromVirtualLibraryStudentId(selectedId);
  if (!selectedRollNumber) return false;
  return normalizeLibraryRollNumberForView(student.roll_number) === selectedRollNumber;
}

function LibraryStudentSummaryCard({
  student,
  expired,
  onEditPhoto,
  compact = false,
}: {
  student: LibraryStudent;
  expired: boolean;
  onEditPhoto?: () => void;
  compact?: boolean;
}) {
  const { t } = useLanguage();
  const displayName = studentDisplayName(student, t);
  const callHref = studentPhoneHref(student.phone_number);

  return (
    <section className={`library-student-summary-card ${expired ? "expired" : ""} ${compact ? "compact" : ""}`}>
      <div className="library-student-summary-top">
        <div className="library-student-summary-person">
          <div className="library-student-photo-frame">
            <StudentPhoto student={student} displayName={displayName} className="hero" />
            {onEditPhoto ? (
              <button className="library-photo-edit-button" type="button" onClick={onEditPhoto} aria-label={`${t("editTransaction")} ${t("studentPhoto")}`}>
                <Pencil size={14} />
              </button>
            ) : null}
          </div>
          <div className="min-w-0">
            <span className={`status-chip ${expired ? "status-pending" : student.active ? "status-approved" : "status-rejected"}`}>
              {expired ? t("expiredSubscription") : student.active ? t("active") : t("inactiveStudents")}
            </span>
            <h3>{displayName}</h3>
          </div>
        </div>
        <div className="library-subscription-highlight">
          <span>{t("expiresOn")}</span>
          <strong>{displayDate(student.subscription_end_date)}</strong>
        </div>
      </div>

      <div className="library-student-key-numbers">
        <div>
          <span>{t("rollNumber")}</span>
          <strong>{studentDisplayRollNumber(student)}</strong>
        </div>
        <div className="featured">
          <span>{t("phone")}</span>
          {callHref ? <a href={callHref}>{displayTextValue(student.phone_number)}</a> : <strong>{displayTextValue(student.phone_number)}</strong>}
        </div>
        <div>
          <span>{t("seatNumber")}</span>
          <strong>{displayTextValue(student.seat_number)}</strong>
        </div>
      </div>

      <div className="library-student-summary-grid">
        <div className="important">
          <span>{t("subscriptionPeriod")}</span>
          <strong>{displayDateRange(student.subscription_start_date, student.subscription_end_date, t)}</strong>
        </div>
        <div>
          <span>{t("timing")}</span>
          <strong>{displayTimeSlots(student.start_time, student.end_time, student.extra_time_slots)}</strong>
          <small>{student.slot_hours ? `${student.slot_hours}h` : "-"}</small>
        </div>
        <div>
          <span>{t("lockerNumber")}</span>
          <strong>{displayTextValue(student.locker_number)}</strong>
        </div>
        <div>
          <span>{t("lastPayment")}</span>
          <strong>{displayDate(student.last_payment_date)}</strong>
        </div>
        <div className="wide">
          <span>{t("address")}</span>
          <strong>{displayTextValue(student.address)}</strong>
        </div>
        <div>
          <span>{t("aadharNumber")}</span>
          <strong>{displayTextValue(student.aadhar_number)}</strong>
        </div>
        <div>
          <span>{t("aadharFront")}</span>
          <StudentDocumentPreview imageUrl={student.aadhar_photo_url} previewLabel={t("aadharFrontPreview")} />
        </div>
        <div>
          <span>{t("aadharBack")}</span>
          <StudentDocumentPreview imageUrl={student.aadhar_back_photo_url} previewLabel={t("aadharBackPreview")} />
        </div>
      </div>

      <div className="library-student-summary-money">
        <span>{t("fee")} <strong>{displayMoneyValue(student.fee_amount)}</strong></span>
        <span>{t("paid")} <strong>{displayMoneyValue(student.paid_amount)}</strong></span>
        <span>{t("dues")} <strong>{displayMoneyValue(student.dues_amount)}</strong></span>
        <span>{t("advance")} <strong>{displayMoneyValue(student.advance_amount)}</strong></span>
      </div>
    </section>
  );
}

function StudentRosterCard({
  student,
  selected,
  showCallAction,
  onOpen,
}: {
  student: StudentRosterCardViewModel;
  selected: boolean;
  showCallAction: boolean;
  onOpen: () => void;
}) {
  const { t } = useLanguage();
  const callHref = showCallAction ? studentPhoneHref(student.phoneNumber) : null;
  const seat = student.seatNumber?.trim() && student.seatNumber.trim() !== "-" ? student.seatNumber.trim() : null;
  const whatsappHref = showCallAction ? studentWhatsAppHref(student.phoneNumber, libraryRenewalReminderMessage) : null;

  return (
    <article
      className={`library-student-list-card ${selected ? "selected" : ""} ${student.expired ? "expired" : ""} ${callHref ? "" : "without-call"} ${whatsappHref ? "with-whatsapp" : ""}`}
    >
      <span className={`library-expiry-chip library-list-expiry ${student.expired ? "expired" : ""}`}>
        {student.expiryLabel}
      </span>
      <button
        type="button"
        onClick={onOpen}
        className={`library-student-list-main ${callHref ? "" : "without-call"}`}
        aria-label={[
          student.displayName,
          `${t("rollNumber")} ${student.rollNumber}`,
          student.meta,
          student.timing,
          seat ? `${t("seat")} ${seat}` : null,
          student.expiryLabel,
        ].filter(Boolean).join(", ")}
      >
        <div className="library-list-avatar-wrap">
          <StudentAvatar displayName={student.displayName} imageUrl={student.imageUrl} className="list" />
          <span className="library-list-roll-badge">#{student.rollNumber}</span>
        </div>
        <div className="library-list-info">
          <strong>{student.displayName}</strong>
          <span>{student.meta}</span>
          {student.timing ? <b className="library-list-timing">{student.timing}</b> : null}
          {seat ? <span className="library-list-seat-badge">{t("seat")}: {seat}</span> : null}
        </div>
      </button>
      {whatsappHref || callHref ? (
        <div className="library-list-actions">
          {whatsappHref ? (
            <a
              className="library-list-whatsapp-button"
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`WhatsApp: ${student.displayName}`}
              title="WhatsApp"
            >
              <MessageCircle size={22} />
            </a>
          ) : null}
          {callHref ? (
            <a
              className="library-list-call-button"
              href={callHref}
              aria-label={`${t("callStudent")}: ${student.displayName}`}
              title={t("callStudent")}
            >
              <PhoneCall size={22} />
            </a>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function StudentDetailItem({
  label,
  value,
  className = "",
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={`student-drawer-detail-item ${className}`}>
      <span>{label}</span>
      <div className="student-drawer-detail-value">{value}</div>
    </div>
  );
}

function studentSubscriptionTransactionStatus(
  transaction: StudentSubscriptionTransaction,
  t: (key: string) => string,
) {
  if (transaction.recordStatus === "cancelled") return t("cancelled");
  if (transaction.mode !== "mixed") return labelForStatus(transaction.approvalStatus, t);

  const statuses = [transaction.cashApprovalStatus, transaction.onlineApprovalStatus].filter(
    (status): status is ApprovalStatus => Boolean(status),
  );
  const approvedCount = statuses.filter((status) => status === "approved").length;
  if (approvedCount === statuses.length && statuses.length > 0) return t("verified");
  if (approvedCount > 0) return t("partiallyVerified");
  if (statuses.some((status) => status === "rejected" || status === "cancelled")) return t("rejected");
  return t("approvalPending");
}

function StudentSubscriptionTransactionSummary({
  transaction,
  compact = false,
}: {
  transaction: StudentSubscriptionTransaction;
  compact?: boolean;
}) {
  const { t } = useLanguage();
  const status = studentSubscriptionTransactionStatus(transaction, t);
  const statusTone = transaction.recordStatus === "cancelled"
    ? "cancelled"
    : transaction.mode === "mixed"
      && [transaction.cashApprovalStatus, transaction.onlineApprovalStatus].filter((value) => value === "approved").length === 1
      ? "reapproval_required"
      : transaction.approvalStatus;

  return (
    <article className={`student-subscription-transaction ${compact ? "compact" : ""} ${transaction.recordStatus}`}>
      {!compact ? <span className="student-history-marker" aria-hidden="true" /> : null}
      <div className="student-subscription-transaction-main">
        <div>
          <strong>{formatMoney(transaction.amount)}</strong>
          <p>{displayDate(transaction.paymentDate)} · {transaction.collectorName}</p>
        </div>
        <span className={`status-chip ${approvalStatusClass(statusTone)}`}>{status}</span>
      </div>
      <div className="student-subscription-transaction-mode">
        {transaction.mode === "mixed" ? (
          <>
            <span className="cash"><Banknote size={15} /> {formatMoney(transaction.cashAmount)} · {labelForStatus(transaction.cashApprovalStatus ?? "pending", t)}</span>
            <span className="online"><CreditCard size={15} /> {formatMoney(transaction.onlineAmount)} · {labelForStatus(transaction.onlineApprovalStatus ?? "pending", t)}</span>
          </>
        ) : (
          <span className={transaction.mode}>
            {transaction.mode === "cash" ? <Banknote size={15} /> : <CreditCard size={15} />}
            {labelForMode(transaction.mode, t)}
          </span>
        )}
      </div>
      {transaction.recordStatus === "cancelled" ? (
        <small className="student-subscription-cancel-note">
          {t("cancelledExcluded")}{transaction.cancelReason ? ` · ${transaction.cancelReason}` : ""}
        </small>
      ) : null}
    </article>
  );
}

function SubscriptionHistoryTimeline({
  subscriptions,
  totalSubscriptions,
  totalTransactions,
  error,
  hasMore,
  loadingMore,
  onLoadOlder,
  editTarget,
  setNotice,
  startTransition,
}: {
  subscriptions: StudentSubscriptionHistoryItem[];
  totalSubscriptions: number;
  totalTransactions: number;
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadOlder: () => void;
  /** When set, each subscription can be edited (period and timing always; amount and date until approval). */
  editTarget?: { studentType: "library" | "course"; studentId: string } | null;
  setNotice?: (notice: ActionResult | null) => void;
  startTransition?: ReturnType<typeof useTransition>[1];
}) {
  const { t } = useLanguage();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const canEdit = Boolean(editTarget && setNotice && startTransition);

  return (
    <section className="student-history-panel" aria-label={t("subscriptionHistory")}>
      <div className="student-history-heading">
        <div>
          <p className="eyebrow">{t("subscriptionHistory")}</p>
          <h3>{totalSubscriptions}</h3>
          <small>{totalTransactions} {t("paymentTransactions")}</small>
        </div>
      </div>
      {error ? <p className="student-history-error">{error}</p> : null}
      <div className="student-history-timeline">
        {subscriptions.map((subscription) => (
          <article key={subscription.subscriptionKey} className="student-subscription-history-card">
            <div className="student-history-entry-title">
              <div>
                <strong>{displayDateRange(subscription.startDate, subscription.endDate, t)}</strong>
                <p>{t("timing")} {displayTimeSlots(subscription.startTime, subscription.endTime, subscription.extraSlots)}</p>
              </div>
              <span className="student-subscription-payment-count">
                {subscription.transactionCount} {t("paymentTransactions")}
              </span>
              {canEdit && editingKey !== subscription.subscriptionKey ? (
                <button
                  className="icon-button student-subscription-edit-button"
                  type="button"
                  aria-label={t("editSubscription")}
                  title={t("editSubscription")}
                  onClick={() => setEditingKey(subscription.subscriptionKey)}
                >
                  <Pencil size={16} />
                </button>
              ) : null}
            </div>
            {canEdit && editTarget && setNotice && startTransition && editingKey === subscription.subscriptionKey ? (
              <form
                className="form-grid student-subscription-edit"
                onSubmit={(event) => submitAndClose(event, updateSubscriptionAction, setNotice, startTransition, () => setEditingKey(null))}
              >
                <input type="hidden" name="student_type" value={editTarget.studentType} />
                <input type="hidden" name="student_id" value={editTarget.studentId} />
                <input type="hidden" name="subscription_key" value={subscription.subscriptionKey} />
                <label>
                  {t("startDate")}
                  <input type="date" name="start_date" defaultValue={subscription.startDate ?? ""} required />
                </label>
                <label>
                  {t("endDate")}
                  <input type="date" name="end_date" defaultValue={subscription.endDate ?? ""} required />
                </label>
                <SubscriptionSlotsFields
                  startTime={subscription.startTime?.slice(0, 5) ?? ""}
                  endTime={subscription.endTime?.slice(0, 5) ?? ""}
                  extraSlots={editTarget.studentType === "library" ? subscription.extraSlots ?? [] : null}
                />
                {subscription.transactions.filter((transaction) => transaction.recordStatus === "active").map((transaction) => {
                  const approved = transaction.approvalStatus === "approved"
                    || transaction.cashApprovalStatus === "approved"
                    || transaction.onlineApprovalStatus === "approved";
                  return approved ? (
                    <p className="full-span student-subscription-edit-locked" key={transaction.id}>
                      {formatMoney(transaction.amount)} · {displayDate(transaction.paymentDate)} · {t("amountLockedAfterApproval")}
                    </p>
                  ) : (
                    <fieldset className="full-span student-subscription-edit-transaction" key={transaction.id}>
                      <legend>{transaction.collectorName} · {labelForMode(transaction.mode, t)}</legend>
                      <label>
                        {t("amount")}
                        <input
                          type="number"
                          name={`amount_${transaction.id}`}
                          defaultValue={transaction.amount}
                          min="1"
                          step="0.01"
                          inputMode="decimal"
                          disabled={transaction.mode === "mixed"}
                          required
                        />
                      </label>
                      <label>
                        {t("transactionDate")}
                        <input type="date" name={`date_${transaction.id}`} defaultValue={transaction.paymentDate.slice(0, 10)} required />
                      </label>
                    </fieldset>
                  );
                })}
                <div className="full-span student-subscription-edit-actions">
                  <button className="secondary-button" type="button" onClick={() => setEditingKey(null)}>{t("cancel")}</button>
                  <button className="primary-button" type="submit">{t("save")}</button>
                </div>
              </form>
            ) : null}
            <div className="student-history-money-grid">
              <span>{t("fee")} <strong>{formatMoney(subscription.feeAmount)}</strong></span>
              <span>{t("totalPaid")} <strong>{formatMoney(subscription.totalPaid)}</strong></span>
              <span>{t("amountLeft")} <strong>{formatMoney(subscription.duesAmount)}</strong></span>
              {subscription.advanceAmount > 0 ? (
                <span>{t("advance")} <strong>{formatMoney(subscription.advanceAmount)}</strong></span>
              ) : null}
            </div>
            {subscription.transactions.length > 1 ? (
              <div className="student-subscription-transaction-tree" aria-label={t("paymentTransactions")}>
                {subscription.transactions.map((transaction) => (
                  <StudentSubscriptionTransactionSummary key={transaction.id} transaction={transaction} />
                ))}
              </div>
            ) : subscription.transactions[0] ? (
              <StudentSubscriptionTransactionSummary transaction={subscription.transactions[0]} compact />
            ) : null}
          </article>
        ))}
      </div>
      {subscriptions.length === 0 && !error ? <p className="student-history-empty">{t("noRecords")}</p> : null}
      {hasMore ? (
        <button className="secondary-button student-history-load-more" type="button" onClick={onLoadOlder} disabled={loadingMore}>
          {loadingMore ? t("saving") : t("loadOlder")}
        </button>
      ) : null}
    </section>
  );
}

function studentRecordSourceId(course: Course) {
  return `course:${course.id}`;
}

function studentRecordSources(
  courses: Course[],
  t: (key: string) => string,
  includeLibrary: boolean,
  includeCourses: boolean,
): StudentRecordSource[] {
  const visibleCourses = includeCourses ? courses.filter((course) => course.active) : [];
  return [
    ...(includeLibrary ? [{ id: "library", type: "library", label: t("library") } satisfies StudentRecordSource] : []),
    ...visibleCourses.map((course): StudentRecordSource => ({
      id: studentRecordSourceId(course),
      type: "course",
      label: course.name,
      course,
    })),
  ];
}

function courseStudentRecordFromStudent(student: CourseStudent, source: CourseStudentRecordSource): CourseStudentRecord {
  return {
    id: student.id,
    paymentId: student.last_payment_id,
    identityKey: student.identity_key,
    displayName: student.student_name?.trim() || "",
    rollNumber: normalizeLibraryRollNumberForView(student.roll_number),
    courseName: source.course.name,
    photoUrl: student.photo_url,
    phoneNumber: student.phone_number,
    address: student.address,
    aadharNumber: student.aadhar_number,
    seatNumber: null,
    startTime: student.start_time,
    endTime: student.end_time,
    subscriptionStartDate: student.subscription_start_date,
    subscriptionEndDate: student.subscription_end_date,
    lastPaymentDate: indiaDateIso(student.updated_at),
    feeAmount: student.fee_amount,
    paidAmount: student.paid_amount,
    duesAmount: student.dues_amount,
    advanceAmount: student.advance_amount,
    aadharPhotoUrl: student.aadhar_photo_url,
    aadharBackPhotoUrl: student.aadhar_back_photo_url,
    active: student.active,
    pausedAt: student.paused_at ?? null,
    inactiveAt: student.inactive_at ?? null,
  };
}

function courseStudentRecordsForSource(students: CourseStudent[], source: CourseStudentRecordSource) {
  return students
    .filter((student) => student.source_course_id === source.course.id)
    .map((student) => courseStudentRecordFromStudent(student, source));
}

function courseStudentDisplayName(record: CourseStudentRecord, t: (key: string) => string) {
  return record.displayName || (record.rollNumber ? `${t("roll")} ${record.rollNumber}` : t("unknown"));
}

function courseStudentPrefill(record: CourseStudentRecord, t: (key: string) => string) {
  const displayName = courseStudentDisplayName(record, t);
  return {
    id: record.id,
    name: displayName,
    rollNumber: record.rollNumber ?? "",
    phoneNumber: record.phoneNumber ?? "",
    address: record.address ?? "",
    aadharNumber: record.aadharNumber ?? "",
    seatNumber: record.seatNumber ?? "",
    startTime: (record.startTime ?? "06:00").slice(0, 5),
    endTime: (record.endTime ?? "07:00").slice(0, 5),
    fee: record.feeAmount ? String(record.feeAmount) : "",
    searchLabel: `${record.rollNumber ?? "-"} · ${displayName}`,
  };
}

function compareCourseStudentRecordsByExpiry(a: CourseStudentRecord, b: CourseStudentRecord, t: (key: string) => string) {
  const aExpiry = isoDateUtcMs(a.subscriptionEndDate);
  const bExpiry = isoDateUtcMs(b.subscriptionEndDate);
  if (aExpiry !== null && bExpiry !== null && aExpiry !== bExpiry) return aExpiry - bExpiry;
  if (aExpiry !== null && bExpiry === null) return -1;
  if (aExpiry === null && bExpiry !== null) return 1;

  return (
    compareLibraryRollNumbers(a.rollNumber, b.rollNumber) ||
    courseStudentDisplayName(a, t).localeCompare(courseStudentDisplayName(b, t), undefined, { sensitivity: "base" })
  );
}

function LibraryStudentsView({
  businessId,
  cacheScope,
  variant = "page",
  students,
  courseStudentRows,
  courses,
  studentSources,
  selectedSourceId,
  setSelectedSourceId,
  listMode,
  setListMode,
  setNotice,
  startTransition,
}: {
  businessId: string;
  cacheScope: string;
  variant?: "page" | "collection";
  students: LibraryStudent[];
  courseStudentRows: CourseStudent[];
  courses: Course[];
  studentSources: StudentRecordSource[];
  selectedSourceId: string;
  setSelectedSourceId: (sourceId: string) => void;
  listMode: LibraryStudentListMode;
  setListMode: (mode: LibraryStudentListMode) => void;
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [currentMinute, setCurrentMinute] = useState(() => currentMinuteOfDay());
  const [selectedId, setSelectedId] = useState("");
  const [editingStudent, setEditingStudent] = useState(false);
  const [drawerView, setDrawerView] = useState<StudentDrawerView>("details");
  const [confirmingStatus, setConfirmingStatus] = useState(false);
  const drawerPanelRef = useRef<HTMLElement>(null);
  const drawerOriginRef = useRef<HTMLElement | null>(null);
  const rosterLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const today = todayIso();
  const selectedSource = useMemo(
    () => studentSources.find((source) => source.id === selectedSourceId) ?? studentSources[0] ?? { id: "library", type: "library", label: t("library") } satisfies StudentRecordSource,
    [selectedSourceId, studentSources, t],
  );
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);
  const rosterPageSize = variant === "collection" ? 15 : 100;
  // Students page filter chips (server-side, plus the same check on locally merged rows).
  const [rosterFlags, setRosterFlags] = useState<StudentRosterFlag[]>([]);
  const [rosterSort, setRosterSort] = useState<StudentRosterSortKey>("expiry");
  const [rosterFilterOpen, setRosterFilterOpen] = useState(false);
  const rosterFlagKey = [...rosterFlags].sort().join(",");
  const rosterQuery = useInfiniteQuery({
    queryKey: ["student-roster", cacheScope, selectedSource.id, listMode, debouncedQuery, rosterPageSize, rosterFlagKey, rosterSort],
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({
        tab: "library_students",
        studentSource: selectedSource.id,
        studentStatus: listMode,
        cursor: String(pageParam),
        limit: String(rosterPageSize),
      });
      if (debouncedQuery) params.set("studentSearch", debouncedQuery);
      if (rosterFlagKey) params.set("studentFlags", rosterFlagKey);
      if (rosterSort !== "expiry") params.set("studentSort", rosterSort);
      return fetchJson<StudentRosterPayload>(`/api/businesses/${businessId}/operational/students?${params}`, signal);
    },
    initialPageParam: "0",
    getNextPageParam: (lastPage) => lastPage.result.nextCursor ?? undefined,
    staleTime: 300_000,
  });
  const rosterCounts = rosterQuery.data?.pages[0]?.counts ?? null;
  const fetchNextRosterPage = rosterQuery.fetchNextPage;
  const rosterHasNextPage = rosterQuery.hasNextPage;
  const rosterIsFetchingNextPage = rosterQuery.isFetchingNextPage;
  useEffect(() => {
    const target = rosterLoadMoreRef.current;
    if (variant !== "collection" || !target || !rosterHasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !rosterIsFetchingNextPage) {
        void fetchNextRosterPage();
      }
    }, { rootMargin: "160px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextRosterPage, rosterHasNextPage, rosterIsFetchingNextPage, variant]);
  const remoteLibraryStudents = useMemo(
    () => rosterQuery.data?.pages.flatMap((page) => page.libraryStudents) ?? [],
    [rosterQuery.data?.pages],
  );
  const remoteCourseStudents = useMemo(
    () => rosterQuery.data?.pages.flatMap((page) => page.courseStudents) ?? [],
    [rosterQuery.data?.pages],
  );
  const mergedLibraryStudents = useMemo(() => {
    const rows = new Map(students.map((student) => [student.id, student]));
    remoteLibraryStudents.forEach((student) => rows.set(student.id, student));
    return [...rows.values()];
  }, [remoteLibraryStudents, students]);
  const mergedCourseStudentRows = useMemo(() => {
    const rows = new Map(courseStudentRows.map((student) => [student.id, student]));
    remoteCourseStudents.forEach((student) => rows.set(student.id, student));
    return [...rows.values()];
  }, [courseStudentRows, remoteCourseStudents]);
  const showingLibraryStudents = selectedSource.type === "library";
  const activeStudents = mergedLibraryStudents.filter((student) => student.active && !student.placeholder);
  const liveStudents = activeStudents.filter((student) => isLibraryStudentLiveNow(student, currentMinute));
  const inactiveStudents = mergedLibraryStudents.filter((student) => !student.active && !student.placeholder);
  const courseStudents = useMemo(
    () => selectedSource.type === "library" ? [] : courseStudentRecordsForSource(mergedCourseStudentRows, selectedSource),
    [mergedCourseStudentRows, selectedSource],
  );
  const activeCourseStudents = courseStudents.filter((record) => record.active);
  const liveCourseStudents = activeCourseStudents.filter((record) => isTimeRangeLiveNow(record.startTime, record.endTime, currentMinute));
  const inactiveCourseStudents = courseStudents.filter((record) => !record.active);
  const expired = (student: LibraryStudent) => isExpiredLibraryStudent(student, today);
  const sourceStudents = listMode === "all"
    ? [...activeStudents, ...inactiveStudents]
    : listMode === "live" ? liveStudents : listMode === "active" ? activeStudents : inactiveStudents;
  const sourceCourseStudents = listMode === "all"
    ? [...activeCourseStudents, ...inactiveCourseStudents]
    : listMode === "live" ? liveCourseStudents : listMode === "active" ? activeCourseStudents : inactiveCourseStudents;
  const normalizedQuery = query.trim().toLowerCase();
  const expiringUntil = addDaysIsoDate(today, rosterExpiringSoonDays) ?? today;
  const matchesRosterFlags = (record: { startTime: string | null | undefined; endTime: string | null | undefined; seat: string | null | undefined; locker: string | null | undefined; endDate: string | null | undefined }) =>
    rosterFlags.every((flag) => {
      if (flag === "full_time") return record.startTime?.slice(0, 5) === libraryFullTimeStart && record.endTime?.slice(0, 5) === libraryFullTimeEnd;
      if (flag === "seat") return Boolean(record.seat?.trim() && record.seat.trim() !== "-");
      if (flag === "locker") return Boolean(record.locker?.trim() && record.locker.trim() !== "-");
      return Boolean(record.endDate && record.endDate >= today && record.endDate <= expiringUntil);
    });
  const visibleStudents = showingLibraryStudents ? sourceStudents
    .filter((student) => matchesRosterFlags({
      startTime: student.start_time,
      endTime: student.end_time,
      seat: student.seat_number,
      locker: student.locker_number,
      endDate: student.subscription_end_date,
    }))
    .filter((student) => {
      if (!normalizedQuery) return true;
      return [studentDisplayRollNumber(student), studentDisplayName(student, t), student.phone_number, student.seat_number, student.locker_number]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    })
    .sort((a, b) =>
      // Searches are mostly by roll number: roll matches first, then the usual expiry order.
      (normalizedQuery ? rollSearchRank(studentDisplayRollNumber(a), normalizedQuery) - rollSearchRank(studentDisplayRollNumber(b), normalizedQuery) : 0)
      || (listMode === "all" ? Number(b.active) - Number(a.active) : 0)
      || (rosterSort === "roll"
        ? compareNaturalText(studentDisplayRollNumber(a), studentDisplayRollNumber(b))
        : rosterSort === "name"
          ? compareNaturalText(studentDisplayName(a, t), studentDisplayName(b, t))
          : rosterSort === "seat"
            ? compareNaturalText(a.seat_number, b.seat_number)
            : listMode === "inactive"
              ? comparePausedThenInactive(
                { active: a.active, pausedAt: a.paused_at, inactiveAt: a.inactive_at },
                { active: b.active, pausedAt: b.paused_at, inactiveAt: b.inactive_at },
              )
              : 0)
      || compareLibraryStudentsByExpiry(a, b, t)) : [];
  const visibleCourseStudents = showingLibraryStudents ? [] : sourceCourseStudents
    .filter((record) => matchesRosterFlags({
      startTime: record.startTime,
      endTime: record.endTime,
      seat: rosterFlags.includes("seat") ? null : "",
      locker: rosterFlags.includes("locker") ? null : "",
      endDate: record.subscriptionEndDate,
    }))
    .filter((record) => {
      if (!normalizedQuery) return true;
      return [record.rollNumber, courseStudentDisplayName(record, t), record.phoneNumber, record.courseName, record.seatNumber, displayTimeRange(record.startTime, record.endTime)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    })
    .sort((a, b) =>
      (normalizedQuery ? rollSearchRank(a.rollNumber, normalizedQuery) - rollSearchRank(b.rollNumber, normalizedQuery) : 0)
      || (listMode === "all" ? Number(b.active) - Number(a.active) : 0)
      || (rosterSort === "roll"
        ? compareNaturalText(a.rollNumber, b.rollNumber)
        : rosterSort === "name"
          ? compareNaturalText(courseStudentDisplayName(a, t), courseStudentDisplayName(b, t))
          : listMode === "inactive"
            ? comparePausedThenInactive(a, b)
            : 0)
      || compareCourseStudentRecordsByExpiry(a, b, t));

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentMinute(currentMinuteOfDay());
    }, 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  const rawSelectedStudent = showingLibraryStudents ? mergedLibraryStudents.find((student) => libraryStudentMatchesSelection(student, selectedId)) ?? null : null;
  const rawSelectedCourseStudent = showingLibraryStudents ? null : courseStudents.find((record) => record.id === selectedId) ?? null;
  const studentDetailQuery = useQuery({
    queryKey: ["student-detail", cacheScope, showingLibraryStudents ? "library" : "course", selectedId],
    queryFn: ({ signal }) => fetchJson<StudentDetailPayload>(
      `/api/businesses/${businessId}/students/${showingLibraryStudents ? "library" : "course"}/${encodeURIComponent(selectedId)}`,
      signal,
    ),
    enabled: Boolean(selectedId),
    staleTime: 300_000,
  });
  const baseSelectedStudent = useMemo(
    () => rawSelectedStudent && studentDetailQuery.data?.source === "library"
      ? { ...rawSelectedStudent, ...studentDetailQuery.data.student }
      : rawSelectedStudent,
    [rawSelectedStudent, studentDetailQuery.data],
  );
  const selectedCourseStudent = useMemo(
    () => rawSelectedCourseStudent
      && selectedSource.type !== "library"
      && studentDetailQuery.data?.source === "course"
      ? courseStudentRecordFromStudent(studentDetailQuery.data.student, selectedSource)
      : rawSelectedCourseStudent,
    [rawSelectedCourseStudent, selectedSource, studentDetailQuery.data],
  );
  const openStudentDetails = (studentId: string) => {
    drawerOriginRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedId(studentId);
    setEditingStudent(false);
    setDrawerView("details");
    setConfirmingStatus(false);
  };
  const closeStudentDetails = useCallback(() => {
    setSelectedId("");
    setEditingStudent(false);
    setDrawerView("details");
    setConfirmingStatus(false);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => drawerPanelRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeStudentDetails();
        return;
      }
      if (event.key !== "Tab" || !drawerPanelRef.current) return;
      const focusable = [...drawerPanelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        drawerPanelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => drawerOriginRef.current?.focus());
    };
  }, [closeStudentDetails, selectedId]);

  const historyQuery = useInfiniteQuery({
    queryKey: ["library-student-history", cacheScope, baseSelectedStudent?.id ?? ""],
    queryFn: ({ pageParam }) => fetchJson<StudentSubscriptionHistoryPage>(`/api/businesses/${businessId}/library-students/${encodeURIComponent(baseSelectedStudent?.id ?? "")}/payments?page=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    enabled: Boolean(baseSelectedStudent?.id),
    staleTime: 300_000,
  });
  const selectedStudent = baseSelectedStudent;
  const courseHistoryQuery = useInfiniteQuery({
    queryKey: ["course-student-history", cacheScope, selectedCourseStudent?.id ?? ""],
    queryFn: ({ pageParam }) => fetchJson<StudentSubscriptionHistoryPage>(`/api/businesses/${businessId}/course-students/${encodeURIComponent(selectedCourseStudent?.id ?? "")}/payments?page=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    enabled: Boolean(selectedCourseStudent?.id),
    staleTime: 300_000,
  });
  const drawerKind = selectedStudent ? "library" : selectedCourseStudent ? "course" : null;
  const drawerName = selectedStudent
    ? studentDisplayName(selectedStudent, t)
    : selectedCourseStudent
      ? courseStudentDisplayName(selectedCourseStudent, t)
      : "";
  const drawerRollNumber = selectedStudent
    ? studentDisplayRollNumber(selectedStudent)
    : selectedCourseStudent?.rollNumber ?? "-";
  const drawerPhoneNumber = selectedStudent?.phone_number ?? selectedCourseStudent?.phoneNumber ?? null;
  const drawerPhoneHref = studentPhoneHref(drawerPhoneNumber);
  const drawerPhotoUrl = selectedStudent?.photo_url ?? selectedCourseStudent?.photoUrl ?? null;
  const drawerActive = selectedStudent?.active ?? selectedCourseStudent?.active ?? false;
  const drawerExpired = selectedStudent
    ? expired(selectedStudent)
    : Boolean(selectedCourseStudent?.subscriptionEndDate && selectedCourseStudent.subscriptionEndDate < today);
  const drawerHistoryQuery = selectedStudent ? historyQuery : courseHistoryQuery;
  const drawerHistorySubscriptions = drawerHistoryQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const drawerHistoryTotal = drawerHistoryQuery.data?.pages[0]?.totalSubscriptions ?? drawerHistorySubscriptions.length;
  const drawerHistoryTransactionTotal = drawerHistoryQuery.data?.pages[0]?.totalTransactions
    ?? drawerHistorySubscriptions.reduce((sum, item) => sum + item.transactionCount, 0);
  const drawerHistoryError = drawerHistoryQuery.error instanceof Error
    ? drawerHistoryQuery.error.message
    : drawerHistoryQuery.error
      ? "Could not load history."
      : null;
  const drawerHasMoreHistory = Boolean(drawerHistoryQuery.hasNextPage);
  const drawerLoadingMoreHistory = drawerHistoryQuery.isFetchingNextPage;
  const drawerSourceLabel = selectedStudent ? t("libraryStudent") : selectedCourseStudent?.courseName ?? t("studentDetails");
  const drawerSubscriptionEnd = selectedStudent?.subscription_end_date ?? selectedCourseStudent?.subscriptionEndDate ?? null;
  const drawerSubscriptionStart = selectedStudent?.subscription_start_date ?? selectedCourseStudent?.subscriptionStartDate ?? null;
  const drawerStartTime = selectedStudent?.start_time ?? selectedCourseStudent?.startTime ?? null;
  const drawerEndTime = selectedStudent?.end_time ?? selectedCourseStudent?.endTime ?? null;
  const drawerAddress = selectedStudent?.address ?? selectedCourseStudent?.address ?? null;
  const drawerAadharNumber = selectedStudent?.aadhar_number ?? selectedCourseStudent?.aadharNumber ?? null;
  const drawerAadharFront = selectedStudent?.aadhar_photo_url ?? selectedCourseStudent?.aadharPhotoUrl ?? null;
  const drawerAadharBack = selectedStudent?.aadhar_back_photo_url ?? selectedCourseStudent?.aadharBackPhotoUrl ?? null;
  const drawerFee = selectedStudent?.fee_amount ?? selectedCourseStudent?.feeAmount ?? null;
  const drawerPaid = selectedStudent?.paid_amount ?? selectedCourseStudent?.paidAmount ?? null;
  const drawerDues = selectedStudent?.dues_amount ?? selectedCourseStudent?.duesAmount ?? null;
  const drawerAdvance = selectedStudent?.advance_amount ?? selectedCourseStudent?.advanceAmount ?? null;
  const drawerLastPayment = selectedStudent?.last_payment_date ?? selectedCourseStudent?.lastPaymentDate ?? null;
  const drawerPause = studentPauseState(drawerActive, selectedStudent?.paused_at ?? selectedCourseStudent?.pausedAt ?? null);
  const drawerStatusLabel = drawerPause.state === "paused"
    ? `${t("pausedTag")} · ${drawerPause.daysLeft} ${t(drawerPause.daysLeft === 1 ? "day" : "days")} ${t("remainingSuffix")}`
    : !drawerActive
      ? t("inactiveTag")
      : drawerExpired
        ? t("expiredSubscription")
        : t("active");
  const drawerStatusClass = drawerPause.state === "paused"
    ? "status-pending"
    : !drawerActive ? "status-rejected" : drawerExpired ? "status-pending" : "status-approved";
  const showSourceSelector = variant === "page" || studentSources.length > 1;
  const showStatusFilters = variant === "page";
  const allowCallActions = variant === "page";
  return (
    <section className={`library-students-view ${variant === "collection" ? "collection-student-browser" : ""}`}>
      {showSourceSelector || showStatusFilters ? (
        <section className="library-student-source-bar" aria-label={t("studentStatus")}>
          {showSourceSelector ? (
            <label className="library-student-source-select">
              <BookOpen size={20} aria-hidden="true" />
              <span className="sr-only">{t("studentSource")}</span>
              <select
                aria-label={t("studentSource")}
                value={selectedSource.id}
                onChange={(event) => setSelectedSourceId(event.target.value)}
              >
                {studentSources.map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}
              </select>
            </label>
          ) : null}
          {showStatusFilters ? (
            <div className="library-student-filter-row" role="group" aria-label={t("studentStatus")}>
              {(["active", "live", "inactive"] as LibraryStudentListMode[]).map((status) => (
                <button
                  aria-pressed={listMode === status}
                  className={`filter-chip ${listMode === status ? "active" : ""}`}
                  key={status}
                  type="button"
                  onClick={() => setListMode(status)}
                >
                  {status === "live" ? "LIVE" : status === "inactive" ? t("inactive") : t("active")}
                  {rosterCounts ? <span className="filter-chip-count">{rosterCounts[status as "active" | "live" | "inactive"]}</span> : null}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
      <section className="library-student-list-panel">
        <label className="form-grid block">
          <span className="mb-2 block text-sm font-bold text-on-surface-variant">{t("studentSearch")}</span>
          <span className="student-search-row">
            <span className="input-with-icon">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`${t("rollNumber")} / ${t("name")}`} />
            </span>
            {variant !== "collection" ? (
              <button
                className={`student-filter-button${rosterFlags.length > 0 || rosterSort !== "expiry" ? " active" : ""}`}
                type="button"
                aria-label={`${t("filters")}${rosterFlags.length ? `: ${rosterFlags.length}` : ""}`}
                onClick={(event) => {
                  event.preventDefault();
                  setRosterFilterOpen(true);
                }}
              >
                <SlidersHorizontal size={18} />
                {rosterFlags.length > 0 ? <span className="header-filter-count">{rosterFlags.length}</span> : null}
              </button>
            ) : null}
          </span>
        </label>
        {rosterFlags.length > 0 || rosterSort !== "expiry" ? (
          <div className="student-active-filters" aria-label={t("filters")}>
            {rosterSort !== "expiry" ? (
              <button type="button" className="filter-chip active" onClick={() => setRosterSort("expiry")}>
                {t("sortBy")}: {rosterSort === "roll" ? t("rollNumber") : rosterSort === "name" ? t("name") : t("seatNumber")} <X size={12} aria-hidden="true" />
              </button>
            ) : null}
            {rosterFlags.map((flag) => (
              <button key={flag} type="button" className="filter-chip active" onClick={() => setRosterFlags((current) => current.filter((item) => item !== flag))}>
                {rosterFlagLabel(flag, t)} <X size={12} aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : null}
        {rosterFilterOpen ? (
          <StudentRosterFilterSheet
            flags={rosterFlags}
            sort={rosterSort}
            library={showingLibraryStudents}
            onApply={(next, nextSort) => {
              setRosterFlags(next);
              setRosterSort(nextSort);
              setRosterFilterOpen(false);
            }}
            onClose={() => setRosterFilterOpen(false)}
          />
        ) : null}
        <div className={`library-student-list-scroll ${listMode === "live" && showingLibraryStudents ? "library-live-student-grid" : "space-y-4"}`}>
          {visibleStudents.map((student) => {
            if (listMode === "live") {
              const displayName = studentDisplayName(student, t);
              const rollNumber = studentDisplayRollNumber(student);
              const slotTime = displayTimeSlots(student.start_time, student.end_time, student.extra_time_slots);
              return (
                <article key={student.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => openStudentDetails(student.id)}
                    className={`library-live-student-card ${selectedStudent?.id === student.id ? "selected" : ""} ${expired(student) ? "expired" : ""}`}
                    aria-label={`${displayName}, ${t("rollNumber")} ${rollNumber}, ${t("timing")} ${slotTime}`}
                  >
                    <div className="library-live-avatar-wrap">
                      <StudentPhoto student={student} displayName={displayName} className="live" />
                      <span className="library-live-roll-badge">#{rollNumber}</span>
                    </div>
                    <strong>{displayName}</strong>
                    <small className="library-live-slot">{slotTime}</small>
                  </button>
                </article>
              );
            }

            const pause = studentPauseState(student.active, student.paused_at);
            const expiryLabel = pause.state === "active"
              ? libraryExpiryStatusLabel(student, today, t)
              : pause.state === "paused"
                ? `${t("pausedTag")} · ${pause.daysLeft} ${t(pause.daysLeft === 1 ? "day" : "days")} ${t("remainingSuffix")}`
                : `${t("inactiveTag")} · ${libraryExpiryStatusLabel(student, today, t)}`;
            const displayName = studentDisplayName(student, t);
            const rollNumber = studentDisplayRollNumber(student);
            const slotTime = displayTimeSlots(student.start_time, student.end_time, student.extra_time_slots);
            return (
              <StudentRosterCard
                key={student.id}
                student={{
                  id: student.id,
                  displayName,
                  rollNumber,
                  imageUrl: student.photo_url,
                  phoneNumber: student.phone_number,
                  meta: student.phone_number ?? t("unknown"),
                  timing: slotTime !== "-" ? slotTime : null,
                  seatNumber: student.seat_number,
                  expiryLabel,
                  expired: expired(student),
                }}
                selected={selectedStudent?.id === student.id}
                showCallAction={allowCallActions}
                onOpen={() => openStudentDetails(student.id)}
              />
            );
          })}
          {visibleCourseStudents.map((record) => {
            const displayName = courseStudentDisplayName(record, t);
            const courseExpired = Boolean(record.subscriptionEndDate && record.subscriptionEndDate < today);
            const coursePause = studentPauseState(record.active, record.pausedAt);
            const expiryLabel = coursePause.state === "active"
              ? subscriptionExpiryStatusLabel(record.subscriptionEndDate, today, t)
              : coursePause.state === "paused"
                ? `${t("pausedTag")} · ${coursePause.daysLeft} ${t(coursePause.daysLeft === 1 ? "day" : "days")} ${t("remainingSuffix")}`
                : t("inactiveTag");
            const timeRange = displayTimeRange(record.startTime, record.endTime);
            const meta = [
              record.courseName,
              `${t("lastPayment")} ${displayDate(record.lastPaymentDate)}`,
            ].filter(Boolean).join(" · ");

            return (
              <StudentRosterCard
                key={record.id}
                student={{
                  id: record.id,
                  displayName,
                  rollNumber: record.rollNumber ?? "-",
                  imageUrl: record.photoUrl,
                  phoneNumber: record.phoneNumber,
                  meta,
                  timing: timeRange !== "-" ? timeRange : null,
                  seatNumber: record.seatNumber,
                  expiryLabel,
                  expired: courseExpired,
                }}
                selected={selectedCourseStudent?.id === record.id}
                showCallAction={false}
                onOpen={() => openStudentDetails(record.id)}
              />
            );
          })}
          {rosterQuery.isPending ? (
            <div className="student-picker-loading" role="status" aria-label="Loading students">
              <span /><span /><span />
            </div>
          ) : null}
          {rosterQuery.isError ? (
            <button className="secondary-button" type="button" onClick={() => void rosterQuery.refetch()}>
              Retry loading students
            </button>
          ) : null}
          {rosterQuery.hasNextPage ? (
            <div className="student-picker-pagination" ref={rosterLoadMoreRef}>
              <button
                className="secondary-button student-roster-load-more"
                type="button"
                onClick={() => void rosterQuery.fetchNextPage()}
                disabled={rosterQuery.isFetchingNextPage}
              >
                {rosterQuery.isFetchingNextPage ? t("saving") : t("loadOlder")}
              </button>
            </div>
          ) : null}
          {!rosterQuery.isPending && !rosterQuery.isError && (showingLibraryStudents ? visibleStudents.length : visibleCourseStudents.length) === 0 ? (
            <div className="operational-filter-empty">
              <p className="text-sm text-on-surface-variant">{t("noRecords")}</p>
              {query.trim() ? (
                <button className="secondary-button" type="button" onClick={() => setQuery("")}>{t("clearSearch")}</button>
              ) : listMode !== "active" && listMode !== "all" ? (
                <button className="secondary-button" type="button" onClick={() => setListMode("active")}>{t("showActiveStudents")}</button>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {drawerKind ? (
        <div className="student-drawer-layer">
          <button className="student-drawer-backdrop" aria-label={t("closeModal")} type="button" onClick={closeStudentDetails} />
          <aside
            ref={drawerPanelRef}
            className="student-profile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={`${t("studentDetails")}: ${drawerName}`}
            tabIndex={-1}
          >
            <header className="student-drawer-header">
              <div className="student-drawer-topline">
                <button
                  className="student-drawer-back-button"
                  type="button"
                  aria-label={drawerView === "subscription" || editingStudent ? t("backToDetails") : t("back")}
                  onClick={() => {
                    if (drawerView === "subscription" || editingStudent) {
                      setEditingStudent(false);
                      setDrawerView("details");
                      return;
                    }
                    closeStudentDetails();
                  }}
                >
                  <ArrowLeft size={18} />
                  {drawerView === "subscription" || editingStudent ? t("backToDetails") : t("back")}
                </button>
                <div className="student-drawer-header-actions">
                  {drawerView === "details" && !editingStudent ? (
                    <button className="student-drawer-edit-button" type="button" onClick={() => setEditingStudent(true)}>
                      <Pencil size={16} />
                      {t("editTransaction")}
                    </button>
                  ) : null}
                  {drawerView !== "subscription" && !editingStudent ? (
                    <details className="student-drawer-menu">
                      <summary aria-label={t("moreOptions")}><MoreHorizontal size={20} /></summary>
                      <div>
                        <button
                          type="button"
                          className={drawerActive ? "danger" : "positive"}
                          onClick={() => setConfirmingStatus(true)}
                        >
                          {drawerActive ? <UserX size={16} /> : <UserCheck size={16} />}
                          {drawerActive ? t("markInactive") : t("reactivate")}
                        </button>
                      </div>
                    </details>
                  ) : null}
                  <button className="student-drawer-close" type="button" aria-label={t("closeModal")} onClick={closeStudentDetails}>
                    <X size={20} />
                  </button>
                </div>
              </div>
              <div className="student-drawer-profile">
                <StudentAvatar displayName={drawerName} imageUrl={drawerPhotoUrl} className="drawer" />
                <div className="student-drawer-identity">
                  <span className={`status-chip ${drawerStatusClass}`}>{drawerStatusLabel}</span>
                  <h2>{drawerName}</h2>
                  <p>#{drawerRollNumber} · {drawerSourceLabel}</p>
                </div>
                <div className="student-drawer-quick-facts">
                  <div>
                    <span>{t("phone")}</span>
                    {allowCallActions && drawerPhoneHref
                      ? <a href={drawerPhoneHref}>{drawerPhoneNumber}</a>
                      : <strong>{drawerPhoneNumber ?? t("notAdded")}</strong>}
                  </div>
                  <div>
                    <span>{t("expiresOn")}</span>
                    <strong>{displayDate(drawerSubscriptionEnd)}</strong>
                  </div>
                </div>
              </div>
            </header>

            {drawerView !== "subscription" && !editingStudent ? (
              <nav className="student-drawer-tabs" aria-label={t("studentDetails")}>
                <button
                  type="button"
                  aria-current={drawerView === "details" ? "page" : undefined}
                  onClick={() => {
                    setDrawerView("details");
                    setConfirmingStatus(false);
                  }}
                >
                  {t("details")}
                </button>
                <button
                  type="button"
                  aria-current={drawerView === "history" ? "page" : undefined}
                  onClick={() => {
                    setDrawerView("history");
                    setConfirmingStatus(false);
                  }}
                >
                  {t("subscriptionHistory")} <span>{drawerHistoryTotal}</span>
                </button>
              </nav>
            ) : null}

            <div className="student-drawer-body">
              {confirmingStatus ? (
                <section className="student-status-confirmation" role="alertdialog" aria-label={drawerActive ? t("markInactive") : t("reactivate")}>
                  <div>
                    <strong>{drawerActive ? t("changeStatus") : `${t("reactivate")}?`}</strong>
                    <p>
                      {drawerActive
                        ? t("pauseOrInactiveHelp")
                        : "The student returns to Active with the same profile and subscription history."}
                    </p>
                  </div>
                  <div className="student-status-confirmation-actions">
                    <button className="secondary-button" type="button" onClick={() => setConfirmingStatus(false)}>{t("cancel")}</button>
                    {(drawerActive ? (["paused", "inactive"] as const) : (["active"] as const)).map((nextStatus) => (
                      <form
                        key={nextStatus}
                        onSubmit={(event) => submitAndClose(
                          event,
                          setStudentStatusAction,
                          setNotice,
                          startTransition,
                          () => {
                            setQuery("");
                            setListMode(nextStatus === "active" ? "active" : "inactive");
                            closeStudentDetails();
                          },
                        )}
                      >
                        <input type="hidden" name="student_type" value={drawerKind ?? ""} />
                        <input type="hidden" name="id" value={selectedStudent?.id ?? selectedCourseStudent?.id ?? ""} />
                        {selectedStudent ? <input type="hidden" name="payment_id" value={selectedStudent.last_payment_id ?? ""} /> : null}
                        <input type="hidden" name="active" value={nextStatus === "active" ? "true" : "false"} />
                        <input type="hidden" name="status" value={nextStatus} />
                        <button className={nextStatus === "active" ? "primary-button" : nextStatus === "paused" ? "secondary-button tone-pause" : "secondary-button tone-cancel"} type="submit">
                          {nextStatus === "active" ? t("reactivate") : nextStatus === "paused" ? t("markPaused") : t("markInactive")}
                        </button>
                      </form>
                    ))}
                  </div>
                </section>
              ) : null}

              {editingStudent && selectedStudent ? (
                <form
                  key={`library-profile-${selectedStudent.id}`}
                  className="form-grid two student-profile-edit-form"
                  onSubmit={(event) => submitWith(event, saveLibraryStudentAction, setNotice, startTransition, false, () => setEditingStudent(false))}
                >
                  <input type="hidden" name="id" value={selectedStudent.id} />
                  <CompressedImageInput inputName="student_photo" label={t("studentPhoto")} previewLabel={t("photoPreview")} displayName={studentNameInputValue(selectedStudent)} initialImageUrl={selectedStudent.photo_url} variant="student" autoSave={{ studentType: "library", studentId: selectedStudent.id }} />
                  <label>{t("name")}<input name="student_name" defaultValue={studentNameInputValue(selectedStudent)} required /></label>
                  <label>{t("rollNumber")}<input name="roll_number" defaultValue={studentDisplayRollNumber(selectedStudent)} required /></label>
                  <label>{t("phone")}<input name="phone_number" defaultValue={selectedStudent.phone_number ?? ""} inputMode="tel" /></label>
                  <label className="full-span">{t("address")}<input name="address" defaultValue={selectedStudent.address ?? ""} /></label>
                  <label>{t("aadharNumber")}<input name="aadhar_number" defaultValue={selectedStudent.aadhar_number ?? ""} inputMode="numeric" /></label>
                  <CompressedImageInput inputName="aadhar_photo" label={t("aadharFront")} previewLabel={t("aadharFrontPreview")} initialImageUrl={selectedStudent.aadhar_photo_url} variant="document" autoSave={{ studentType: "library", studentId: selectedStudent.id }} />
                  <CompressedImageInput inputName="aadhar_back_photo" label={t("aadharBack")} previewLabel={t("aadharBackPreview")} initialImageUrl={selectedStudent.aadhar_back_photo_url} variant="document" autoSave={{ studentType: "library", studentId: selectedStudent.id }} />
                  <label>{t("seatNumber")}<input name="seat_number" defaultValue={selectedStudent.seat_number ?? ""} /></label>
                  <label>{t("lockerNumber")}<input name="locker_number" defaultValue={selectedStudent.locker_number ?? ""} /></label>
                  <div className="full-span flex flex-wrap gap-2">
                    <button className="primary-button" type="submit">{t("save")}</button>
                    <button className="secondary-button" type="button" onClick={() => setEditingStudent(false)}>{t("cancel")}</button>
                  </div>
                </form>
              ) : null}

              {editingStudent && selectedCourseStudent ? (
                <form
                  key={`course-profile-${selectedCourseStudent.id}`}
                  className="form-grid two student-profile-edit-form"
                  onSubmit={(event) => submitWith(event, saveCourseStudentAction, setNotice, startTransition, false, () => setEditingStudent(false))}
                >
                  <input type="hidden" name="payment_id" value={selectedCourseStudent.paymentId ?? ""} />
                  <CompressedImageInput inputName="student_photo" label={t("studentPhoto")} previewLabel={t("photoPreview")} displayName={drawerName} initialImageUrl={selectedCourseStudent.photoUrl} variant="student" autoSave={{ studentType: "course", studentId: selectedCourseStudent.id }} />
                  <label>{t("name")}<input name="customer_name" defaultValue={drawerName} required /></label>
                  <label>{t("rollNumber")}<input name="roll_number" defaultValue={selectedCourseStudent.rollNumber ?? ""} required /></label>
                  <label>{t("phone")}<input name="phone_number" defaultValue={selectedCourseStudent.phoneNumber ?? ""} inputMode="tel" /></label>
                  <label className="full-span">{t("address")}<input name="address" defaultValue={selectedCourseStudent.address ?? ""} /></label>
                  <label>{t("aadharNumber")}<input name="aadhar_number" defaultValue={selectedCourseStudent.aadharNumber ?? ""} inputMode="numeric" /></label>
                  <CompressedImageInput inputName="aadhar_photo" label={t("aadharFront")} previewLabel={t("aadharFrontPreview")} initialImageUrl={selectedCourseStudent.aadharPhotoUrl} variant="document" autoSave={{ studentType: "course", studentId: selectedCourseStudent.id }} />
                  <CompressedImageInput inputName="aadhar_back_photo" label={t("aadharBack")} previewLabel={t("aadharBackPreview")} initialImageUrl={selectedCourseStudent.aadharBackPhotoUrl} variant="document" autoSave={{ studentType: "course", studentId: selectedCourseStudent.id }} />
                  <label>{t("startDate")}<input name="start_date" type="date" defaultValue={selectedCourseStudent.subscriptionStartDate ?? ""} required /></label>
                  <label>{t("endDate")}<input name="end_date" type="date" defaultValue={selectedCourseStudent.subscriptionEndDate ?? ""} required /></label>
                  <label>{t("startTime")}<input name="start_time" type="time" defaultValue={selectedCourseStudent.startTime?.slice(0, 5) ?? "06:00"} required /></label>
                  <label>{t("endTime")}<input name="end_time" type="time" defaultValue={selectedCourseStudent.endTime?.slice(0, 5) ?? "07:00"} required /></label>
                  <div className="full-span flex flex-wrap gap-2">
                    <button className="primary-button" type="submit">{t("save")}</button>
                    <button className="secondary-button" type="button" onClick={() => setEditingStudent(false)}>{t("cancel")}</button>
                  </div>
                </form>
              ) : null}

              {!editingStudent && drawerView === "details" ? (
                <div className="student-drawer-details">
                  <section className="student-drawer-section">
                    <div className="student-drawer-section-heading"><h3>{t("studentProfile")}</h3></div>
                    <div className="student-drawer-detail-grid">
                      <StudentDetailItem
                        label={t("phone")}
                        value={allowCallActions && drawerPhoneHref ? <a href={drawerPhoneHref}>{drawerPhoneNumber}</a> : drawerPhoneNumber ?? t("notAdded")}
                      />
                      <StudentDetailItem label={t("address")} value={displayTextValue(drawerAddress)} className="wide" />
                      <StudentDetailItem label={t("aadharNumber")} value={displayTextValue(drawerAadharNumber)} />
                      {selectedStudent ? <StudentDetailItem label={t("seatNumber")} value={displayTextValue(selectedStudent.seat_number)} /> : null}
                      {selectedStudent ? <StudentDetailItem label={t("lockerNumber")} value={displayTextValue(selectedStudent.locker_number)} /> : null}
                      {selectedCourseStudent ? <StudentDetailItem label={t("course")} value={selectedCourseStudent.courseName} /> : null}
                      <StudentDetailItem label={t("aadharFront")} value={<StudentDocumentPreview imageUrl={drawerAadharFront} previewLabel={t("aadharFrontPreview")} />} />
                      <StudentDetailItem label={t("aadharBack")} value={<StudentDocumentPreview imageUrl={drawerAadharBack} previewLabel={t("aadharBackPreview")} />} />
                    </div>
                  </section>
                  <section className="student-drawer-section">
                    <div className="student-drawer-section-heading"><h3>{t("subscription")}</h3><span className={`status-chip ${drawerStatusClass}`}>{drawerStatusLabel}</span></div>
                    <div className="student-drawer-detail-grid">
                      <StudentDetailItem label={t("subscriptionPeriod")} value={displayDateRange(drawerSubscriptionStart, drawerSubscriptionEnd, t)} className="wide important" />
                      <StudentDetailItem label={t("timing")} value={displayTimeRange(drawerStartTime, drawerEndTime)} />
                      <StudentDetailItem label={t("lastPayment")} value={displayDate(drawerLastPayment)} />
                    </div>
                    <div className="student-drawer-money-grid">
                      <span>{t("fee")}<strong>{displayMoneyValue(drawerFee)}</strong></span>
                      <span>{t("paid")}<strong>{displayMoneyValue(drawerPaid)}</strong></span>
                      <span>{t("dues")}<strong>{displayMoneyValue(drawerDues)}</strong></span>
                      <span>{t("advance")}<strong>{displayMoneyValue(drawerAdvance)}</strong></span>
                    </div>
                  </section>
                </div>
              ) : null}

              {!editingStudent && drawerView === "history" ? (
                <SubscriptionHistoryTimeline
                  subscriptions={drawerHistorySubscriptions}
                  totalSubscriptions={drawerHistoryTotal}
                  totalTransactions={drawerHistoryTransactionTotal}
                  error={drawerHistoryError}
                  hasMore={drawerHasMoreHistory}
                  loadingMore={drawerLoadingMoreHistory}
                  onLoadOlder={() => void drawerHistoryQuery.fetchNextPage()}
                  editTarget={drawerKind && (selectedStudent?.id ?? selectedCourseStudent?.id)
                    ? { studentType: drawerKind, studentId: (selectedStudent?.id ?? selectedCourseStudent?.id) as string }
                    : null}
                  setNotice={setNotice}
                  startTransition={startTransition}
                />
              ) : null}

              {!editingStudent && drawerView === "refund" && drawerKind && Number(drawerAdvance ?? 0) > 0 ? (
                <section className="student-subscription-step">
                  <div className="student-subscription-step-intro">
                    <ArrowUp size={18} />
                    <div><h3>{t("returnAdvance")}</h3><p>#{drawerRollNumber} · {drawerName} · {t("advance")} {displayMoneyValue(drawerAdvance)}</p></div>
                  </div>
                  <form
                    className="form-grid two"
                    onSubmit={(event) => submitAndClose(event, refundStudentAdvanceAction, setNotice, startTransition, () => setDrawerView("details"))}
                  >
                    <input type="hidden" name="student_type" value={drawerKind} />
                    <input type="hidden" name="student_id" value={selectedStudent?.id ?? selectedCourseStudent?.id ?? ""} />
                    <div className="form-pair full-span">
                      <label>
                        {t("amount")}
                        <input name="amount" type="number" min="1" step="1" max={Number(drawerAdvance ?? 0)} defaultValue={Number(drawerAdvance ?? 0)} required />
                      </label>
                      <label>
                        {t("mode")}
                        <select name="mode" defaultValue="cash">
                          <option value="cash">{t("cash")}</option>
                          <option value="online">{t("online")}</option>
                        </select>
                      </label>
                    </div>
                    <label className="full-span">
                      {t("date")}
                      <input name="refund_date" type="date" defaultValue={todayIso()} max={todayIso()} required />
                    </label>
                    <label className="full-span">
                      {t("note")}
                      <input name="note" placeholder={t("optional")} />
                    </label>
                    <p className="date-filter-note full-span">{t("returnAdvanceHelp")}</p>
                    <div className="full-span student-subscription-edit-actions">
                      <button className="secondary-button" type="button" onClick={() => setDrawerView("details")}>{t("cancel")}</button>
                      <button className="primary-button" type="submit">{t("returnAdvance")}</button>
                    </div>
                  </form>
                </section>
              ) : null}

              {!editingStudent && drawerView === "subscription" && selectedStudent ? (
                <section className="student-subscription-step">
                  <div className="student-subscription-step-intro">
                    <Plus size={18} />
                    <div><h3>{Number(selectedStudent.dues_amount ?? 0) > 0 ? t("collectDue") : t("addSubscription")}</h3><p>#{drawerRollNumber} · {drawerName}</p></div>
                  </div>
                  <PaymentForm
                    key={`drawer-library-subscription-${selectedStudent.id}-${selectedStudent.last_payment_id ?? selectedStudent.updated_at}`}
                    businessId={businessId}
                    cacheScope={cacheScope}
                    type="library"
                    rooms={[]}
                    courses={[]}
                    referrals={[]}
                    courseStudents={mergedCourseStudentRows}
                    libraryStudents={mergedLibraryStudents}
                    initialLibraryStudent={selectedStudent}
                    setNotice={setNotice}
                    startTransition={startTransition}
                    onSuccess={() => setDrawerView("details")}
                  />
                </section>
              ) : null}

              {!editingStudent && drawerView === "subscription" && selectedCourseStudent ? (
                <section className="student-subscription-step">
                  <div className="student-subscription-step-intro">
                    <Plus size={18} />
                    <div><h3>{Number(selectedCourseStudent.duesAmount ?? 0) > 0 ? t("collectDue") : t("addSubscription")}</h3><p>#{drawerRollNumber} · {drawerName}</p></div>
                  </div>
                  <PaymentForm
                    key={`drawer-course-subscription-${selectedCourseStudent.id}-${selectedCourseStudent.paymentId ?? "new"}`}
                    businessId={businessId}
                    cacheScope={cacheScope}
                    type="course"
                    rooms={[]}
                    courses={courses}
                    referrals={[]}
                    courseStudents={mergedCourseStudentRows}
                    libraryStudents={mergedLibraryStudents}
                    initialCourseStudent={selectedCourseStudent}
                    initialCourseSource={selectedSource.type === "library" ? null : selectedSource}
                    setNotice={setNotice}
                    startTransition={startTransition}
                    onSuccess={() => setDrawerView("details")}
                  />
                </section>
              ) : null}
            </div>

            {!editingStudent && drawerView !== "subscription" && drawerView !== "refund" ? (
              <footer className={`student-drawer-footer${Number(drawerAdvance ?? 0) > 0 ? " with-refund" : ""}`}>
                {Number(drawerAdvance ?? 0) > 0 ? (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setConfirmingStatus(false);
                      setDrawerView("refund");
                    }}
                  >
                    <ArrowUp size={18} />
                    {t("returnAdvance")}
                  </button>
                ) : null}
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => {
                    setConfirmingStatus(false);
                    setDrawerView("subscription");
                  }}
                >
                  <Plus size={18} />
                  {(selectedStudent && Number(selectedStudent.dues_amount ?? 0) > 0)
                    || (selectedCourseStudent && Number(selectedCourseStudent.duesAmount ?? 0) > 0)
                    ? t("collectDue")
                    : t("addSubscription")}
                </button>
              </footer>
            ) : null}
          </aside>
        </div>
      ) : null}

    </section>
  );
}

function StudentCollectionFlow({
  businessId,
  cacheScope,
  type,
  courses,
  referrals,
  courseStudents,
  libraryStudents,
  setNotice,
  startTransition,
  onSuccess,
}: {
  businessId: string;
  cacheScope: string;
  type: "library" | "course";
  courses: Course[];
  referrals: Pick<ReferralCode, "code">[];
  courseStudents: CourseStudent[];
  libraryStudents: LibraryStudent[];
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
  onSuccess: () => void;
}) {
  const { t } = useLanguage();
  const [memberMode, setMemberMode] = useState<LibraryMemberMode | null>(null);
  const studentSources = useMemo(
    () => type === "library"
      ? [{ id: "library", type: "library", label: t("library") } satisfies StudentRecordSource]
      : studentRecordSources(courses, t, false, true),
    [courses, t, type],
  );
  const [selectedSourceId, setSelectedSourceId] = useState(studentSources[0]?.id ?? "");
  const selectedCourseSource = studentSources.find(
    (source): source is CourseStudentRecordSource => source.id === selectedSourceId && source.type !== "library",
  ) ?? null;
  const sourceReady = type === "library" || Boolean(selectedCourseSource);

  return (
    <div className="collection-student-flow">
      <div className="library-member-mode" role="group" aria-label={t("memberType")}>
        <button
          type="button"
          className={memberMode === "new" ? "selected" : ""}
          aria-pressed={memberMode === "new"}
          onClick={() => setMemberMode("new")}
        >
          <UserPlus size={18} />
          <span>{t("newStudent")}</span>
        </button>
        <button
          type="button"
          className={memberMode === "existing" ? "selected" : ""}
          aria-pressed={memberMode === "existing"}
          onClick={() => setMemberMode("existing")}
        >
          <UserCheck size={18} />
          <span>{t("existingMember")}</span>
        </button>
      </div>

      {memberMode === "new" && sourceReady ? (
        <PaymentForm
          key={`new-${type}-${selectedSourceId}`}
          businessId={businessId}
          cacheScope={cacheScope}
          type={type}
          rooms={[]}
          courses={courses}
          referrals={referrals}
          courseStudents={courseStudents}
          libraryStudents={libraryStudents}
          initialMemberMode="new"
          initialCourseSource={selectedCourseSource}
          setNotice={setNotice}
          startTransition={startTransition}
          onSuccess={onSuccess}
        />
      ) : null}

      {memberMode === "existing" && sourceReady ? (
        <LibraryStudentsView
          key={`existing-${type}`}
          businessId={businessId}
          cacheScope={cacheScope}
          variant="collection"
          students={libraryStudents}
          courseStudentRows={courseStudents}
          courses={courses}
          studentSources={studentSources}
          selectedSourceId={selectedSourceId}
          setSelectedSourceId={setSelectedSourceId}
          // Inactive students stay findable here; a new subscription reactivates them.
          listMode="all"
          setListMode={() => undefined}
          setNotice={setNotice}
          startTransition={startTransition}
        />
      ) : null}

      {memberMode && !sourceReady ? <p className="empty-state">{t("noRecords")}</p> : null}
    </div>
  );
}

function ActionSheet({
  businessId,
  cacheScope,
  actionModal,
  selectedPositive,
  selectedNegative,
  setSelectedPositive,
  setSelectedNegative,
  canUsePayment,
  businessTypes,
  rooms,
  courses,
  referrals,
  courseStudents,
  libraryStudents,
  receiveMoneyProfiles,
  sendMoneyProfiles,
  settlementDate,
  agentIncentiveBalances,
  canPayAgentIncentive,
  closeAction,
  setNotice,
  startTransition,
}: {
  businessId: string;
  cacheScope: string;
  actionModal: Exclude<ActionModal, null>;
  selectedPositive: PositiveFlow | null;
  selectedNegative: NegativeFlow | null;
  setSelectedPositive: (type: PositiveFlow | null) => void;
  setSelectedNegative: (type: NegativeFlow | null) => void;
  canUsePayment: (type: BusinessType | "expense") => boolean;
  businessTypes: BusinessType[];
  rooms: { id: string; room_number: string; label: string | null }[];
  courses: Course[];
  referrals: Pick<ReferralCode, "code">[];
  courseStudents: CourseStudent[];
  libraryStudents: LibraryStudent[];
  receiveMoneyProfiles: Profile[];
  sendMoneyProfiles: Profile[];
  settlementDate: string;
  agentIncentiveBalances: AgentIncentiveBalance[];
  canPayAgentIncentive: boolean;
  closeAction: () => void;
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const { t } = useLanguage();
  const positiveOptions = paymentOptions.filter((option): option is { type: BusinessType; labelKey: string; icon: ReactNode } =>
    option.type !== "expense" && canUsePayment(option.type),
  );
  const positiveSettlementOptions = receiveMoneyProfiles.length > 0
    ? [{ type: "receive_money" as const, labelKey: "receiveMoney", icon: <ArrowDown size={18} /> }]
    : [];
  const negativeOptions = [
    ...(canUsePayment("expense") ? [{ type: "expense" as const, labelKey: "expense", icon: <Banknote size={18} /> }] : []),
    ...(sendMoneyProfiles.length > 0
      ? [{ type: "send_money" as const, labelKey: "sendMoney", icon: <ArrowUp size={18} /> }]
      : []),
    ...(canPayAgentIncentive && agentIncentiveBalances.length > 0
      ? [{ type: "agent_settlement" as const, labelKey: "agentPayout", icon: <WalletCards size={18} /> }]
      : []),
  ];
  const title = actionModal === "positive" ? t("collectPayment") : t("negativeEntry");

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label={title}>
      <button className="modal-backdrop" aria-label={t("closeModal")} type="button" onClick={closeAction} />
      <section className="action-sheet">
        <header className="sheet-header">
          <div>
            <p className="eyebrow">{actionModal === "positive" ? t("moneyIn") : t("moneyOut")}</p>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" type="button" aria-label={t("closeModal")} onClick={closeAction}>
            <X size={18} />
          </button>
        </header>

        {actionModal === "positive" && !selectedPositive ? (
          <div className="sheet-options">
            {[...positiveOptions, ...positiveSettlementOptions].map((option) => (
              <button className="sheet-option positive-option" key={option.type} type="button" onClick={() => setSelectedPositive(option.type)}>
                {option.icon}
                <span>{t(option.labelKey)}</span>
              </button>
            ))}
          </div>
        ) : null}

        {actionModal === "negative" && !selectedNegative ? (
          <div className="sheet-options">
            {negativeOptions.map((option) => (
              <button className="sheet-option negative-option" key={option.type} type="button" onClick={() => setSelectedNegative(option.type)}>
                {option.icon}
                <span>{t(option.labelKey)}</span>
              </button>
            ))}
          </div>
        ) : null}

        {actionModal === "positive" && (selectedPositive === "library" || selectedPositive === "course") ? (
          <>
            <button className="back-link" type="button" onClick={() => setSelectedPositive(null)}>
              {t("selectAnotherType")}
            </button>
            <StudentCollectionFlow
              businessId={businessId}
              cacheScope={cacheScope}
              type={selectedPositive}
              courses={courses}
              referrals={referrals}
              courseStudents={courseStudents}
              libraryStudents={libraryStudents}
              setNotice={setNotice}
              startTransition={startTransition}
              onSuccess={closeAction}
            />
          </>
        ) : null}

        {actionModal === "positive"
        && selectedPositive
        && selectedPositive !== "receive_money"
        && selectedPositive !== "library"
        && selectedPositive !== "course" ? (
          <>
            <button className="back-link" type="button" onClick={() => setSelectedPositive(null)}>
              {t("selectAnotherType")}
            </button>
            <PaymentForm
              businessId={businessId}
              cacheScope={cacheScope}
              type={selectedPositive}
              rooms={rooms}
              courses={courses}
              referrals={referrals}
              courseStudents={courseStudents}
              libraryStudents={libraryStudents}
              setNotice={setNotice}
              startTransition={startTransition}
              onSuccess={closeAction}
            />
          </>
        ) : null}

        {actionModal === "positive" && selectedPositive === "receive_money" ? (
          <>
            <button className="back-link" type="button" onClick={() => setSelectedPositive(null)}>
              {t("selectAnotherType")}
            </button>
            <MoneySettlementForm
              direction="received_from_user"
              profiles={receiveMoneyProfiles}
              settlementDate={settlementDate}
              setNotice={setNotice}
              startTransition={startTransition}
              onSuccess={closeAction}
            />
          </>
        ) : null}

        {actionModal === "negative" && selectedNegative === "expense" ? (
          <>
            <button className="back-link" type="button" onClick={() => setSelectedNegative(null)}>
              {t("selectAnotherType")}
            </button>
            <ExpenseForm businessTypes={businessTypes} setNotice={setNotice} startTransition={startTransition} onSuccess={closeAction} />
          </>
        ) : null}

        {actionModal === "negative" && selectedNegative === "agent_settlement" ? (
          <>
            <button className="back-link" type="button" onClick={() => setSelectedNegative(null)}>
              {t("selectAnotherType")}
            </button>
            <AgentSettlementForm
              agentIncentiveBalances={agentIncentiveBalances}
              setNotice={setNotice}
              startTransition={startTransition}
              onSuccess={closeAction}
            />
          </>
        ) : null}

        {actionModal === "negative" && selectedNegative === "send_money" ? (
          <>
            <button className="back-link" type="button" onClick={() => setSelectedNegative(null)}>
              {t("selectAnotherType")}
            </button>
            <MoneySettlementForm
              direction="sent_to_user"
              profiles={sendMoneyProfiles}
              settlementDate={settlementDate}
              setNotice={setNotice}
              startTransition={startTransition}
              onSuccess={closeAction}
            />
          </>
        ) : null}
      </section>
    </div>
  );
}

function PaymentForm({
  businessId,
  cacheScope,
  type,
  rooms,
  courses,
  referrals,
  courseStudents,
  libraryStudents,
  initialMemberMode,
  initialLibraryStudent,
  initialCourseStudent,
  initialCourseSource,
  setNotice,
  startTransition,
  onSuccess,
}: {
  businessId: string;
  cacheScope: string;
  type: BusinessType;
  rooms: { id: string; room_number: string; label: string | null }[];
  courses: Course[];
  referrals: Pick<ReferralCode, "code">[];
  courseStudents: CourseStudent[];
  libraryStudents: LibraryStudent[];
  initialMemberMode?: LibraryMemberMode;
  initialLibraryStudent?: LibraryStudent | null;
  initialCourseStudent?: CourseStudentRecord | null;
  initialCourseSource?: CourseStudentRecordSource | null;
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
  onSuccess?: () => void;
}) {
  const { t } = useLanguage();
  const today = todayIso();
  const initialLibraryPrefill = type === "library" && initialLibraryStudent ? libraryStudentPrefill(initialLibraryStudent, t) : null;
  const initialLibraryRenewalRange = type === "library" && initialLibraryStudent ? libraryRenewalDateRange(initialLibraryStudent) : null;
  const initialLibraryDueAmount = type === "library" && initialLibraryStudent ? Math.max(Number(initialLibraryStudent.dues_amount ?? 0), 0) : 0;
  const initialCoursePrefill = type === "course" && initialCourseStudent ? courseStudentPrefill(initialCourseStudent, t) : null;
  const initialCourseRenewalRange = type === "course" && initialCourseStudent ? courseRenewalDateRange(initialCourseStudent) : null;
  const initialCourseDueAmount = type === "course" && initialCourseStudent ? Math.max(Number(initialCourseStudent.duesAmount ?? 0), 0) : 0;
  const initialCourse = type === "course" && initialCourseSource ? initialCourseSource.course : null;
  const [libraryMemberMode, setLibraryMemberMode] = useState<LibraryMemberMode | null>(initialLibraryPrefill ? "existing" : initialMemberMode ?? null);
  const [fee, setFee] = useState(initialLibraryPrefill?.fee ?? initialCoursePrefill?.fee ?? "");
  const [admissionFee, setAdmissionFee] = useState("");
  const [paid, setPaid] = useState(
    initialLibraryDueAmount > 0
      ? String(initialLibraryDueAmount)
      : initialCourseDueAmount > 0
        ? String(initialCourseDueAmount)
        : "",
  );
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [cashCollection, setCashCollection] = useState("");
  const [onlineCollection, setOnlineCollection] = useState("");
  const [startTime, setStartTime] = useState(initialLibraryPrefill?.startTime ?? initialCoursePrefill?.startTime ?? "06:00");
  const [endTime, setEndTime] = useState(initialLibraryPrefill?.endTime ?? initialCoursePrefill?.endTime ?? "07:00");
  // Extra daily slots after the first one (library); they may not overlap each other or the first.
  const [extraSlots, setExtraSlots] = useState<TimeSlotValue[]>(initialLibraryPrefill?.extraSlots ?? []);
  const allTimeSlots = [{ start: startTime, end: endTime }, ...extraSlots];
  const timeSlotError = timeSlotsProblem(allTimeSlots, t);
  const slotValidityRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    slotValidityRef.current?.setCustomValidity(type === "library" && timeSlotError ? timeSlotError : "");
  }, [timeSlotError, type]);
  // Library "Full time" = the whole opening day (7 AM - 10 PM); while ticked the times are locked.
  const libraryFullTime = startTime === libraryFullTimeStart && endTime === libraryFullTimeEnd;
  const timesBeforeFullTimeRef = useRef<{ start: string; end: string } | null>(null);
  const toggleLibraryFullTime = (checked: boolean) => {
    if (checked) {
      timesBeforeFullTimeRef.current = { start: startTime, end: endTime };
      setStartTime(libraryFullTimeStart);
      setEndTime(libraryFullTimeEnd);
      setExtraSlots([]);
      return;
    }
    const previous = timesBeforeFullTimeRef.current;
    const restorable = previous && !(previous.start === libraryFullTimeStart && previous.end === libraryFullTimeEnd);
    setStartTime(restorable ? previous.start : "06:00");
    setEndTime(restorable ? previous.end : "07:00");
  };
  const libraryExtraSlotsEditor = libraryFullTime ? null : (
    <div className="extra-slots full-span">
      {extraSlots.map((slot, index) => (
        <div className="extra-slot-row" key={index}>
          <label>
            {t("startTime")} {index + 2}
            <input
              type="time"
              step="3600"
              min="06:00"
              max="22:00"
              value={slot.start}
              onChange={(event) => setExtraSlots((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, start: event.target.value } : item))}
              required
            />
          </label>
          <label>
            {t("endTime")} {index + 2}
            <input
              type="time"
              step="3600"
              min="06:00"
              max="22:00"
              value={slot.end}
              onChange={(event) => setExtraSlots((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, end: event.target.value } : item))}
              required
            />
          </label>
          <button
            className="icon-button extra-slot-remove"
            type="button"
            aria-label={t("removeSlot")}
            onClick={() => setExtraSlots((current) => current.filter((_, itemIndex) => itemIndex !== index))}
          >
            <X size={16} />
          </button>
        </div>
      ))}
      <button className="secondary-button extra-slot-add" type="button" onClick={() => setExtraSlots((current) => [...current, nextFreeSlot([{ start: startTime, end: endTime }, ...current])])}>
        <Plus size={16} /> {t("addSlot")}
      </button>
      {timeSlotError ? <p className="form-error">{timeSlotError}</p> : null}
      <input type="hidden" name="extra_time_slots" value={JSON.stringify(extraSlots)} />
      {/* Not read-only: read-only inputs skip validation, and this one carries the overlap error. */}
      <input ref={slotValidityRef} className="slot-validity" tabIndex={-1} aria-hidden="true" value={timeSlotError ? "" : "ok"} onChange={() => undefined} />
    </div>
  );
  const libraryFullTimeToggle = (
    <label className="full-time-toggle full-span">
      <input type="checkbox" checked={libraryFullTime} onChange={(event) => toggleLibraryFullTime(event.target.checked)} />
      <span>{t("fullTime")}</span>
      <small>7:00 AM – 10:00 PM</small>
    </label>
  );
  const [selectedCourseId, setSelectedCourseId] = useState(initialCourse?.id ?? "");
  const [courseMemberMode, setCourseMemberMode] = useState<LibraryMemberMode | null>(initialCoursePrefill ? "existing" : initialMemberMode ?? null);
  const [courseSearch, setCourseSearch] = useState(initialCoursePrefill?.searchLabel ?? "");
  const [debouncedCourseSearch, setDebouncedCourseSearch] = useState("");
  const [selectedCourseStudentId, setSelectedCourseStudentId] = useState(initialCoursePrefill?.id ?? "");
  const [librarySearch, setLibrarySearch] = useState(initialLibraryPrefill?.searchLabel ?? "");
  const [debouncedLibrarySearch, setDebouncedLibrarySearch] = useState("");
  const [selectedLibraryStudentId, setSelectedLibraryStudentId] = useState(initialLibraryPrefill?.id ?? "");
  const libraryLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const courseLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const [studentName, setStudentName] = useState(initialLibraryPrefill?.name ?? initialCoursePrefill?.name ?? "");
  const [rollNumber, setRollNumber] = useState(initialLibraryPrefill?.rollNumber ?? initialCoursePrefill?.rollNumber ?? "");
  const [phoneNumber, setPhoneNumber] = useState(initialLibraryPrefill?.phoneNumber ?? "");
  const [address, setAddress] = useState(initialLibraryPrefill?.address ?? "");
  const [aadharNumber, setAadharNumber] = useState(initialCoursePrefill?.aadharNumber ?? "");
  const [seatNumber, setSeatNumber] = useState(initialLibraryPrefill?.seatNumber ?? initialCoursePrefill?.seatNumber ?? "");
  const [lockerNumber, setLockerNumber] = useState(initialLibraryPrefill?.lockerNumber ?? "");
  const [subscriptionStartDate, setSubscriptionStartDate] = useState(initialLibraryRenewalRange?.startDate ?? initialCourseRenewalRange?.startDate ?? todayIso());
  const [subscriptionEndDate, setSubscriptionEndDate] = useState(initialLibraryRenewalRange?.endDate ?? initialCourseRenewalRange?.endDate ?? addMonthsIso());
  const selectedCourseSource = useMemo<CourseStudentRecordSource | null>(() => {
    const course = courses.find((item) => item.id === selectedCourseId);
    return course ? { id: studentRecordSourceId(course), type: "course", label: course.name, course } : null;
  }, [courses, selectedCourseId]);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedLibrarySearch(librarySearch.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [librarySearch]);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedCourseSearch(courseSearch.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [courseSearch]);

  const libraryCollectionQuery = useInfiniteQuery({
    queryKey: ["student-picker", cacheScope, "library", debouncedLibrarySearch],
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({
        source: "library",
        intent: "existing",
        cursor: String(pageParam),
      });
      if (debouncedLibrarySearch) params.set("q", debouncedLibrarySearch);
      return fetchJson<StudentCollectionPage>(
        `/api/businesses/${businessId}/student-collection?${params}`,
        signal,
      );
    },
    initialPageParam: "0",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: type === "library" && libraryMemberMode === "existing" && !selectedLibraryStudentId && !initialLibraryStudent,
    staleTime: 300_000,
  });
  const courseCollectionQuery = useInfiniteQuery({
    queryKey: ["student-picker", cacheScope, selectedCourseSource?.id ?? "", debouncedCourseSearch],
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({
        source: selectedCourseSource?.id ?? "",
        intent: "existing",
        cursor: String(pageParam),
      });
      if (debouncedCourseSearch) params.set("q", debouncedCourseSearch);
      return fetchJson<StudentCollectionPage>(
        `/api/businesses/${businessId}/student-collection?${params}`,
        signal,
      );
    },
    initialPageParam: "0",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: type === "course" && courseMemberMode === "existing" && Boolean(selectedCourseSource) && !selectedCourseStudentId && !initialCourseStudent,
    staleTime: 300_000,
  });
  const libraryDefaultsQuery = useQuery({
    queryKey: ["student-collection-defaults", cacheScope, "library"],
    queryFn: ({ signal }) => fetchJson<StudentCollectionPage>(
      `/api/businesses/${businessId}/student-collection?source=library&intent=new_defaults`,
      signal,
    ),
    enabled: type === "library" && libraryMemberMode === "new" && !initialLibraryStudent,
    staleTime: 60_000,
  });
  const courseDefaultsQuery = useQuery({
    queryKey: ["student-collection-defaults", cacheScope, selectedCourseSource?.id ?? ""],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        source: selectedCourseSource?.id ?? "",
        intent: "new_defaults",
      });
      return fetchJson<StudentCollectionPage>(
        `/api/businesses/${businessId}/student-collection?${params}`,
        signal,
      );
    },
    enabled: type === "course" && courseMemberMode === "new" && Boolean(selectedCourseSource) && !initialCourseStudent,
    staleTime: 60_000,
  });
  const suggestedRollNumber = type === "library" && libraryMemberMode === "new"
    ? libraryDefaultsQuery.data?.nextRollNumber ?? ""
    : type === "course" && courseMemberMode === "new"
      ? courseDefaultsQuery.data?.nextRollNumber ?? ""
      : "";
  const effectiveRollNumber = rollNumber || suggestedRollNumber;

  const collectionLibraryStudents = useMemo(
    () => libraryCollectionQuery.data?.pages.flatMap((page) =>
      page.items.flatMap((item) => item.source === "library" ? [item.student] : []),
    ) ?? [],
    [libraryCollectionQuery.data?.pages],
  );
  const collectionCourseStudents = useMemo(
    () => courseCollectionQuery.data?.pages.flatMap((page) =>
      page.items.flatMap((item) => item.source === "course" ? [item.student] : []),
    ) ?? [],
    [courseCollectionQuery.data?.pages],
  );
  const selectedLibraryStudent = useMemo(() => {
    if (initialLibraryStudent && initialLibraryStudent.id === selectedLibraryStudentId) return initialLibraryStudent;
    return collectionLibraryStudents.find((student) => student.id === selectedLibraryStudentId)
      ?? libraryStudents.find((student) => student.id === selectedLibraryStudentId)
      ?? null;
  }, [collectionLibraryStudents, initialLibraryStudent, libraryStudents, selectedLibraryStudentId]);
  const courseStudentRecords = useMemo(() => {
    if (!selectedCourseSource) return [];
    const rows = new Map<string, CourseStudent>();
    courseStudents
      .filter((student) => student.source_course_id === selectedCourseSource.course.id)
      .forEach((student) => rows.set(student.id, student));
    collectionCourseStudents.forEach((student) => rows.set(student.id, student));
    return [...rows.values()].map((student) => courseStudentRecordFromStudent(student, selectedCourseSource));
  }, [collectionCourseStudents, courseStudents, selectedCourseSource]);
  const sortedCourseStudentRecords = useMemo(
    () => [...courseStudentRecords].sort((a, b) => compareCourseStudentRecordsByExpiry(a, b, t)),
    [courseStudentRecords, t],
  );
  const selectedCourseStudent = useMemo(
    () => {
      if (initialCourseStudent && initialCourseStudent.id === selectedCourseStudentId) return initialCourseStudent;
      return sortedCourseStudentRecords.find((record) => record.id === selectedCourseStudentId) ?? null;
    },
    [initialCourseStudent, selectedCourseStudentId, sortedCourseStudentRecords],
  );
  const fetchNextLibraryPage = libraryCollectionQuery.fetchNextPage;
  const libraryHasNextPage = libraryCollectionQuery.hasNextPage;
  const libraryIsFetchingNextPage = libraryCollectionQuery.isFetchingNextPage;
  useEffect(() => {
    const target = libraryLoadMoreRef.current;
    if (!target || !libraryHasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !libraryIsFetchingNextPage) {
        void fetchNextLibraryPage();
      }
    }, { rootMargin: "160px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextLibraryPage, libraryHasNextPage, libraryIsFetchingNextPage]);
  const fetchNextCoursePage = courseCollectionQuery.fetchNextPage;
  const courseHasNextPage = courseCollectionQuery.hasNextPage;
  const courseIsFetchingNextPage = courseCollectionQuery.isFetchingNextPage;
  useEffect(() => {
    const target = courseLoadMoreRef.current;
    if (!target || !courseHasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !courseIsFetchingNextPage) {
        void fetchNextCoursePage();
      }
    }, { rootMargin: "160px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [courseHasNextPage, courseIsFetchingNextPage, fetchNextCoursePage]);
  const libraryDueAmount = type === "library" && libraryMemberMode === "existing" ? Math.max(Number(selectedLibraryStudent?.dues_amount ?? 0), 0) : 0;
  const libraryPaidAmount = type === "library" && libraryMemberMode === "existing" ? Math.max(Number(selectedLibraryStudent?.paid_amount ?? 0), 0) : 0;
  const collectingLibraryDues = type === "library" && libraryMemberMode === "existing" && Boolean(selectedLibraryStudent) && libraryDueAmount > 0;
  const courseDueAmount = type === "course" && courseMemberMode === "existing" ? Math.max(Number(selectedCourseStudent?.duesAmount ?? 0), 0) : 0;
  const collectingCourseDues = type === "course" && courseMemberMode === "existing" && Boolean(selectedCourseStudent) && courseDueAmount > 0;
  const collectingStudentDues = collectingLibraryDues || collectingCourseDues;
  const currentDueAmount = collectingLibraryDues ? libraryDueAmount : collectingCourseDues ? courseDueAmount : 0;
  // Admission fee: new and inactive students pay it; a pause within 45 days waives it.
  const libraryReturnState = type === "library" && !collectingLibraryDues
    ? selectedLibraryStudent
      ? studentPauseState(selectedLibraryStudent.active, selectedLibraryStudent.paused_at)
      : libraryMemberMode === "new" ? { state: "new" as const, daysLeft: 0 } : null
    : null;
  const admissionApplies = libraryReturnState?.state === "new" || libraryReturnState?.state === "inactive";
  const admissionFeeNumber = admissionApplies ? Number(admissionFee || 0) : 0;
  const feeNumber = Number(fee || 0) + admissionFeeNumber;
  const paidNumber = Number(paid || 0);
  const amountNumber = Number(amount || 0);
  const splitCollectionNumber = Number(cashCollection || 0) + Number(onlineCollection || 0);
  const collectedNumber = mode === "mixed" ? splitCollectionNumber : paidNumber;
  const splitTotal = collectingStudentDues ? currentDueAmount : type === "library" || type === "course" ? feeNumber : amountNumber;
  const splitRemaining = Math.max(splitTotal - splitCollectionNumber, 0);
  const dues = collectingStudentDues ? Math.max(currentDueAmount - collectedNumber, 0) : Math.max(feeNumber - collectedNumber, 0);
  const advance = collectingStudentDues ? Math.max(collectedNumber - currentDueAmount, 0) : Math.max(collectedNumber - feeNumber, 0);
  const slotHours = type === "library"
    ? allTimeSlots.reduce((sum, slot) => sum + Math.max(clockMinutes(slot.end) - clockMinutes(slot.start), 0), 0) / 60
    : Math.max((Number(endTime.slice(0, 2)) || 0) - (Number(startTime.slice(0, 2)) || 0), 0);
  const libraryMemberChoicePending = type === "library" && !initialLibraryStudent && !libraryMemberMode;
  const libraryExistingMemberPending = type === "library" && libraryMemberMode === "existing" && !selectedLibraryStudentId;
  const libraryPaymentFieldsReady = type !== "library" || (!libraryMemberChoicePending && !libraryExistingMemberPending);
  const coursePaymentFieldsReady = type !== "course" || Boolean(selectedCourseSource && courseMemberMode && (courseMemberMode !== "existing" || selectedCourseStudent));
  const paymentFieldsReady = libraryPaymentFieldsReady && coursePaymentFieldsReady;
  const searchableLibraryStudents = type === "library" ? collectionLibraryStudents : [];
  const showLibrarySearchResults = libraryMemberMode === "existing" && !selectedLibraryStudent;
  const searchableCourseStudents = type === "course" && selectedCourseSource
    ? collectionCourseStudents.map((student) => courseStudentRecordFromStudent(student, selectedCourseSource))
    : [];
  const showCourseSearchResults = courseMemberMode === "existing" && !selectedCourseStudent;
  const duplicateLibraryRollStudent = useMemo(() => {
    if (type !== "library") return null;
    const rollKey = libraryRollKey(effectiveRollNumber);
    if (!rollKey) return null;

    return libraryStudents.find((student) => {
      if (libraryStudentRollKey(student) !== rollKey) return false;
      return !selectedLibraryStudentId || !libraryStudentMatchesSelection(student, selectedLibraryStudentId);
    }) ?? null;
  }, [effectiveRollNumber, libraryStudents, selectedLibraryStudentId, type]);
  const duplicateLibraryRollError = duplicateLibraryRollStudent ? t("rollNumberAlreadyExist") : "";
  const duplicateCourseRollStudent = useMemo(() => {
    if (type !== "course" || courseMemberMode !== "new") return null;
    const rollKey = libraryRollKey(effectiveRollNumber);
    if (!rollKey) return null;

    return courseStudentRecords.find((record) => libraryRollKey(record.rollNumber) === rollKey) ?? null;
  }, [courseMemberMode, courseStudentRecords, effectiveRollNumber, type]);
  const duplicateCourseRollError = duplicateCourseRollStudent ? t("rollNumberAlreadyExist") : "";

  function handlePaymentSubmit(event: FormEvent<HTMLFormElement>) {
    if (duplicateLibraryRollStudent || duplicateCourseRollStudent) {
      event.preventDefault();
      setNotice({ ok: false, message: t("rollNumberAlreadyExist") });
      return;
    }

    if (onSuccess) {
      submitAndClose(event, createPaymentAction, setNotice, startTransition, onSuccess);
      return;
    }

    submitWith(event, createPaymentAction, setNotice, startTransition);
  }

  function resetLibraryFieldsForNewStudent() {
    setSelectedLibraryStudentId("");
    setStudentName("");
    setRollNumber("");
    setPhoneNumber("");
    setAddress("");
    setAadharNumber("");
    setSeatNumber("");
    setLockerNumber("");
    setStartTime("06:00");
    setEndTime("07:00");
    setExtraSlots([]);
    setFee("");
    setLibrarySearch("");
    setSubscriptionStartDate(todayIso());
    setSubscriptionEndDate(addMonthsIso());
    setPaid("");
    setCashCollection("");
    setOnlineCollection("");
    setMode("cash");
  }

  function clearExistingLibrarySelection() {
    setSelectedLibraryStudentId("");
    setStudentName("");
    setRollNumber("");
    setPhoneNumber("");
    setAddress("");
    setAadharNumber("");
    setSeatNumber("");
    setLockerNumber("");
    setStartTime("06:00");
    setEndTime("07:00");
    setExtraSlots([]);
    setFee("");
    setLibrarySearch("");
    setSubscriptionStartDate(todayIso());
    setSubscriptionEndDate(addMonthsIso());
    setPaid("");
    setCashCollection("");
    setOnlineCollection("");
    setMode("cash");
  }

  function chooseLibraryMemberMode(mode: LibraryMemberMode) {
    setLibraryMemberMode(mode);
    if (mode === "new") {
      resetLibraryFieldsForNewStudent();
      return;
    }
    clearExistingLibrarySelection();
  }

  function applyLibraryStudentPrefill(student: LibraryStudent) {
    const values = libraryStudentPrefill(student, t);
    const renewalRange = libraryRenewalDateRange(student);
    const pendingDue = Math.max(Number(student.dues_amount ?? 0), 0);
    setSelectedLibraryStudentId(values.id);
    setStudentName(values.name);
    setRollNumber(values.rollNumber);
    setPhoneNumber(values.phoneNumber);
    setAddress(values.address);
    setSeatNumber(values.seatNumber);
    setLockerNumber(values.lockerNumber);
    setStartTime(values.startTime);
    setEndTime(values.endTime);
    setExtraSlots(values.extraSlots);
    setFee(values.fee);
    setSubscriptionStartDate(renewalRange.startDate);
    setSubscriptionEndDate(renewalRange.endDate);
    setPaid(pendingDue > 0 ? String(pendingDue) : "");
    setCashCollection("");
    setOnlineCollection("");
    setMode("cash");
  }

  function selectLibraryStudent(studentId: string) {
    setSelectedLibraryStudentId(studentId);
    const student = libraryStudents.find((item) => item.id === studentId);
    if (!student) {
      setStudentName("");
      setRollNumber("");
      setPhoneNumber("");
      setAddress("");
      setSeatNumber("");
      setLockerNumber("");
      setStartTime("06:00");
      setEndTime("07:00");
    setExtraSlots([]);
      setFee("");
      setLibrarySearch("");
      setSubscriptionStartDate(todayIso());
      setSubscriptionEndDate(addMonthsIso());
      return;
    }
    applyLibraryStudentPrefill(student);
    setLibrarySearch(libraryStudentPrefill(student, t).searchLabel);
  }

  function handleLibrarySearchChange(value: string) {
    setLibrarySearch(value);
    const selected = libraryStudents.find((student) => student.id === selectedLibraryStudentId);
    if (selected && value !== libraryStudentPrefill(selected, t).searchLabel) {
      setSelectedLibraryStudentId("");
    }
  }

  function resetCourseFieldsForNewStudent() {
    setSelectedCourseStudentId("");
    setCourseSearch("");
    setStudentName("");
    setRollNumber("");
    setPhoneNumber("");
    setAddress("");
    setAadharNumber("");
    setSeatNumber("");
    setLockerNumber("");
    setStartTime("06:00");
    setEndTime("07:00");
    setExtraSlots([]);
    setFee("");
    setSubscriptionStartDate(today);
    setSubscriptionEndDate(addMonthsIso());
    setPaid("");
    setCashCollection("");
    setOnlineCollection("");
    setMode("cash");
  }

  function clearExistingCourseSelection() {
    setSelectedCourseStudentId("");
    setCourseSearch("");
    setStudentName("");
    setRollNumber("");
    setPhoneNumber("");
    setAddress("");
    setAadharNumber("");
    setSeatNumber("");
    setLockerNumber("");
    setStartTime("06:00");
    setEndTime("07:00");
    setExtraSlots([]);
    setFee("");
    setSubscriptionStartDate(today);
    setSubscriptionEndDate(addMonthsIso());
    setPaid("");
    setCashCollection("");
    setOnlineCollection("");
    setMode("cash");
  }

  function resetCourseMemberFlow() {
    const nextMode = initialMemberMode ?? courseMemberMode;
    setCourseMemberMode(nextMode);
    if (nextMode === "new") {
      resetCourseFieldsForNewStudent();
      return;
    }
    if (nextMode === "existing") {
      clearExistingCourseSelection();
      return;
    }
    resetCourseFieldsForNewStudent();
  }

  function handleCourseChange(courseId: string) {
    setSelectedCourseId(courseId);
    resetCourseMemberFlow();
  }

  function chooseCourseMemberMode(mode: LibraryMemberMode) {
    setCourseMemberMode(mode);
    if (mode === "new") {
      resetCourseFieldsForNewStudent();
      return;
    }
    clearExistingCourseSelection();
  }

  function applyCourseStudentPrefill(record: CourseStudentRecord) {
    const values = courseStudentPrefill(record, t);
    const renewalRange = courseRenewalDateRange(record);
    const pendingDue = Math.max(Number(record.duesAmount ?? 0), 0);
    setSelectedCourseStudentId(values.id);
    setStudentName(values.name);
    setRollNumber(values.rollNumber);
    setPhoneNumber(values.phoneNumber);
    setAddress(values.address);
    setAadharNumber(values.aadharNumber);
    setSeatNumber(values.seatNumber);
    setLockerNumber("");
    setStartTime(values.startTime);
    setEndTime(values.endTime);
    setFee(values.fee);
    setSubscriptionStartDate(renewalRange.startDate);
    setSubscriptionEndDate(renewalRange.endDate);
    setPaid(pendingDue > 0 ? String(pendingDue) : "");
    setCashCollection("");
    setOnlineCollection("");
    setMode("cash");
  }

  function selectCourseStudent(recordId: string) {
    setSelectedCourseStudentId(recordId);
    const record = sortedCourseStudentRecords.find((item) => item.id === recordId);
    if (!record) {
      clearExistingCourseSelection();
      return;
    }
    applyCourseStudentPrefill(record);
    setCourseSearch(courseStudentPrefill(record, t).searchLabel);
  }

  function handleCourseSearchChange(value: string) {
    setCourseSearch(value);
    const selected = sortedCourseStudentRecords.find((record) => record.id === selectedCourseStudentId);
    if (selected && value !== courseStudentPrefill(selected, t).searchLabel) {
      setSelectedCourseStudentId("");
    }
  }

  return (
    <form
      className="form-grid two"
      onSubmit={handlePaymentSubmit}
    >
      <input type="hidden" name="business_type" value={type} />
      {type === "guest_house" ? (
        <>
          <label>
            {t("room")}
            <select name="room_id" required>
              <option value="">{t("selectRoom")}</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.label ?? room.room_number}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("amount")}
            <input name="amount" type="number" min="0" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required />
          </label>
          <DatePair />
        </>
      ) : null}

      {type === "library" && initialLibraryStudent ? (
        <>
          <input type="hidden" name="library_payment_kind" value={collectingLibraryDues ? "dues" : "renewal"} />
          <input type="hidden" name="library_student_id" value={selectedLibraryStudentId} />
          <input type="hidden" name="customer_name" value={studentName} />
          <input type="hidden" name="roll_number" value={rollNumber} />
          <input type="hidden" name="phone_number" value={phoneNumber} />
          <input type="hidden" name="address" value={address} />
          <input type="hidden" name="seat_number" value={seatNumber} />
          <input type="hidden" name="locker_number" value={lockerNumber} />
          {collectingLibraryDues ? (
            <>
              <input type="hidden" name="previous_due_amount" value={libraryDueAmount} />
              <input type="hidden" name="previous_paid_amount" value={libraryPaidAmount} />
              <input type="hidden" name="start_date" value={selectedLibraryStudent?.subscription_start_date ?? ""} />
              <input type="hidden" name="end_date" value={selectedLibraryStudent?.subscription_end_date ?? ""} />
              <input type="hidden" name="start_time" value={selectedLibraryStudent?.start_time?.slice(0, 5) ?? ""} />
              <input type="hidden" name="end_time" value={selectedLibraryStudent?.end_time?.slice(0, 5) ?? ""} />
              <input type="hidden" name="slot_hours" value={selectedLibraryStudent?.slot_hours ?? ""} />
              <label>
                {t("paymentDate")}
                <input name="payment_date" type="date" defaultValue={todayIso()} required />
              </label>
              <div className="library-due-collection-card full-span">
                <span>{t("pendingDues")}</span>
                <strong>{formatMoney(libraryDueAmount)}</strong>
                <small>{t("duesCollectionHelp")}</small>
              </div>
            </>
          ) : (
            <>
              <label>
                {t("paymentDate")}
                <input name="payment_date" type="date" defaultValue={todayIso()} required />
              </label>
              <label>
                {t("startDate")}
                <input
                  name="start_date"
                  type="date"
                  value={subscriptionStartDate}
                  onChange={(event) => setSubscriptionStartDate(event.target.value)}
                  required
                />
              </label>
              <label>
                {t("endDate")}
                <input
                  name="end_date"
                  type="date"
                  value={subscriptionEndDate}
                  onChange={(event) => setSubscriptionEndDate(event.target.value)}
                  required
                />
              </label>
              {libraryFullTimeToggle}
              <label>
                {t("startTime")}
                <input
                  name="start_time"
                  type="time"
                  min="06:00"
                  max="22:00"
                  step="3600"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  readOnly={libraryFullTime}
                  required
                />
              </label>
              <label>
                {t("endTime")}
                <input
                  name="end_time"
                  type="time"
                  min="06:00"
                  max="22:00"
                  step="3600"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  readOnly={libraryFullTime}
                  required
                />
              </label>
              {libraryExtraSlotsEditor}
              <label>
                {t("slotHours")}
                <input name="slot_hours" value={slotHours} readOnly />
              </label>
            </>
          )}
        </>
      ) : type === "library" ? (
        <>
          {!initialMemberMode ? (
            <div className="library-member-mode full-span" role="group" aria-label={t("memberType")}>
              <button
                type="button"
                className={libraryMemberMode === "new" ? "selected" : ""}
                onClick={() => chooseLibraryMemberMode("new")}
              >
                <UserPlus size={18} />
                <span>{t("newStudent")}</span>
              </button>
              <button
                type="button"
                className={libraryMemberMode === "existing" ? "selected" : ""}
                onClick={() => chooseLibraryMemberMode("existing")}
              >
                <UserCheck size={18} />
                <span>{t("existingMember")}</span>
              </button>
            </div>
          ) : null}
          {libraryMemberMode === "existing" ? (
            <>
              <label className="full-span">
                {t("studentSearch")}
                <span className="input-with-icon">
                  <Search size={16} />
                  <input
                    type="search"
                    value={librarySearch}
                    onChange={(event) => handleLibrarySearchChange(event.target.value)}
                    placeholder={`${t("rollNumber")} / ${t("name")}`}
                  />
                </span>
              </label>
              {showLibrarySearchResults ? (
                <div className="library-search-results full-span" role="listbox" aria-label={t("selectStudent")}>
                  {searchableLibraryStudents.map((student) => (
                    <button
                      key={student.id}
                      type="button"
                      className={selectedLibraryStudentId === student.id ? "selected" : ""}
                      onClick={() => selectLibraryStudent(student.id)}
                    >
                      <div className="library-search-result-main">
                        <StudentPhoto student={student} displayName={studentDisplayName(student, t)} className="picker" />
                        <span>
                          <strong>{studentDisplayRollNumber(student)} · {studentDisplayName(student, t)}</strong>
                          <small>
                            {student.phone_number ?? t("unknown")} · {t("seat")} {student.seat_number ?? "-"}
                            {student.subscription_end_date ? ` · ${t("expiresOn")} ${displayDate(student.subscription_end_date)}` : ""}
                          </small>
                        </span>
                      </div>
                      {!student.active ? <em>{t("inactiveStudents")}</em> : null}
                    </button>
                  ))}
                  {libraryCollectionQuery.isPending ? (
                    <div className="student-picker-loading" role="status" aria-label="Loading students">
                      <span /><span /><span />
                    </div>
                  ) : null}
                  {libraryCollectionQuery.isError ? (
                    <button className="secondary-button" type="button" onClick={() => void libraryCollectionQuery.refetch()}>
                      Retry loading students
                    </button>
                  ) : null}
                  {!libraryCollectionQuery.isPending && searchableLibraryStudents.length === 0 ? <p>{t("noRecords")}</p> : null}
                  {libraryCollectionQuery.hasNextPage ? (
                    <div className="student-picker-pagination" ref={libraryLoadMoreRef}>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => void libraryCollectionQuery.fetchNextPage()}
                        disabled={libraryCollectionQuery.isFetchingNextPage}
                      >
                        {libraryCollectionQuery.isFetchingNextPage ? t("saving") : t("loadOlder")}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
          {libraryPaymentFieldsReady ? (
            <>
              <input type="hidden" name="library_payment_kind" value={collectingLibraryDues ? "dues" : "renewal"} />
              <input type="hidden" name="library_student_id" value={selectedLibraryStudentId} />
              {libraryMemberMode === "existing" && selectedLibraryStudent ? (
                <>
                  <div className="full-span">
                    <LibraryStudentSummaryCard
                      student={selectedLibraryStudent}
                      expired={isExpiredLibraryStudent(selectedLibraryStudent, todayIso())}
                      compact
                    />
                    {!initialLibraryStudent ? (
                      <button
                        className="student-picker-change"
                        type="button"
                        onClick={() => {
                          clearExistingLibrarySelection();
                          setLibraryMemberMode("existing");
                        }}
                      >
                        Change student
                      </button>
                    ) : null}
                  </div>
                  <input type="hidden" name="customer_name" value={studentName} />
                  <input type="hidden" name="roll_number" value={rollNumber} />
                  <input type="hidden" name="phone_number" value={phoneNumber} />
                  <input type="hidden" name="address" value={address} />
                  <input type="hidden" name="aadhar_number" value={selectedLibraryStudent.aadhar_number ?? ""} />
                  <input type="hidden" name="seat_number" value={seatNumber} />
                  <input type="hidden" name="locker_number" value={lockerNumber} />
                </>
              ) : null}
              {libraryMemberMode === "new" ? (
                <>
                  <label>
                    {t("name")}
                    <input name="customer_name" value={studentName} onChange={(event) => setStudentName(event.target.value)} required />
                  </label>
                  <label>
                    {t("rollNumber")}
                    <input
                      name="roll_number"
                      value={effectiveRollNumber}
                      onChange={(event) => setRollNumber(event.target.value)}
                      aria-invalid={duplicateLibraryRollStudent ? "true" : undefined}
                      aria-describedby={duplicateLibraryRollStudent ? "library-roll-number-error" : undefined}
                      required
                    />
                    {duplicateLibraryRollError ? (
                      <span id="library-roll-number-error" className="text-xs font-semibold text-error" role="alert">
                        {duplicateLibraryRollError}
                      </span>
                    ) : null}
                    {libraryDefaultsQuery.isPending && !effectiveRollNumber ? <small className="muted">Loading next roll number…</small> : null}
                  </label>
                  <label>
                    {t("phone")}
                    <input name="phone_number" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} inputMode="tel" />
                  </label>
                  <label className="full-span">
                    {t("address")}
                    <input name="address" value={address} onChange={(event) => setAddress(event.target.value)} />
                  </label>
                  <CompressedImageInput
                    inputName="student_photo"
                    draftKey="library-new-student"
                    label={t("studentPhoto")}
                    previewLabel={t("photoPreview")}
                    displayName={studentName}
                    variant="student"
                  />
                  <CompressedImageInput
                    inputName="aadhar_photo"
                    draftKey="library-new-student"
                    label={t("aadharFront")}
                    previewLabel={t("aadharFrontPreview")}
                    variant="document"
                  />
                  <CompressedImageInput
                    inputName="aadhar_back_photo"
                    draftKey="library-new-student"
                    label={t("aadharBack")}
                    previewLabel={t("aadharBackPreview")}
                    variant="document"
                  />
                </>
              ) : null}
              {collectingLibraryDues ? (
                <>
                  <input type="hidden" name="previous_due_amount" value={libraryDueAmount} />
                  <input type="hidden" name="previous_paid_amount" value={libraryPaidAmount} />
                  <input type="hidden" name="start_date" value={selectedLibraryStudent?.subscription_start_date ?? ""} />
                  <input type="hidden" name="end_date" value={selectedLibraryStudent?.subscription_end_date ?? ""} />
                  <input type="hidden" name="start_time" value={selectedLibraryStudent?.start_time?.slice(0, 5) ?? ""} />
                  <input type="hidden" name="end_time" value={selectedLibraryStudent?.end_time?.slice(0, 5) ?? ""} />
                  <input type="hidden" name="slot_hours" value={selectedLibraryStudent?.slot_hours ?? ""} />
                  <label>
                    {t("paymentDate")}
                    <input name="payment_date" type="date" defaultValue={todayIso()} required />
                  </label>
                  <div className="library-due-collection-card full-span">
                    <span>{t("pendingDues")}</span>
                    <strong>{formatMoney(libraryDueAmount)}</strong>
                    <small>{t("duesCollectionHelp")}</small>
                  </div>
                </>
              ) : (
                <>
                  <label>
                    {t("paymentDate")}
                    <input name="payment_date" type="date" defaultValue={todayIso()} required />
                  </label>
                  <label>
                    {t("startDate")}
                    <input
                      name="start_date"
                      type="date"
                      value={subscriptionStartDate}
                      onChange={(event) => setSubscriptionStartDate(event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    {t("endDate")}
                    <input
                      name="end_date"
                      type="date"
                      value={subscriptionEndDate}
                      onChange={(event) => setSubscriptionEndDate(event.target.value)}
                      required
                    />
                  </label>
                  {libraryMemberMode === "new" ? (
                    <>
                      <label>
                        {t("seatNumber")}
                        <input name="seat_number" value={seatNumber} onChange={(event) => setSeatNumber(event.target.value)} />
                      </label>
                      <label>
                        {t("lockerNumber")}
                        <input name="locker_number" value={lockerNumber} onChange={(event) => setLockerNumber(event.target.value)} />
                      </label>
                    </>
                  ) : null}
                  {libraryFullTimeToggle}
                  <label>
                    {t("startTime")}
                    <input
                      name="start_time"
                      type="time"
                      min="06:00"
                      max="22:00"
                      step="3600"
                      value={startTime}
                      onChange={(event) => setStartTime(event.target.value)}
                      readOnly={libraryFullTime}
                      required
                    />
                  </label>
                  <label>
                    {t("endTime")}
                    <input
                      name="end_time"
                      type="time"
                      min="06:00"
                      max="22:00"
                      step="3600"
                      value={endTime}
                      onChange={(event) => setEndTime(event.target.value)}
                      readOnly={libraryFullTime}
                      required
                    />
                  </label>
                  {libraryExtraSlotsEditor}
                  <label>
                    {t("slotHours")}
                    <input name="slot_hours" value={slotHours} readOnly />
                  </label>
                </>
              )}
            </>
          ) : null}
        </>
      ) : null}

      {type === "course" ? (
        <>
          <input type="hidden" name="course_payment_kind" value={collectingCourseDues ? "dues" : "renewal"} />
          {initialCourseStudent && initialCourseSource ? (
            <>
              <input type="hidden" name="course_student_id" value={initialCourseStudent.id} />
              <input type="hidden" name="course_id" value={initialCourse?.id ?? ""} />
            </>
          ) : (
            <>
              <label className="full-span">
                {t("course")}
                <select
                  name="course_id"
                  required
                  value={selectedCourseId}
                  onChange={(event) => handleCourseChange(event.target.value)}
                >
                  <option value="">{t("selectCourse")}</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {selectedCourseSource ? (
            <>
              {!initialCourseStudent && !initialMemberMode ? (
                <div className="library-member-mode full-span" role="group" aria-label={t("memberType")}>
                  <button
                    type="button"
                    className={courseMemberMode === "new" ? "selected" : ""}
                    onClick={() => chooseCourseMemberMode("new")}
                  >
                    <UserPlus size={18} />
                    <span>{t("newStudent")}</span>
                  </button>
                  <button
                    type="button"
                    className={courseMemberMode === "existing" ? "selected" : ""}
                    onClick={() => chooseCourseMemberMode("existing")}
                  >
                    <UserCheck size={18} />
                    <span>{t("existingMember")}</span>
                  </button>
                </div>
              ) : null}

              {courseMemberMode === "existing" && !initialCourseStudent ? (
                <>
                  <label className="full-span">
                    {t("studentSearch")}
                    <span className="input-with-icon">
                      <Search size={16} />
                      <input
                        type="search"
                        value={courseSearch}
                        onChange={(event) => handleCourseSearchChange(event.target.value)}
                        placeholder={`${t("rollNumber")} / ${t("name")}`}
                      />
                    </span>
                  </label>
                  {showCourseSearchResults ? (
                    <div className="library-search-results full-span" role="listbox" aria-label={t("selectStudent")}>
                      {searchableCourseStudents.map((record) => {
                        const displayName = courseStudentDisplayName(record, t);
                        return (
                          <button
                            key={record.id}
                            type="button"
                            className={selectedCourseStudentId === record.id ? "selected" : ""}
                            onClick={() => selectCourseStudent(record.id)}
                          >
                            <div className="library-search-result-main">
                              <StudentAvatar displayName={displayName} imageUrl={record.photoUrl} className="picker" />
                              <span>
                                <strong>{record.rollNumber ?? "-"} · {displayName}</strong>
                                <small>
                                  {record.courseName}
                                  {record.subscriptionEndDate ? ` · ${t("expiresOn")} ${displayDate(record.subscriptionEndDate)}` : ""}
                                </small>
                              </span>
                            </div>
                            {!record.active ? <em>{t("inactiveStudents")}</em> : null}
                          </button>
                        );
                      })}
                      {courseCollectionQuery.isPending ? (
                        <div className="student-picker-loading" role="status" aria-label="Loading students">
                          <span /><span /><span />
                        </div>
                      ) : null}
                      {courseCollectionQuery.isError ? (
                        <button className="secondary-button" type="button" onClick={() => void courseCollectionQuery.refetch()}>
                          Retry loading students
                        </button>
                      ) : null}
                      {!courseCollectionQuery.isPending && searchableCourseStudents.length === 0 ? <p>{t("noRecords")}</p> : null}
                      {courseCollectionQuery.hasNextPage ? (
                        <div className="student-picker-pagination" ref={courseLoadMoreRef}>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => void courseCollectionQuery.fetchNextPage()}
                            disabled={courseCollectionQuery.isFetchingNextPage}
                          >
                            {courseCollectionQuery.isFetchingNextPage ? t("saving") : t("loadOlder")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : null}

              {coursePaymentFieldsReady ? (
                <>
                  {courseMemberMode === "existing" && selectedCourseStudent ? (
                    <>
                      {!initialCourseStudent ? (
                        <div className="library-selected-profile with-photo full-span">
                          <StudentAvatar displayName={courseStudentDisplayName(selectedCourseStudent, t)} imageUrl={selectedCourseStudent.photoUrl} className="selected" />
                          <span>
                            <strong>{courseStudentDisplayName(selectedCourseStudent, t)}</strong>
                            <small>
                              #{selectedCourseStudent.rollNumber ?? "-"} · {selectedCourseStudent.courseName}
                            </small>
                          </span>
                          <button
                            className="student-picker-change"
                            type="button"
                            onClick={() => {
                              clearExistingCourseSelection();
                              setCourseMemberMode("existing");
                            }}
                          >
                            Change student
                          </button>
                        </div>
                      ) : null}
                      <input type="hidden" name="customer_name" value={studentName} />
                      <input type="hidden" name="roll_number" value={rollNumber} />
                      <input type="hidden" name="phone_number" value={phoneNumber} />
                      <input type="hidden" name="address" value={address} />
                      <input type="hidden" name="aadhar_number" value={aadharNumber} />
                    </>
                  ) : null}
                  {courseMemberMode === "new" ? (
                    <>
                      <label>
                        {t("name")}
                        <input name="customer_name" value={studentName} onChange={(event) => setStudentName(event.target.value)} required />
                      </label>
                      <label>
                        {t("rollNumber")}
                        <input
                          name="roll_number"
                          value={effectiveRollNumber}
                          onChange={(event) => setRollNumber(event.target.value)}
                          aria-invalid={duplicateCourseRollStudent ? "true" : undefined}
                          aria-describedby={duplicateCourseRollStudent ? "course-roll-number-error" : undefined}
                          required
                        />
                        {duplicateCourseRollError ? (
                          <span id="course-roll-number-error" className="text-xs font-semibold text-error" role="alert">
                            {duplicateCourseRollError}
                          </span>
                        ) : null}
                        {courseDefaultsQuery.isPending && !effectiveRollNumber ? <small className="muted">Loading next roll number…</small> : null}
                      </label>
                      <label>
                        {t("phone")}
                        <input name="phone_number" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} inputMode="tel" />
                      </label>
                      <label className="full-span">
                        {t("address")}
                        <input name="address" value={address} onChange={(event) => setAddress(event.target.value)} />
                      </label>
                      <label>
                        {t("aadharNumber")}
                        <input name="aadhar_number" value={aadharNumber} onChange={(event) => setAadharNumber(event.target.value)} inputMode="numeric" />
                      </label>
                      <CompressedImageInput
                        inputName="student_photo"
                        draftKey="course-new-student"
                        label={t("studentPhoto")}
                        previewLabel={t("photoPreview")}
                        displayName={studentName}
                        variant="student"
                      />
                      <CompressedImageInput
                        inputName="aadhar_photo"
                        draftKey="course-new-student"
                        label={t("aadharFront")}
                        previewLabel={t("aadharFrontPreview")}
                        variant="document"
                      />
                      <CompressedImageInput
                        inputName="aadhar_back_photo"
                        draftKey="course-new-student"
                        label={t("aadharBack")}
                        previewLabel={t("aadharBackPreview")}
                        variant="document"
                      />
                    </>
                  ) : null}
                  {collectingCourseDues ? (
                    <>
                      <input type="hidden" name="start_date" value={selectedCourseStudent?.subscriptionStartDate ?? ""} />
                      <input type="hidden" name="end_date" value={selectedCourseStudent?.subscriptionEndDate ?? ""} />
                      <input type="hidden" name="start_time" value={selectedCourseStudent?.startTime?.slice(0, 5) ?? ""} />
                      <input type="hidden" name="end_time" value={selectedCourseStudent?.endTime?.slice(0, 5) ?? ""} />
                      <label>
                        {t("paymentDate")}
                        <input name="payment_date" type="date" defaultValue={today} required />
                      </label>
                      <div className="library-due-collection-card full-span">
                        <span>{t("pendingDues")}</span>
                        <strong>{formatMoney(courseDueAmount)}</strong>
                        <small>{t("duesCollectionHelp")}</small>
                      </div>
                    </>
                  ) : (
                    <>
                      <label>
                        {t("paymentDate")}
                        <input name="payment_date" type="date" defaultValue={today} required />
                      </label>
                      <label>
                        {t("startDate")}
                        <input
                          name="start_date"
                          type="date"
                          value={subscriptionStartDate}
                          onChange={(event) => setSubscriptionStartDate(event.target.value)}
                          required
                        />
                      </label>
                      <label>
                        {t("endDate")}
                        <input
                          name="end_date"
                          type="date"
                          value={subscriptionEndDate}
                          onChange={(event) => setSubscriptionEndDate(event.target.value)}
                          required
                        />
                      </label>
                      <label>
                        {t("startTime")}
                        <input
                          name="start_time"
                          type="time"
                          min="06:00"
                          max="22:00"
                          step="3600"
                          value={startTime}
                          onChange={(event) => setStartTime(event.target.value)}
                          required
                        />
                      </label>
                      <label>
                        {t("endTime")}
                        <input
                          name="end_time"
                          type="time"
                          min="06:00"
                          max="22:00"
                          step="3600"
                          value={endTime}
                          onChange={(event) => setEndTime(event.target.value)}
                          required
                        />
                      </label>
                      <label>
                        {t("slotHours")}
                        <input name="slot_hours" value={slotHours} readOnly />
                      </label>
                      <label>
                        {t("referralCode")}
                        <input name="referral_code" list="referral-codes" />
                        <datalist id="referral-codes">
                          {referrals.map((referral) => (
                            <option key={referral.code} value={referral.code} />
                          ))}
                        </datalist>
                      </label>
                    </>
                  )}
                </>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      {((type === "library" && libraryPaymentFieldsReady && collectingLibraryDues)
        || (type === "course" && coursePaymentFieldsReady && collectingCourseDues)) ? (
        <>
          <input type="hidden" name="fee_amount" value={fee} />
          {mode === "mixed" ? (
            <input type="hidden" name="paid_amount" value={splitCollectionNumber} />
          ) : (
            <label>
              {t("collectDue")}
              <input
                name="paid_amount"
                type="number"
                min="0"
                step="1"
                value={paid}
                onChange={(event) => setPaid(event.target.value)}
                required
              />
            </label>
          )}
          <div className="form-pair full-span">
            <label>
              {t("dues")}
              <input value={dues} readOnly />
            </label>
            <label>
              {t("advance")}
              <input value={advance} readOnly />
            </label>
          </div>
        </>
      ) : null}

      {(type === "course" && coursePaymentFieldsReady && !collectingCourseDues)
        || (type === "library" && libraryPaymentFieldsReady && !collectingLibraryDues) ? (
        <>
          {libraryReturnState?.state === "paused" ? (
            <p className="student-return-note full-span">
              {t("admissionFeeWaived").replace("{days}", String(studentPauseGraceDays - libraryReturnState.daysLeft))} {t("newStartsToday")}
            </p>
          ) : null}
          {libraryReturnState?.state === "inactive" ? (
            <p className="student-return-note warning full-span">{t("admissionFeeApplies")} {t("newStartsToday")}</p>
          ) : null}
          {admissionApplies ? (
            <label className="full-span">
              {t("admissionFee")}
              <input name="admission_fee" type="number" min="0" step="1" value={admissionFee} onChange={(event) => setAdmissionFee(event.target.value)} placeholder="0" />
            </label>
          ) : null}
          {/* Fee sent with the payment = subscription fee + admission fee. */}
          <input type="hidden" name="fee_amount" value={feeNumber} />
          <div className="form-pair full-span">
            <label>
              {admissionFeeNumber > 0 ? `${t("fee")} (${t("total")} ${formatMoney(feeNumber)})` : t("fee")}
              <input type="number" min="0" step="1" value={fee} onChange={(event) => setFee(event.target.value)} />
            </label>
            {mode === "mixed" ? (
              <input type="hidden" name="paid_amount" value={splitCollectionNumber} />
            ) : (
              <label>
                {t("paid")}
                <input
                  name="paid_amount"
                  type="number"
                  min="0"
                  step="1"
                  value={paid}
                  onChange={(event) => setPaid(event.target.value)}
                  required
                />
              </label>
            )}
          </div>
          <div className="form-pair full-span">
            <label>
              {t("dues")}
              <input value={dues} readOnly />
            </label>
            <label>
              {t("advance")}
              <input value={advance} readOnly />
            </label>
          </div>
        </>
      ) : null}

      {type === "general" ? (
        <>
          <label className="full-span">
            {t("description")}
            <input name="description" minLength={3} required />
          </label>
          <label>
            {t("amount")}
            <input name="amount" type="number" min="0" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required />
          </label>
          <label>
            {t("paymentDate")}
            <input name="payment_date" type="date" defaultValue={todayIso()} required />
          </label>
        </>
      ) : null}

      {paymentFieldsReady ? (
        <>
          <label>
            {t("mode")}
            <select name="mode" value={mode} onChange={(event) => setMode(event.target.value as PaymentMode)}>
              <option value="cash">{t("cash")}</option>
              <option value="online">{t("online")}</option>
              <option value="mixed">{t("mixed")}</option>
            </select>
          </label>
          {mode === "mixed" ? (
            <>
              <label>
                {t("cashCollection")}
                <input
                  name="cash_collection"
                  type="number"
                  min="0"
                  step="1"
                  value={cashCollection}
                  onChange={(event) => setCashCollection(event.target.value)}
                  required
                />
              </label>
              <label>
                {t("onlineCollection")}
                <input
                  name="online_collection"
                  type="number"
                  min="0"
                  step="1"
                  value={onlineCollection}
                  onChange={(event) => setOnlineCollection(event.target.value)}
                  required
                />
              </label>
              <label>
                {t("remaining")}
                <input value={splitRemaining} readOnly />
              </label>
            </>
          ) : null}
          <CompressedImageInput
            inputName="photo"
            label={t("addImage")}
            previewLabel={t("photoPreview")}
            variant="document"
          />
          <label className="full-span">
            {t("remark")}
            <textarea name="remark" rows={3} />
          </label>
          <button className="primary-button full-span" type="submit" disabled={Boolean(duplicateLibraryRollStudent || duplicateCourseRollStudent)}>
            {collectingStudentDues ? t("collectDue") : t("collectPayment")}
          </button>
        </>
      ) : null}
    </form>
  );
}

function DatePair({ subscription = false }: { subscription?: boolean }) {
  const { t } = useLanguage();

  return (
    <>
      <label>
        {t("startDate")}
        <input name="start_date" type="date" defaultValue={todayIso()} required />
      </label>
      <label>
        {t("endDate")}
        <input name="end_date" type="date" defaultValue={subscription ? addMonthsIso() : todayIso()} required />
      </label>
    </>
  );
}

function FlowCell({
  className,
  label,
  value,
  note,
  onClick,
}: {
  className: string;
  label: string;
  value: string;
  note?: string | null;
  onClick?: () => void;
}) {
  const content = (
    <>
      <small>{label}</small>
      <strong>{value}</strong>
      {note ? <em>{note}</em> : null}
    </>
  );
  return onClick ? (
    <button className={`flow-cell ${className}`} type="button" onClick={onClick}>{content}</button>
  ) : (
    <div className={`flow-cell ${className}`}>{content}</div>
  );
}

function FlowBreakdown({
  inLabel,
  outLabel,
  cashIn,
  cashInApproved,
  cashOut,
  cashOutApproved,
  onlineIn,
  onlineVerified,
  onlineOut = 0,
  onCashIn,
  onCashOut,
  onOnline,
  leadingRows,
  trailingRows,
}: {
  leadingRows?: ReactNode;
  trailingRows?: ReactNode;
  inLabel: string;
  outLabel: string;
  /** Totals include records still awaiting approval; the *Approved values exclude them. */
  cashIn: number;
  cashInApproved: number;
  cashOut: number;
  cashOutApproved: number;
  onlineIn: number;
  onlineVerified: number;
  onlineOut?: number;
  onCashIn?: () => void;
  onCashOut?: () => void;
  onOnline?: () => void;
}) {
  const { t } = useLanguage();
  const awaitingNote = (total: number, approved: number) => {
    const awaiting = Math.max(total - approved, 0);
    return awaiting > 0 ? `${t("awaitingVerification")} ${formatMoney(awaiting)}` : null;
  };
  const approvedLabel = labelForStatus("approved", t);
  return (
    <div className="flow-breakdown">
      {leadingRows}
      <div className="flow-row tone-cash">
        <span className="flow-row-label"><Banknote size={16} />{t("cash")}</span>
        <FlowCell className="in" label={inLabel} value={`+${formatMoney(cashIn)}`} onClick={onCashIn} />
        <FlowCell
          className="in approved"
          label={approvedLabel}
          value={formatMoney(cashInApproved)}
          note={awaitingNote(cashIn, cashInApproved)}
          onClick={onCashIn}
        />
      </div>
      <div className="flow-row tone-cash">
        <span className="flow-row-label"><Banknote size={16} />{t("cash")}</span>
        <FlowCell className="out" label={outLabel} value={`-${formatMoney(cashOut)}`} onClick={onCashOut} />
        <FlowCell
          className="out approved"
          label={approvedLabel}
          value={`-${formatMoney(cashOutApproved)}`}
          note={awaitingNote(cashOut, cashOutApproved)}
          onClick={onCashOut}
        />
      </div>
      <div className="flow-row tone-online">
        <span className="flow-row-label"><CreditCard size={16} />{t("online")}</span>
        <FlowCell className="in" label={inLabel} value={`+${formatMoney(onlineIn)}`} onClick={onOnline} />
        <FlowCell
          className="verified"
          label={t("verifiedOnline")}
          value={formatMoney(onlineVerified)}
          note={awaitingNote(onlineIn, onlineVerified)}
          onClick={onOnline}
        />
      </div>
      {onlineOut > 0 ? <p className="flow-note">{t("online")} {outLabel}: -{formatMoney(onlineOut)}</p> : null}
      {trailingRows}
    </div>
  );
}

function FlowPendingRow({ amount, count, onClick }: { amount: number; count: number; onClick?: () => void }) {
  const { t } = useLanguage();
  return (
    <button className="flow-row tone-pending single" type="button" onClick={onClick}>
      <span className="flow-row-label"><ClipboardList size={16} />{t("pending")}</span>
      <span className="flow-cell">
        <small>{count} {t(count === 1 ? "record" : "records")}</small>
        <strong>{formatMoney(amount)}</strong>
      </span>
    </button>
  );
}

function formatTimeInZone(value: string | null | undefined, timeZone: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-IN", { timeZone, hour: "numeric", minute: "2-digit", hour12: true })
    .format(date)
    .replace(/\b(am|pm)\b/gi, (period) => period.toUpperCase());
}

function formatDuration(fromIso: string, toIso: string) {
  const minutes = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const workNextStage: Record<WorkTaskStatus, { status: WorkTaskStatus; labelKey: string }> = {
  todo: { status: "in_progress", labelKey: "startTask" },
  in_progress: { status: "done", labelKey: "completeTask" },
  done: { status: "todo", labelKey: "reopenTask" },
};

const voiceNoteMaxSeconds = 120;

function preferredVoiceMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"]
    .find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function VoiceNoteRecorder({ setNotice }: { setNotice: (notice: ActionResult | null) => void }) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const [recording, setRecording] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  const clearVoice = useCallback(() => {
    if (inputRef.current) preparedPhotoFiles.delete(inputRef.current);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setSeconds(0);
  }, []);

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    form.addEventListener("reset", clearVoice);
    return () => form.removeEventListener("reset", clearVoice);
  }, [clearVoice]);

  useEffect(() => () => {
    if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
  }, []);

  async function startRecording() {
    const mimeType = preferredVoiceMimeType();
    if (mimeType === null || !navigator.mediaDevices?.getUserMedia) {
      setNotice({ ok: false, message: t("voiceNotSupported") });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setNotice({ ok: false, message: t("microphoneBlocked") });
      return;
    }
    clearVoice();
    const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32000 });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
      setRecording(false);
      const type = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunks, { type });
      if (blob.size === 0 || !inputRef.current) return;
      const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      preparedPhotoFiles.set(inputRef.current, new File([blob], `voice-note.${extension}`, { type }));
      setSeconds(Math.min(voiceNoteMaxSeconds, Math.round((Date.now() - startedAtRef.current) / 1000)));
      setPreviewUrl(URL.createObjectURL(blob));
    };
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    recorder.start();
    setRecording(true);
    stopTimerRef.current = window.setTimeout(() => recorder.state === "recording" && recorder.stop(), voiceNoteMaxSeconds * 1000);
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  return (
    <div className="work-voice">
      <input ref={inputRef} type="file" name="voice" hidden tabIndex={-1} aria-hidden="true" />
      <input type="hidden" name="voice_seconds" value={previewUrl ? String(seconds) : ""} />
      {recording ? (
        <button className="secondary-button work-recording" type="button" onClick={stopRecording}>
          <span className="work-recording-dot" aria-hidden="true" />
          {t("stopRecording")}
        </button>
      ) : (
        <button className="secondary-button" type="button" onClick={startRecording}>
          <Mic size={16} />
          {t("recordVoice")}
        </button>
      )}
      {previewUrl ? (
        <span className="work-voice-preview">
          <audio controls src={previewUrl} preload="metadata" />
          <button className="icon-button" type="button" onClick={clearVoice} aria-label={t("removeVoice")}>
            <Trash2 size={16} />
          </button>
        </span>
      ) : null}
    </div>
  );
}

function shiftWorkDate(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function workInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
}

function WorkView({
  businessId,
  cacheScope,
  profileId,
  setNotice,
  startTransition,
}: {
  businessId: string;
  cacheScope: string;
  profileId: string;
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const { t } = useLanguage();
  const [date, setDate] = useState<string | null>(null);
  const [personFilter, setPersonFilter] = useState("all");
  const [section, setSection] = useState<"updates" | "tasks">("updates");
  const [taskStage, setTaskStage] = useState<WorkTaskStatus>("todo");
  const [addingTask, setAddingTask] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [linkedTaskId, setLinkedTaskId] = useState("");
  const workQuery = useQuery({
    queryKey: ["work", cacheScope, date ?? "today"],
    queryFn: ({ signal }) => fetchJson<WorkPage>(`/api/businesses/${businessId}/work${date ? `?date=${date}` : ""}`, signal),
    staleTime: 15_000,
  });
  const data = workQuery.data;

  if (!data) {
    return (
      <section className="work-page" aria-busy={workQuery.isPending}>
        <p className="muted">{workQuery.isError ? workQuery.error.message : t("loading")}</p>
      </section>
    );
  }

  const memberName = (id: string) => data.members.find((member) => member.id === id)?.full_name ?? "Member";
  const isToday = data.date === data.today;
  const matchesPerson = (id: string) => personFilter === "all" || personFilter === id;
  const goToDate = (next: string) => setDate(next >= data.today ? null : next);
  const dateLabel = isToday
    ? t("today")
    : data.date === shiftWorkDate(data.today, -1)
      ? t("yesterday")
      : new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })
        .format(new Date(`${data.date}T00:00:00Z`));

  const myAttendance = data.attendance.find((row) => row.profile_id === profileId);
  const presentCount = data.members.filter((member) => data.attendance.some((row) => row.profile_id === member.id)).length;
  const myStatusTitle = !myAttendance
    ? t("notCheckedIn")
    : myAttendance.check_out_at
      ? `${formatTimeInZone(myAttendance.check_in_at, data.timezone)} – ${formatTimeInZone(myAttendance.check_out_at, data.timezone)}`
      : `${t("checkedInSince")} ${formatTimeInZone(myAttendance.check_in_at, data.timezone)}`;
  const myStatusDetail = !myAttendance
    ? ""
    : myAttendance.check_out_at || isToday
      ? `${t("workedFor")} ${formatDuration(myAttendance.check_in_at, myAttendance.check_out_at ?? new Date().toISOString())}`
      : t("noCheckOut");

  const openTasks = data.tasks.filter((task) => task.status !== "done");
  const stageTasks = data.tasks.filter((task) => task.status === taskStage && matchesPerson(task.assigned_to));
  const stageCount = (stage: WorkTaskStatus) => data.tasks.filter((task) => task.status === stage && matchesPerson(task.assigned_to)).length;
  const taskTitle = (id: string | null) => data.tasks.find((task) => task.id === id)?.title ?? null;
  const visibleUpdates = data.updates.filter((update) => matchesPerson(update.author_id));
  const updatesByAuthor = visibleUpdates.reduce<Map<string, WorkUpdate[]>>((groups, update) => {
    groups.set(update.author_id, [...(groups.get(update.author_id) ?? []), update]);
    return groups;
  }, new Map());

  return (
    <section className="work-page" aria-label={t("work")}>
      <header className="work-topbar">
        <div className="work-date-stepper">
          <button className="icon-button" type="button" aria-label={t("previousDay")} onClick={() => goToDate(shiftWorkDate(data.date, -1))}>
            <ArrowLeft size={18} />
          </button>
          <label className="work-date-label">
            <CalendarDays size={16} aria-hidden="true" />
            <span>{dateLabel}</span>
            <input
              type="date"
              value={data.date}
              max={data.today}
              aria-label={t("date")}
              onChange={(event) => event.target.value && goToDate(event.target.value)}
            />
          </label>
          <button className="icon-button" type="button" aria-label={t("nextDay")} disabled={isToday} onClick={() => goToDate(shiftWorkDate(data.date, 1))}>
            <ChevronRight size={18} />
          </button>
        </div>
        <select className="work-person-select" value={personFilter} onChange={(event) => setPersonFilter(event.target.value)} aria-label={t("member")}>
          <option value="all">{t("everyone")}</option>
          <option value={profileId}>{t("me")}</option>
          {data.members.filter((member) => member.id !== profileId).map((member) => (
            <option key={member.id} value={member.id}>{member.full_name}</option>
          ))}
        </select>
      </header>

      <article className="work-hero">
        <div className="work-hero-main">
          <span className={`work-status-dot${myAttendance ? (myAttendance.check_out_at ? " done" : " in") : ""}`} aria-hidden="true" />
          <div className="work-hero-copy">
            <small>{t("myDay")}</small>
            <strong>{myStatusTitle}</strong>
            {myStatusDetail ? <span>{myStatusDetail}</span> : null}
          </div>
          {isToday && !myAttendance?.check_out_at ? (
            <form onSubmit={(event) => submitWith(event, myAttendance ? checkOutAction : checkInAction, setNotice, startTransition)}>
              <button className={myAttendance ? "secondary-button" : "primary-button"} type="submit">
                {myAttendance ? <LogOut size={16} /> : <UserCheck size={16} />}
                {myAttendance ? t("checkOut") : t("checkIn")}
              </button>
            </form>
          ) : null}
        </div>
        <div className="work-team-strip">
          <div className="work-team-avatars">
            {data.members.map((member) => {
              const row = data.attendance.find((item) => item.profile_id === member.id);
              const detail = row
                ? `${formatTimeInZone(row.check_in_at, data.timezone)} – ${row.check_out_at ? formatTimeInZone(row.check_out_at, data.timezone) : "…"}`
                : t("absent");
              return (
                <button
                  key={member.id}
                  type="button"
                  className={`work-avatar${row ? " present" : ""}${personFilter === member.id ? " selected" : ""}`}
                  title={`${member.full_name} · ${detail}`}
                  aria-label={`${member.full_name} · ${detail}`}
                  onClick={() => setPersonFilter((current) => current === member.id ? "all" : member.id)}
                >
                  {workInitials(member.full_name)}
                </button>
              );
            })}
          </div>
          <small>{presentCount}/{data.members.length} {t("present")}</small>
        </div>
      </article>

      <div className="work-segments" role="tablist" aria-label={t("work")}>
        <button type="button" role="tab" aria-selected={section === "updates"} className={section === "updates" ? "active" : ""} onClick={() => setSection("updates")}>
          {t("updates")} <span>{visibleUpdates.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={section === "tasks"} className={section === "tasks" ? "active" : ""} onClick={() => setSection("tasks")}>
          {t("tasks")} <span>{openTasks.filter((task) => matchesPerson(task.assigned_to)).length}</span>
        </button>
      </div>

      {section === "updates" ? (
        <>
          {isToday ? (
            <form
              className={`work-composer${composerOpen ? " open" : ""}`}
              onSubmit={(event) => submitWith(event, postWorkUpdateAction, setNotice, startTransition, true, () => {
                setLinkedTaskId("");
                setComposerOpen(false);
              })}
            >
              <textarea
                name="body"
                rows={composerOpen ? 3 : 1}
                maxLength={4000}
                placeholder={t("whatDidYouDo")}
                onFocus={() => setComposerOpen(true)}
              />
              {composerOpen ? (
                <>
                  <div className="work-composer-tools">
                    <CompressedImageInput inputName="photo" label={t("addPhoto")} previewLabel={t("addPhoto")} variant="document" />
                    <VoiceNoteRecorder setNotice={setNotice} />
                  </div>
                  <div className="work-composer-row">
                    <select name="task_id" value={linkedTaskId} onChange={(event) => setLinkedTaskId(event.target.value)} aria-label={t("linkedTask")}>
                      <option value="">{t("noLinkedTask")}</option>
                      {openTasks.map((task) => (
                        <option key={task.id} value={task.id}>{task.title} · {memberName(task.assigned_to)}</option>
                      ))}
                    </select>
                    {linkedTaskId ? (
                      <label className="work-check">
                        <input type="checkbox" name="mark_done" />
                        {t("markTaskDone")}
                      </label>
                    ) : null}
                  </div>
                  <div className="work-composer-actions">
                    <button className="secondary-button" type="reset" onClick={() => { setLinkedTaskId(""); setComposerOpen(false); }}>
                      {t("cancel")}
                    </button>
                    <button className="primary-button" type="submit">{t("postUpdate")}</button>
                  </div>
                </>
              ) : null}
            </form>
          ) : null}

          {updatesByAuthor.size ? (
            <div className="work-feed">
              {[...updatesByAuthor.entries()].map(([authorId, updates]) => (
                <section key={authorId} className="work-feed-group">
                  <header>
                    <span className="work-avatar small" aria-hidden="true">{workInitials(memberName(authorId))}</span>
                    <strong>{authorId === profileId ? `${memberName(authorId)} (${t("me")})` : memberName(authorId)}</strong>
                    <small>{updates.length}</small>
                  </header>
                  {updates.map((update) => {
                    const linkedTitle = taskTitle(update.task_id);
                    return (
                      <article key={update.id} className="work-feed-item">
                        <div className="work-feed-meta">
                          <time>{formatTimeInZone(update.created_at, data.timezone)}</time>
                          {linkedTitle ? <span className="work-task-chip">{linkedTitle}</span> : null}
                          {update.status_change === "done" ? <span className="work-done-chip"><Check size={12} />{t("completedTask")}</span> : null}
                        </div>
                        {update.body ? <p>{update.body}</p> : null}
                        {update.photo_url ? (
                          <a href={update.photo_url} target="_blank" rel="noreferrer" className="work-log-photo">
                            {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs are not served through next/image */}
                            <img src={update.photo_url} alt="" loading="lazy" />
                          </a>
                        ) : null}
                        {update.voice_url ? <audio controls preload="none" src={update.voice_url} /> : null}
                        {update.author_id === profileId ? (
                          <form className="work-feed-delete" onSubmit={(event) => submitWith(event, deleteWorkUpdateAction, setNotice, startTransition, false)}>
                            <input type="hidden" name="id" value={update.id} />
                            <button className="icon-button" type="submit" aria-label={t("deleteUpdate")}>
                              <Trash2 size={15} />
                            </button>
                          </form>
                        ) : null}
                      </article>
                    );
                  })}
                </section>
              ))}
            </div>
          ) : (
            <p className="work-empty">{t("noWorkUpdates")}</p>
          )}
        </>
      ) : (
        <>
          <div className="work-task-toolbar">
            <div className="work-stage-chips" role="tablist" aria-label={t("tasks")}>
              {(["todo", "in_progress", "done"] as const).map((stage) => (
                <button
                  key={stage}
                  type="button"
                  role="tab"
                  aria-selected={taskStage === stage}
                  className={taskStage === stage ? "active" : ""}
                  onClick={() => setTaskStage(stage)}
                >
                  {t(stage === "todo" ? "toDo" : stage === "in_progress" ? "inProgress" : "done")} <span>{stageCount(stage)}</span>
                </button>
              ))}
            </div>
            <button className={addingTask ? "secondary-button" : "primary-button"} type="button" onClick={() => setAddingTask((current) => !current)}>
              {addingTask ? <X size={16} /> : <Plus size={16} />}
              {addingTask ? t("cancel") : t("addTask")}
            </button>
          </div>

          {addingTask ? (
            <form
              className="form-grid two work-task-form"
              onSubmit={(event) => submitWith(event, createWorkTaskAction, setNotice, startTransition, true, () => setAddingTask(false))}
            >
              <label className="full-span">
                {t("taskTitle")}
                <input name="title" required maxLength={200} autoFocus />
              </label>
              <label>
                {t("assignTo")}
                <select name="assigned_to" defaultValue={profileId}>
                  {data.members.map((member) => (
                    <option key={member.id} value={member.id}>{member.id === profileId ? `${member.full_name} (${t("me")})` : member.full_name}</option>
                  ))}
                </select>
              </label>
              <label>
                {t("dueDate")}
                <input name="due_date" type="date" min={data.today} />
              </label>
              <label className="full-span">
                {t("taskNotes")}
                <textarea name="notes" rows={2} maxLength={2000} />
              </label>
              <button className="primary-button full-span" type="submit">{t("addTask")}</button>
            </form>
          ) : null}

          {stageTasks.length ? (
            <ul className="work-task-list">
              {stageTasks.map((task: WorkTask) => {
                const overdue = task.status !== "done" && Boolean(task.due_date) && (task.due_date as string) < data.today;
                const next = workNextStage[task.status];
                return (
                  <li key={task.id} className={`stage-${task.status}`}>
                    <div className="work-task-body">
                      <strong>{task.title}</strong>
                      <small>
                        <span className="work-avatar tiny" aria-hidden="true">{workInitials(memberName(task.assigned_to))}</span>
                        {memberName(task.assigned_to)}
                        {task.due_date ? <span className={overdue ? "work-overdue" : ""}> · {overdue ? `${t("overdue")} ` : ""}{displayDate(task.due_date)}</span> : null}
                      </small>
                      {task.notes ? <p>{task.notes}</p> : null}
                    </div>
                    <form onSubmit={(event) => submitWith(event, setWorkTaskStatusAction, setNotice, startTransition, false)}>
                      <input type="hidden" name="id" value={task.id} />
                      <input type="hidden" name="status" value={next.status} />
                      <button className={`work-stage-button to-${next.status}`} type="submit">
                        {next.status === "done" ? <Check size={15} /> : null}
                        {t(next.labelKey)}
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="work-empty">{t("noTasksHere")}</p>
          )}
        </>
      )}
    </section>
  );
}

function ExpenseForm({
  businessTypes,
  setNotice,
  startTransition,
  onSuccess,
}: {
  businessTypes: BusinessType[];
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
  onSuccess?: () => void;
}) {
  const { t } = useLanguage();

  return (
    <form
      className="form-grid two"
      onSubmit={(event) =>
        onSuccess
          ? submitAndClose(event, createExpenseAction, setNotice, startTransition, onSuccess)
          : submitWith(event, createExpenseAction, setNotice, startTransition)
      }
    >
      <input type="hidden" name="mode" value="cash" />
      <label>
        {t("business")}
        <select name="business_type" defaultValue={businessTypes.includes("general") ? "general" : businessTypes[0]} required>
          {businessTypes.map((business) => (
            <option key={business} value={business}>
              {labelForBusiness(business, t)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("expenseDate")}
        <input name="expense_date" type="date" defaultValue={todayIso()} required />
      </label>
      <label className="full-span">
        {t("description")}
        <input name="description" minLength={3} required />
      </label>
      <label>
        {t("amount")}
        <input name="amount" type="number" min="0" step="1" required />
      </label>
      <label>
        {t("photo")}
        <span className="camera-field">
          <Camera size={16} />
          {t("addImage")}
          <input name="photo" type="file" accept="image/*" capture="environment" />
        </span>
      </label>
      <label className="full-span">
        {t("remark")}
        <textarea name="remark" rows={3} />
      </label>
      <button className="primary-button full-span" type="submit">
        {t("addExpense")}
      </button>
    </form>
  );
}

function MoneySettlementForm({
  direction,
  profiles,
  settlementDate,
  setNotice,
  startTransition,
  onSuccess,
  defaultProfileId = "",
  defaultAmount = 0,
}: {
  direction: SettlementDirection;
  profiles: Profile[];
  settlementDate: string;
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
  onSuccess: () => void;
  defaultProfileId?: string;
  defaultAmount?: number;
}) {
  const { t } = useLanguage();
  const [selectedProfileId, setSelectedProfileId] = useState(defaultProfileId);
  const isReceived = direction === "received_from_user";

  return (
    <form
      className="form-grid two"
      onSubmit={(event) => submitAndClose(event, settleCashAction, setNotice, startTransition, onSuccess)}
    >
      <input type="hidden" name="settlement_direction" value={direction} />
      <SearchableProfileSelect
        label={t("user")}
        name="profile_id"
        profiles={profiles}
        value={selectedProfileId}
        onChange={setSelectedProfileId}
        includeEmptyOption
      />
      <label>
        {t("amount")}
        <input
          key={`${direction}-${selectedProfileId || "no-user"}`}
          name="amount"
          type="number"
          min="1"
          step="1"
          defaultValue={defaultAmount || ""}
          required
        />
      </label>
      <label>
        {t("transferDate")}
        <input name="settlement_date" type="date" defaultValue={settlementDate} max={todayIso()} required />
      </label>
      <label className="full-span">
        {t("note")}
        <input name="note" placeholder={t("optional")} />
      </label>
      <button className="primary-button full-span" type="submit">
        {isReceived ? t("receivedFormTitle") : t("sendFormTitle")}
      </button>
    </form>
  );
}

function SearchableProfileSelect({
  label,
  name,
  profiles,
  value,
  onChange,
  includeEmptyOption = false,
}: {
  label: string;
  name: string;
  profiles: Profile[];
  value?: string;
  onChange?: (profileId: string) => void;
  includeEmptyOption?: boolean;
}) {
  const { t } = useLanguage();
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState("");
  const [internalSelectedProfileId, setInternalSelectedProfileId] = useState(
    value ?? (includeEmptyOption ? "" : profiles[0]?.id ?? ""),
  );
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedProfileId = value ?? internalSelectedProfileId;
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleProfiles = profiles.filter((profile) => {
    if (!normalizedSearch) return true;
    const role = profileRoleLabel(profile, t);
    return `${profile.full_name} ${profile.email} ${role}`.toLocaleLowerCase().includes(normalizedSearch);
  });
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const selectedLabel = selectedProfile
    ? `${selectedProfile.full_name} · ${profileRoleLabel(selectedProfile, t)}`
    : "";
  const safeActiveIndex = Math.min(activeIndex, Math.max(visibleProfiles.length - 1, 0));

  const chooseProfile = useCallback((profile: Profile) => {
    setInternalSelectedProfileId(profile.id);
    onChange?.(profile.id);
    setSearch("");
    setOpen(false);
    setActiveIndex(0);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [onChange]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.setCustomValidity(selectedProfileId ? "" : t("selectUser"));
  }, [selectedProfileId, t]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div className="searchable-profile-select" ref={containerRef}>
      <label htmlFor={inputId}>{label}</label>
      <div className={`profile-combobox ${open ? "open" : ""}`}>
        <Search size={16} />
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-activedescendant={open && visibleProfiles[safeActiveIndex] ? `${listboxId}-${visibleProfiles[safeActiveIndex].id}` : undefined}
          value={open ? search : selectedLabel}
          onFocus={() => {
            setSearch("");
            setOpen(true);
          }}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            setSearch(event.target.value);
            setInternalSelectedProfileId("");
            onChange?.("");
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => Math.min(current + 1, Math.max(visibleProfiles.length - 1, 0)));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => Math.max(current - 1, 0));
            } else if (event.key === "Enter" && open && visibleProfiles[safeActiveIndex]) {
              event.preventDefault();
              chooseProfile(visibleProfiles[safeActiveIndex]);
            } else if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              setSearch("");
            } else if (event.key === "Tab") {
              setOpen(false);
              setSearch("");
            }
          }}
          placeholder={t("searchUser")}
        />
        <button
          type="button"
          aria-label={open ? `Close ${label}` : t("selectUser")}
          onClick={() => {
            setSearch("");
            setOpen((current) => !current);
            window.requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          <ChevronDown size={17} />
        </button>
        {open ? (
          <div className="profile-combobox-options" id={listboxId} role="listbox" aria-label={label}>
            {visibleProfiles.map((profile, index) => (
              <button
                id={`${listboxId}-${profile.id}`}
                key={profile.id}
                type="button"
                role="option"
                aria-selected={profile.id === selectedProfileId}
                className={index === safeActiveIndex ? "active" : ""}
                onPointerMove={() => setActiveIndex(index)}
                onClick={() => chooseProfile(profile)}
              >
                <SafeAvatarImage alt="" fullName={profile.full_name} avatarUrl={profile.avatar_url} />
                <span>
                  <strong>{profile.full_name}</strong>
                  <small>{profile.email} · {profileRoleLabel(profile, t)}</small>
                </span>
                {profile.id === selectedProfileId ? <Check size={16} /> : null}
              </button>
            ))}
            {visibleProfiles.length === 0 ? <p>{t("noRecords")}</p> : null}
          </div>
        ) : null}
      </div>
      <input type="hidden" name={name} value={selectedProfileId} />
    </div>
  );
}

function AgentSettlementForm({
  agentIncentiveBalances,
  setNotice,
  startTransition,
  onSuccess,
}: {
  agentIncentiveBalances: AgentIncentiveBalance[];
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
  onSuccess: () => void;
}) {
  const { t } = useLanguage();
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const selectedBalance = agentIncentiveBalances.find((item) => item.agent.id === selectedAgentId)?.balance ?? 0;

  return (
    <form
      className="form-grid two"
      onSubmit={(event) => submitAndClose(event, createAgentSettlementAction, setNotice, startTransition, onSuccess)}
    >
      <label>
        {t("salesAgent")}
        <select
          name="agent_id"
          required
          value={selectedAgentId}
          onChange={(event) => setSelectedAgentId(event.target.value)}
        >
          <option value="">{t("selectAgent")}</option>
          {agentIncentiveBalances.map(({ agent, balance }) => (
            <option key={agent.id} value={agent.id}>
              {agent.full_name} · {formatMoney(balance)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("amount")}
        <input
          key={selectedAgentId || "no-agent"}
          name="amount"
          type="number"
          min="1"
          max={selectedBalance || undefined}
          step="1"
          defaultValue={selectedBalance || ""}
          required
        />
      </label>
      <label className="full-span">
        {t("note")}
        <input name="note" placeholder={t("optional")} />
      </label>
      <button className="primary-button full-span" type="submit">
        {t("sendPayout")}
      </button>
    </form>
  );
}

function MiniAction({
  hidden,
  label,
  reason = false,
  reasonRequired = false,
  tone = "neutral",
  icon,
  action,
  setNotice,
  startTransition,
}: {
  hidden: Record<string, string>;
  label: string;
  reason?: boolean;
  reasonRequired?: boolean;
  tone?: "neutral" | "approve" | "reject" | "cancel";
  icon?: ReactNode;
  action: ClientAction;
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const { t } = useLanguage();

  return (
    <form onSubmit={(event) => submitWith(event, action, setNotice, startTransition, false)}>
      {Object.entries(hidden).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      {reason ? <input name="reason" placeholder={reasonRequired ? t("reasonRequired") : t("reasonOptional")} required={reasonRequired} /> : null}
      <button className={icon ? `mini-action icon-mini-action tone-${tone}` : `mini-action tone-${tone}`} type="submit" aria-label={label} title={label}>
        {icon ?? label}
      </button>
    </form>
  );
}

function profileInitials(profile: Profile) {
  return profile.full_name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || roleBadge(profile);
}

function ClosingView({
  date,
  dateFilterKey,
  owner,
  canVerifyOnlineCollections,
  profile,
  summaries,
  payments,
  expenses,
  movements,
  agentSettlements,
  postingEvents,
  profiles,
  managerUnitScopes,
  staffUnitAssignments,
  setNotice,
  startTransition,
}: {
  date: string;
  dateFilterKey: DateFilterKey;
  owner: boolean;
  canVerifyOnlineCollections: boolean;
  profile: Profile;
  summaries: UserClosingSummary[];
  payments: Payment[];
  expenses: Expense[];
  movements: MoneyMovement[];
  agentSettlements: AgentSettlement[];
  postingEvents: DailyPostingEvent[];
  profiles: Profile[];
  managerUnitScopes: ManagerUnitScope[];
  staffUnitAssignments: StaffUnitAssignment[];
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const { t } = useLanguage();
  const [reviewTarget, setReviewTarget] = useState<{ profileId: string; filter: ClosingReviewFilter; mode: ClosingReviewMode } | null>(null);
  const reviewProfileId = reviewTarget?.profileId ?? null;
  const openReview = (profileId: string, filter: ClosingReviewFilter = "all", mode: ClosingReviewMode = "all") =>
    setReviewTarget({ profileId, filter, mode });
  const [settlementEntryAmounts, setSettlementEntryAmounts] = useState<Record<string, string>>({});
  const viewerManagerBusinessTypes = new Set(
    managerUnitScopes
      .filter((scope) => scope.manager_profile_id === profile.id)
      .map((scope) => scope.business_type),
  );
  const closingBusinessTypesForProfile = (closingProfile: Profile): Set<BusinessType> | null => {
    if (profile.membership_role === "primary_owner") return null;
    if (profile.membership_role === "co_owner") {
      if (closingProfile.membership_role === "co_owner") {
        return new Set(
          managerUnitScopes
            .filter((scope) => scope.manager_profile_id === closingProfile.id)
            .map((scope) => scope.business_type)
            .filter((businessType) => viewerManagerBusinessTypes.has(businessType)),
        );
      }
      return new Set(
        staffUnitAssignments
          .filter((assignment) => assignment.staff_profile_id === closingProfile.id)
          .map((assignment) => assignment.business_type)
          .filter((businessType) => viewerManagerBusinessTypes.has(businessType)),
      );
    }
    return new Set(
      staffUnitAssignments
        .filter((assignment) => assignment.staff_profile_id === profile.id)
        .map((assignment) => assignment.business_type),
    );
  };
  const visibleSummaries = summaries
    .filter((summary) => {
      if (!summary.profile.active) return false;
      if (profile.membership_role === "primary_owner") return true;
      if (profile.membership_role === "co_owner") {
        if (summary.profile.membership_role === "co_owner") return true;
        return summary.profile.membership_role === "staff" || summary.profile.membership_role === "sales_agent";
      }
      return summary.profile.id === profile.id;
    })
    .sort((left, right) => {
      const rank = (item: UserClosingSummary) => {
        if (item.profile.id === profile.id) return 0;
        if (item.profile.membership_role === "primary_owner") return 1;
        if (item.profile.membership_role === "co_owner") return 2;
        return 3;
      };
      return rank(left) - rank(right) || left.profile.full_name.localeCompare(right.profile.full_name);
    });
  const closingBusinessTypesByProfile = new Map(
    visibleSummaries.map((summary) => [summary.profile.id, closingBusinessTypesForProfile(summary.profile)]),
  );
  const recordInClosingScope = (profileId: string, businessType: BusinessType | null | undefined) => {
    const scope = closingBusinessTypesByProfile.get(profileId);
    return scope === null || Boolean(businessType && scope?.has(businessType));
  };
  const selectedReviewSummary = reviewProfileId ? visibleSummaries.find((summary) => summary.profile.id === reviewProfileId) ?? null : null;
  const selectedReviewBusinessTypes = selectedReviewSummary
    ? closingBusinessTypesByProfile.get(selectedReviewSummary.profile.id) ?? null
    : null;
  const pendingReviewSummary = (summary: UserClosingSummary): ClosingPendingBreakdown => {
    const paymentBreakdowns = payments
      .filter(
      (payment) =>
        paymentReviewProfileId(payment) === summary.profile.id &&
        recordInClosingScope(summary.profile.id, payment.business_type) &&
        payment.record_status === "active" &&
        belongsToClosingReview(payment.payment_date, date, payment.approval_status) &&
        isPendingReviewStatus(payment.approval_status),
      )
      .map((payment) => ({
        cash: paymentPendingCashAmount(payment),
        online: paymentComponentStatus(payment, "online") === "approved" ? 0 : paymentOnlineAmount(payment),
        onClosingDate: payment.payment_date.slice(0, 10) === date,
      }))
      .filter((breakdown) => breakdown.cash > 0 || breakdown.online > 0);
    const pendingExpenses = expenses.filter(
      (expense) =>
        expense.spent_by === summary.profile.id &&
        recordInClosingScope(summary.profile.id, expense.business_type ?? "general") &&
        expense.record_status === "active" &&
        belongsToClosingReview(expense.expense_date, date, expense.approval_status) &&
        isPendingReviewStatus(expense.approval_status),
    );
    const cashPaymentAmount = paymentBreakdowns.reduce((sum, breakdown) => sum + breakdown.cash, 0);
    const onlinePaymentAmount = paymentBreakdowns.reduce((sum, breakdown) => sum + breakdown.online, 0);
    const expenseAmount = pendingExpenses.reduce((sum, expense) => sum + numberValue(expense.amount), 0);

    return {
      totalAmount: cashPaymentAmount + onlinePaymentAmount + expenseAmount,
      totalRecordCount: paymentBreakdowns.length + pendingExpenses.length,
      onlineAmount: onlinePaymentAmount,
      dayCashIn: paymentBreakdowns
        .filter((breakdown) => breakdown.onClosingDate)
        .reduce((sum, breakdown) => sum + breakdown.cash, 0),
      dayCashOut: pendingExpenses
        .filter((expense) => expense.mode !== "online" && expense.expense_date.slice(0, 10) === date)
        .reduce((sum, expense) => sum + numberValue(expense.amount), 0),
    };
  };
  const closingCards: ClosingCardViewModel[] = visibleSummaries.map((summary) => ({
    summary,
    pending: pendingReviewSummary(summary),
  }));

  // Owners review and approve; others may open their own card's records read-only.
  if (selectedReviewSummary && (owner || selectedReviewSummary.profile.id === profile.id)) {
    return (
      <ClosingReviewDetail
        key={`${selectedReviewSummary.profile.id}-${date}-${reviewTarget?.filter}-${reviewTarget?.mode}`}
        initialFilter={reviewTarget?.filter}
        initialMode={reviewTarget?.mode}
        summary={selectedReviewSummary}
        date={date}
        payments={payments}
        expenses={expenses}
        movements={movements}
        agentSettlements={agentSettlements}
        postingEvents={postingEvents}
        dateFilterKey={dateFilterKey}
        profiles={profiles}
        businessTypes={selectedReviewBusinessTypes === null ? null : [...selectedReviewBusinessTypes]}
        canVerifyOnlineCollections={canVerifyOnlineCollections}
        reviewActionsEnabled={owner && (
          profile.membership_role !== "co_owner"
          || selectedReviewSummary.profile.membership_role === "staff"
          || selectedReviewSummary.profile.id === profile.id
        )}
        close={() => setReviewTarget(null)}
        setNotice={setNotice}
        startTransition={startTransition}
      />
    );
  }

  return (
    <div className="view-stack closing-workspace">
      {dateFilterKey === "transaction" ? (
        <p className="date-filter-note closing-date-filter-note">{t("closingBalancePostingNote")}</p>
      ) : null}

      <section className="closing-ledger-section">
        <div className="closing-ledger-heading">
          <h2>{t("userDailyLedger")}</h2>
          <span>{date}</span>
        </div>
        <div className="closing-user-grid">
          {closingCards.map(({ summary, pending: pendingSummary }) => {
            const cashToReceive = Math.max(summary.closing, 0);
            const custodyCashIn = summary.collected + summary.received;
            const custodyCashOut = summary.expenses + summary.sent;
            const ownerCard = summary.profile.membership_role === "primary_owner";
            const canOpenReview = (owner || summary.profile.id === profile.id);
            const settlementProfileKey = `${date}:${summary.profile.id}`;
            const canReceiveFromUser = summary.profile.id !== profile.id && (
              (
                profile.membership_role === "primary_owner"
                && ["co_owner", "staff", "sales_agent"].includes(summary.profile.membership_role)
              ) ||
              (
                profile.membership_role === "co_owner"
                && (summary.profile.membership_role === "staff" || summary.profile.membership_role === "sales_agent")
              )
            );
            const settlementEntryKey = settlementProfileKey;
            const settlementEntryAmount = settlementEntryAmounts[settlementEntryKey]
              ?? (cashToReceive > 0 ? String(cashToReceive) : "");
            const settlementEntryNumber = numberValue(settlementEntryAmount);
            const canReceiveCash = settlementEntryNumber > 0;
            return (
              <article
                className="closing-user-card"
                key={summary.profile.id}
              >
                <div className="closing-staff-head">
                  <span className="closing-avatar">{profileInitials(summary.profile)}</span>
                  <span>
                    <strong>{summary.profile.full_name}{summary.profile.id === profile.id ? ` (${t("self")})` : ""}</strong>
                    <small className={`closing-role-chip role-${summary.profile.membership_role}`}>
                      {profileRoleLabel(summary.profile, t)}
                    </small>
                  </span>
                  {!ownerCard && pendingSummary.totalRecordCount > 0 ? (
                    <span className="closing-status warning">
                      {pendingSummary.totalRecordCount} {t("pending")}
                    </span>
                  ) : null}
                </div>
                <section className="closing-cash-custody">
                  <div className="closing-section-heading">
                    <span><Banknote aria-hidden="true" size={17} /> {ownerCard ? t("todaysCash") : t("cashInHand")}</span>
                    <small>{t("approvalDate")} · {date}</small>
                  </div>
                  {/* The Owner is where cash ends up, so a running balance is not meaningful; show only the day's flow. */}
                  <div
                    className={`closing-cash-equation${ownerCard ? " owner-day-flow" : ""}`}
                    aria-label={ownerCard
                      ? `${t("cashIn")} ${formatMoney(custodyCashIn)}, ${t("cashOut")} ${formatMoney(custodyCashOut)}`
                      : `${t("openingCash")} ${formatMoney(summary.opening)}, ${t("cashIn")} ${formatMoney(custodyCashIn)}, ${t("cashOut")} ${formatMoney(custodyCashOut)}, ${t("closingCashInHand")} ${formatMoney(summary.closing)}`}
                  >
                    {!ownerCard ? (
                      <span className="closing-equation-part full-row">
                        <small>{t("openingCash")}</small>
                        <strong>{formatMoney(summary.opening)}</strong>
                      </span>
                    ) : null}
                    <button type="button" disabled={!canOpenReview} className="closing-equation-part positive" onClick={() => openReview(summary.profile.id, "in", "cash")}>
                      <small>+ {t("cash")} {t("cashIn")}</small>
                      <strong>{formatMoney(custodyCashIn + pendingSummary.dayCashIn)}</strong>
                    </button>
                    <button type="button" disabled={!canOpenReview} className="closing-equation-part positive approved" onClick={() => openReview(summary.profile.id, "in", "cash")}>
                      <small>{labelForStatus("approved", t)}</small>
                      <strong>{formatMoney(custodyCashIn)}</strong>
                    </button>
                    <button type="button" disabled={!canOpenReview} className="closing-equation-part negative" onClick={() => openReview(summary.profile.id, "out", "cash")}>
                      <small>− {t("cash")} {t("cashOut")}</small>
                      <strong>{formatMoney(custodyCashOut + pendingSummary.dayCashOut)}</strong>
                    </button>
                    <button type="button" disabled={!canOpenReview} className="closing-equation-part negative approved" onClick={() => openReview(summary.profile.id, "out", "cash")}>
                      <small>{labelForStatus("approved", t)}</small>
                      <strong>{formatMoney(custodyCashOut)}</strong>
                    </button>
                    {summary.adjustments !== 0 ? (
                      <span className={`closing-equation-part full-row${summary.adjustments < 0 ? " negative" : " positive"}`}>
                        <small>{summary.adjustments < 0 ? "−" : "+"} {t("adjustments")}</small>
                        <strong>{formatMoney(Math.abs(summary.adjustments))}</strong>
                      </span>
                    ) : null}
                  </div>
                  {!ownerCard ? (
                    <div className={`closing-cash-result${summary.closing < 0 ? " negative" : ""}`}>
                      <span>
                        <small>{t("closingCashInHand")}</small>
                        <em>{date}</em>
                        {summary.closing < 0 ? (
                          <b className="closing-reconciliation-status">{t("needsReconciliation")}</b>
                        ) : null}
                      </span>
                      <strong>{formatMoney(summary.closing)}</strong>
                    </div>
                  ) : null}
                </section>

                <section
                  className="closing-online-activity"
                  title={t("onlineOwnerBankNote")}
                  aria-label={`${t("onlineIn")} ${formatMoney(summary.inOnline + pendingSummary.onlineAmount)} · ${t("verifiedOnline")} ${formatMoney(summary.inOnline)}`}
                >
                  <button type="button" disabled={!canOpenReview} className="closing-online-summary" onClick={() => openReview(summary.profile.id, "in", "online")}>
                    <span className="closing-online-metric">
                      <small><Landmark aria-hidden="true" size={15} /> {t("onlineIn")}</small>
                      <strong>+{formatMoney(summary.inOnline + pendingSummary.onlineAmount)}</strong>
                    </span>
                    <span aria-hidden="true" className="closing-online-divider" />
                    <span className="closing-online-metric reviewed">
                      <small><ShieldCheck aria-hidden="true" size={15} /> {t("verifiedOnline")}</small>
                      <strong>{formatMoney(summary.inOnline)}</strong>
                      {pendingSummary.onlineAmount > 0 ? (
                        <em>{t("awaitingVerification")} {formatMoney(pendingSummary.onlineAmount)}</em>
                      ) : null}
                    </span>
                  </button>
                </section>

                {!ownerCard ? (
                <section className={`closing-pending-panel${pendingSummary.totalRecordCount > 0 ? " active" : ""}`}>
                  <button type="button" disabled={!canOpenReview} className="closing-pending-head" onClick={() => openReview(summary.profile.id, "pending")}>
                    <span className="closing-pending-icon">
                      <ClipboardList aria-hidden="true" size={18} />
                    </span>
                    <span className="closing-pending-copy">
                      <strong>{t("pending")}</strong>
                      <small>{pendingSummary.totalRecordCount} {t(pendingSummary.totalRecordCount === 1 ? "record" : "records")}</small>
                    </span>
                    <strong className="closing-pending-amount">{formatMoney(pendingSummary.totalAmount)}</strong>
                  </button>
                </section>
                ) : null}
                {owner ? (
                  <div className="closing-staff-actions">
                    <button className="closing-review-button" type="button" onClick={() => openReview(summary.profile.id)}>
                      {t("reviewAndSettle")}
                    </button>
                    {canReceiveFromUser ? (
                      <form
                        className="closing-receive-form"
                        onSubmit={(event) =>
                          submitAndClose(event, settleCashAction, setNotice, startTransition, () =>
                            setSettlementEntryAmounts((current) => ({ ...current, [settlementEntryKey]: "" })),
                          )
                        }
                      >
                        <input type="hidden" name="settlement_direction" value="received_from_user" />
                        <input type="hidden" name="profile_id" value={summary.profile.id} />
                        <input type="hidden" name="settlement_date" value={date} />
                        <label className="closing-receive-field">
                          <span>{t("amount")}</span>
                          <input
                            name="amount"
                            type="number"
                            min="1"
                            step="0.01"
                            value={settlementEntryAmount}
                            onChange={(event) =>
                              setSettlementEntryAmounts((current) => ({ ...current, [settlementEntryKey]: event.target.value }))
                            }
                            placeholder={cashToReceive ? String(cashToReceive) : "0"}
                            required
                          />
                        </label>
                        <button type="submit" disabled={!canReceiveCash}>
                          <ShieldCheck size={18} />
                          {t("receivedFormTitle")}
                        </button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ClosingReviewDetail({
  summary,
  date,
  dateFilterKey,
  payments,
  expenses,
  movements,
  agentSettlements,
  postingEvents,
  profiles,
  businessTypes,
  canVerifyOnlineCollections,
  reviewActionsEnabled,
  initialFilter = "all",
  initialMode = "all",
  close,
  setNotice,
  startTransition,
}: {
  initialFilter?: ClosingReviewFilter;
  initialMode?: ClosingReviewMode;
  summary: UserClosingSummary;
  date: string;
  dateFilterKey: DateFilterKey;
  payments: Payment[];
  expenses: Expense[];
  movements: MoneyMovement[];
  agentSettlements: AgentSettlement[];
  postingEvents: DailyPostingEvent[];
  profiles: Profile[];
  businessTypes: BusinessType[] | null;
  canVerifyOnlineCollections: boolean;
  reviewActionsEnabled: boolean;
  close: () => void;
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const { t } = useLanguage();
  const [reviewFilter, setReviewFilter] = useState<ClosingReviewFilter>(initialFilter);
  const [reviewMode, setReviewMode] = useState<ClosingReviewMode>(initialMode);
  type ClosingReviewRecord = {
    id: string;
    sourceId: string;
    recordType: "payment" | "expense" | "movement";
    title: string;
    amount: number;
    mode: string;
    status: string;
    recordDate: string;
    transactionDate: string;
    approvalDate: string | null;
    isBacklog: boolean;
    createdAt: string;
    businessLabel: string;
    cashAmount: number;
    onlineAmount: number;
    cashStatus: ApprovalStatus | null;
    onlineStatus: ApprovalStatus | null;
    note: string;
    transferLines: string[];
    journey: TransactionJourneyStep[];
    journeyLanes?: TransactionJourneyLane[];
    hasPendingTransfer: boolean;
    canReview: boolean;
    isMixedPayment: boolean;
    tone: "positive" | "negative";
    icon: ReactNode;
  };
  const recordInScope = (businessType: BusinessType | null | undefined) =>
    businessTypes === null || Boolean(businessType && businessTypes.includes(businessType));
  const profileDayEvents = postingEventsForProfileDate(postingEvents, summary.profile.id, date, dateFilterKey)
    .filter((event) => recordInScope(event.business_type));
  const paymentEventGroups = new Map<string, DailyPostingEvent[]>();
  profileDayEvents.filter((event) => event.source_type === "payment").forEach((event) => {
    paymentEventGroups.set(event.source_id, [...(paymentEventGroups.get(event.source_id) ?? []), event]);
  });

  const approvedPaymentRecords: ClosingReviewRecord[] = [...paymentEventGroups.entries()].flatMap(([paymentId, events]) => {
    const payment = payments.find((item) => item.id === paymentId);
    if (!payment) return [];
    const cashAmount = events.reduce((sum, event) => sum + event.cash_amount, 0);
    const onlineAmount = events.reduce((sum, event) => sum + event.online_amount, 0);
    return [{
      id: `${payment.id}-${date}`,
      sourceId: payment.id,
      recordType: "payment",
      title: paymentDisplayTitle(payment, t),
      amount: cashAmount + onlineAmount,
      mode: paymentModeLabel(payment, t),
      status: "approved",
      recordDate: date,
      transactionDate: payment.payment_date,
      approvalDate: events.map((event) => event.approval_date).sort().at(-1) ?? null,
      isBacklog: false,
      createdAt: events.map((event) => event.approved_at).filter((value): value is string => Boolean(value)).sort().at(-1) ?? payment.created_at,
      businessLabel: transactionBusinessTag(payment.business_type, t),
      cashAmount,
      onlineAmount,
      cashStatus: paymentComponentStatus(payment, "cash"),
      onlineStatus: paymentComponentStatus(payment, "online"),
      note: paymentReference(payment, t),
      transferLines: transferSummaryLines(paymentTransfers(movements, payment.id), profiles, t),
      journey: [],
      journeyLanes: paymentJourneyLanes(payment, paymentTransfers(movements, payment.id), profiles, t),
      hasPendingTransfer: Boolean(pendingPaymentTransfer(movements, payment.id)),
      canReview: false,
      isMixedPayment: paymentCashAmount(payment) > 0 && paymentOnlineAmount(payment) > 0,
      tone: "positive",
      icon: payment.business_type === "guest_house" ? <Hotel size={22} /> : payment.business_type === "library" ? <BookOpen size={22} /> : <WalletCards size={22} />,
    }];
  });

  const pendingPaymentRecords: ClosingReviewRecord[] = payments
    .filter((payment) =>
      paymentReviewProfileId(payment) === summary.profile.id &&
      recordInScope(payment.business_type) &&
      payment.record_status === "active" &&
      belongsToClosingReview(payment.payment_date, date, payment.approval_status) &&
      isPendingReviewStatus(payment.approval_status),
    )
    .map((payment) => {
      const pendingCash = paymentComponentStatus(payment, "cash") === "approved" ? 0 : paymentCashAmount(payment);
      const pendingOnline = paymentComponentStatus(payment, "online") === "approved" ? 0 : paymentOnlineAmount(payment);
      return {
        id: `${payment.id}-pending`,
        sourceId: payment.id,
        recordType: "payment" as const,
        title: paymentDisplayTitle(payment, t),
        amount: pendingCash + pendingOnline,
        mode: paymentModeLabel(payment, t),
        status: payment.approval_status,
        recordDate: payment.payment_date,
        transactionDate: payment.payment_date,
        approvalDate: null,
        isBacklog: payment.payment_date < date,
        createdAt: payment.created_at,
        businessLabel: transactionBusinessTag(payment.business_type, t),
        cashAmount: pendingCash,
        onlineAmount: pendingOnline,
        cashStatus: paymentComponentStatus(payment, "cash"),
        onlineStatus: paymentComponentStatus(payment, "online"),
        note: paymentReference(payment, t),
        transferLines: transferSummaryLines(paymentTransfers(movements, payment.id), profiles, t),
        journey: [],
        journeyLanes: paymentJourneyLanes(payment, paymentTransfers(movements, payment.id), profiles, t),
        hasPendingTransfer: Boolean(pendingPaymentTransfer(movements, payment.id)),
        canReview: true,
        isMixedPayment: paymentCashAmount(payment) > 0 && paymentOnlineAmount(payment) > 0,
        tone: "positive" as const,
        icon: payment.business_type === "guest_house" ? <Hotel size={22} /> : payment.business_type === "library" ? <BookOpen size={22} /> : <WalletCards size={22} />,
      };
    });

  const approvedExpenseRecords: ClosingReviewRecord[] = profileDayEvents
    .filter((event) => event.source_type === "expense")
    .flatMap((event) => {
      const expense = expenses.find((item) => item.id === event.source_id);
      if (!expense) return [];
      return [{
        id: `${expense.id}-${date}`,
        sourceId: expense.id,
        recordType: "expense" as const,
        title: expenseDisplayTitle(expense),
        amount: -event.amount,
        mode: labelForMode(expense.mode, t),
        status: "approved",
        recordDate: date,
        transactionDate: expense.expense_date,
        approvalDate: event.approval_date,
        isBacklog: false,
        createdAt: event.approved_at ?? expense.created_at,
        businessLabel: transactionBusinessTag(expense.business_type, t),
        cashAmount: event.cash_amount,
        onlineAmount: event.online_amount,
        cashStatus: null,
        onlineStatus: null,
        note: expenseReference(expense, t),
        transferLines: [],
        journey: expenseJourneySteps(expense, profiles, t),
        hasPendingTransfer: false,
        canReview: false,
        isMixedPayment: false,
        tone: "negative" as const,
        icon: <ReceiptText size={22} />,
      }];
    });

  const pendingExpenseRecords: ClosingReviewRecord[] = expenses
    .filter((expense) =>
      expense.spent_by === summary.profile.id &&
      recordInScope(expense.business_type ?? "general") &&
      expense.record_status === "active" &&
      belongsToClosingReview(expense.expense_date, date, expense.approval_status) &&
      isPendingReviewStatus(expense.approval_status),
    )
    .map((expense) => ({
      id: `${expense.id}-pending`,
      sourceId: expense.id,
      recordType: "expense" as const,
      title: expenseDisplayTitle(expense),
      amount: -numberValue(expense.amount),
      mode: labelForMode(expense.mode, t),
      status: expense.approval_status,
      recordDate: expense.expense_date,
      transactionDate: expense.expense_date,
      approvalDate: null,
      isBacklog: expense.expense_date < date,
      createdAt: expense.created_at,
      businessLabel: transactionBusinessTag(expense.business_type, t),
      cashAmount: expense.mode === "online" ? 0 : numberValue(expense.amount),
      onlineAmount: expense.mode === "online" ? numberValue(expense.amount) : 0,
      cashStatus: null,
      onlineStatus: null,
      note: expenseReference(expense, t),
      transferLines: [],
      journey: expenseJourneySteps(expense, profiles, t),
      hasPendingTransfer: false,
      canReview: true,
      isMixedPayment: false,
      tone: "negative" as const,
      icon: <ReceiptText size={22} />,
    }));

  const movementRecords: ClosingReviewRecord[] = profileDayEvents
    .filter((event) => event.source_type === "transfer" || event.source_type === "settlement")
    .flatMap((event) => {
      const movement = movements.find((item) => item.id === event.source_id);
      if (!movement) return [];
      const incoming = event.direction === "in";
      return [{
        id: `${movement.id}-${event.direction}`,
        sourceId: movement.id,
        recordType: "movement" as const,
        title: incoming ? t("cashReceived") : t("cashSent"),
        amount: incoming ? event.amount : -event.amount,
        mode: labelForMode(movement.mode, t),
        status: movement.status,
        recordDate: date,
        transactionDate: event.transaction_date,
        approvalDate: event.approval_date,
        isBacklog: false,
        createdAt: movement.responded_at ?? movement.created_at,
        businessLabel: t("cashTransfer"),
        cashAmount: event.cash_amount,
        onlineAmount: 0,
        cashStatus: null,
        onlineStatus: null,
        note: movement.note ?? t("noReason"),
        transferLines: [`${profileName(profiles, movement.from_profile_id, t)} → ${profileName(profiles, movement.to_profile_id, t)}`],
        journey: cashTransferJourneySteps(movement, profiles, t, incoming ? "cash_in" : "cash_out"),
        hasPendingTransfer: false,
        canReview: false,
        isMixedPayment: false,
        tone: incoming ? "positive" as const : "negative" as const,
        icon: incoming ? <ArrowDown size={22} /> : <ArrowUp size={22} />,
      }];
    });

  const agentSettlementRecords: ClosingReviewRecord[] = profileDayEvents
    .filter((event) => businessTypes === null && event.source_type === "agent_settlement")
    .flatMap((event) => {
      const settlement = agentSettlements.find((item) => item.id === event.source_id);
      if (!settlement) return [];
      const incoming = event.direction === "in";
      return [{
        id: `${settlement.id}-${event.direction}`,
        sourceId: settlement.id,
        recordType: "movement" as const,
        title: incoming ? t("incentivePayout") : t("agentPayout"),
        amount: incoming ? event.amount : -event.amount,
        mode: t("cash"),
        status: settlement.status,
        recordDate: date,
        transactionDate: event.transaction_date,
        approvalDate: event.approval_date,
        isBacklog: false,
        createdAt: settlement.responded_at ?? settlement.created_at,
        businessLabel: t("cashTransfer"),
        cashAmount: event.cash_amount,
        onlineAmount: event.online_amount,
        cashStatus: null,
        onlineStatus: null,
        note: settlement.note ?? t("noReason"),
        transferLines: [`${profileName(profiles, settlement.paid_by, t)} → ${profileName(profiles, settlement.agent_id, t)}`],
        journey: agentPayoutJourneySteps(settlement, profiles, t, incoming ? "cash_in" : "cash_out"),
        hasPendingTransfer: false,
        canReview: false,
        isMixedPayment: false,
        tone: incoming ? "positive" as const : "negative" as const,
        icon: <WalletCards size={22} />,
      }];
    });

  const reviewRecords = [
    ...approvedPaymentRecords,
    ...approvedExpenseRecords,
    ...movementRecords,
    ...agentSettlementRecords,
    ...pendingPaymentRecords,
    ...pendingExpenseRecords,
  ].sort((a, b) => a.recordDate.localeCompare(b.recordDate) || a.createdAt.localeCompare(b.createdAt));
  // ALL / IN / OUT stay on the closing date (ALL includes that day's pending records);
  // PENDING carries every record still awaiting approval up to the closing date.
  const pendingRecords = reviewRecords.filter((record) => record.canReview);
  // Cash / Online narrows every chip (set when a closing card's Cash or Online figure is tapped).
  const matchesMode = (record: { cashAmount: number; onlineAmount: number }) =>
    reviewMode === "all" || (reviewMode === "cash" ? record.cashAmount > 0 : record.onlineAmount > 0);
  const allDayRecords = reviewRecords.filter((record) => record.recordDate === date && matchesMode(record));
  // IN / OUT include the day's pending records, matching the card's Cash IN / Cash OUT totals.
  const inRecords = allDayRecords.filter((record) => record.tone === "positive");
  const outRecords = allDayRecords.filter((record) => record.tone === "negative");
  const modePendingRecords = pendingRecords.filter(matchesMode);
  const reviewFilterOptions = [
    { value: "all" as const, label: t("all"), records: allDayRecords },
    { value: "in" as const, label: "IN", records: inRecords },
    { value: "out" as const, label: "OUT", records: outRecords },
    { value: "pending" as const, label: t("pending"), records: modePendingRecords },
  ];
  const visibleReviewRecords = reviewFilterOptions.find((option) => option.value === reviewFilter)?.records ?? allDayRecords;
  const createdTime = (createdAt: string) => formatIndiaTime(createdAt);

  return (
    <div className="closing-review-detail">
      <header className="closing-review-header">
        <button className="icon-button" type="button" aria-label={t("back")} onClick={close}>
          <ArrowLeft size={18} />
        </button>
        <span className="closing-avatar">{profileInitials(summary.profile)}</span>
        <div>
          <p className="eyebrow">{t("reviewAndSettle")}</p>
          <h2>{summary.profile.full_name}</h2>
        </div>
      </header>

      <section className="review-transaction-section">
        <div className="closing-ledger-heading">
          <h2>{reviewFilter === "pending" ? t("pendingReview") : t("dailyTransactions")}</h2>
          <span>{date}</span>
        </div>
        <div className="transaction-activity-chips review-activity-chips" aria-label={t("reviewAndSettle")}>
          {reviewFilterOptions.map((option) => (
            <button
              aria-pressed={reviewFilter === option.value}
              className={reviewFilter === option.value ? "active" : ""}
              key={option.value}
              onClick={() => setReviewFilter(option.value)}
              type="button"
            >
              {option.label} · {option.records.length}
            </button>
          ))}
          {reviewMode !== "all" ? (
            <button className="active review-mode-chip" type="button" onClick={() => setReviewMode("all")} aria-label={`${t(reviewMode)} · Clear filter`}>
              {t(reviewMode)} <X size={13} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {reviewFilter === "pending" && pendingRecords.length > 0 ? <p className="date-filter-note">{t("pendingDateUsesTransaction")}</p> : null}
        <div className="review-transaction-list">
          {visibleReviewRecords.length > 0 ? visibleReviewRecords.map((record) => {
            const canReview = record.canReview && reviewActionsEnabled;
            const hasCashComponent = record.recordType === "payment" && record.cashStatus !== null;
            const hasOnlineComponent = record.recordType === "payment" && record.onlineStatus !== null;
            const recordWhen = record.isBacklog ? `${record.recordDate} · ${createdTime(record.createdAt)} · ${t("backlog")}` : createdTime(record.createdAt);
            return (
              <article className={`history-card closing-history-card ${record.tone}`} key={`${record.recordType}-${record.id}`}>
                <div className="history-card-icon">{record.icon}</div>
                <div className="history-card-main">
                  <strong>{record.title}</strong>
                  <span className="history-business-badge">{record.businessLabel}</span>
                  {record.approvalDate && record.transactionDate !== record.approvalDate ? (
                    <small className="history-date-context">
                      {t("transactionDate")} {record.transactionDate} · {t("approvalDate")} {record.approvalDate}
                    </small>
                  ) : null}
                </div>
                <div className="history-card-side">
                  <TransactionCardAmount
                    amount={record.amount}
                    cashAmount={record.cashAmount}
                    onlineAmount={record.onlineAmount}
                    tone={record.tone}
                  />
                </div>
                <details className="history-actions-menu closing-history-actions">
                  <summary aria-label={t("moreOptions")}>
                    <MoreHorizontal size={18} />
                  </summary>
                  <div className="details-menu transaction-options-menu closing-history-menu">
                    <div className="closing-history-menu-copy">
                      <strong>{recordWhen}</strong>
                      <span>{record.mode} · {labelForStatus(record.status, t)}</span>
                      <span>{record.note}</span>
                      {record.transferLines.map((line, index) => (
                        <span key={`${line}-${index}`}>{line}</span>
                      ))}
                    </div>
                    {canReview && record.recordType === "expense" ? (
                      <MiniAction
                        hidden={{ record_type: record.recordType, id: record.sourceId, decision: "rejected" }}
                        label={t("reject")}
                        tone="reject"
                        action={approveRecordAction}
                        setNotice={setNotice}
                        startTransition={startTransition}
                      />
                    ) : null}
                  </div>
                </details>
                <div className="history-card-flow">
                  <TransactionJourney steps={record.journey} lanes={record.journeyLanes} amount={record.amount}>
                    <div className="journey-action-row closing-history-approval-actions">
                      {record.recordType === "payment" ? (
                        <>
                          {hasCashComponent ? (
                            record.cashStatus === "approved" ? (
                              <span className="component-approved"><Check size={16} /> {t("cash")} {labelForStatus("approved", t)}</span>
                            ) : record.hasPendingTransfer && canReview ? (
                              <button className="mini-action tone-approve" type="button" disabled title={t("resolveTransferFirst")}>
                                {t("approve")} {t("cash")}
                              </button>
                            ) : canReview && canApproveRecordStatus(record.cashStatus ?? record.status) ? (
                              <MiniAction
                                hidden={{ record_type: record.recordType, id: record.sourceId, decision: "approved", payment_component: "cash" }}
                                label={`${t("approve")} ${t("cash")}`}
                                tone="approve"
                                action={approveRecordAction}
                                setNotice={setNotice}
                                startTransition={startTransition}
                              />
                            ) : null
                          ) : null}
                          {hasOnlineComponent ? (
                            record.onlineStatus === "approved" ? (
                              <span className="component-owner-verification verified"><Landmark size={15} /> {t("verifiedByOwner")}</span>
                            ) : canVerifyOnlineCollections && canReview && record.hasPendingTransfer ? (
                              <button className="mini-action tone-approve" type="button" disabled title={t("resolveTransferFirst")}>
                                {t("verifyOnline")}
                              </button>
                            ) : canVerifyOnlineCollections && canReview && canApproveRecordStatus(record.onlineStatus ?? record.status) ? (
                              <MiniAction
                                hidden={{ record_type: record.recordType, id: record.sourceId, decision: "approved", payment_component: "online" }}
                                label={t("verifyOnline")}
                                tone="approve"
                                action={approveRecordAction}
                                setNotice={setNotice}
                                startTransition={startTransition}
                              />
                            ) : (
                              <span className="component-owner-verification pending"><Landmark size={15} /> {t("awaitingOwnerVerification")}</span>
                            )
                          ) : null}
                        </>
                      ) : canReview ? (
                        record.hasPendingTransfer ? (
                          <button className="mini-action tone-approve" type="button" disabled title={t("resolveTransferFirst")}>
                            {t("resolveTransferFirst")}
                          </button>
                        ) : (
                          <MiniAction
                            hidden={{ record_type: record.recordType, id: record.sourceId, decision: "approved" }}
                            label={t("approve")}
                            tone="approve"
                            action={approveRecordAction}
                            setNotice={setNotice}
                            startTransition={startTransition}
                          />
                        )
                      ) : null}
                    </div>
                  </TransactionJourney>
                </div>
              </article>
            );
          }) : (
            <p className="muted">{t("noRecordsForFilter")}</p>
          )}
        </div>
      </section>
    </div>
  );
}
