"use client";

import { createContext, FormEvent, ReactNode, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useTransition, WheelEvent } from "react";
import { useFormStatus } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  ChevronRight,
  ClipboardList,
  Copy,
  GraduationCap,
  Hotel,
  Landmark,
  LogOut,
  Menu,
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
  createAgentSettlementAction,
  createExpenseAction,
  createPaymentAction,
  createStaffAction,
  changeUserPasswordAction,
  deleteCourseAction,
  deleteReferralAction,
  deleteRoomAction,
  deleteUserAction,
  logoutAction,
  markNotificationsReadAction,
  reviewChangeRequestAction,
  requestPaymentTransferAction,
  saveCourseStudentAction,
  saveLibraryStudentAction,
  saveCourseAction,
  saveReferralAction,
  saveRoomAction,
  saveStaffPermissionsAction,
  setLibraryStudentStatusAction,
  respondPaymentTransferAction,
  settleCashAction,
  updateRecordAction,
  updateProfileAction,
} from "@/app/actions";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import { addMonthsIso, businessLabels, businessPermissions, formatMoney, isOwnerish, isSalesAgent, permissionOptions, todayIso } from "@/lib/constants";
import type { AgentSettlement, AppData, AppNotification, AppRole, ApprovalStatus, BootstrapPayload, BusinessType, Course, DashboardPayload, Expense, LedgerEntry, LibraryStudent, LibraryStudentSubscriptionEvent, MoneyMovement, Payment, PaymentMode, Profile, ReferralCode } from "@/lib/types";
import { rangeForPreset, type AppTab, type AppViewState, type DateRangePreset, type DateRangeState, type TransactionFilter } from "@/lib/view-state";

type Tab = AppTab;
type Language = "en" | "hi";
type ActionResult = { ok: true; message?: string } | { ok: false; message: string };
type ToastNotice = ActionResult & { id: string };
type ActionModal = "positive" | "negative" | null;
type PositiveFlow = BusinessType | "receive_money";
type NegativeFlow = "expense" | "send_money" | "agent_settlement";
type ClientAction = (formData: FormData) => Promise<ActionResult>;
type MutationRefreshScope = "dashboard" | "bootstrap" | "dashboard-library" | "none";
type MutationRefreshDetail = {
  scope: MutationRefreshScope;
  savingMessageKey: string;
  refreshingMessageKey: string;
};
type SettlementDirection = "received_from_user" | "sent_to_user";
type TransactionActionKind = "transfer" | "edit" | "delete";
type LibraryMemberMode = "new" | "existing";
type LibraryStudentListMode = "active" | "live" | "inactive";
type StudentRecordSource =
  | { id: "library"; type: "library"; label: string }
  | { id: string; type: "mainCourse" | "skillCourse"; label: string; course: Course };
type CourseStudentRecordSource = Extract<StudentRecordSource, { type: "mainCourse" | "skillCourse" }>;
type CourseStudentRecord = {
  id: string;
  paymentId: string;
  identityKey: string;
  displayName: string;
  rollNumber: string | null;
  courseName: string;
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
  active: boolean;
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

function getProfileImage(fullName: string, avatarUrl?: string | null) {
  if (avatarUrl) return avatarUrl;

  const name = fullName.toLowerCase();
  if (name.includes("alex")) return "https://lh3.googleusercontent.com/aida-public/AB6AXuCKWCI0NmjmpzJ1Ou2dOGYzT_SqCk-zMQSUHuWDPj_63UFU9HjpIXkgUGc6quxycauzhwBCadMr96AaOYuGtlG7LHci7q461fo8T55rkGDe7_eQ0vTJk1QLVn85jsmc8uyNmIc7EEcm64Y41gKH7DCfPXadqRCa8Zocve1EXXVsoeOy4Rcw0MpArfkFOe5Yx2gk2NP5t-_v6Zz7bx53fJX1q2x3IFMcLa6QtRKAGn5HLXzeTXxPIuYoEKeCR9uxzztIDpwnkpr_4Q";
  if (name.includes("altamash")) return "https://lh3.googleusercontent.com/aida-public/AB6AXuDf2QPj4Z950V9MxBXiG9oe269_76pWubhnTjuc1HBILwGR7F0slFHrB4jw0PyJA51rGSxLWI1FbNTd6dw_KUdOjw8THKM9Z_OYZkBIFPuwTQBTpjpMJ3W1GP25VBmEwH9wPZjcBI0ViMlbEQAzkhpxHgeEB8Csnvmvwa4NvX_KCoJbUM3bdSMljm--QQKi6fh_NMng8kYlyUg835dC2ViVLTviZK3o-4RRpvTrL4UlC2sHihyILbk6Iwcs-zKrWyNj-QLNpkuH_A";
  if (name.includes("anivesh")) return "https://lh3.googleusercontent.com/aida-public/AB6AXuBHMvZIaJASvGEBfDthL6ypfh1vBLMwtCra6pNz6Tcy_bKUPIvvZhyctDwQOmMUmAsluHA6sjentAvFQuR6sGxpITLJDo9CoSakBvFmft5f4XejNWMnUC30uKKxpmImL_przYNWVIz3tGGH0qessaEuFgkIixw3DuLoFqZYacrYdwEvPWJzmWLroLHn62gd1u7dY9xmsVh2G0F7JAlbGZE4ELXsjTNh4rka97FDKl7Dde1uA0hoq8JtuJjyJM0whgwALe5LLDdLAQ";
  if (name.includes("monira")) return "https://lh3.googleusercontent.com/aida-public/AB6AXuDh99_4mUjnxTvzPDseWFd1yGf9701A2EOZW4Adntw-5OZ3G-QaYf0EAqPk07G4Abw_OtyuAJmGyNoGdIigFBwtmJpnd0FDH59zzqOv6l_tasJDX3QXL_PCsMOCpsMi283ShI_gVr1uN4e6UZQf7ygF5gNpda1NEAUnXfWWCPbYseV6bqdfqhJqemeiT-vtIsikhxwlVUQekxRRUhJPKcq-qm_8dp20QW03GZLzc1owf1G463EhcL8oKxQ7zZRcv7BvaSxWh4jDKQ";
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=c8e8d0&color=002110`;
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
    case "settings":
      return <Settings size={21} />;
  }
}

const tabItems: { id: Tab; labelKey: string; icon: ReactNode }[] = [
  { id: "home", labelKey: "dashboard", icon: <Landmark size={17} /> },
  { id: "payments", labelKey: "transactions", icon: <ReceiptText size={17} /> },
  { id: "library_students", labelKey: "libraryStudents", icon: <BookOpen size={17} /> },
  { id: "closing", labelKey: "closing", icon: <ClipboardList size={17} /> },
  { id: "settings", labelKey: "settings", icon: <Settings size={17} /> },
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
    aadharPhotoPreview: "Aadhar card preview",
    aadharNumber: "Aadhar number",
    addSubscription: "Add subscription",
    addCourse: "Add course",
    addExpense: "Add expense",
    addExpenseOrSettlement: "Add expense or settlement",
    addImage: "Add image",
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
    amountReceived: "Amount received",
    approve: "Approve",
    awaitingOwnerApproval: "Awaiting owner approval",
    back: "Back",
    backlog: "Backlog",
    balanceIncentive: "Incentive due",
    business: "Business",
    cancel: "Cancel",
    cancelWrongEntry: "Cancel wrong entry",
    cash: "Cash",
    cashAndOnline: "Cash and online",
    cashBalances: "Cash balances",
    cashCollection: "Cash collection",
    cashIn: "IN",
    cashInFromOwner: "IN from owner",
    cashInHand: "Cash in hand",
    cashInCollected: "IN",
    cashOut: "OUT",
    cashOutExpenses: "OUT",
    cashWithStaff: "Cash with staff",
    currentHolder: "Current holder",
    changeRequests: "Change requests",
    changePassword: "Change password",
    closing: "Closing",
    closingBalance: "Closing balance",
    closingCash: "Closing cash",
    code: "Code",
    closeNavigation: "Close navigation",
    closeModal: "Close modal",
    collectDue: "Collect due",
    collectPayment: "Collect payment",
    collectMoney: "Collect money",
    collections: "Collections",
    collected: "Collected",
    copyReferralCode: "Copy code",
    confirmReceived: "Confirm received",
    confirmed: "Confirmed",
    confirmedPayouts: "Paid incentive",
    collectedByStaff: "Collected payment",
    businessStatus: "Business status",
    businessStatusHelp: "IN, OUT, and pending review by business.",
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
    expiresToday: "Expires today",
    finalizeAndSettle: "Finalize & Settle",
    fee: "Fee",
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
    studentRecords: "Student records",
    studentSearch: "Search student",
    activeStudents: "Active students",
    ago: "ago",
    day: "day",
    days: "days",
    liveStudents: "LIVE students",
    inactiveStudents: "Inactive students",
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
    note: "Note",
    notifications: "Notifications",
    online: "Online",
    onlineCollection: "Online collection",
    onlinePart: "Online part",
    openNavigation: "Open navigation",
    openingCash: "Opening cash",
    openingBalance: "Opening balance",
    openingCashBalance: "Opening",
    optional: "Optional",
    out: "OUT",
    owner: "Owner",
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
    receiveMoney: "Receive money",
    receivedFormTitle: "RECEIVED",
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
    transferTransaction: "Transfer",
    viewPhoto: "View photo",
    reviewAndSettle: "Review",
    reviewToday: "Today",
    reviewPending: "Pending",
    reviewPendingButton: "Review pending",
    reviewPendingFirst: "Review pending first",
    reviewSettlementNotice: "Review pending transactions carefully before recording received cash.",
    settlementAmountHelp: "Enter only the cash actually received for this settlement.",
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
    updatingAppData: "Updating app data...",
    updatingTransactionList: "Updating transaction list...",
    select: "Select",
    selectAgent: "Select agent",
    selectAnotherType: "Select another type",
    selectCourse: "Select course",
    selectRoom: "Select room",
    selectSkill: "Select skill",
    selectStaff: "Select staff",
    selectUser: "Select user",
    searchUser: "Search user",
    sendPayout: "Pay incentive",
    sendMoney: "Send money",
    sendFormTitle: "SEND",
    shareReferralCode: "Share code",
    sendMoneyLower: "send money",
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
    settlementHistory: "Settlement history",
    settlements: "Settlements",
    shikshanSansthan: "Shikshan Sansthan",
    skill: "Skill",
    slotHours: "Slot hours",
    staff: "Staff",
    staffBusinessStatus: "My service status",
    staffBusinessStatusHelp: "IN, OUT, and pending review by service.",
    staffDailyLedger: "Staff Daily Ledger",
    staffPermissions: "Staff permissions",
    spent: "Spent",
    startDate: "Start date",
    startTime: "Start time",
    status: "Status",
    to: "to",
    toEmployee: "To employee",
    today: "Today",
    totalClosing: "Total closing",
    totalCollected: "Total collected",
    totalExpenses: "Total expenses",
    totalIn: "IN",
    totalOut: "OUT",
    totalCollection: "Total collection",
    ownerAccountCredit: "Owner account credit",
    totalOpening: "Total opening",
    totalRecorded: "Total recorded",
    tillDate: "Till date",
    transferCash: "Transfer cash",
    transferred: "Transferred",
    transferHistory: "Transfer history",
    transfers: "Transfers",
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
    viewAll: "View all",
    yesterday: "Yesterday",
    receivedFromStaff: "Received from staff",
    receivedFromUser: "Received from user",
    cashReceived: "Cash Received",
    cashSent: "Cash Sent",
    cashSettled: "Cash Settled",
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
    aadharPhotoPreview: "आधार कार्ड प्रीव्यू",
    aadharNumber: "आधार नंबर",
    addSubscription: "सब्सक्रिप्शन जोड़ें",
    addCourse: "कोर्स जोड़ें",
    addExpense: "खर्च जोड़ें",
    addExpenseOrSettlement: "खर्च या जमा जोड़ें",
    addImage: "फोटो जोड़ें",
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
    amountReceived: "मिली रकम",
    approve: "ठीक है",
    awaitingOwnerApproval: "मालिक की मंजूरी बाकी",
    back: "वापस",
    backlog: "बैकलॉग",
    balanceIncentive: "कमिशन बाकी",
    business: "काम",
    cancel: "रद्द करें",
    cancelWrongEntry: "गलत एंट्री हटाएं",
    cash: "नकद",
    cashAndOnline: "नकद और ऑनलाइन",
    cashBalances: "नकद बाकी",
    cashCollection: "नकद जमा",
    cashIn: "IN",
    cashInFromOwner: "मालिक से IN",
    cashInHand: "हाथ में नकद",
    cashInCollected: "IN",
    cashOut: "OUT",
    cashOutExpenses: "OUT",
    cashWithStaff: "स्टाफ के पास नकद",
    currentHolder: "मौजूदा होल्डर",
    changeRequests: "बदलाव की मांग",
    changePassword: "पासवर्ड बदलें",
    closing: "दिन बंद",
    closingBalance: "बंद हिसाब",
    closingCash: "दिन के अंत का नकद",
    code: "कोड",
    closeNavigation: "मेनू बंद करें",
    closeModal: "बंद करें",
    collectDue: "बाकी जमा करें",
    collectPayment: "पैसा जमा करें",
    collectMoney: "पैसा लें",
    collections: "कलेक्शन",
    collected: "जमा",
    copyReferralCode: "कोड कॉपी करें",
    confirmReceived: "मिल गया",
    confirmed: "पक्का",
    confirmedPayouts: "दिया गया कमिशन",
    collectedByStaff: "जमा पैसा",
    businessStatus: "काम का स्टेटस",
    businessStatusHelp: "काम के हिसाब से IN, OUT और बाकी जांच।",
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
    expiresToday: "आज खत्म",
    finalizeAndSettle: "फाइनल जमा करें",
    fee: "फीस",
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
    studentRecords: "छात्र रिकॉर्ड",
    studentSearch: "छात्र खोजें",
    activeStudents: "चालू छात्र",
    ago: "पहले",
    day: "दिन",
    days: "दिन",
    liveStudents: "LIVE छात्र",
    inactiveStudents: "बंद छात्र",
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
    note: "नोट",
    notifications: "सूचनाएं",
    online: "ऑनलाइन",
    onlineCollection: "ऑनलाइन जमा",
    onlinePart: "ऑनलाइन हिस्सा",
    openNavigation: "मेनू खोलें",
    openingCash: "शुरू का नकद",
    openingBalance: "शुरू हिसाब",
    openingCashBalance: "शुरू",
    optional: "जरूरी नहीं",
    out: "OUT",
    owner: "मालिक",
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
    receiveMoney: "पैसा प्राप्त करें",
    receivedFormTitle: "मिला",
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
    transferTransaction: "ट्रांसफर",
    viewPhoto: "फोटो देखें",
    reviewAndSettle: "जांचें",
    reviewToday: "आज",
    reviewPending: "बाकी",
    reviewPendingButton: "बाकी जांचें",
    reviewPendingFirst: "पहले बाकी जांचें",
    reviewSettlementNotice: "नकद मिला दर्ज करने से पहले बाकी एंट्री ध्यान से जांचें।",
    settlementAmountHelp: "इस सेटलमेंट में जितनी नकद सच में मिली है, सिर्फ वही रकम डालें।",
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
    updatingAppData: "ऐप डेटा अपडेट हो रहा है...",
    updatingTransactionList: "लेनदेन सूची अपडेट हो रही है...",
    select: "चुनें",
    selectAgent: "एजेंट चुनें",
    selectAnotherType: "दूसरा प्रकार चुनें",
    selectCourse: "कोर्स चुनें",
    selectRoom: "कमरा चुनें",
    selectSkill: "स्किल चुनें",
    selectStaff: "स्टाफ चुनें",
    selectUser: "यूजर चुनें",
    searchUser: "यूजर खोजें",
    sendPayout: "कमिशन दें",
    sendMoney: "पैसा भेजें",
    sendFormTitle: "भेजें",
    shareReferralCode: "कोड शेयर करें",
    sendMoneyLower: "पैसा भेजें",
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
    settlementHistory: "सेटलमेंट हिसाब",
    settlements: "सेटलमेंट",
    shikshanSansthan: "शिक्षण संस्थान",
    skill: "स्किल",
    slotHours: "घंटा",
    staff: "स्टाफ",
    staffBusinessStatus: "मेरे काम का स्टेटस",
    staffBusinessStatusHelp: "काम के हिसाब से IN, OUT और बाकी जांच।",
    staffDailyLedger: "स्टाफ का दिन का हिसाब",
    staffPermissions: "स्टाफ अधिकार",
    spent: "खर्च",
    startDate: "शुरू तारीख",
    startTime: "शुरू समय",
    status: "हाल",
    to: "को",
    toEmployee: "किस स्टाफ को",
    today: "आज",
    totalClosing: "कुल बंद हिसाब",
    totalCollected: "कुल जमा",
    totalExpenses: "कुल खर्च",
    totalIn: "IN",
    totalOut: "OUT",
    totalCollection: "कुल जमा",
    ownerAccountCredit: "मालिक खाते में जमा",
    totalOpening: "कुल शुरू हिसाब",
    totalRecorded: "कुल रिकॉर्ड",
    tillDate: "आज तक",
    transferCash: "नकद भेजें",
    transferred: "ट्रांसफर हुए",
    transferHistory: "भेजने का हिसाब",
    transfers: "पैसा भेजना",
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
    viewAll: "सब देखें",
    yesterday: "कल",
    receivedFromStaff: "स्टाफ से मिला",
    receivedFromUser: "यूजर से मिला",
    cashReceived: "नकद मिला",
    cashSent: "नकद भेजा",
    cashSettled: "नकद जमा किया",
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

const permissionLabelKeys: Record<string, string> = {
  collect_guest_house: "guestHouse",
  collect_library: "library",
  collect_course: "course",
  collect_general: "general",
  add_expense: "addExpense",
  transfer_money: "transferCash",
};

const roleLabelKeys: Record<string, string> = {
  admin: "admin",
  owner: "owner",
  staff: "staff",
  sales_agent: "salesAgent",
};

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

const actionStartedEvent = "lenden:action-started";
const actionEndedEvent = "lenden:action-ended";
const mutationCommittedEvent = "lenden:mutation-committed";

const transactionRefreshActions = new Set<ClientAction>([
  approveRecordAction,
  cancelRecordAction,
  createAgentSettlementAction,
  createExpenseAction,
  createPaymentAction,
  reviewChangeRequestAction,
  requestPaymentTransferAction,
  respondPaymentTransferAction,
  settleCashAction,
  updateRecordAction,
]);

const bootstrapRefreshActions = new Set<ClientAction>([
  changeUserPasswordAction,
  createStaffAction,
  deleteCourseAction,
  deleteReferralAction,
  deleteRoomAction,
  deleteUserAction,
  saveCourseAction,
  saveReferralAction,
  saveRoomAction,
  saveStaffPermissionsAction,
  updateProfileAction,
]);

const libraryRefreshActions = new Set<ClientAction>([
  saveCourseStudentAction,
  saveLibraryStudentAction,
  setLibraryStudentStatusAction,
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
  const isLibraryPayment = action === createPaymentAction && formData.get("business_type") === "library";
  if (libraryRefreshActions.has(action) || isLibraryPayment) {
    return {
      scope: "dashboard-library",
      savingMessageKey: action === createPaymentAction ? "savingTransaction" : "savingChanges",
      refreshingMessageKey: action === createPaymentAction ? "updatingTransactionList" : "updatingAppData",
    };
  }

  if (transactionRefreshActions.has(action)) {
    return {
      scope: "dashboard",
      savingMessageKey: "savingTransaction",
      refreshingMessageKey: "updatingTransactionList",
    };
  }

  if (bootstrapRefreshActions.has(action)) {
    return {
      scope: "bootstrap",
      savingMessageKey: "savingChanges",
      refreshingMessageKey: "updatingAppData",
    };
  }

  return {
    scope: "none",
    savingMessageKey: "savingChanges",
    refreshingMessageKey: "updatingAppData",
  };
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

function submitWith(
  event: FormEvent<HTMLFormElement>,
  action: ClientAction,
  setNotice: (notice: ActionResult | null) => void,
  startTransition: ReturnType<typeof useTransition>[1],
  reset = true,
) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.checkValidity()) {
    setNotice({ ok: false, message: formValidationMessage(form) });
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
      if (result.ok) {
        window.dispatchEvent(new CustomEvent<MutationRefreshDetail>(mutationCommittedEvent, { detail: refreshDetail }));
        if (reset) form.reset();
        form.closest("details.history-actions-menu")?.removeAttribute("open");
      } else {
        window.dispatchEvent(new CustomEvent(actionEndedEvent));
      }
    } catch (error) {
      setNotice({
        ok: false,
        message: error instanceof Error ? error.message : "Network error. Please check your connection and try again.",
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
      if (result.ok) {
        window.dispatchEvent(new CustomEvent<MutationRefreshDetail>(mutationCommittedEvent, { detail: refreshDetail }));
        form.reset();
        onSuccess();
      } else {
        window.dispatchEvent(new CustomEvent(actionEndedEvent));
      }
    } catch (error) {
      setNotice({
        ok: false,
        message: error instanceof Error ? error.message : "Network error. Please check your connection and try again.",
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

function paymentReviewProfileId(payment: Payment) {
  return paymentCashAmount(payment) > 0 ? payment.current_holder_id ?? payment.collected_by : payment.collected_by;
}

function paymentModeLabel(payment: Payment, t: (key: string) => string) {
  if (payment.mode !== "mixed") return labelForMode(payment.mode, t);
  return `${labelForMode("mixed", t)}: ${t("cash")} ${formatMoney(paymentCashAmount(payment))}, ${t("online")} ${formatMoney(paymentOnlineAmount(payment))}`;
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

function paymentDisplayTitle(payment: Payment, t: (key: string) => string) {
  return payment.description || payment.customer_name || payment.room_number_snapshot || labelForBusiness(payment.business_type, t);
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

function movementDate(movement: MoneyMovement) {
  return (movement.responded_at ?? movement.created_at).slice(0, 10);
}

function ownerCashTransferInAmount(
  movements: MoneyMovement[],
  profiles: Profile[],
  profileId: string,
  range: NormalizedDateRange,
) {
  const ownerIds = ownerProfileIdSet(profiles);
  return movements
    .filter(
      (movement) =>
        movement.status === "accepted" &&
        movement.type === "transfer" &&
        !movement.payment_id &&
        movement.to_profile_id === profileId &&
        ownerIds.has(movement.from_profile_id) &&
        dateInRange(movementDate(movement), range),
    )
    .reduce((sum, movement) => sum + numberValue(movement.amount), 0);
}

function summaryWithOwnerCashInAsCollection(
  summary: UserClosingSummary,
  movements: MoneyMovement[],
  profiles: Profile[],
  date: string,
) {
  if (summary.profile.role !== "staff") return summary;
  const ownerCashIn = ownerCashTransferInAmount(movements, profiles, summary.profile.id, { from: date, to: date });
  if (ownerCashIn <= 0) return summary;

  return {
    ...summary,
    collected: summary.collected + ownerCashIn,
    received: Math.max(summary.received - ownerCashIn, 0),
  };
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

  return { profile, opening, collected, expenses, received, sent, adjustments, closing, dayEntries };
}

function roleBadge(profile: Profile) {
  if (profile.role === "sales_agent") return "A";
  if (profile.role === "staff") return "S";
  return "O";
}

function bootstrapFromAppData(data: AppData): BootstrapPayload {
  return {
    profile: data.profile,
    permissions: data.permissions,
    allPermissions: data.allPermissions,
    profiles: data.profiles,
    rooms: data.rooms,
    courses: data.courses,
    referrals: data.referrals,
  };
}

function dashboardFromAppData(data: AppData): DashboardPayload {
  return {
    libraryStudents: data.libraryStudents,
    studentPayments: data.studentPayments,
    payments: data.payments,
    expenses: data.expenses,
    movements: data.movements,
    ledger: data.ledger,
    closingSummaries: data.closingSummaries,
    changeRequests: data.changeRequests,
    agentSettlements: data.agentSettlements,
    notifications: data.notifications,
  };
}

function mergeCachedAppData(bootstrap: BootstrapPayload, dashboard: DashboardPayload): AppData {
  return {
    ...bootstrap,
    ...dashboard,
  };
}

function dashboardDataSearchParams(dateRange: DateRangeState) {
  const params = new URLSearchParams();
  params.set("range", dateRange.preset);
  if (dateRange.preset === "custom") {
    params.set("from", dateRange.from);
    params.set("to", dateRange.to);
  }
  return params;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}

function LogoutButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <>
      {pending ? (
        <div className="toast-stack" aria-live="polite" aria-atomic="true">
          <div className="toast toast-info">
            <span className="toast-icon saving-dot" />
            <strong>{label}...</strong>
          </div>
        </div>
      ) : null}
      <button className="ghost-button full" type="submit" disabled={pending}>
        {pending ? `${label}...` : label}
      </button>
    </>
  );
}

export function AppShell({ data, initialViewState }: { data: AppData; initialViewState: AppViewState }) {
  const initialUserIsSalesAgent = isSalesAgent(data.profile.role);
  const initialTab = initialUserIsSalesAgent && (initialViewState.tab === "closing" || initialViewState.tab === "settings" || initialViewState.tab === "library_students")
    ? "home"
    : initialViewState.tab;
  const initialTransactionProfileId = initialViewState.transactionProfileId === "all"
    ? "all"
    : data.profiles.some((profile) => profile.id === initialViewState.transactionProfileId)
    ? initialViewState.transactionProfileId
    : isOwnerish(data.profile.role) ? "all" : data.profile.id;
  const initialTransactionFilter = initialViewState.transactionFilter;
  const [tab, setTab] = useState<Tab>(initialTab);
  const [language, setLanguageState] = useState<Language>("en");
  const [dateRange, setDateRange] = useState<DateRangeState>(initialViewState.dateRange);
  const [transactionProfileId, setTransactionProfileId] = useState(initialTransactionProfileId);
  const [transactionFilter, setTransactionFilter] = useState<TransactionFilter>(initialTransactionFilter);
  const [toasts, setToasts] = useState<ToastNotice[]>([]);
  const [notificationOverrides, setNotificationOverrides] = useState<AppNotification[] | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [actionModal, setActionModal] = useState<ActionModal>(null);
  const [selectedPositive, setSelectedPositive] = useState<PositiveFlow | null>(null);
  const [selectedNegative, setSelectedNegative] = useState<NegativeFlow | null>(null);
  const [pending, startTransition] = useTransition();
  const [actionBusyMessageKey, setActionBusyMessageKey] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const initialDashboardData = useMemo(() => dashboardFromAppData(data), [data]);
  const initialDashboardParams = useMemo(
    () => dashboardDataSearchParams(initialViewState.dateRange).toString(),
    [initialViewState.dateRange],
  );
  const dashboardParams = useMemo(
    () => dashboardDataSearchParams(dateRange).toString(),
    [dateRange],
  );
  const bootstrapQuery = useQuery({
    queryKey: ["bootstrap"],
    queryFn: () => fetchJson<BootstrapPayload>("/api/app/bootstrap"),
    initialData: () => bootstrapFromAppData(data),
  });
  const dashboardQuery = useQuery({
    queryKey: ["dashboard", dashboardParams],
    queryFn: () => fetchJson<DashboardPayload>(`/api/app/dashboard?${dashboardParams}`),
    initialData: dashboardParams === initialDashboardParams ? () => initialDashboardData : undefined,
    placeholderData: (previousDashboard) => previousDashboard,
  });
  const appData = useMemo(
    () => mergeCachedAppData(bootstrapQuery.data, dashboardQuery.data ?? initialDashboardData),
    [bootstrapQuery.data, dashboardQuery.data, initialDashboardData],
  );
  const t = useMemo(() => (key: string) => messages[language][key] ?? messages.en[key] ?? key, [language]);
  const notifications = notificationOverrides ?? appData.notifications;
  const unreadNotifications = notifications.filter((notification) => !notification.read_at).length;
  const currentUserIsSalesAgent = isSalesAgent(appData.profile.role);
  const owner = isOwnerish(appData.profile.role);
  const permissions = activePermissions(appData.profile.role, appData.permissions);
  const canViewLibraryStudents = !currentUserIsSalesAgent && (owner || permissions.includes("collect_library"));
  const canViewStudentRecords = canViewLibraryStudents || (!currentUserIsSalesAgent && permissions.includes("collect_course"));
  const visibleTabItems = currentUserIsSalesAgent
    ? tabItems.filter((item) => item.id === "home" || item.id === "payments")
    : tabItems.filter((item) => item.id !== "library_students" || canViewStudentRecords);
  const bottomTabItems = visibleTabItems.filter((item) => item.id === "home" || item.id === "payments" || item.id === "closing");

  const pushNotice = useCallback((notice: ActionResult | null) => {
    if (!notice?.message) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current.slice(-3), { ...notice, id }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, notice.ok ? 5200 : 7600);
  }, []);

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem("lenden-language");
    if (savedLanguage === "en" || savedLanguage === "hi") {
      queueMicrotask(() => setLanguageState(savedLanguage));
    }
  }, []);

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

    async function refreshCachedData(detail: MutationRefreshDetail) {
      setDocumentAppBusy(true);
      setActionBusyMessageKey(detail.refreshingMessageKey);

      try {
        const refreshes: Promise<unknown>[] = [];
        if (detail.scope === "dashboard" || detail.scope === "dashboard-library" || detail.scope === "bootstrap") {
          refreshes.push(
            queryClient.refetchQueries({
              queryKey: ["dashboard", dashboardParams],
              exact: true,
              type: "active",
            }),
          );
        }
        if (detail.scope === "bootstrap") {
          refreshes.push(
            queryClient.refetchQueries({
              queryKey: ["bootstrap"],
              exact: true,
              type: "active",
            }),
          );
        }
        if (detail.scope === "dashboard-library") {
          refreshes.push(queryClient.invalidateQueries({ queryKey: ["library-student-history"] }));
        }
        await Promise.all(refreshes);
      } finally {
        endBusy();
      }
    }

    function commitMutation(event: Event) {
      const detail = (event as CustomEvent<MutationRefreshDetail>).detail ?? {
        scope: "none",
        savingMessageKey: "savingChanges",
        refreshingMessageKey: "updatingAppData",
      };
      void refreshCachedData(detail);
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
  }, [dashboardParams, queryClient]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tab);
    params.set("range", dateRange.preset);
    params.set("txUser", transactionProfileId);
    params.set("txFilter", transactionFilter);
    params.delete("settlementFilter");

    if (dateRange.preset === "custom") {
      params.set("from", dateRange.from);
      params.set("to", dateRange.to);
    } else {
      params.delete("from");
      params.delete("to");
    }

    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [dateRange, tab, transactionFilter, transactionProfileId]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
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
            const source = current ?? appData.notifications;
            return [notification, ...source.filter((item) => item.id !== notification.id)];
          });
          pushNotice({ ok: true, message: `${notification.title}: ${notification.body}` });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [appData.notifications, appData.profile.id, pushNotice]);

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

  function toggleNotifications() {
    setNotificationsOpen((open) => {
      const nextOpen = !open;
      if (nextOpen && unreadNotifications > 0) {
        const readAt = new Date().toISOString();
        setNotificationOverrides((current) =>
          (current ?? appData.notifications).map((notification) =>
            notification.read_at ? notification : { ...notification, read_at: readAt },
          ),
        );
        startTransition(async () => {
          const result = await markNotificationsReadAction();
          if (!result.ok) pushNotice(result);
        });
      }
      return nextOpen;
    });
  }

  const agentReferralCodes = appData.referrals.filter(
    (referral) => referral.active && referral.agent_id === appData.profile.id,
  );
  const canViewSharedBusinessHistory =
    owner ||
    (Object.keys(businessPermissions) as BusinessType[]).some((type) =>
      permissions.includes(businessPermissions[type]),
    );
  const mainCourses = appData.courses.filter((course) => course.kind === "main" && course.active);
  const skillCourses = appData.courses.filter((course) => course.kind === "skill" && course.active);
  const activeRooms = appData.rooms.filter((room) => room.active);
  const salesAgents = appData.profiles.filter((profile) => profile.active && profile.role === "sales_agent");
  const staffProfiles = appData.profiles.filter(
    (profile) => profile.active && profile.role === "staff" && profile.id !== appData.profile.id,
  );
  const moneyMovementProfiles = appData.profiles.filter((item) => {
    if (currentUserIsSalesAgent || !item.active || item.id === appData.profile.id) return false;
    if (owner) return item.role === "staff" || item.role === "sales_agent";
    return isOwnerish(item.role);
  });
  const permissionsByProfile = useMemo(() => {
    return appData.profiles.reduce<Record<string, string[]>>((acc, profile) => {
      acc[profile.id] = appData.allPermissions
        .filter((permission) => permission.profile_id === profile.id)
        .map((permission) => permission.permission);
      return acc;
    }, {});
  }, [appData.allPermissions, appData.profiles]);

  const selectedDateRange = normalizeDateRange(dateRange);
  const selectedDateRangeLabel = formatDateRange(selectedDateRange, t);
  const closingDate = selectedDateRange.to;
  const appOwnerProfileIds = useMemo(() => ownerProfileIdSet(appData.profiles), [appData.profiles]);
  const filteredPayments = appData.payments.filter((payment) => dateInRange(payment.payment_date, selectedDateRange));
  const filteredExpenses = appData.expenses.filter((expense) => dateInRange(expense.expense_date, selectedDateRange));
  const transactionUserId = canViewSharedBusinessHistory ? transactionProfileId : appData.profile.id;
  const closingProfiles = appData.profiles.filter((profile) => profile.active);
  const closingSummaries = useMemo(
    () => {
      if (appData.closingSummaries.length > 0) {
        return appData.closingSummaries
          .map((summary) => {
            const profile = appData.profiles.find((item) => item.id === summary.profile_id);
            if (!profile) return null;
            const dayEntries = appData.ledger.filter(
              (entry) => entry.account_profile_id === summary.profile_id && entry.entry_date === closingDate,
            );

            return summaryWithOwnerCashInAsCollection({
              profile,
              opening: numberValue(summary.opening),
              collected: numberValue(summary.collected),
              expenses: numberValue(summary.expenses),
              received: numberValue(summary.received),
              sent: numberValue(summary.sent),
              adjustments: numberValue(summary.adjustments),
              closing: numberValue(summary.closing),
              dayEntries,
            }, appData.movements, appData.profiles, closingDate);
          })
          .filter((summary): summary is UserClosingSummary => Boolean(summary));
      }

      return closingProfiles.map((profile) =>
        summaryWithOwnerCashInAsCollection(
          buildClosingSummary(profile, appData.ledger, closingDate),
          appData.movements,
          appData.profiles,
          closingDate,
        ),
      );
    },
    [appData.closingSummaries, appData.ledger, appData.movements, appData.profiles, closingDate, closingProfiles],
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

  const totals = useMemo(() => {
    const activePayments = filteredPayments.filter(
      (payment) => payment.record_status === "active" && isEffectivelyApprovedPayment(payment, appOwnerProfileIds),
    );
    const activeExpenses = filteredExpenses.filter(
      (expense) => expense.record_status === "active" && isEffectivelyApprovedExpense(expense, appOwnerProfileIds),
    );
    return {
      total: activePayments.reduce((sum, payment) => sum + numberValue(payment.amount), 0),
      cash: activePayments
        .reduce((sum, payment) => sum + paymentCashAmount(payment), 0),
      online: activePayments
        .reduce((sum, payment) => sum + paymentOnlineAmount(payment), 0),
      expense: activeExpenses.reduce((sum, expense) => sum + numberValue(expense.amount), 0),
      byBusiness: Object.fromEntries(
        Object.keys(businessLabels).map((business) => [
          business,
          activePayments
            .filter((payment) => payment.business_type === business)
            .reduce((sum, payment) => sum + numberValue(payment.amount), 0),
        ]),
      ) as Record<BusinessType, number>,
      expenseByBusiness: Object.fromEntries(
        Object.keys(businessLabels).map((business) => [
          business,
          activeExpenses
            .filter((expense) => (expense.business_type ?? "general") === business)
            .reduce((sum, expense) => sum + numberValue(expense.amount), 0),
        ]),
      ) as Record<BusinessType, number>,
    };
  }, [appOwnerProfileIds, filteredExpenses, filteredPayments]);

  const cashBalances = useMemo(() => {
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
  }, [appData.ledger, appData.profiles, closingSummaries]);

  function canUsePayment(type: BusinessType | "expense") {
    if (currentUserIsSalesAgent) return false;
    if (type === "expense") return permissions.includes("add_expense");
    return permissions.includes(businessPermissions[type]);
  }

  function changeTab(nextTab: Tab) {
    if (currentUserIsSalesAgent && (nextTab === "closing" || nextTab === "settings" || nextTab === "library_students")) {
      setTab("home");
    } else if (nextTab === "library_students" && !canViewStudentRecords) {
      setTab("home");
    } else {
      setTab(nextTab);
    }
    setSidebarOpen(false);
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

  const activeDateRangeOptions = dateRangeOptions;
  const showSharedDateRange = tab === "home" || tab === "payments";
  const showQuickActions = tab === "home" && !currentUserIsSalesAgent;
  const showPageHeadingRow = tab !== "library_students";
  const busyMessage = actionBusyMessageKey ? t(actionBusyMessageKey) : pending ? t("saving") : null;

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
    <div
      className="app-root bg-surface text-on-surface antialiased min-h-screen flex flex-col selection:bg-primary-container selection:text-on-primary-container pb-24 md:pb-0"
      onWheelCapture={disableNumberInputWheelChange}
    >
      <header className="app-header bg-surface dark:bg-surface flex justify-between items-center px-4 py-3 w-full sticky top-0 z-40 transition-shadow border-b border-outline-variant/10 shadow-xs" id="main-header">
        <div className="app-header-brand flex items-center gap-3">
          <button type="button" aria-label="Open Menu" className="mobile-menu-button header-icon-button text-primary dark:text-inverse-primary hover:bg-surface-container-low dark:hover:bg-surface-container-highest transition-colors rounded-full p-2 scale-95 duration-100 ease-in-out md:hidden cursor-pointer" onClick={() => setSidebarOpen(true)}>
            <Menu size={22} />
          </button>
          <img className="app-logo-image" src="/icon-192.png" alt="Lenden logo" />
          <span className="app-brand-title font-headline text-xl font-bold text-primary dark:text-inverse-primary">Lenden</span>
        </div>
        <div className="app-header-title font-headline text-headline-sm font-semibold tracking-tight text-primary dark:text-inverse-primary hidden md:block">
          {t(visibleTabItems.find((item) => item.id === tab)?.labelKey ?? "dashboard")}
        </div>
        <div className="app-header-actions flex items-center gap-3">
          <button
            type="button"
            className="header-icon-button notification-trigger text-on-surface-variant hover:bg-surface-container-low transition-colors rounded-full p-2 relative cursor-pointer"
            onClick={toggleNotifications}
            aria-label={t("notifications")}
          >
            {unreadNotifications > 0 ? <BellRing size={22} /> : <Bell size={22} />}
            {unreadNotifications > 0 ? (
              <span className="absolute top-2 right-2.5 w-2 h-2 bg-error rounded-full border-2 border-surface"></span>
            ) : null}
          </button>
          <button type="button" className="profile-avatar-button rounded-full overflow-hidden w-9 h-9 border border-outline-variant/30 shadow-soft focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface">
            <img alt="Profile picture of user" className="w-full h-full object-cover" src={getProfileImage(appData.profile.full_name, appData.profile.avatar_url)}/>
          </button>
        </div>
      </header>

      <div className="app-shell-body flex flex-1 overflow-hidden relative w-full max-w-7xl mx-auto">
        {sidebarOpen && (
          <button
            className="app-sidebar-scrim fixed inset-0 z-45 bg-black/40 backdrop-blur-xs md:hidden border-0 cursor-pointer"
            aria-label={t("closeNavigation")}
            type="button"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside className={`app-sidebar fixed inset-y-0 left-0 z-50 flex flex-col bg-surface-container-low dark:bg-surface-container-lowest h-full w-80 shadow-2xl py-6 overflow-y-auto transition-transform duration-300 md:sticky md:top-[64px] md:h-[calc(100vh-64px)] md:shadow-xl md:rounded-r-xl ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:flex'}`}>
          <div className="app-sidebar-profile px-6 mb-8 flex items-center gap-4">
            <img alt="User profile" className="w-12 h-12 rounded-full object-cover shadow-sm" src={getProfileImage(appData.profile.full_name, appData.profile.avatar_url)}/>
            <div>
              <h2 className="font-headline text-lg font-bold text-primary">{appData.profile.full_name}</h2>
              <p className="font-body text-body-md text-on-surface-variant">{t(roleLabelKeys[appData.profile.role] ?? appData.profile.role)}</p>
            </div>
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
          <div className="px-4 mt-auto">
            <form action={logoutAction}>
              <button className="app-logout-button flex items-center gap-3 px-4 py-3 text-error m-2 p-2 rounded-lg hover:bg-error-container/50 transition-all duration-200 w-full text-left cursor-pointer border-0" type="submit">
                <LogOut size={20} />
                <span className="font-body text-body-md">{t("logout")}</span>
              </button>
            </form>
          </div>
        </aside>

        <main
          className="app-main flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8 w-full"
          onInvalidCapture={handleInvalid}
        >
          <div className="app-main-inner max-w-4xl mx-auto space-y-8">
            {showPageHeadingRow ? (
              <div className="page-heading-row flex justify-between items-center">
                <div className="flex items-center gap-3 md:hidden">
                  <h1 className="mobile-page-title font-headline text-2xl font-bold text-on-surface">
                    {t(visibleTabItems.find((item) => item.id === tab)?.labelKey ?? "dashboard")}
                  </h1>
                </div>

                <div className="page-controls controls-row flex items-center gap-2 ml-auto">
                  {tab === "closing" ? (
                    <div className="app-date-filter date-filter date-range-filter flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-lg border border-outline-variant/30">
                      <CalendarDays size={19} />
                      <input
                        aria-label={t("settlementDate")}
                        type="date"
                        className="bg-transparent border-0 p-0 text-sm outline-hidden cursor-pointer"
                        value={closingDate}
                        onChange={(event) => {
                          const nextDate = event.target.value || todayIso();
                          setDateRange({ preset: "custom", from: nextDate, to: nextDate });
                        }}
                      />
                    </div>
                  ) : showSharedDateRange ? (
                    <div className="app-date-filter date-filter date-range-filter flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-lg border border-outline-variant/30">
                      <CalendarDays size={19} />
                      <select
                        aria-label={t("dateRange")}
                        className="bg-transparent border-0 p-0 text-sm outline-hidden cursor-pointer"
                        value={dateRange.preset}
                        onChange={(event) => setDateRange((current) => rangeForPreset(event.target.value as DateRangePreset, current))}
                      >
                        {activeDateRangeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {t(option.labelKey)}
                          </option>
                        ))}
                      </select>
                      {dateRange.preset === "custom" ? (
                        <div className="custom-date-inputs flex items-center gap-2 border-l border-outline-variant/30 pl-2 ml-2">
                          <input
                            aria-label={t("startDate")}
                            type="date"
                            className="bg-transparent border-0 p-0 text-sm outline-hidden cursor-pointer"
                            value={dateRange.from}
                            onChange={(event) => setDateRange((current) => ({ ...current, preset: "custom", from: event.target.value }))}
                          />
                          <span className="text-xs text-on-surface-variant font-bold">{t("rangeTo")}</span>
                          <input
                            aria-label={t("endDate")}
                            type="date"
                            className="bg-transparent border-0 p-0 text-sm outline-hidden cursor-pointer"
                            value={dateRange.to}
                            onChange={(event) => setDateRange((current) => ({ ...current, preset: "custom", to: event.target.value }))}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {showQuickActions ? (
              <BottomActions
                canAddPositive={(Object.keys(businessPermissions) as BusinessType[]).some((type) => canUsePayment(type)) || moneyMovementProfiles.length > 0}
                canAddNegative={canUsePayment("expense") || moneyMovementProfiles.length > 0 || (owner && staffProfiles.length > 0)}
                onPositive={() => openAction("positive")}
                onNegative={() => openAction("negative")}
              />
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
            {notificationsOpen ? (
              <NotificationSheet
                notifications={notifications}
                profiles={appData.profiles}
                close={() => setNotificationsOpen(false)}
              />
            ) : null}

            {tab === "home" ? (
              <HomeView
                totals={totals}
                cashBalances={cashBalances}
                owner={owner}
                data={appData}
                dateRange={selectedDateRange}
                dateRangePreset={dateRange.preset}
                dateLabel={selectedDateRangeLabel}
                agentIncentiveSummary={agentIncentiveSummary}
                agentReferralCodes={agentReferralCodes}
                changeTab={changeTab}
                setNotice={pushNotice}
                startTransition={startTransition}
              />
            ) : null}

            {tab === "payments" ? (
              <TransactionsView
                dateLabel={selectedDateRangeLabel}
                dateRange={selectedDateRange}
                dateRangePreset={dateRange.preset}
                transactionFilter={transactionFilter}
                setTransactionFilter={setTransactionFilter}
                transactionProfileId={transactionUserId}
                setTransactionProfileId={setTransactionProfileId}
                payments={appData.payments}
                expenses={appData.expenses}
                movements={appData.movements}
                ledger={appData.ledger}
                agentSettlements={appData.agentSettlements}
                profiles={appData.profiles}
                profile={appData.profile}
                owner={owner}
                sharedBusinessHistory={canViewSharedBusinessHistory}
                agentIncentiveSummary={agentIncentiveSummary}
                agentReferralCodes={agentReferralCodes}
                permissionsByProfile={permissionsByProfile}
                setNotice={pushNotice}
                startTransition={startTransition}
              />
            ) : null}

            {tab === "library_students" && canViewStudentRecords ? (
              <LibraryStudentsView
                students={appData.libraryStudents}
                payments={appData.studentPayments ?? appData.payments}
                courses={appData.courses}
                includeLibrary={canViewLibraryStudents}
                setNotice={pushNotice}
                startTransition={startTransition}
              />
            ) : null}

            {tab === "closing" ? (
              <ClosingView
                date={closingDate}
                owner={owner}
                profile={appData.profile}
                summaries={closingSummaries}
                payments={appData.payments}
                expenses={appData.expenses}
                movements={appData.movements}
                profiles={appData.profiles}
                setNotice={pushNotice}
                startTransition={startTransition}
              />
            ) : null}

            {tab === "settings" ? (
              <SettingsView
                owner={owner}
                profile={appData.profile}
                profiles={appData.profiles}
                rooms={appData.rooms}
                courses={appData.courses}
                referrals={appData.referrals}
                salesAgents={salesAgents}
                changeRequests={appData.changeRequests}
                permissionsByProfile={permissionsByProfile}
                                setNotice={pushNotice}
                startTransition={startTransition}
              />
            ) : null}
          </div>
        </main>
      </div>

      <nav
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
      </nav>

      {actionModal && !currentUserIsSalesAgent ? (
        <ActionSheet
          actionModal={actionModal}
          selectedPositive={selectedPositive}
          selectedNegative={selectedNegative}
          setSelectedPositive={setSelectedPositive}
          setSelectedNegative={setSelectedNegative}
          canUsePayment={canUsePayment}
          owner={owner}
          rooms={activeRooms}
          mainCourses={mainCourses}
          skillCourses={skillCourses}
          referrals={appData.referrals}
          payments={appData.studentPayments ?? appData.payments}
          libraryStudents={appData.libraryStudents}
          moneyMovementProfiles={moneyMovementProfiles}
          settlementDate={closingDate}
          agentIncentiveBalances={agentIncentiveBalances}
          closeAction={closeAction}
          setNotice={pushNotice}
          startTransition={startTransition}
        />
      ) : null}

    </div>
    </LanguageContext.Provider>
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
        <div className={toast.ok ? "toast toast-success" : "toast toast-error"} key={toast.id}>
          <span className="toast-icon">
            {toast.ok ? <Check size={18} /> : <AlertCircle size={18} />}
          </span>
          <strong>{toast.message}</strong>
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
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function NotificationSheet({
  notifications,
  profiles,
  close,
}: {
  notifications: AppNotification[];
  profiles: Profile[];
  close: () => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="notification-layer">
      <button className="notification-scrim" type="button" aria-label={t("closeModal")} onClick={close} />
      <aside className="notification-sheet" aria-label={t("notifications")}>
        <header>
          <div>
            <p className="eyebrow">{t("unreadNotifications")}</p>
            <h2>{t("notifications")}</h2>
          </div>
          <button className="icon-button" type="button" aria-label={t("closeModal")} onClick={close}>
            <X size={18} />
          </button>
        </header>
        <div className="notification-list">
          {notifications.length > 0 ? (
            notifications.map((notification) => (
              <article className={`notification-item tone-${notification.tone}`} key={notification.id}>
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
            <p className="muted">{t("noNotifications")}</p>
          )}
        </div>
      </aside>
    </div>
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
  close,
  setNotice,
  startTransition,
}: {
  records: PendingReviewRecord[];
  contextRecords: PendingContextRecord[];
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
                      <MiniAction
                        hidden={{ record_type: record.recordType, id: record.id, decision: "rejected" }}
                        label={t("reject")}
                        tone="reject"
                        icon={<X size={18} />}
                        action={approveRecordAction}
                        setNotice={setNotice}
                        startTransition={startTransition}
                      />
                    ) : null}
                    {record.hasPendingTransfer ? (
                      <button className="mini-action icon-mini-action tone-approve" type="button" disabled title={t("resolveTransferFirst")} aria-label={t("resolveTransferFirst")}>
                        <Check size={18} />
                      </button>
                    ) : (
                      <MiniAction
                        hidden={{ record_type: record.recordType, id: record.id, decision: "approved" }}
                        label={t("approve")}
                        tone="approve"
                        icon={<Check size={18} />}
                        action={approveRecordAction}
                        setNotice={setNotice}
                        startTransition={startTransition}
                      />
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

function HomeView({
  totals,
  cashBalances,
  owner,
  data,
  dateRange,
  dateRangePreset,
  dateLabel,
  agentIncentiveSummary,
  agentReferralCodes,
  changeTab,
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
  dateRange: NormalizedDateRange;
  dateRangePreset: DateRangePreset;
  dateLabel: string;
  agentIncentiveSummary: AgentIncentiveSummary;
  agentReferralCodes: ReferralCode[];
  changeTab: (tab: AppTab) => void;
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const { t } = useLanguage();
  const [pendingReviewOpen, setPendingReviewOpen] = useState(false);

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

  if (!owner) {
    const profileId = data.profile.id;
    const pendingInScope = (isoDate: string) => pendingRecordInScope(isoDate, dateRange, dateRangePreset);
    const myLedgerBalance = cashBalances.find((cb) => cb.profile.id === data.profile.id)?.balance ?? 0;
    const myPendingPayments = data.payments.filter(
      (payment) =>
        payment.record_status === "active" &&
        isPendingReviewStatus(payment.approval_status) &&
        pendingInScope(payment.payment_date) &&
        paymentReviewProfileId(payment) === profileId,
    );
    const myPendingExpenses = data.expenses.filter(
      (expense) =>
        expense.record_status === "active" &&
        isPendingReviewStatus(expense.approval_status) &&
        pendingInScope(expense.expense_date) &&
        expense.spent_by === profileId,
    );
    const myPendingSettlementMovements = data.movements.filter(
      (movement) =>
        movement.status === "pending" &&
        movement.type === "settlement" &&
        pendingInScope(movement.created_at) &&
        (movement.from_profile_id === profileId || movement.to_profile_id === profileId),
    );
    const myPendingCash = myPendingPayments.reduce((sum, payment) => sum + paymentCashAmount(payment), 0);
    const myBalance = myLedgerBalance + myPendingCash;
    const myPayments = data.payments.filter(
      (payment) =>
        payment.record_status === "active" &&
        dateInRange(payment.payment_date, dateRange) &&
        (payment.collected_by === profileId || payment.current_holder_id === profileId),
    );
    const myApprovedPayments = myPayments.filter((payment) => payment.approval_status === "approved");
    const myExpenses = data.expenses.filter(
      (expense) =>
        expense.record_status === "active" &&
        dateInRange(expense.expense_date, dateRange) &&
        expense.spent_by === profileId,
    );
    const myApprovedExpenses = myExpenses.filter((expense) => expense.approval_status === "approved");
    const mySettlementMovements = data.movements.filter(
      (movement) =>
        movement.status === "accepted" &&
        movement.type === "settlement" &&
        !movement.payment_id &&
        dateInRange(movement.responded_at ?? movement.created_at, dateRange) &&
        (movement.from_profile_id === profileId || movement.to_profile_id === profileId),
    );
    const myOwnerCashIn = ownerCashTransferInAmount(data.movements, data.profiles, profileId, dateRange);
    const myCollectionCash = myApprovedPayments.reduce((sum, payment) => sum + paymentCashAmount(payment), 0) + myOwnerCashIn;
    const myCollectionOnline = myApprovedPayments.reduce((sum, payment) => sum + paymentOnlineAmount(payment), 0);
    const myExpenseAmount = myApprovedExpenses.reduce((sum, expense) => sum + numberValue(expense.amount), 0);
    const mySettlementOut = mySettlementMovements
      .filter((movement) => movement.from_profile_id === profileId)
      .reduce((sum, movement) => sum + numberValue(movement.amount), 0);
    const mySettlementIn = mySettlementMovements
      .filter((movement) => movement.to_profile_id === profileId)
      .reduce((sum, movement) => sum + numberValue(movement.amount), 0);
    const myInCash = myCollectionCash + mySettlementIn;
    const myInOnline = myCollectionOnline;
    const myInAmount = myInCash + myInOnline;
    const myOutCash = myExpenseAmount + mySettlementOut;
    const myPendingAmount =
      myPendingPayments.reduce((sum, payment) => sum + numberValue(payment.amount), 0) +
      myPendingExpenses.reduce((sum, expense) => sum + numberValue(expense.amount), 0) +
      myPendingSettlementMovements.reduce((sum, movement) => sum + numberValue(movement.amount), 0);
    const myPendingCount = myPendingPayments.length + myPendingExpenses.length + myPendingSettlementMovements.length;
    const myBusinessStatus = (Object.keys(businessLabels) as BusinessType[]).map((business): BusinessDashboardStatus => {
      const businessPayments = myApprovedPayments.filter((payment) => payment.business_type === business);
      const businessExpenses = myApprovedExpenses.filter((expense) => (expense.business_type ?? "general") === business);
      const pendingBusinessPayments = myPendingPayments.filter((payment) => payment.business_type === business);
      const pendingBusinessExpenses = myPendingExpenses.filter((expense) => (expense.business_type ?? "general") === business);
      const cashCollection = businessPayments.reduce((sum, payment) => sum + paymentCashAmount(payment), 0);
      const onlineCollection = businessPayments.reduce((sum, payment) => sum + paymentOnlineAmount(payment), 0);
      const expenses = businessExpenses.reduce((sum, expense) => sum + numberValue(expense.amount), 0);
      const pendingAmount =
        pendingBusinessPayments.reduce((sum, payment) => sum + numberValue(payment.amount), 0) +
        pendingBusinessExpenses.reduce((sum, expense) => sum + numberValue(expense.amount), 0);

      return {
        business,
        collection: businessPayments.reduce((sum, payment) => sum + numberValue(payment.amount), 0),
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
              <p className="dashboard-card-value font-headline text-3xl font-bold text-on-error-container">{formatMoney(myOutCash)}</p>
              <p className="dashboard-card-note text-xs text-error font-medium mt-1">{t("cash")} {formatMoney(myOutCash)}</p>
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
                        {isPayment ? t("collected") : t("spent")} · {item.created_at.slice(0, 10)}
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
  const activePayments = data.payments.filter((payment) => payment.record_status === "active");
  const activeExpenses = data.expenses.filter((expense) => expense.record_status === "active");
  const approvedPayments = activePayments.filter(
    (payment) => isEffectivelyApprovedPayment(payment, ownerProfileIds) && dateInRange(payment.payment_date, dateRange),
  );
  const approvedExpenses = activeExpenses.filter(
    (expense) => isEffectivelyApprovedExpense(expense, ownerProfileIds) && dateInRange(expense.expense_date, dateRange),
  );
  const pendingPayments = activePayments.filter(
    (payment) => isEffectivelyPendingPayment(payment, ownerProfileIds) && pendingInScope(payment.payment_date),
  );
  const pendingExpenses = activeExpenses.filter(
    (expense) => isEffectivelyPendingExpense(expense, ownerProfileIds) && pendingInScope(expense.expense_date),
  );
  const ownerCashMovements = data.movements.filter(
    (movement) =>
      movement.status === "accepted" &&
      !movement.payment_id &&
      dateInRange(movement.responded_at ?? movement.created_at, dateRange),
  );
  const ownerMovementIn = ownerCashMovements
    .filter((movement) => !ownerProfileIds.has(movement.from_profile_id) && ownerProfileIds.has(movement.to_profile_id ?? ""))
    .reduce((sum, movement) => sum + numberValue(movement.amount), 0);
  const ownerMovementOut = ownerCashMovements
    .filter((movement) => ownerProfileIds.has(movement.from_profile_id) && !ownerProfileIds.has(movement.to_profile_id ?? ""))
    .reduce((sum, movement) => sum + numberValue(movement.amount), 0);
  const ownerAgentPayoutOut = data.agentSettlements
    .filter((settlement) => settlement.status === "accepted" && dateInRange(settlement.responded_at ?? settlement.created_at, dateRange))
    .reduce((sum, settlement) => sum + numberValue(settlement.amount), 0);
  const ownerInCash = totals.cash + ownerMovementIn;
  const ownerInOnline = totals.online;
  const ownerInAmount = ownerInCash + ownerInOnline;
  const ownerOutCash = totals.expense + ownerMovementOut + ownerAgentPayoutOut;
  const pendingSettlementMovements = data.movements.filter(
    (movement) => movement.status === "pending" && movement.type === "settlement" && pendingInScope(movement.created_at),
  );
  const pendingAgentSettlements = data.agentSettlements.filter(
    (settlement) => settlement.status === "pending" && pendingInScope(settlement.created_at),
  );
  const pendingReviewRecords: PendingReviewRecord[] = [
    ...pendingPayments.map((payment): PendingReviewRecord => ({
      id: payment.id,
      recordType: "payment",
      transactionType: t("payments"),
      staffName: profileName(data.profiles, paymentReviewProfileId(payment), t),
      serviceType: labelForBusiness(payment.business_type, t),
      amount: numberValue(payment.amount),
      cashAmount: paymentCashAmount(payment),
      onlineAmount: paymentOnlineAmount(payment),
      date: payment.payment_date,
      note: paymentReference(payment, t),
      status: payment.approval_status,
      statusLabel: labelForStatus(payment.approval_status, t),
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
    ...pendingSettlementMovements.map((movement): PendingContextRecord => {
      const toOwner = ownerProfileIds.has(movement.to_profile_id ?? "");
      const staffId = toOwner ? movement.from_profile_id : movement.to_profile_id;
      return {
        id: `movement-${movement.id}`,
        transactionType: t("settlements"),
        staffName: profileName(data.profiles, staffId, t),
        serviceType: t("settlementActivity"),
        amount: toOwner ? numberValue(movement.amount) : -numberValue(movement.amount),
        date: movement.created_at.slice(0, 10),
        note: movement.note ?? t("noReason"),
        statusLabel: labelForStatus(movement.status, t),
        tone: toOwner ? "positive" : "negative",
        icon: <ShieldCheck size={22} />,
      };
    }),
    ...pendingAgentSettlements.map((settlement): PendingContextRecord => ({
      id: `agent-${settlement.id}`,
      transactionType: t("pendingIncentive"),
      staffName: profileName(data.profiles, settlement.agent_id, t),
      serviceType: t("agentPayoutLower"),
      amount: -numberValue(settlement.amount),
      date: settlement.created_at.slice(0, 10),
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
  const businessStatus = (Object.keys(businessLabels) as BusinessType[]).map((business): BusinessDashboardStatus => {
    const businessPayments = approvedPayments.filter((payment) => payment.business_type === business);
    const businessExpenses = approvedExpenses.filter((expense) => (expense.business_type ?? "general") === business);
    const pendingBusinessPayments = pendingPayments.filter((payment) => payment.business_type === business);
    const pendingBusinessExpenses = pendingExpenses.filter((expense) => (expense.business_type ?? "general") === business);
    const cashCollection = businessPayments.reduce((sum, payment) => sum + paymentCashAmount(payment), 0);
    const onlineCollection = businessPayments.reduce((sum, payment) => sum + paymentOnlineAmount(payment), 0);
    const expenses = businessExpenses.reduce((sum, expense) => sum + numberValue(expense.amount), 0);
    const pendingBusinessAmount =
      pendingBusinessPayments.reduce((sum, payment) => sum + numberValue(payment.amount), 0) +
      pendingBusinessExpenses.reduce((sum, expense) => sum + numberValue(expense.amount), 0);

    return {
      business,
      collection: businessPayments.reduce((sum, payment) => sum + numberValue(payment.amount), 0),
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
            <p className="dashboard-card-value font-headline text-3xl font-bold text-on-error-container">{formatMoney(ownerOutCash)}</p>
            <p className="dashboard-card-note text-xs text-error font-medium mt-1">{t("cash")} {formatMoney(ownerOutCash)}</p>
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
    </div>
  );
}

function TransactionsView({
  dateLabel,
  dateRange,
  dateRangePreset,
  transactionFilter,
  setTransactionFilter,
  transactionProfileId,
  setTransactionProfileId,
  payments,
  expenses,
  movements,
  ledger,
  agentSettlements,
  profiles,
  profile,
  owner,
  sharedBusinessHistory,
  agentIncentiveSummary,
  agentReferralCodes,
  permissionsByProfile,
  setNotice,
  startTransition,
}: {
  dateLabel: string;
  dateRange: NormalizedDateRange;
  dateRangePreset: DateRangePreset;
  transactionFilter: TransactionFilter;
  setTransactionFilter: (filter: TransactionFilter) => void;
  transactionProfileId: string;
  setTransactionProfileId: (id: string) => void;
  payments: Payment[];
  expenses: Expense[];
  movements: MoneyMovement[];
  ledger: LedgerEntry[];
  agentSettlements: AgentSettlement[];
  profiles: Profile[];
  profile: Profile;
  owner: boolean;
  sharedBusinessHistory: boolean;
  agentIncentiveSummary: AgentIncentiveSummary;
  agentReferralCodes: ReferralCode[];
  permissionsByProfile: Record<string, string[]>;
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const { t } = useLanguage();
  const [transactionAction, setTransactionAction] = useState<{
    kind: TransactionActionKind;
    recordKey: string;
  } | null>(null);
  const currentUserIsSalesAgent = isSalesAgent(profile.role);
  const canUseProfileFilter = !currentUserIsSalesAgent && (owner || sharedBusinessHistory);
  const effectiveTransactionFilter = owner && transactionFilter === "pending" ? "transactions" : transactionFilter;
  const selectableProfiles = useMemo(() => {
    if (owner) return profiles.filter((item) => item.active);

    const visibleProfileIds = new Set<string>([profile.id]);
    payments.forEach((payment) => {
      visibleProfileIds.add(payment.collected_by);
      if (payment.current_holder_id) visibleProfileIds.add(payment.current_holder_id);
    });
    expenses.forEach((expense) => visibleProfileIds.add(expense.spent_by));
    if (transactionProfileId !== "all") visibleProfileIds.add(transactionProfileId);

    return profiles.filter((item) => item.active && visibleProfileIds.has(item.id));
  }, [expenses, owner, payments, profile.id, profiles, transactionProfileId]);
  const allTransactionRecords = useMemo(() => {
    type HistoryRecordFilter = Exclude<TransactionFilter, "all" | "pending">;
    type HistoryRecord = {
      id: string;
      kind: "collection" | "expense" | "settlement" | "agent_payout";
      filter: HistoryRecordFilter;
      date: string;
      sortAt: string;
      amount: number;
      cashAmount: number;
      onlineAmount: number;
      amountTone?: "positive" | "negative" | "neutral" | "online-approved";
      onlineTone?: "neutral" | "online-approved";
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
      icon: ReactNode;
      recordType?: "payment" | "expense";
      editDate?: string;
      editAmount?: number;
      canEdit?: boolean;
      canDelete?: boolean;
      transferLines?: string[];
      transferRecipients?: Profile[];
      canRequestTransfer?: boolean;
      incomingTransferId?: string | null;
      pendingApproval?: boolean;
      canApprove?: boolean;
      approvalBlockedByTransfer?: boolean;
    };
    const selectedUserId = canUseProfileFilter ? transactionProfileId : profile.id;
    const userMatches = (userId: string | null | undefined) => selectedUserId === "all" || userId === selectedUserId;
    const movementEntry = (movement: MoneyMovement, amount: number, accountId?: string | null) =>
      ledger.find((entry) => {
        if (entry.source_id !== movement.id || entry.source_type !== movement.type) return false;
        if (accountId && entry.account_profile_id !== accountId) return false;
        return amount >= 0 ? numberValue(entry.amount) > 0 : numberValue(entry.amount) < 0;
      });
    const collectionStatus = (payment: Payment) => {
      if (payment.approval_status !== "approved") return labelForStatus(payment.approval_status, t);
      const onlineOnly = paymentOnlineAmount(payment) > 0 && paymentCashAmount(payment) === 0;
      if (onlineOnly && !canUseProfileFilter && payment.collected_by === profile.id) return t("neutralized");
      return labelForStatus(payment.approval_status, t);
    };
    const collectionStatusTone = (payment: Payment) =>
      payment.approval_status === "approved" && paymentOnlineAmount(payment) > 0 && paymentCashAmount(payment) === 0
        ? "approved"
        : payment.approval_status;
    const ownerProfileIds = ownerProfileIdSet(profiles);
    const isOwnerProfile = (profileId: string | null | undefined) => Boolean(profileId && ownerProfileIds.has(profileId));
    const paymentMatchesSelectedProfile = (payment: Payment, linkedTransfers: MoneyMovement[]) => (
      userMatches(payment.collected_by) ||
      userMatches(payment.current_holder_id) ||
      linkedTransfers.some((movement) => userMatches(movement.from_profile_id) || userMatches(movement.to_profile_id))
    );

    const historyDateInScope = (isoDate: string, pendingApproval: boolean) =>
      pendingApproval ? pendingRecordInScope(isoDate, dateRange, dateRangePreset) : dateInRange(isoDate, dateRange);

    const paymentRows = currentUserIsSalesAgent ? [] : payments
      .filter((payment) => historyDateInScope(payment.payment_date, isEffectivelyPendingPayment(payment, ownerProfileIds)))
      .filter((payment) => payment.record_status === "active")
      .flatMap((payment): HistoryRecord[] => {
        const linkedTransfers = paymentTransfers(movements, payment.id);
        if (!paymentMatchesSelectedProfile(payment, linkedTransfers)) return [];

        const cashImpact = paymentCashAmount(payment);
        const onlineImpact = paymentOnlineAmount(payment);
        const onlineOnly = onlineImpact > 0 && cashImpact === 0;
        const ownerAuthoredPayment = isOwnerProfile(payment.collected_by);
        const effectivePaymentApproved = isEffectivelyApprovedPayment(payment, ownerProfileIds);
        const effectivePaymentPending = isEffectivelyPendingPayment(payment, ownerProfileIds);
        const onlineApproved = effectivePaymentApproved;
        const paymentStatus = ownerAuthoredPayment ? t("receivedStatus") : collectionStatus(payment);
        const paymentStatusTone = ownerAuthoredPayment ? "approved" : collectionStatusTone(payment);
        const reviewProfileId = paymentReviewProfileId(payment);
        const pendingTransfer = linkedTransfers.find((movement) => movement.status === "pending") ?? null;
        const activeTransfer = linkedTransfers.some((movement) => movement.status === "pending" || movement.status === "accepted");
        const transferOut = !owner && linkedTransfers.some(
          (movement) =>
            (movement.status === "accepted" || movement.status === "pending") &&
            movement.from_profile_id === profile.id,
        );
        const transferIn = !owner && linkedTransfers.some(
          (movement) =>
            (movement.status === "accepted" || movement.status === "pending") &&
            movement.to_profile_id === profile.id,
        );
        const requiredPermission = businessPermissions[payment.business_type];
        const transferRecipients = cashImpact > 0 && requiredPermission
          ? profiles.filter((item) =>
              item.active &&
              item.id !== (payment.current_holder_id ?? payment.collected_by) &&
              item.role === "staff" &&
              (permissionsByProfile[item.id] ?? []).includes(requiredPermission),
            )
          : [];
        const canRequestTransfer =
          (owner || payment.current_holder_id === profile.id) &&
          effectivePaymentPending &&
          cashImpact > 0 &&
          !pendingTransfer &&
          transferRecipients.length > 0;
        const incomingTransferId = pendingTransfer?.to_profile_id === profile.id ? pendingTransfer.id : null;
        const baseRecord = {
          id: payment.id,
          date: payment.payment_date,
          sortAt: payment.created_at,
          title: paymentDisplayTitle(payment, t),
          status: paymentStatus,
          statusTone: paymentStatusTone,
          modeLabel: paymentModeLabel(payment, t),
          recordStatus: payment.record_status,
          ownerId: payment.collected_by,
          description: payment.description ?? "",
          remark: payment.remark ?? "",
          reason: payment.cancel_reason,
          recordType: "payment" as const,
          editDate: payment.payment_date,
          editAmount: numberValue(payment.amount),
          canEdit: (owner || payment.collected_by === profile.id) && effectivePaymentPending && !activeTransfer,
          canDelete: owner && !effectivePaymentApproved,
          transferLines: transferSummaryLines(linkedTransfers, profiles, t),
          transferRecipients,
          canRequestTransfer,
          incomingTransferId,
          pendingApproval: effectivePaymentPending || Boolean(pendingTransfer),
          canApprove: owner && effectivePaymentPending && !pendingTransfer,
          approvalBlockedByTransfer: owner && effectivePaymentPending && Boolean(pendingTransfer),
          icon: payment.business_type === "guest_house"
            ? <Hotel size={24} />
            : payment.business_type === "library"
              ? <BookOpen size={24} />
              : payment.business_type === "course"
                ? <GraduationCap size={24} />
                : <WalletCards size={24} />,
        };

        if (owner) {
          const collectedByOwner = isOwnerProfile(payment.collected_by);
          const currentHolderIsOwner = isOwnerProfile(payment.current_holder_id);
          const rows: HistoryRecord[] = [];

          rows.push({
            ...baseRecord,
            kind: "collection",
            filter: "transactions",
            amount: numberValue(payment.amount),
            cashAmount: cashImpact,
            onlineAmount: onlineImpact,
            amountTone: "neutral",
            onlineTone: onlineApproved ? "online-approved" : "neutral",
            meta: `${profileName(profiles, reviewProfileId, t)} · ${labelForBusiness(payment.business_type, t)}`,
          });

          if (effectivePaymentApproved) {
            const ownerCashAmount = collectedByOwner || currentHolderIsOwner ? cashImpact : 0;
            const ownerOnlineAmount = onlineImpact;
            const ownerFinancialAmount = ownerCashAmount + ownerOnlineAmount;
            if (ownerFinancialAmount > 0) {
              rows.push({
                ...baseRecord,
                kind: "collection",
                filter: "cash_in",
                amount: ownerFinancialAmount,
                cashAmount: ownerCashAmount,
                onlineAmount: ownerOnlineAmount,
                amountTone: ownerOnlineAmount > 0 && ownerCashAmount === 0 ? "online-approved" : "positive",
                onlineTone: ownerOnlineAmount > 0 ? "online-approved" : "neutral",
                meta: `${profileName(profiles, payment.collected_by, t)} · ${labelForBusiness(payment.business_type, t)}${!collectedByOwner && ownerOnlineAmount > 0 ? ` · ${t("ownerAccountCredit")}` : ""}`,
                recordType: collectedByOwner ? "payment" : undefined,
                canDelete: collectedByOwner && !effectivePaymentApproved,
                transferLines: [],
                transferRecipients: [],
                canRequestTransfer: false,
                incomingTransferId: null,
                pendingApproval: false,
              });
            }
          }

          return rows;
        }

        const rows: HistoryRecord[] = [];
        const personalStaffView = !canUseProfileFilter;
        const staffOwnOnline = personalStaffView && payment.collected_by === profile.id && onlineImpact > 0;
        const rowCashAmount = canUseProfileFilter
          ? cashImpact
          : transferOut
            ? cashImpact
            : payment.current_holder_id === profile.id || transferIn
              ? cashImpact
              : 0;

        if (rowCashAmount > 0 || (canUseProfileFilter && onlineImpact > 0)) {
          const rowOnlineAmount = canUseProfileFilter ? onlineImpact : 0;
          const shownAmount = transferOut ? -rowCashAmount : rowCashAmount + rowOnlineAmount;
          rows.push({
            ...baseRecord,
            kind: "collection",
            filter: transferOut ? "cash_out" : "cash_in",
            amount: shownAmount,
            cashAmount: rowCashAmount,
            onlineAmount: rowOnlineAmount,
            amountTone: shownAmount === 0 ? "neutral" : shownAmount > 0 ? "positive" : "negative",
            onlineTone: onlineApproved ? "online-approved" : "neutral",
            meta: `${profileName(profiles, payment.collected_by, t)} · ${labelForBusiness(payment.business_type, t)}`,
          });
        }

        if (staffOwnOnline && !transferOut && !transferIn) {
          const onlineAmount = onlineImpact;
          rows.push({
            ...baseRecord,
            id: onlineOnly ? payment.id : `${payment.id}-online`,
            kind: "settlement",
            filter: "cash_out",
            amount: -onlineAmount,
            cashAmount: 0,
            onlineAmount,
            amountTone: onlineApproved ? "online-approved" : "neutral",
            onlineTone: onlineApproved ? "online-approved" : "neutral",
            title: t("ownerAccountCredit"),
            meta: `${paymentDisplayTitle(payment, t)} · ${labelForBusiness(payment.business_type, t)}`,
            modeLabel: t("online"),
            recordType: onlineOnly ? "payment" : undefined,
            canEdit: onlineOnly ? baseRecord.canEdit : false,
            canDelete: false,
            transferLines: [],
            transferRecipients: [],
            canRequestTransfer: false,
            incomingTransferId: null,
          });
        }

        return rows;
      });
    const expenseRows = currentUserIsSalesAgent ? [] : expenses
      .filter((expense) => historyDateInScope(expense.expense_date, isEffectivelyPendingExpense(expense, ownerProfileIds)))
      .filter((expense) => expense.record_status === "active")
      .filter((expense) => userMatches(expense.spent_by))
      .flatMap((expense): HistoryRecord[] => {
        const spentByOwner = isOwnerProfile(expense.spent_by);
        const expenseEffectiveStatus = effectiveExpenseStatus(expense, ownerProfileIds);
        const effectiveExpenseApproved = isEffectivelyApprovedExpense(expense, ownerProfileIds);
        const pendingApproval = isEffectivelyPendingExpense(expense, ownerProfileIds);
        const baseRecord = {
          id: expense.id,
          kind: "expense" as const,
          date: expense.expense_date,
          sortAt: expense.created_at,
          amount: -numberValue(expense.amount),
          cashAmount: expense.mode === "online" ? 0 : numberValue(expense.amount),
          onlineAmount: expense.mode === "online" ? numberValue(expense.amount) : 0,
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
          canEdit: expense.spent_by === profile.id && pendingApproval,
          canDelete: owner && !effectiveExpenseApproved,
          pendingApproval,
          icon: <ReceiptText size={24} />,
        };

        if (!owner) {
          return [{ ...baseRecord, filter: "cash_out" }];
        }

        if (spentByOwner && effectiveExpenseApproved) {
          return [{ ...baseRecord, filter: "cash_out", pendingApproval: false }];
        }

        if (!spentByOwner || pendingApproval) {
          return [{
            ...baseRecord,
            filter: "transactions",
            amountTone: "neutral",
          }];
        }

        return [];
      });
    const settlementRows = currentUserIsSalesAgent ? [] : movements.flatMap((movement): HistoryRecord[] => {
      if ((movement.status !== "accepted" && movement.status !== "pending") || movement.payment_id) return [];
      const fromProfile = profiles.find((item) => item.id === movement.from_profile_id);
      const toProfile = profiles.find((item) => item.id === movement.to_profile_id);
      const fromOwnerish = isOwnerish(fromProfile?.role ?? "");
      const toOwnerish = isOwnerish(toProfile?.role ?? "");
      const movementAmount = numberValue(movement.amount);
      const pendingMovement = movement.status === "pending";

      if (owner) {
        const ownerFacingAmount = !fromOwnerish && toOwnerish ? movementAmount : fromOwnerish && !toOwnerish ? -movementAmount : 0;
        if (ownerFacingAmount === 0) return [];
        const ownerReceivedSettlement = ownerFacingAmount > 0;
        const counterpartyId = ownerFacingAmount > 0 ? movement.from_profile_id : movement.to_profile_id;
        if (!userMatches(counterpartyId)) return [];
        const entry = pendingMovement ? null : movementEntry(movement, ownerFacingAmount);
        const date = entry?.entry_date ?? movement.created_at.slice(0, 10);
        if (!historyDateInScope(date, pendingMovement)) return [];
        const counterpartyName = profileName(profiles, counterpartyId, t);
        return [{
          id: `movement-${movement.id}`,
          kind: ownerReceivedSettlement ? "settlement" : "expense",
          filter: ownerReceivedSettlement ? "cash_in" : "cash_out",
          date,
          sortAt: movement.responded_at ?? movement.created_at,
          amount: ownerFacingAmount,
          cashAmount: movementAmount,
          onlineAmount: 0,
          title: ownerFacingAmount > 0 ? t("cashReceived") : t("cashSent"),
          meta: `${ownerFacingAmount > 0 ? t("from") : t("to")}: ${counterpartyName}${movement.note ? ` · ${movement.note}` : ""}`,
          status: pendingMovement ? labelForStatus(movement.status, t) : t("verified"),
          statusTone: movement.status,
          modeLabel: labelForMode(movement.mode, t),
          recordStatus: "active",
          ownerId: counterpartyId ?? profile.id,
          description: entry?.description ?? "",
          remark: movement.note ?? "",
          reason: null,
          pendingApproval: pendingMovement,
          icon: ownerReceivedSettlement ? <ArrowDown size={24} /> : <ArrowUp size={24} />,
        }];
      }

      const staffFacingAmount = movement.from_profile_id === profile.id
        ? -movementAmount
        : movement.to_profile_id === profile.id
          ? movementAmount
          : 0;
      if (staffFacingAmount === 0) return [];
      if (!userMatches(profile.id)) return [];
      const counterpartyId = staffFacingAmount < 0 ? movement.to_profile_id : movement.from_profile_id;
      const entry = pendingMovement ? null : movementEntry(movement, staffFacingAmount, profile.id);
      const date = entry?.entry_date ?? movement.created_at.slice(0, 10);
      if (!historyDateInScope(date, pendingMovement)) return [];
      const staffCashIn = staffFacingAmount > 0;
      const incomingOwnerCash = staffFacingAmount > 0 && fromOwnerish && !toOwnerish;
      const outgoingOwnerSettlement = staffFacingAmount < 0 && toOwnerish;
      return [{
        id: `movement-${movement.id}`,
        kind: staffCashIn ? "collection" : "settlement",
        filter: staffCashIn ? "cash_in" : "cash_out",
        date,
        sortAt: movement.responded_at ?? movement.created_at,
        amount: staffFacingAmount,
        cashAmount: movementAmount,
        onlineAmount: 0,
        title: staffCashIn ? (incomingOwnerCash ? t("cashInFromOwner") : t("cashReceived")) : outgoingOwnerSettlement ? t("cashSettled") : t("cashSent"),
        meta: `${staffFacingAmount < 0 ? t("to") : t("from")}: ${profileName(profiles, counterpartyId, t)}${movement.note ? ` · ${movement.note}` : ""}`,
        status: pendingMovement ? labelForStatus(movement.status, t) : t("verified"),
        statusTone: movement.status,
        modeLabel: staffCashIn ? t("cashIn") : labelForMode(movement.mode, t),
        recordStatus: "active",
        ownerId: profile.id,
        description: entry?.description ?? "",
        remark: movement.note ?? "",
        reason: null,
        pendingApproval: pendingMovement,
        icon: staffCashIn ? <ArrowDown size={24} /> : <ArrowUp size={24} />,
      }];
    });
    const agentRows = agentSettlements.flatMap((settlement): HistoryRecord[] => {
      if (settlement.status === "rejected") return [];
      const amount = numberValue(settlement.amount);
      const visibleToOwner = owner && userMatches(settlement.agent_id);
      const visibleToAgent = !owner && settlement.agent_id === profile.id && userMatches(settlement.agent_id);
      if (!visibleToOwner && !visibleToAgent) return [];
      if (!historyDateInScope(settlement.created_at, settlement.status === "pending")) return [];
      return [{
        id: `agent-${settlement.id}`,
        kind: "agent_payout",
        filter: visibleToAgent ? "cash_in" : "cash_out",
        date: settlement.created_at.slice(0, 10),
        sortAt: settlement.responded_at ?? settlement.created_at,
        amount: visibleToOwner ? -amount : amount,
        cashAmount: amount,
        onlineAmount: 0,
        amountTone: visibleToOwner ? "negative" : "positive",
        title: settlement.status === "pending" ? t("pendingIncentive") : visibleToAgent ? t("incentivePayout") : t("agentPayout"),
        meta: `${visibleToOwner ? t("to") : t("from")}: ${profileName(profiles, visibleToOwner ? settlement.agent_id : settlement.paid_by, t)}${settlement.note ? ` · ${settlement.note}` : ""}`,
        status: labelForStatus(settlement.status, t),
        statusTone: settlement.status,
        modeLabel: visibleToAgent ? t("cashIn") : t("agentPayoutLower"),
        recordStatus: "active",
        ownerId: visibleToOwner ? settlement.agent_id : profile.id,
        description: "",
        remark: settlement.note ?? "",
        reason: null,
        pendingApproval: settlement.status === "pending",
        icon: <WalletCards size={24} />,
      }];
    });

    return [...paymentRows, ...expenseRows, ...settlementRows, ...agentRows]
      .sort((a, b) => `${b.date}-${b.sortAt}-${b.id}`.localeCompare(`${a.date}-${a.sortAt}-${a.id}`));
  }, [agentSettlements, canUseProfileFilter, currentUserIsSalesAgent, dateRange, dateRangePreset, expenses, ledger, movements, owner, payments, permissionsByProfile, profile.id, profiles, t, transactionProfileId]);
  const selectedTransactionActionRecord = transactionAction
    ? allTransactionRecords.find((record) => `${record.kind}-${record.id}` === transactionAction.recordKey) ?? null
    : null;
  const closeTransactionAction = () => setTransactionAction(null);
  const openTransactionAction = (kind: TransactionActionKind, recordKey: string, trigger: HTMLButtonElement) => {
    trigger.closest("details")?.removeAttribute("open");
    setTransactionAction({ kind, recordKey });
  };
  const transactionRecords = useMemo(() => allTransactionRecords.filter((record) => {
    if (effectiveTransactionFilter === "all") return owner ? record.filter !== "transactions" && !record.pendingApproval : true;
    if (effectiveTransactionFilter === "transactions") return owner ? record.filter === "transactions" || Boolean(record.pendingApproval) : record.filter === "transactions";
    if (effectiveTransactionFilter === "pending") return Boolean(record.pendingApproval);
    return record.filter === effectiveTransactionFilter && !record.pendingApproval;
  }), [allTransactionRecords, effectiveTransactionFilter, owner]);
  const totalTransactionRecords = allTransactionRecords.filter((record) => record.filter !== "transactions" && !record.pendingApproval);
  const inCashTotal = totalTransactionRecords
    .filter((record) => numberValue(record.amount) > 0)
    .reduce((sum, record) => sum + numberValue(record.cashAmount), 0);
  const inOnlineTotal = totalTransactionRecords
    .filter((record) => numberValue(record.amount) > 0)
    .reduce((sum, record) => sum + numberValue(record.onlineAmount), 0);
  const positiveTotal = inCashTotal + inOnlineTotal;
  const outCashTotal = totalTransactionRecords
    .filter((record) => numberValue(record.amount) < 0)
    .reduce((sum, record) => sum + numberValue(record.cashAmount), 0);
  const outOnlineTotal = totalTransactionRecords
    .filter((record) => numberValue(record.amount) < 0)
    .reduce((sum, record) => sum + numberValue(record.onlineAmount), 0);
  const negativeTotal = outCashTotal + outOnlineTotal;
  const groupedRecords = transactionRecords.reduce<{ date: string; records: typeof transactionRecords }[]>((groups, record) => {
    const lastGroup = groups.at(-1);
    if (lastGroup?.date === record.date) {
      lastGroup.records.push(record);
      return groups;
    }
    groups.push({ date: record.date, records: [record] });
    return groups;
  }, []);
  const visibleTransactionFilters = (owner
    ? ["all", "cash_in", "cash_out", "transactions"]
    : ["all", "cash_in", "cash_out", "pending"]) as TransactionFilter[];
  const transactionFilterLabel = (filter: TransactionFilter) => {
    if (filter === "all") return t("all");
    if (filter === "cash_in") return t("cashIn");
    if (filter === "cash_out") return t("cashOut");
    if (filter === "pending") return t("pending");
    if (filter === "transactions") return t("transactions");
    return t("all");
  };

  return (
    <div className="view-stack mobile-clean transaction-history-view">
      {currentUserIsSalesAgent ? (
        <>
          <AgentCodePanel profile={profile} referrals={agentReferralCodes} setNotice={setNotice} />
          <AgentIncentivePanel summary={agentIncentiveSummary} />
        </>
      ) : null}

      <section className="history-summary-panel">
        <div className="history-filter-row">
          <button className="history-filter-chip" type="button">
            <CalendarDays size={20} />
            <span>{dateLabel}</span>
          </button>
          {canUseProfileFilter ? (
            <label className="history-filter-chip history-user-select">
              <UserPlus size={20} />
              <select value={transactionProfileId} onChange={(event) => setTransactionProfileId(event.target.value)}>
                <option value="all">{t("allStaff")}</option>
                {selectableProfiles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id === profile.id ? `${item.full_name} (${t("self")})` : item.full_name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        {!currentUserIsSalesAgent ? (
          <div className="history-total-card">
            <div>
              <span>{t("totalIn")}</span>
              <strong className="positive">+{formatMoney(positiveTotal)}</strong>
              <small className="history-total-breakdown">{t("cash")} {formatMoney(inCashTotal)} · {t("online")} {formatMoney(inOnlineTotal)}</small>
            </div>
            <div className="history-total-divider" />
            <div>
              <span>{t("totalOut")}</span>
              <strong className="negative">-{formatMoney(negativeTotal)}</strong>
              <small className="history-total-breakdown">{t("cash")} {formatMoney(outCashTotal)} · {t("online")} {formatMoney(outOnlineTotal)}</small>
            </div>
          </div>
        ) : (
          <div className="agent-history-total">
            <span>{t("cashIn")}</span>
            <strong>{formatMoney(positiveTotal)}</strong>
            <small className="history-total-breakdown">{t("cash")} {formatMoney(inCashTotal)} · {t("online")} {formatMoney(inOnlineTotal)}</small>
          </div>
        )}
        <div className="history-tab-strip" role="tablist" aria-label={t("transactions")}>
          {visibleTransactionFilters.map((filter) => (
            <button
              className={effectiveTransactionFilter === filter ? "history-tab active" : "history-tab"}
              key={filter}
              type="button"
              onClick={() => setTransactionFilter(filter)}
            >
              {transactionFilterLabel(filter)}
            </button>
          ))}
        </div>
      </section>

      <section className="history-list-section">
        {groupedRecords.length > 0 ? (
          groupedRecords.map((group) => (
            <div className="history-day-group" key={group.date}>
              <h3>{group.date === todayIso() ? t("today") : group.date}</h3>
              <div className="history-card-list">
                {group.records.map((record) => (
                  <article
                    className={`history-card ${record.kind === "settlement" ? "settlement" : record.amountTone ?? (record.amount === 0 ? "neutral" : record.amount > 0 ? "positive" : "negative")}`}
                    key={`${record.kind}-${record.id}`}
                  >
                    <div className="history-card-icon">{record.icon}</div>
                    <div className="history-card-main">
                      <strong>{record.title}</strong>
                      <p>{record.meta}</p>
                      <div className="history-badge-row">
                        <span className={`status-chip status-${record.statusTone}`}>{record.status}</span>
                        {record.modeLabel ? <span className="history-mode-badge">{record.modeLabel}</span> : null}
                      </div>
                      {record.transferLines && record.transferLines.length > 0 ? (
                        <div className="history-transfer-panel">
                          {record.transferLines.map((line, index) => (
                            <span key={`${line}-${index}`}>{line}</span>
                          ))}
                          {record.incomingTransferId ? (
                            <div className="history-transfer-actions">
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
                        </div>
                      ) : null}
                    </div>
                    <div className="history-card-side">
                      <strong className={record.amountTone ?? (record.amount === 0 ? "neutral" : record.amount > 0 ? "positive" : "negative")}>
                        {record.amount === 0 ? "" : record.amount > 0 ? "+" : "-"}{formatMoney(Math.abs(record.amount))}
                      </strong>
                      {record.filter === "cash_in" && record.amount > 0 ? (
                        <span className={`history-online-amount ${record.onlineTone ?? "neutral"}`}>
                          {t("cash")} {formatMoney(record.cashAmount)} · {t("online")} {formatMoney(record.onlineAmount)}
                        </span>
                      ) : null}
                      {record.filter === "cash_out" && record.amount < 0 && record.onlineAmount > 0 ? (
                        <span className={`history-online-amount ${record.onlineTone ?? "neutral"}`}>
                          {t("cash")} {formatMoney(record.cashAmount)} · {t("online")} {formatMoney(record.onlineAmount)}
                        </span>
                      ) : null}
                      {record.kind === "settlement" ? <span>{record.filter === "cash_in" ? t("cashIn") : t("cashOut")}</span> : null}
                      <div className="history-card-controls">
                        {record.canApprove && record.recordType ? (
                          <MiniAction
                            hidden={{ record_type: record.recordType, id: record.id, decision: "approved" }}
                            label={t("approve")}
                            tone="approve"
                            icon={<Check size={20} strokeWidth={3} />}
                            action={approveRecordAction}
                            setNotice={setNotice}
                            startTransition={startTransition}
                          />
                        ) : record.approvalBlockedByTransfer ? (
                          <button className="history-approve-button blocked" type="button" disabled title={t("resolveTransferFirst")} aria-label={t("resolveTransferFirst")}>
                            <Check size={20} strokeWidth={3} />
                          </button>
                        ) : null}
                        {record.recordType && (record.canEdit || record.canDelete || record.canRequestTransfer) ? (
                          <details className="history-actions-menu">
                            <summary aria-label={t("moreOptions")}>
                              <MoreHorizontal size={18} />
                            </summary>
                            <div className="details-menu transaction-options-menu">
                              {record.canRequestTransfer ? (
                                <button
                                  className="transaction-option-button"
                                  type="button"
                                  onClick={(event) => openTransactionAction("transfer", `${record.kind}-${record.id}`, event.currentTarget)}
                                >
                                  <ArrowUp size={18} />
                                  <span>{t("transferTransaction")}</span>
                                </button>
                              ) : null}
                              {record.canEdit ? (
                                <button
                                  className="transaction-option-button"
                                  type="button"
                                  onClick={(event) => openTransactionAction("edit", `${record.kind}-${record.id}`, event.currentTarget)}
                                >
                                  <Pencil size={18} />
                                  <span>{t("editTransaction")}</span>
                                </button>
                              ) : null}
                              {record.canDelete ? (
                                <button
                                  className="transaction-option-button danger"
                                  type="button"
                                  onClick={(event) => openTransactionAction("delete", `${record.kind}-${record.id}`, event.currentTarget)}
                                >
                                  <Trash2 size={18} />
                                  <span>{t("deleteTransaction")}</span>
                                </button>
                              ) : null}
                            </div>
                          </details>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="muted">{t("noRecordsForFilter")}</p>
        )}
      </section>

      {transactionAction && selectedTransactionActionRecord?.recordType ? (
        <div
          className="modal-layer"
          role="dialog"
          aria-modal="true"
          aria-label={transactionAction.kind === "transfer" ? t("transferTransaction") : transactionAction.kind === "edit" ? t("editTransaction") : t("deleteTransaction")}
        >
          <button className="modal-backdrop" aria-label={t("closeModal")} type="button" onClick={closeTransactionAction} />
          <section className="action-sheet transaction-action-sheet">
            <header className="sheet-header">
              <div>
                <p className="eyebrow">{selectedTransactionActionRecord.title}</p>
                <h2>
                  {transactionAction.kind === "transfer"
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

            {transactionAction.kind === "transfer" ? (
              <form
                className="form-grid"
                onSubmit={(event) => submitAndClose(event, requestPaymentTransferAction, setNotice, startTransition, closeTransactionAction)}
              >
                <input type="hidden" name="payment_id" value={selectedTransactionActionRecord.id} />
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
                onSubmit={(event) => submitAndClose(event, updateRecordAction, setNotice, startTransition, closeTransactionAction)}
              >
                <input type="hidden" name="record_type" value={selectedTransactionActionRecord.recordType} />
                <input type="hidden" name="id" value={selectedTransactionActionRecord.id} />
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
                onSubmit={(event) => submitAndClose(event, cancelRecordAction, setNotice, startTransition, closeTransactionAction)}
              >
                <input type="hidden" name="record_type" value={selectedTransactionActionRecord.recordType} />
                <input type="hidden" name="id" value={selectedTransactionActionRecord.id} />
                <label className="full-span">
                  {t("reasonRequired")}
                  <input name="reason" placeholder={t("reasonRequired")} required autoFocus />
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
        aria-label={t("collectPayment")}
        disabled={!canAddPositive}
        onClick={onPositive}
      >
        <Plus size={19} />
      </button>
      <button
        className="quick-action-button quick-action-negative flex items-center gap-2 bg-error text-on-error px-5 py-3 rounded-full shadow-soft hover:scale-105 transition-all active:scale-95 font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        type="button"
        aria-label={t("addExpense")}
        disabled={!canAddNegative}
        onClick={onNegative}
      >
        <Minus size={19} />
      </button>
    </div>
  );
}


type LibraryStudentHistory = {
  payments: Payment[];
  events: LibraryStudentSubscriptionEvent[];
};

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
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function isTimeRangeLiveNow(startTime: string | null | undefined, endTime: string | null | undefined, minuteOfDay: number) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null || start === end) return false;
  if (start < end) return minuteOfDay >= start && minuteOfDay < end;
  return minuteOfDay >= start || minuteOfDay < end;
}

function isLibraryStudentLiveNow(student: LibraryStudent, minuteOfDay: number) {
  return isTimeRangeLiveNow(student.start_time, student.end_time, minuteOfDay);
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
  return `${t("expiresIn")} ${dayDelta} ${dayLabel}`;
}

function libraryExpiryStatusLabel(student: LibraryStudent, today: string, t: (key: string) => string) {
  return subscriptionExpiryStatusLabel(student.subscription_end_date, today, t);
}

function displayTimeRange(startTime: string | null, endTime: string | null) {
  const start = displayTime(startTime);
  const end = displayTime(endTime);
  if (start && end) return `${start}-${end}`;
  return start || end || "-";
}

function displayTextValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "-";
  const text = String(value).trim();
  return text || "-";
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

function nextLibraryRollNumber(students: LibraryStudent[]) {
  let largestValue = -1;
  let largestWidth = 0;

  students.forEach((student) => {
    const rollNumber = normalizeLibraryRollNumberForView(studentDisplayRollNumber(student));
    if (!rollNumber || !/^\d+$/.test(rollNumber)) return;
    const numericRoll = Number(rollNumber);
    if (!Number.isSafeInteger(numericRoll)) return;
    if (numericRoll > largestValue || (numericRoll === largestValue && rollNumber.length > largestWidth)) {
      largestValue = numericRoll;
      largestWidth = rollNumber.length;
    }
  });

  if (largestValue < 0) return "";
  const nextRollNumber = String(largestValue + 1);
  return nextRollNumber.padStart(largestWidth, "0");
}

function nextCourseRollNumber(records: CourseStudentRecord[]) {
  let largestValue = -1;
  let largestWidth = 0;

  records.forEach((record) => {
    const rollNumber = normalizeLibraryRollNumberForView(record.rollNumber);
    if (!rollNumber || !/^\d+$/.test(rollNumber)) return;
    const numericRoll = Number(rollNumber);
    if (!Number.isSafeInteger(numericRoll)) return;
    if (numericRoll > largestValue || (numericRoll === largestValue && rollNumber.length > largestWidth)) {
      largestValue = numericRoll;
      largestWidth = rollNumber.length;
    }
  });

  if (largestValue < 0) return "1";
  const nextRollNumber = String(largestValue + 1);
  return nextRollNumber.padStart(largestWidth, "0");
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
  const avatarUrl = imageUrl ?? getProfileImage(displayName);
  return (
    <span
      className={`library-student-photo ${className}`}
      role="img"
      aria-label={`${displayName} photo`}
      style={{ backgroundImage: `url("${avatarUrl.replace(/"/g, "%22")}")` }}
    />
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
  const imageUrl = getProfileImage(displayName, student.photo_url);
  return <StudentAvatar displayName={displayName} imageUrl={imageUrl} className={className} />;
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

function CompressedImageInput({
  inputName,
  label,
  previewLabel,
  displayName = "",
  initialImageUrl,
  variant,
  capture = false,
}: {
  inputName: "student_photo" | "aadhar_photo" | "photo";
  label: string;
  previewLabel: string;
  displayName?: string;
  initialImageUrl?: string | null;
  variant: "student" | "document";
  capture?: boolean;
}) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState(initialImageUrl ?? null);
  const [preparing, setPreparing] = useState(false);
  const [hasSelectedPhoto, setHasSelectedPhoto] = useState(false);

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
      if (input) preparedPhotoFiles.delete(input);
    };
    form?.addEventListener("reset", resetPreview);
    return () => {
      form?.removeEventListener("reset", resetPreview);
      releaseObjectUrl();
    };
  }, [initialImageUrl]);

  function handlePhotoChange(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) {
      preparedPhotoFiles.delete(input);
      releaseObjectUrl();
      setPreviewUrl(initialImageUrl ?? null);
      setHasSelectedPhoto(false);
      return;
    }

    showFilePreview(file);
    preparedPhotoFiles.delete(input);
    setHasSelectedPhoto(true);
    setPreparing(true);
    const preparation = compressUploadImage(file)
      .then((preparedFile) => {
        if (input.files?.[0] !== file) return;
        if (preparedFile !== file) {
          preparedPhotoFiles.set(input, preparedFile);
          showFilePreview(preparedFile);
        }
      })
      .finally(() => {
        if (pendingFilePreparations.get(input) === preparation) {
          pendingFilePreparations.delete(input);
          setPreparing(false);
        }
      });
    pendingFilePreparations.set(input, preparation);
  }

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
            <span>{preparing ? t("compressingPhoto") : hasSelectedPhoto ? t("photoReady") : label}</span>
          </div>
        </div>
      ) : null}
      <label>
        {label}
        <span className="camera-field">
          <Camera size={16} />
          {t("addImage")}
          <input
            ref={inputRef}
            name={inputName}
            type="file"
            accept="image/*"
            capture={capture ? "environment" : undefined}
            onChange={(event) => handlePhotoChange(event.currentTarget)}
          />
        </span>
      </label>
    </div>
  );
}

function studentNameInputValue(student: LibraryStudent) {
  return studentHasSwappedRollAndName(student) ? student.roll_number : student.student_name ?? "";
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

function subscriptionRenewalDateRange(previousEndDate: string | null | undefined) {
  if (!previousEndDate) {
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
  return subscriptionRenewalDateRange(student?.subscription_end_date);
}

function courseRenewalDateRange(record: CourseStudentRecord | null | undefined) {
  return subscriptionRenewalDateRange(record?.subscriptionEndDate);
}

function isRealLibraryStudentId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

function paymentMatchesLibraryStudent(payment: Payment, student: LibraryStudent) {
  if (payment.library_student_id === student.id) return true;
  const paymentRollNumber = normalizeLibraryRollNumberForView(payment.roll_number);
  const studentRollNumber = normalizeLibraryRollNumberForView(student.roll_number);
  return Boolean(paymentRollNumber && studentRollNumber && paymentRollNumber === studentRollNumber);
}

function libraryPaymentSubscriptionSortKey(payment: Payment) {
  return [
    payment.end_date ?? "",
    payment.start_date ?? "",
    payment.payment_date,
    payment.created_at,
    payment.id,
  ].join("|");
}

function libraryStudentSubscriptionSortKey(student: LibraryStudent) {
  return [
    student.subscription_end_date ?? "",
    student.subscription_start_date ?? "",
    student.last_payment_date ?? "",
  ].join("|");
}

function latestLibrarySubscriptionPayment(payments: Payment[]) {
  return payments
    .filter((payment) => payment.business_type === "library" && payment.record_status === "active")
    .sort((a, b) => libraryPaymentSubscriptionSortKey(b).localeCompare(libraryPaymentSubscriptionSortKey(a)))[0] ?? null;
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
          <strong>{displayTimeRange(student.start_time, student.end_time)}</strong>
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
          <span>{t("aadharCardPhoto")}</span>
          {student.aadhar_photo_url ? (
            <a
              className="library-document-preview-link"
              href={student.aadhar_photo_url}
              target="_blank"
              rel="noreferrer"
              aria-label={t("viewPhoto")}
            >
              <span
                className="document-upload-preview has-image"
                role="img"
                aria-label={t("aadharPhotoPreview")}
                style={{ backgroundImage: `url("${student.aadhar_photo_url.replace(/"/g, "%22")}")` }}
              />
              <small>{t("viewPhoto")}</small>
            </a>
          ) : (
            <strong>{displayTextValue(null)}</strong>
          )}
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

function libraryStudentWithLatestSubscription(student: LibraryStudent, payments: Payment[]) {
  const latestPayment = latestLibrarySubscriptionPayment(payments);
  if (!latestPayment) return student;

  const paymentDate = latestPayment.payment_date.slice(0, 10);
  if (libraryStudentSubscriptionSortKey(student) > libraryPaymentSubscriptionSortKey(latestPayment)) return student;

  return {
    ...student,
    student_name: latestPayment.customer_name ?? student.student_name,
    roll_number: normalizeLibraryRollNumberForView(latestPayment.roll_number) ?? student.roll_number,
    seat_number: latestPayment.seat_number ?? student.seat_number,
    start_time: latestPayment.start_time ?? student.start_time,
    end_time: latestPayment.end_time ?? student.end_time,
    slot_hours: latestPayment.slot_hours ?? student.slot_hours,
    subscription_start_date: latestPayment.start_date ?? student.subscription_start_date,
    subscription_end_date: latestPayment.end_date ?? student.subscription_end_date,
    fee_amount: latestPayment.fee_amount ?? student.fee_amount,
    paid_amount: latestPayment.paid_amount ?? student.paid_amount,
    dues_amount: latestPayment.dues_amount ?? student.dues_amount,
    advance_amount: latestPayment.advance_amount ?? student.advance_amount,
    active: true,
    placeholder: false,
    last_payment_id: latestPayment.id,
    last_payment_date: paymentDate,
    updated_at: latestPayment.created_at,
  };
}

function mergePaymentHistory(...groups: Payment[][]) {
  const rows = new Map<string, Payment>();
  groups.flat().forEach((payment) => rows.set(payment.id, payment));

  return [...rows.values()].sort((a, b) =>
    libraryPaymentSubscriptionSortKey(b).localeCompare(libraryPaymentSubscriptionSortKey(a)),
  );
}

function studentRecordSourceId(course: Course) {
  return `${course.kind === "skill" ? "skill" : "course"}:${course.id}`;
}

function studentRecordSources(courses: Course[], t: (key: string) => string, includeLibrary: boolean): StudentRecordSource[] {
  const visibleCourses = courses.filter((course) => course.active);
  return [
    ...(includeLibrary ? [{ id: "library", type: "library", label: t("library") } satisfies StudentRecordSource] : []),
    ...visibleCourses.map((course): StudentRecordSource => ({
      id: studentRecordSourceId(course),
      type: course.kind === "skill" ? "skillCourse" : "mainCourse",
      label: course.kind === "skill" ? `${course.name} (${t("skill")})` : course.name,
      course,
    })),
  ];
}

function paymentMatchesStudentRecordSource(payment: Payment, source: CourseStudentRecordSource) {
  if (payment.business_type !== "course" || payment.record_status !== "active") return false;
  return source.type === "skillCourse"
    ? payment.skill_course_id === source.course.id
    : payment.course_id === source.course.id && !payment.skill_course_id;
}

function courseStudentIdentityKey(payment: Payment) {
  const rollKey = libraryRollKey(payment.roll_number);
  if (rollKey) return `roll:${rollKey}`;

  const nameKey = payment.customer_name?.trim().toLowerCase();
  if (nameKey) return `name:${nameKey}`;

  return `payment:${payment.id}`;
}

function courseStudentRecordFromPayment(payment: Payment, source: CourseStudentRecordSource, today: string): CourseStudentRecord {
  const endMs = isoDateUtcMs(payment.end_date);
  const todayMs = isoDateUtcMs(today);
  const active = endMs === null || todayMs === null || endMs >= todayMs;

  return {
    id: `${source.id}:${courseStudentIdentityKey(payment)}`,
    paymentId: payment.id,
    identityKey: courseStudentIdentityKey(payment),
    displayName: payment.customer_name?.trim() || "",
    rollNumber: normalizeLibraryRollNumberForView(payment.roll_number),
    courseName: source.course.name,
    seatNumber: payment.seat_number,
    startTime: payment.start_time,
    endTime: payment.end_time,
    subscriptionStartDate: payment.start_date,
    subscriptionEndDate: payment.end_date,
    lastPaymentDate: payment.payment_date,
    feeAmount: payment.fee_amount,
    paidAmount: payment.paid_amount,
    duesAmount: payment.dues_amount,
    advanceAmount: payment.advance_amount,
    active,
  };
}

function courseStudentRecordsForSource(payments: Payment[], source: CourseStudentRecordSource, today: string) {
  const latestPayments = new Map<string, Payment>();

  payments
    .filter((payment) => paymentMatchesStudentRecordSource(payment, source))
    .forEach((payment) => {
      const key = courseStudentIdentityKey(payment);
      const current = latestPayments.get(key);
      if (!current || libraryPaymentSubscriptionSortKey(payment) > libraryPaymentSubscriptionSortKey(current)) {
        latestPayments.set(key, payment);
      }
    });

  return [...latestPayments.values()].map((payment) => courseStudentRecordFromPayment(payment, source, today));
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
  students,
  payments,
  courses,
  includeLibrary,
  setNotice,
  startTransition,
}: {
  students: LibraryStudent[];
  payments: Payment[];
  courses: Course[];
  includeLibrary: boolean;
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [listMode, setListMode] = useState<LibraryStudentListMode>("active");
  const [currentMinute, setCurrentMinute] = useState(() => currentMinuteOfDay());
  const [selectedSourceId, setSelectedSourceId] = useState<StudentRecordSource["id"]>("library");
  const [selectedId, setSelectedId] = useState("");
  const [editingStudent, setEditingStudent] = useState(false);
  const today = todayIso();
  const sources = useMemo(() => studentRecordSources(courses, t, includeLibrary), [courses, includeLibrary, t]);
  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? sources[0] ?? { id: "library", type: "library", label: t("library") } satisfies StudentRecordSource,
    [selectedSourceId, sources, t],
  );
  const selectedSourceValue = selectedSource.id;
  const showingLibraryStudents = selectedSource.type === "library";
  const activeStudents = students.filter((student) => student.active && !student.placeholder);
  const liveStudents = activeStudents.filter((student) => isLibraryStudentLiveNow(student, currentMinute));
  const inactiveStudents = students.filter((student) => !student.active && !student.placeholder);
  const courseStudents = useMemo(
    () => selectedSource.type === "library" ? [] : courseStudentRecordsForSource(payments, selectedSource, today),
    [payments, selectedSource, today],
  );
  const activeCourseStudents = courseStudents.filter((record) => record.active);
  const liveCourseStudents = activeCourseStudents.filter((record) => isTimeRangeLiveNow(record.startTime, record.endTime, currentMinute));
  const inactiveCourseStudents = courseStudents.filter((record) => !record.active);
  const expired = (student: LibraryStudent) => isExpiredLibraryStudent(student, today);
  const sourceStudents = listMode === "live" ? liveStudents : listMode === "active" ? activeStudents : inactiveStudents;
  const sourceCourseStudents = listMode === "live" ? liveCourseStudents : listMode === "active" ? activeCourseStudents : inactiveCourseStudents;
  const activeCount = showingLibraryStudents ? activeStudents.length : activeCourseStudents.length;
  const liveCount = showingLibraryStudents ? liveStudents.length : liveCourseStudents.length;
  const inactiveCount = showingLibraryStudents ? inactiveStudents.length : inactiveCourseStudents.length;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleStudents = showingLibraryStudents ? sourceStudents
    .filter((student) => {
      if (!normalizedQuery) return true;
      return [studentDisplayRollNumber(student), studentDisplayName(student, t), student.phone_number, student.seat_number, student.locker_number]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    })
    .sort((a, b) => {
      return compareLibraryStudentsByExpiry(a, b, t);
    }) : [];
  const visibleCourseStudents = showingLibraryStudents ? [] : sourceCourseStudents
    .filter((record) => {
      if (!normalizedQuery) return true;
      return [record.rollNumber, courseStudentDisplayName(record, t), record.courseName, record.seatNumber, displayTimeRange(record.startTime, record.endTime)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    })
    .sort((a, b) => compareCourseStudentRecordsByExpiry(a, b, t));

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentMinute(currentMinuteOfDay());
    }, 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  const baseSelectedStudent = showingLibraryStudents ? students.find((student) => libraryStudentMatchesSelection(student, selectedId)) ?? null : null;
  const selectedCourseStudent = showingLibraryStudents ? null : courseStudents.find((record) => record.id === selectedId) ?? null;
  const changeStudentSource = (nextSourceId: string) => {
    setSelectedSourceId(nextSourceId);
    setQuery("");
    setListMode("active");
    setSelectedId("");
    setEditingStudent(false);
  };
  const openStudentDetails = (studentId: string) => {
    setSelectedId(studentId);
    setEditingStudent(false);
  };
  const closeStudentDetails = () => {
    setSelectedId("");
    setEditingStudent(false);
  };
  const historyQuery = useQuery({
    queryKey: ["library-student-history", baseSelectedStudent?.id ?? ""],
    queryFn: () => fetchJson<LibraryStudentHistory>(`/api/app/library-students/${encodeURIComponent(baseSelectedStudent?.id ?? "")}/payments`),
    enabled: Boolean(baseSelectedStudent?.id),
    placeholderData: (previousHistory) => previousHistory,
  });
  const localHistoryPayments = useMemo(
    () => baseSelectedStudent ? payments.filter((payment) => paymentMatchesLibraryStudent(payment, baseSelectedStudent)) : [],
    [baseSelectedStudent, payments],
  );
  const historyPayments = useMemo(
    () => mergePaymentHistory(historyQuery.data?.payments ?? [], localHistoryPayments),
    [historyQuery.data?.payments, localHistoryPayments],
  );
  const selectedStudent = useMemo(
    () => baseSelectedStudent ? libraryStudentWithLatestSubscription(baseSelectedStudent, historyPayments) : null,
    [baseSelectedStudent, historyPayments],
  );
  const courseHistoryPayments = useMemo(() => {
    if (!selectedCourseStudent || selectedSource.type === "library") return [];
    return payments
      .filter((payment) =>
        paymentMatchesStudentRecordSource(payment, selectedSource) &&
        courseStudentIdentityKey(payment) === selectedCourseStudent.identityKey,
      )
      .sort((a, b) => libraryPaymentSubscriptionSortKey(b).localeCompare(libraryPaymentSubscriptionSortKey(a)));
  }, [payments, selectedCourseStudent, selectedSource]);
  return (
    <section className="library-students-view">
      <div className="library-student-source-bar">
        <h1 className="library-student-page-title">{t("libraryStudents")}</h1>
        <label className="library-student-source-select">
          {showingLibraryStudents ? <BookOpen size={20} /> : <GraduationCap size={20} />}
          <select
            aria-label={t("selectCourse")}
            value={selectedSourceValue}
            onChange={(event) => changeStudentSource(event.target.value)}
          >
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.label}
              </option>
            ))}
          </select>
        </label>
        <div className="library-student-filter-row">
          <button
            type="button"
            className={`filter-chip ${listMode === "active" ? "active" : ""}`}
            onClick={() => setListMode("active")}
          >
            ACTIVE · {activeCount}
          </button>
          <button
            type="button"
            className={`filter-chip ${listMode === "live" ? "active" : ""}`}
            onClick={() => setListMode("live")}
          >
            LIVE · {liveCount}
          </button>
          <button
            type="button"
            className={`filter-chip ${listMode === "inactive" ? "active" : ""}`}
            onClick={() => setListMode("inactive")}
          >
            INACTIVE · {inactiveCount}
          </button>
        </div>
      </div>

      <section className="library-student-list-panel">
        <label className="form-grid block">
          <span className="mb-2 block text-sm font-bold text-on-surface-variant">{t("studentSearch")}</span>
          <span className="input-with-icon">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`${t("rollNumber")} / ${t("name")}`} />
          </span>
        </label>
        <div className={`library-student-list-scroll ${listMode === "live" && showingLibraryStudents ? "library-live-student-grid" : "space-y-4"}`}>
          {visibleStudents.map((student) => {
            if (listMode === "live") {
              const displayName = studentDisplayName(student, t);
              const rollNumber = studentDisplayRollNumber(student);
              const slotTime = displayTimeRange(student.start_time, student.end_time);
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

            const callHref = studentPhoneHref(student.phone_number);
            const expiryLabel = libraryExpiryStatusLabel(student, today, t);
            const displayName = studentDisplayName(student, t);
            const rollNumber = studentDisplayRollNumber(student);
            return (
              <article
                key={student.id}
                className={`library-student-list-card ${selectedStudent?.id === student.id ? "selected" : ""} ${expired(student) ? "expired" : ""} ${callHref ? "" : "without-call"}`}
              >
                <span className={`library-expiry-chip library-list-expiry ${expired(student) ? "expired" : ""}`}>{expiryLabel}</span>
                <button
                  type="button"
                  onClick={() => openStudentDetails(student.id)}
                  className={`library-student-list-main ${callHref ? "" : "without-call"}`}
                  aria-label={`${displayName}, ${t("rollNumber")} ${rollNumber}, ${expiryLabel}`}
                >
                  <div className="library-list-avatar-wrap">
                    <StudentPhoto student={student} displayName={displayName} className="list" />
                    <span className="library-list-roll-badge">#{rollNumber}</span>
                  </div>
                  <div className="library-list-info">
                    <strong>{displayName}</strong>
                    <span>{student.phone_number ?? t("unknown")} · {t("seat")} {student.seat_number ?? "-"}</span>
                  </div>
                </button>
                {callHref ? (
                  <a
                    className="library-list-call-button"
                    href={callHref}
                    aria-label={`${t("callStudent")}: ${displayName}`}
                    title={t("callStudent")}
                  >
                    <PhoneCall size={22} />
                  </a>
                ) : null}
              </article>
            );
          })}
          {visibleCourseStudents.map((record) => {
            const displayName = courseStudentDisplayName(record, t);
            const expiryLabel = subscriptionExpiryStatusLabel(record.subscriptionEndDate, today, t);
            const timeRange = displayTimeRange(record.startTime, record.endTime);
            const meta = [
              record.courseName,
              timeRange !== "-" ? timeRange : null,
              `${t("lastPayment")} ${displayDate(record.lastPaymentDate)}`,
            ].filter(Boolean).join(" · ");

            return (
              <article
                key={record.id}
                className={`library-student-list-card without-call ${selectedCourseStudent?.id === record.id ? "selected" : ""} ${record.active ? "" : "expired"}`}
              >
                <span className={`library-expiry-chip library-list-expiry ${record.active ? "" : "expired"}`}>{expiryLabel}</span>
                <button
                  type="button"
                  onClick={() => openStudentDetails(record.id)}
                  className="library-student-list-main without-call"
                  aria-label={`${displayName}, ${record.courseName}, ${expiryLabel}`}
                >
                  <div className="library-list-avatar-wrap">
                    <StudentAvatar displayName={displayName} className="list" />
                    <span className="library-list-roll-badge">#{record.rollNumber ?? "-"}</span>
                  </div>
                  <div className="library-list-info">
                    <strong>{displayName}</strong>
                    <span>{meta}</span>
                  </div>
                </button>
              </article>
            );
          })}
          {(showingLibraryStudents ? visibleStudents.length : visibleCourseStudents.length) === 0 ? <p className="text-sm text-on-surface-variant">{t("noRecords")}</p> : null}
        </div>
      </section>

      {selectedStudent ? (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-label={studentDisplayName(selectedStudent, t)}>
          <button className="modal-backdrop" aria-label={t("closeModal")} type="button" onClick={closeStudentDetails} />
          <section className="action-sheet library-student-sheet">
            <header className="sheet-header">
              <div>
                <p className="eyebrow">{t("libraryStudent")}</p>
                <h2>{t("studentDetails")}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button className="secondary-button" type="button" onClick={() => setEditingStudent((value) => !value)}>
                  {editingStudent ? <X size={16} /> : <Pencil size={16} />}
                  {editingStudent ? t("cancel") : t("editTransaction")}
                </button>
                <button className="icon-button" type="button" aria-label={t("closeModal")} onClick={closeStudentDetails}>
                  <X size={18} />
                </button>
              </div>
            </header>

            <div className="space-y-5">
              {!editingStudent ? (
                <div className="library-student-detail-view">
                  <LibraryStudentSummaryCard
                    student={selectedStudent}
                    expired={expired(selectedStudent)}
                    onEditPhoto={() => setEditingStudent(true)}
                  />
                </div>
              ) : null}

              {isRealLibraryStudentId(selectedStudent.id) ? (
                <div className="flex justify-end">
                  <form onSubmit={(event) => submitWith(event, setLibraryStudentStatusAction, setNotice, startTransition, false)}>
                    <input type="hidden" name="id" value={selectedStudent.id} />
                    <input type="hidden" name="active" value={selectedStudent.active ? "false" : "true"} />
                    <button className="secondary-button" type="submit">
                      {selectedStudent.active ? <UserX size={16} /> : <UserCheck size={16} />}
                      {selectedStudent.active ? t("markInactive") : t("reactivate")}
                    </button>
                  </form>
                </div>
              ) : null}

              {editingStudent ? (
                <form
                  key={selectedStudent.id}
                  className="form-grid two"
                  onSubmit={(event) => submitWith(event, saveLibraryStudentAction, setNotice, startTransition, false)}
                >
                  <input type="hidden" name="id" value={selectedStudent.id} />
                  <h3 className="full-span section-title">{t("studentProfile")}</h3>
                  <CompressedImageInput
                    inputName="student_photo"
                    label={t("studentPhoto")}
                    previewLabel={t("photoPreview")}
                    displayName={studentNameInputValue(selectedStudent)}
                    initialImageUrl={selectedStudent.photo_url}
                    variant="student"
                  />
                  <label>
                    {t("name")}
                    <input name="student_name" defaultValue={studentNameInputValue(selectedStudent)} required />
                  </label>
                  <label>
                    {t("rollNumber")}
                    <input name="roll_number" defaultValue={studentDisplayRollNumber(selectedStudent)} required />
                  </label>
                  <label>
                    {t("phone")}
                    <input name="phone_number" defaultValue={selectedStudent.phone_number ?? ""} inputMode="tel" />
                  </label>
                  <label className="full-span">
                    {t("address")}
                    <input name="address" defaultValue={selectedStudent.address ?? ""} />
                  </label>
                  <label>
                    {t("aadharNumber")}
                    <input name="aadhar_number" defaultValue={selectedStudent.aadhar_number ?? ""} inputMode="numeric" />
                  </label>
                  <CompressedImageInput
                    inputName="aadhar_photo"
                    label={t("aadharCardPhoto")}
                    previewLabel={t("aadharPhotoPreview")}
                    initialImageUrl={selectedStudent.aadhar_photo_url}
                    variant="document"
                  />
                  <label>
                    {t("seatNumber")}
                    <input name="seat_number" defaultValue={selectedStudent.seat_number ?? ""} />
                  </label>
                  <label>
                    {t("lockerNumber")}
                    <input name="locker_number" defaultValue={selectedStudent.locker_number ?? ""} />
                  </label>
                  <label className="flex-row items-center gap-2">
                    <input name="inactive" type="checkbox" defaultChecked={!selectedStudent.active} />
                    <span>{t("inactiveStudents")}</span>
                  </label>
                  <div className="full-span flex flex-wrap gap-2">
                    <button className="primary-button" type="submit">
                      {t("save")}
                    </button>
                    <button className="secondary-button" type="button" onClick={() => setEditingStudent(false)}>
                      {t("cancel")}
                    </button>
                  </div>
                </form>
              ) : null}

              <div className="rounded-lg bg-surface-container-low p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Plus size={16} />
                  <h4 className="font-headline text-base font-bold">
                    {Number(selectedStudent.dues_amount ?? 0) > 0 ? t("collectDue") : t("addSubscription")}
                  </h4>
                </div>
                <PaymentForm
                  key={`${selectedStudent.id}-${selectedStudent.last_payment_id ?? selectedStudent.updated_at}`}
                  type="library"
                  rooms={[]}
                  mainCourses={[]}
                  skillCourses={[]}
                  referrals={[]}
                  payments={payments}
                  libraryStudents={students}
                  initialLibraryStudent={selectedStudent}
                  setNotice={setNotice}
                  startTransition={startTransition}
                />
              </div>

              <div className="rounded-lg bg-surface-container-low p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="font-headline text-base font-bold">{t("subscriptionHistory")}</h4>
                  <span className="text-xs text-on-surface-variant">{historyQuery.isFetching ? t("saving") : `${historyPayments.length}`}</span>
                </div>
                <div className="space-y-2">
                  {historyQuery.error ? <p className="text-sm text-error">{historyQuery.error instanceof Error ? historyQuery.error.message : "Could not load history."}</p> : null}
                  {historyPayments.slice(0, 8).map((payment) => (
                    <div key={payment.id} className="subscription-history-row">
                      <div className="min-w-0">
                        <strong>{displayDateRange(payment.start_date, payment.end_date, t)}</strong>
                        <p>{t("timing")} {displayTimeRange(payment.start_time, payment.end_time)} · {paymentModeLabel(payment, t)} · {labelForStatus(payment.approval_status, t)}</p>
                        <p>{t("paymentDate")} {displayDate(payment.payment_date)}</p>
                      </div>
                      <div className="subscription-amount-grid">
                        <span>{t("fee")} <strong>{formatMoney(payment.fee_amount ?? payment.amount)}</strong></span>
                        <span>{t("paid")} <strong>{formatMoney(payment.paid_amount ?? payment.amount)}</strong></span>
                        <span>{t("dues")} <strong>{formatMoney(payment.dues_amount ?? 0)}</strong></span>
                        <span>{t("advance")} <strong>{formatMoney(payment.advance_amount ?? 0)}</strong></span>
                      </div>
                    </div>
                  ))}
                  {historyPayments.length === 0 ? <p className="text-sm text-on-surface-variant">{t("noRecords")}</p> : null}
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {selectedCourseStudent ? (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-label={courseStudentDisplayName(selectedCourseStudent, t)}>
          <button className="modal-backdrop" aria-label={t("closeModal")} type="button" onClick={closeStudentDetails} />
          <section className="action-sheet library-student-sheet">
            <header className="sheet-header">
              <div>
                <p className="eyebrow">{selectedCourseStudent.courseName}</p>
                <h2>{t("studentDetails")}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button className="secondary-button" type="button" onClick={() => setEditingStudent((value) => !value)}>
                  {editingStudent ? <X size={16} /> : <Pencil size={16} />}
                  {editingStudent ? t("cancel") : t("editTransaction")}
                </button>
                <button className="icon-button" type="button" aria-label={t("closeModal")} onClick={closeStudentDetails}>
                  <X size={18} />
                </button>
              </div>
            </header>

            <div className="space-y-5">
              {!editingStudent ? (
                <section className="library-student-summary-card">
                  <div className="library-student-summary-top">
                    <StudentAvatar displayName={courseStudentDisplayName(selectedCourseStudent, t)} className="detail" />
                    <div className="library-student-summary-identity">
                      <span className="library-student-roll-badge">#{selectedCourseStudent.rollNumber ?? "-"}</span>
                      <h3>{courseStudentDisplayName(selectedCourseStudent, t)}</h3>
                      <p>{selectedCourseStudent.courseName}</p>
                    </div>
                    <span className={`library-expiry-chip ${selectedCourseStudent.active ? "" : "expired"}`}>
                      {subscriptionExpiryStatusLabel(selectedCourseStudent.subscriptionEndDate, today, t)}
                    </span>
                  </div>
                  <div className="library-student-summary-grid">
                    <div className="important">
                      <span>{t("subscriptionPeriod")}</span>
                      <strong>{displayDateRange(selectedCourseStudent.subscriptionStartDate, selectedCourseStudent.subscriptionEndDate, t)}</strong>
                    </div>
                    <div>
                      <span>{t("timing")}</span>
                      <strong>{displayTimeRange(selectedCourseStudent.startTime, selectedCourseStudent.endTime)}</strong>
                    </div>
                    <div>
                      <span>{t("lastPayment")}</span>
                      <strong>{displayDate(selectedCourseStudent.lastPaymentDate)}</strong>
                    </div>
                  </div>
                  <div className="library-student-summary-money">
                    <span>{t("fee")} <strong>{displayMoneyValue(selectedCourseStudent.feeAmount)}</strong></span>
                    <span>{t("paid")} <strong>{displayMoneyValue(selectedCourseStudent.paidAmount)}</strong></span>
                    <span>{t("dues")} <strong>{displayMoneyValue(selectedCourseStudent.duesAmount)}</strong></span>
                    <span>{t("advance")} <strong>{displayMoneyValue(selectedCourseStudent.advanceAmount)}</strong></span>
                  </div>
                </section>
              ) : (
                <form
                  key={selectedCourseStudent.paymentId}
                  className="form-grid two"
                  onSubmit={(event) => submitWith(event, saveCourseStudentAction, setNotice, startTransition, false)}
                >
                  <input type="hidden" name="payment_id" value={selectedCourseStudent.paymentId} />
                  <label>
                    {t("name")}
                    <input name="customer_name" defaultValue={courseStudentDisplayName(selectedCourseStudent, t)} required />
                  </label>
                  <label>
                    {t("rollNumber")}
                    <input name="roll_number" defaultValue={selectedCourseStudent.rollNumber ?? ""} required />
                  </label>
                  <label>
                    {t("startDate")}
                    <input name="start_date" type="date" defaultValue={selectedCourseStudent.subscriptionStartDate ?? ""} required />
                  </label>
                  <label>
                    {t("endDate")}
                    <input name="end_date" type="date" defaultValue={selectedCourseStudent.subscriptionEndDate ?? ""} required />
                  </label>
                  <label>
                    {t("startTime")}
                    <input name="start_time" type="time" defaultValue={selectedCourseStudent.startTime?.slice(0, 5) ?? "06:00"} required />
                  </label>
                  <label>
                    {t("endTime")}
                    <input name="end_time" type="time" defaultValue={selectedCourseStudent.endTime?.slice(0, 5) ?? "07:00"} required />
                  </label>
                  <div className="full-span flex flex-wrap gap-2">
                    <button className="primary-button" type="submit">{t("save")}</button>
                    <button className="secondary-button" type="button" onClick={() => setEditingStudent(false)}>{t("cancel")}</button>
                  </div>
                </form>
              )}

              <div className="rounded-lg bg-surface-container-low p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="font-headline text-base font-bold">{t("subscriptionHistory")}</h4>
                  <span className="text-xs text-on-surface-variant">{courseHistoryPayments.length}</span>
                </div>
                <div className="space-y-2">
                  {courseHistoryPayments.slice(0, 8).map((payment) => (
                    <div key={payment.id} className="subscription-history-row">
                      <div className="min-w-0">
                        <strong>{displayDateRange(payment.start_date, payment.end_date, t)}</strong>
                        <p>{t("timing")} {displayTimeRange(payment.start_time, payment.end_time)} · {paymentModeLabel(payment, t)}</p>
                        <p>{t("paymentDate")} {displayDate(payment.payment_date)}</p>
                      </div>
                      <div className="subscription-amount-grid">
                        <span>{t("fee")} <strong>{formatMoney(payment.fee_amount ?? payment.amount)}</strong></span>
                        <span>{t("paid")} <strong>{formatMoney(payment.paid_amount ?? payment.amount)}</strong></span>
                        <span>{t("dues")} <strong>{formatMoney(payment.dues_amount ?? 0)}</strong></span>
                        <span>{t("advance")} <strong>{formatMoney(payment.advance_amount ?? 0)}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function ActionSheet({
  actionModal,
  selectedPositive,
  selectedNegative,
  setSelectedPositive,
  setSelectedNegative,
  canUsePayment,
  owner,
  rooms,
  mainCourses,
  skillCourses,
  referrals,
  payments,
  libraryStudents,
  moneyMovementProfiles,
  settlementDate,
  agentIncentiveBalances,
  closeAction,
  setNotice,
  startTransition,
}: {
  actionModal: Exclude<ActionModal, null>;
  selectedPositive: PositiveFlow | null;
  selectedNegative: NegativeFlow | null;
  setSelectedPositive: (type: PositiveFlow | null) => void;
  setSelectedNegative: (type: NegativeFlow | null) => void;
  canUsePayment: (type: BusinessType | "expense") => boolean;
  owner: boolean;
  rooms: { id: string; room_number: string; label: string | null }[];
  mainCourses: Course[];
  skillCourses: Course[];
  referrals: Pick<ReferralCode, "code">[];
  payments: Payment[];
  libraryStudents: LibraryStudent[];
  moneyMovementProfiles: Profile[];
  settlementDate: string;
  agentIncentiveBalances: AgentIncentiveBalance[];
  closeAction: () => void;
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const { t } = useLanguage();
  const positiveOptions = paymentOptions.filter((option): option is { type: BusinessType; labelKey: string; icon: ReactNode } =>
    option.type !== "expense" && canUsePayment(option.type),
  );
  const positiveSettlementOptions = moneyMovementProfiles.length > 0
    ? [{ type: "receive_money" as const, labelKey: "receiveMoney", icon: <ArrowDown size={18} /> }]
    : [];
  const negativeOptions = [
    ...(canUsePayment("expense") ? [{ type: "expense" as const, labelKey: "expense", icon: <Banknote size={18} /> }] : []),
    ...(moneyMovementProfiles.length > 0
      ? [{ type: "send_money" as const, labelKey: "sendMoney", icon: <ArrowUp size={18} /> }]
      : []),
    ...(owner && agentIncentiveBalances.length > 0
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

        {actionModal === "positive" && selectedPositive && selectedPositive !== "receive_money" ? (
          <>
            <button className="back-link" type="button" onClick={() => setSelectedPositive(null)}>
              {t("selectAnotherType")}
            </button>
            <PaymentForm
              type={selectedPositive}
              rooms={rooms}
              mainCourses={mainCourses}
              skillCourses={skillCourses}
              referrals={referrals}
              payments={payments}
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
              profiles={moneyMovementProfiles}
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
            <ExpenseForm setNotice={setNotice} startTransition={startTransition} onSuccess={closeAction} />
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
              profiles={moneyMovementProfiles}
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
  type,
  rooms,
  mainCourses,
  skillCourses,
  referrals,
  payments,
  libraryStudents,
  initialLibraryStudent,
  setNotice,
  startTransition,
  onSuccess,
}: {
  type: BusinessType;
  rooms: { id: string; room_number: string; label: string | null }[];
  mainCourses: Course[];
  skillCourses: Course[];
  referrals: Pick<ReferralCode, "code">[];
  payments: Payment[];
  libraryStudents: LibraryStudent[];
  initialLibraryStudent?: LibraryStudent | null;
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
  onSuccess?: () => void;
}) {
  const { t } = useLanguage();
  const today = todayIso();
  const initialLibraryPrefill = type === "library" && initialLibraryStudent ? libraryStudentPrefill(initialLibraryStudent, t) : null;
  const initialLibraryRenewalRange = type === "library" && initialLibraryStudent ? libraryRenewalDateRange(initialLibraryStudent) : null;
  const initialLibraryDueAmount = type === "library" && initialLibraryStudent ? Math.max(Number(initialLibraryStudent.dues_amount ?? 0), 0) : 0;
  const defaultNewLibraryRollNumber = type === "library" ? nextLibraryRollNumber(libraryStudents) : "";
  const [libraryMemberMode, setLibraryMemberMode] = useState<LibraryMemberMode | null>(initialLibraryPrefill ? "existing" : null);
  const [fee, setFee] = useState(initialLibraryPrefill?.fee ?? "");
  const [paid, setPaid] = useState(initialLibraryDueAmount > 0 ? String(initialLibraryDueAmount) : "");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [cashCollection, setCashCollection] = useState("");
  const [onlineCollection, setOnlineCollection] = useState("");
  const [startTime, setStartTime] = useState(initialLibraryPrefill?.startTime ?? "06:00");
  const [endTime, setEndTime] = useState(initialLibraryPrefill?.endTime ?? "07:00");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedSkillCourseId, setSelectedSkillCourseId] = useState("");
  const [courseMemberMode, setCourseMemberMode] = useState<LibraryMemberMode | null>(null);
  const [courseSearch, setCourseSearch] = useState("");
  const [selectedCourseStudentId, setSelectedCourseStudentId] = useState("");
  const [librarySearch, setLibrarySearch] = useState(initialLibraryPrefill?.searchLabel ?? "");
  const [selectedLibraryStudentId, setSelectedLibraryStudentId] = useState(initialLibraryPrefill?.id ?? "");
  const [studentName, setStudentName] = useState(initialLibraryPrefill?.name ?? "");
  const [rollNumber, setRollNumber] = useState(initialLibraryPrefill?.rollNumber ?? defaultNewLibraryRollNumber);
  const [phoneNumber, setPhoneNumber] = useState(initialLibraryPrefill?.phoneNumber ?? "");
  const [address, setAddress] = useState(initialLibraryPrefill?.address ?? "");
  const [seatNumber, setSeatNumber] = useState(initialLibraryPrefill?.seatNumber ?? "");
  const [lockerNumber, setLockerNumber] = useState(initialLibraryPrefill?.lockerNumber ?? "");
  const [subscriptionStartDate, setSubscriptionStartDate] = useState(initialLibraryRenewalRange?.startDate ?? todayIso());
  const [subscriptionEndDate, setSubscriptionEndDate] = useState(initialLibraryRenewalRange?.endDate ?? addMonthsIso());
  const selectedLibraryStudent = useMemo(() => {
    if (initialLibraryStudent && initialLibraryStudent.id === selectedLibraryStudentId) return initialLibraryStudent;
    return libraryStudents.find((student) => student.id === selectedLibraryStudentId) ?? null;
  }, [initialLibraryStudent, libraryStudents, selectedLibraryStudentId]);
  const selectedMainCourse = useMemo(
    () => mainCourses.find((course) => course.id === selectedCourseId) ?? null,
    [mainCourses, selectedCourseId],
  );
  const courseNeedsSkill = selectedMainCourse?.name === "Skills";
  const selectedSkillCourse = useMemo(
    () => skillCourses.find((course) => course.id === selectedSkillCourseId) ?? null,
    [selectedSkillCourseId, skillCourses],
  );
  const selectedCourseSource = useMemo<CourseStudentRecordSource | null>(() => {
    if (courseNeedsSkill) {
      if (!selectedSkillCourse) return null;
      return {
        id: studentRecordSourceId(selectedSkillCourse),
        type: "skillCourse",
        label: `${selectedSkillCourse.name} (${t("skill")})`,
        course: selectedSkillCourse,
      };
    }

    if (!selectedMainCourse) return null;
    return {
      id: studentRecordSourceId(selectedMainCourse),
      type: "mainCourse",
      label: selectedMainCourse.name,
      course: selectedMainCourse,
    };
  }, [courseNeedsSkill, selectedMainCourse, selectedSkillCourse, t]);
  const courseStudentRecords = useMemo(
    () => selectedCourseSource ? courseStudentRecordsForSource(payments, selectedCourseSource, today) : [],
    [payments, selectedCourseSource, today],
  );
  const sortedCourseStudentRecords = useMemo(
    () => [...courseStudentRecords].sort((a, b) => compareCourseStudentRecordsByExpiry(a, b, t)),
    [courseStudentRecords, t],
  );
  const selectedCourseStudent = useMemo(
    () => sortedCourseStudentRecords.find((record) => record.id === selectedCourseStudentId) ?? null,
    [selectedCourseStudentId, sortedCourseStudentRecords],
  );
  const libraryDueAmount = type === "library" && libraryMemberMode === "existing" ? Math.max(Number(selectedLibraryStudent?.dues_amount ?? 0), 0) : 0;
  const libraryPaidAmount = type === "library" && libraryMemberMode === "existing" ? Math.max(Number(selectedLibraryStudent?.paid_amount ?? 0), 0) : 0;
  const collectingLibraryDues = type === "library" && libraryMemberMode === "existing" && Boolean(selectedLibraryStudent) && libraryDueAmount > 0;
  const feeNumber = Number(fee || 0);
  const paidNumber = Number(paid || 0);
  const amountNumber = Number(amount || 0);
  const splitCollectionNumber = Number(cashCollection || 0) + Number(onlineCollection || 0);
  const collectedNumber = mode === "mixed" ? splitCollectionNumber : paidNumber;
  const splitTotal = collectingLibraryDues ? libraryDueAmount : type === "library" || type === "course" ? feeNumber : amountNumber;
  const splitRemaining = Math.max(splitTotal - splitCollectionNumber, 0);
  const dues = collectingLibraryDues ? Math.max(libraryDueAmount - collectedNumber, 0) : Math.max(feeNumber - collectedNumber, 0);
  const advance = collectingLibraryDues ? Math.max(collectedNumber - libraryDueAmount, 0) : Math.max(collectedNumber - feeNumber, 0);
  const slotHours = Math.max((Number(endTime.slice(0, 2)) || 0) - (Number(startTime.slice(0, 2)) || 0), 0);
  const libraryMemberChoicePending = type === "library" && !initialLibraryStudent && !libraryMemberMode;
  const libraryExistingMemberPending = type === "library" && libraryMemberMode === "existing" && !selectedLibraryStudentId;
  const libraryPaymentFieldsReady = type !== "library" || (!libraryMemberChoicePending && !libraryExistingMemberPending);
  const coursePaymentFieldsReady = type !== "course" || Boolean(selectedCourseSource && courseMemberMode && (courseMemberMode !== "existing" || selectedCourseStudent));
  const paymentFieldsReady = libraryPaymentFieldsReady && coursePaymentFieldsReady;
  const searchableLibraryStudents = useMemo(() => {
    if (type !== "library") return [];
    const query = librarySearch.trim().toLowerCase();
    return libraryStudents
      .filter((student) => {
        if (student.placeholder) return false;
        if (!query) return !student.placeholder;
        return [studentDisplayRollNumber(student), studentDisplayName(student, t), student.phone_number, student.address, student.seat_number]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      })
      .slice(0, 40);
  }, [librarySearch, libraryStudents, t, type]);
  const selectedLibrarySearchLabel = selectedLibraryStudent ? libraryStudentPrefill(selectedLibraryStudent, t).searchLabel : "";
  const showLibrarySearchResults = libraryMemberMode === "existing" && (!selectedLibraryStudent || librarySearch !== selectedLibrarySearchLabel);
  const searchableCourseStudents = useMemo(() => {
    if (type !== "course" || !selectedCourseSource) return [];
    const query = courseSearch.trim().toLowerCase();
    return sortedCourseStudentRecords
      .filter((record) => {
        if (!query) return true;
        return [
          record.rollNumber,
          courseStudentDisplayName(record, t),
          record.courseName,
          record.seatNumber,
          displayTimeRange(record.startTime, record.endTime),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      })
      .slice(0, 40);
  }, [courseSearch, selectedCourseSource, sortedCourseStudentRecords, t, type]);
  const selectedCourseSearchLabel = selectedCourseStudent ? courseStudentPrefill(selectedCourseStudent, t).searchLabel : "";
  const showCourseSearchResults = courseMemberMode === "existing" && (!selectedCourseStudent || courseSearch !== selectedCourseSearchLabel);
  const duplicateLibraryRollStudent = useMemo(() => {
    if (type !== "library") return null;
    const rollKey = libraryRollKey(rollNumber);
    if (!rollKey) return null;

    return libraryStudents.find((student) => {
      if (libraryStudentRollKey(student) !== rollKey) return false;
      return !selectedLibraryStudentId || !libraryStudentMatchesSelection(student, selectedLibraryStudentId);
    }) ?? null;
  }, [libraryStudents, rollNumber, selectedLibraryStudentId, type]);
  const duplicateLibraryRollError = duplicateLibraryRollStudent ? t("rollNumberAlreadyExist") : "";
  const duplicateCourseRollStudent = useMemo(() => {
    if (type !== "course" || courseMemberMode !== "new") return null;
    const rollKey = libraryRollKey(rollNumber);
    if (!rollKey) return null;

    return courseStudentRecords.find((record) => libraryRollKey(record.rollNumber) === rollKey) ?? null;
  }, [courseMemberMode, courseStudentRecords, rollNumber, type]);
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
    setRollNumber(defaultNewLibraryRollNumber);
    setPhoneNumber("");
    setAddress("");
    setSeatNumber("");
    setLockerNumber("");
    setStartTime("06:00");
    setEndTime("07:00");
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
    setSeatNumber("");
    setLockerNumber("");
    setStartTime("06:00");
    setEndTime("07:00");
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
      setRollNumber(defaultNewLibraryRollNumber);
      setPhoneNumber("");
      setAddress("");
      setSeatNumber("");
      setLockerNumber("");
      setStartTime("06:00");
      setEndTime("07:00");
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

  function courseSourceForIds(courseId: string, skillCourseId: string): CourseStudentRecordSource | null {
    const mainCourse = mainCourses.find((course) => course.id === courseId) ?? null;
    if (!mainCourse) return null;

    if (mainCourse.name === "Skills") {
      const skillCourse = skillCourses.find((course) => course.id === skillCourseId) ?? null;
      if (!skillCourse) return null;
      return {
        id: studentRecordSourceId(skillCourse),
        type: "skillCourse",
        label: `${skillCourse.name} (${t("skill")})`,
        course: skillCourse,
      };
    }

    return {
      id: studentRecordSourceId(mainCourse),
      type: "mainCourse",
      label: mainCourse.name,
      course: mainCourse,
    };
  }

  function nextCourseRollNumberForSource(source: CourseStudentRecordSource | null) {
    if (!source) return "";
    return nextCourseRollNumber(courseStudentRecordsForSource(payments, source, today));
  }

  function resetCourseFieldsForNewStudent(source: CourseStudentRecordSource | null) {
    setSelectedCourseStudentId("");
    setCourseSearch("");
    setStudentName("");
    setRollNumber(nextCourseRollNumberForSource(source));
    setPhoneNumber("");
    setAddress("");
    setSeatNumber("");
    setLockerNumber("");
    setStartTime("06:00");
    setEndTime("07:00");
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
    setSeatNumber("");
    setLockerNumber("");
    setStartTime("06:00");
    setEndTime("07:00");
    setFee("");
    setSubscriptionStartDate(today);
    setSubscriptionEndDate(addMonthsIso());
    setPaid("");
    setCashCollection("");
    setOnlineCollection("");
    setMode("cash");
  }

  function resetCourseMemberFlow(source: CourseStudentRecordSource | null) {
    setCourseMemberMode(null);
    resetCourseFieldsForNewStudent(source);
  }

  function handleCourseChange(courseId: string) {
    setSelectedCourseId(courseId);
    setSelectedSkillCourseId("");
    resetCourseMemberFlow(courseSourceForIds(courseId, ""));
  }

  function handleSkillCourseChange(skillCourseId: string) {
    setSelectedSkillCourseId(skillCourseId);
    resetCourseMemberFlow(courseSourceForIds(selectedCourseId, skillCourseId));
  }

  function chooseCourseMemberMode(mode: LibraryMemberMode) {
    setCourseMemberMode(mode);
    if (mode === "new") {
      resetCourseFieldsForNewStudent(selectedCourseSource);
      return;
    }
    clearExistingCourseSelection();
  }

  function applyCourseStudentPrefill(record: CourseStudentRecord) {
    const values = courseStudentPrefill(record, t);
    const renewalRange = courseRenewalDateRange(record);
    setSelectedCourseStudentId(values.id);
    setStudentName(values.name);
    setRollNumber(values.rollNumber);
    setPhoneNumber("");
    setAddress("");
    setSeatNumber(values.seatNumber);
    setLockerNumber("");
    setStartTime(values.startTime);
    setEndTime(values.endTime);
    setFee(values.fee);
    setSubscriptionStartDate(renewalRange.startDate);
    setSubscriptionEndDate(renewalRange.endDate);
    setPaid("");
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
            </>
          )}
        </>
      ) : type === "library" ? (
        <>
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
                  {searchableLibraryStudents.slice(0, 8).map((student) => (
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
                  {librarySearch.trim() && searchableLibraryStudents.length === 0 ? <p>{t("noRecords")}</p> : null}
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
                      value={rollNumber}
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
                    label={t("studentPhoto")}
                    previewLabel={t("photoPreview")}
                    displayName={studentName}
                    variant="student"
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
                </>
              )}
            </>
          ) : null}
        </>
      ) : null}

      {type === "course" ? (
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
              {mainCourses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </label>
          {courseNeedsSkill ? (
            <label className="full-span">
              {t("skill")}
              <select
                name="skill_course_id"
                required
                value={selectedSkillCourseId}
                onChange={(event) => handleSkillCourseChange(event.target.value)}
              >
                <option value="">{t("selectSkill")}</option>
                {skillCourses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {selectedCourseSource ? (
            <>
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

              {courseMemberMode === "existing" ? (
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
                      {searchableCourseStudents.slice(0, 8).map((record) => {
                        const displayName = courseStudentDisplayName(record, t);
                        return (
                          <button
                            key={record.id}
                            type="button"
                            className={selectedCourseStudentId === record.id ? "selected" : ""}
                            onClick={() => selectCourseStudent(record.id)}
                          >
                            <div className="library-search-result-main">
                              <StudentAvatar displayName={displayName} className="picker" />
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
                      {courseSearch.trim() && searchableCourseStudents.length === 0 ? <p>{t("noRecords")}</p> : null}
                    </div>
                  ) : null}
                </>
              ) : null}

              {coursePaymentFieldsReady ? (
                <>
                  {courseMemberMode === "existing" && selectedCourseStudent ? (
                    <>
                      <div className="library-selected-profile with-photo full-span">
                        <StudentAvatar displayName={courseStudentDisplayName(selectedCourseStudent, t)} className="selected" />
                        <span>
                          <strong>{courseStudentDisplayName(selectedCourseStudent, t)}</strong>
                          <small>
                            #{selectedCourseStudent.rollNumber ?? "-"} · {selectedCourseStudent.courseName}
                          </small>
                        </span>
                      </div>
                      <input type="hidden" name="customer_name" value={studentName} />
                      <input type="hidden" name="roll_number" value={rollNumber} />
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
                          value={rollNumber}
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
                      </label>
                    </>
                  ) : null}
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
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      {type === "library" && libraryPaymentFieldsReady && collectingLibraryDues ? (
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
          <label>
            {t("dues")}
            <input value={dues} readOnly />
          </label>
          <label>
            {t("advance")}
            <input value={advance} readOnly />
          </label>
        </>
      ) : null}

      {(type === "course" && coursePaymentFieldsReady) || (type === "library" && libraryPaymentFieldsReady && !collectingLibraryDues) ? (
        <>
          <label>
            {t("fee")}
            <input name="fee_amount" type="number" min="0" step="1" value={fee} onChange={(event) => setFee(event.target.value)} />
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
          <label>
            {t("dues")}
            <input value={dues} readOnly />
          </label>
          <label>
            {t("advance")}
            <input value={advance} readOnly />
          </label>
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
            capture
          />
          <label className="full-span">
            {t("remark")}
            <textarea name="remark" rows={3} />
          </label>
          <button className="primary-button full-span" type="submit" disabled={Boolean(duplicateLibraryRollStudent || duplicateCourseRollStudent)}>
            {collectingLibraryDues ? t("collectDue") : t("collectPayment")}
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

function ExpenseForm({
  setNotice,
  startTransition,
  onSuccess,
}: {
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
        <select name="business_type" defaultValue="general">
          {(Object.keys(businessLabels) as BusinessType[]).map((business) => (
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
      <input type="hidden" name="settlement_date" value={settlementDate} />
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
        {t("settlementDate")}
        <input value={settlementDate} readOnly />
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
  const selectId = useId();
  const [search, setSearch] = useState("");
  const [internalSelectedProfileId, setInternalSelectedProfileId] = useState(value ?? profiles[0]?.id ?? "");
  const selectedProfileId = value ?? internalSelectedProfileId;
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleProfiles = profiles.filter((profile) => {
    if (profile.id === selectedProfileId) return true;
    if (!normalizedSearch) return true;
    const role = t(roleLabelKeys[profile.role] ?? profile.role);
    return `${profile.full_name} ${profile.email} ${role}`.toLocaleLowerCase().includes(normalizedSearch);
  });

  return (
    <div className="searchable-profile-select">
      <label htmlFor={selectId}>{label}</label>
      <span className="input-with-icon">
        <Search size={16} />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("searchUser")}
          aria-label={t("searchUser")}
        />
      </span>
      <select
        id={selectId}
        name={name}
        required
        value={selectedProfileId}
        onChange={(event) => {
          setInternalSelectedProfileId(event.target.value);
          onChange?.(event.target.value);
        }}
      >
        {includeEmptyOption ? <option value="">{t("selectUser")}</option> : null}
        {visibleProfiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.full_name} · {t(roleLabelKeys[profile.role] ?? profile.role)}
          </option>
        ))}
        {visibleProfiles.length === 0 ? <option value="" disabled>{t("noRecords")}</option> : null}
      </select>
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
  owner,
  profile,
  summaries,
  payments,
  expenses,
  movements,
  profiles,
  setNotice,
  startTransition,
}: {
  date: string;
  owner: boolean;
  profile: Profile;
  summaries: UserClosingSummary[];
  payments: Payment[];
  expenses: Expense[];
  movements: MoneyMovement[];
  profiles: Profile[];
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const { t } = useLanguage();
  const [reviewProfileId, setReviewProfileId] = useState<string | null>(null);
  const [settlementEntryAmounts, setSettlementEntryAmounts] = useState<Record<string, string>>({});
  const visibleSummaries = owner
    ? summaries.filter((summary) => summary.profile.active && summary.profile.role === "staff")
    : summaries.filter((summary) => summary.profile.id === profile.id);
  const selectedReviewSummary = reviewProfileId ? visibleSummaries.find((summary) => summary.profile.id === reviewProfileId) ?? null : null;
  const pendingReviewSummary = (summary: UserClosingSummary) => {
    const pendingPayments = payments.filter(
      (payment) =>
        paymentReviewProfileId(payment) === summary.profile.id &&
        payment.record_status === "active" &&
        belongsToClosingReview(payment.payment_date, date, payment.approval_status) &&
        isPendingReviewStatus(payment.approval_status),
    );
    const pendingExpenses = expenses.filter(
      (expense) =>
        expense.spent_by === summary.profile.id &&
        expense.record_status === "active" &&
        belongsToClosingReview(expense.expense_date, date, expense.approval_status) &&
        isPendingReviewStatus(expense.approval_status),
    );
    const pendingSettlementMovements = movements.filter(
      (movement) =>
        movement.status === "pending" &&
        movement.type === "settlement" &&
        movement.created_at.slice(0, 10) <= date &&
        (movement.from_profile_id === summary.profile.id || movement.to_profile_id === summary.profile.id),
    );

    return {
      count: pendingPayments.length + pendingExpenses.length + pendingSettlementMovements.length,
      amount:
        pendingPayments.reduce((sum, payment) => sum + numberValue(payment.amount), 0) +
        pendingExpenses.reduce((sum, expense) => sum + numberValue(expense.amount), 0) +
        pendingSettlementMovements.reduce((sum, movement) => sum + numberValue(movement.amount), 0),
    };
  };
  const overview = {
    collected: visibleSummaries.reduce((sum, summary) => sum + summary.collected, 0),
    expenses: visibleSummaries.reduce((sum, summary) => sum + summary.expenses, 0),
    received: visibleSummaries.reduce((sum, summary) => sum + summary.received, 0),
    sent: visibleSummaries.reduce((sum, summary) => sum + summary.sent, 0),
    pendingAmount: visibleSummaries.reduce((sum, summary) => sum + pendingReviewSummary(summary).amount, 0),
    pendingCount: visibleSummaries.reduce((sum, summary) => sum + pendingReviewSummary(summary).count, 0),
  };
  const overviewInCash = overview.collected + overview.received;
  const overviewInOnline = 0;
  const overviewOutCash = overview.expenses + overview.sent;

  if (selectedReviewSummary && owner) {
    return (
      <ClosingReviewDetail
        key={`${selectedReviewSummary.profile.id}-${date}`}
        summary={selectedReviewSummary}
        date={date}
        payments={payments}
        expenses={expenses}
        movements={movements}
        profiles={profiles}
        close={() => setReviewProfileId(null)}
        setNotice={setNotice}
        startTransition={startTransition}
      />
    );
  }

  return (
    <div className="view-stack closing-workspace">
      {owner ? (
        <div className="closing-overview-grid">
          <article className="closing-overview-card positive">
            <span>{t("cashIn")}</span>
            <strong>{formatMoney(overviewInCash + overviewInOnline)}</strong>
            <p className="money-split-line">{t("cash")} {formatMoney(overviewInCash)} · {t("online")} {formatMoney(overviewInOnline)}</p>
          </article>
          <article className="closing-overview-card negative">
            <span>{t("cashOut")}</span>
            <strong>{formatMoney(overviewOutCash)}</strong>
            <p className="money-split-line">{t("cash")} {formatMoney(overviewOutCash)}</p>
          </article>
          <article className="closing-overview-card pending">
            <span>{t("pending")}{overview.pendingCount > 0 ? ` · ${overview.pendingCount}` : ""}</span>
            <strong>{formatMoney(overview.pendingAmount)}</strong>
          </article>
        </div>
      ) : null}

      <section className="closing-ledger-section">
        <div className="closing-ledger-heading">
          <h2>{t("staffDailyLedger")}</h2>
          <span>{date}</span>
        </div>
        <div className="closing-user-grid">
          {visibleSummaries.map((summary) => {
            const pendingSummary = pendingReviewSummary(summary);
            const cashToReceive = Math.max(summary.closing, 0);
            const settlementEntryKey = `${date}:${summary.profile.id}`;
            const settlementEntryAmount = settlementEntryAmounts[settlementEntryKey] ?? (cashToReceive > 0 ? String(cashToReceive) : "");
            const settlementEntryNumber = numberValue(settlementEntryAmount);
            const receiveInputDisabled = pendingSummary.count > 0 || cashToReceive <= 0;
            const canReceiveCash = !receiveInputDisabled && settlementEntryNumber > 0 && settlementEntryNumber <= cashToReceive;
            return (
              <article
                className="closing-user-card"
                key={summary.profile.id}
              >
                <div className="closing-staff-head">
                  <span className="closing-avatar">{profileInitials(summary.profile)}</span>
                  <span>
                    <strong>{summary.profile.full_name}</strong>
                    <small>{t(roleLabelKeys[summary.profile.role] ?? summary.profile.role)}</small>
                  </span>
                  <span className={pendingSummary.count > 0 ? "closing-status warning" : "closing-status"}>
                    {pendingSummary.count > 0 ? `${pendingSummary.count} ${t("pending")}` : t("active")}
                  </span>
                </div>
                <div className="closing-ledger-parts">
                  <span>
                    <small>{t("openingBalance")}</small>
                    <strong>{formatMoney(summary.opening)}</strong>
                  </span>
                  <span className="positive">
                    <small>{t("cashIn")}</small>
                    <strong>{formatMoney(summary.collected + summary.received)}</strong>
                    <em>{t("cash")} {formatMoney(summary.collected + summary.received)} · {t("online")} {formatMoney(0)}</em>
                  </span>
                  <span className="negative">
                    <small>{t("cashOut")}</small>
                    <strong>{formatMoney(summary.expenses + summary.sent)}</strong>
                    <em>{t("cash")} {formatMoney(summary.expenses + summary.sent)}</em>
                  </span>
                  <span className="warning">
                    <small>{t("pending")}</small>
                    <strong>{formatMoney(pendingSummary.amount)}</strong>
                  </span>
                </div>
                <div className="closing-net-row">
                  <span>{t("netBalance")}</span>
                  <strong>{formatMoney(summary.closing)}</strong>
                </div>
                {owner ? (
                  <div className="closing-staff-actions">
                    <button className="closing-review-button" type="button" onClick={() => setReviewProfileId(summary.profile.id)}>
                      {t("reviewAndSettle")}
                    </button>
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
                        <span>{t("amountReceived")}</span>
                        <input
                          name="amount"
                          type="number"
                          min="1"
                          max={cashToReceive || undefined}
                          step="0.01"
                          value={settlementEntryAmount}
                          onChange={(event) =>
                            setSettlementEntryAmounts((current) => ({ ...current, [settlementEntryKey]: event.target.value }))
                          }
                          placeholder={cashToReceive ? String(cashToReceive) : "0"}
                          disabled={receiveInputDisabled}
                          required
                        />
                      </label>
                      <button type="submit" disabled={!canReceiveCash}>
                        <ShieldCheck size={18} />
                        {t("received")}
                      </button>
                    </form>
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
  payments,
  expenses,
  movements,
  profiles,
  close,
  setNotice,
  startTransition,
}: {
  summary: UserClosingSummary;
  date: string;
  payments: Payment[];
  expenses: Expense[];
  movements: MoneyMovement[];
  profiles: Profile[];
  close: () => void;
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const { t } = useLanguage();
  const [reviewTab, setReviewTab] = useState<"today" | "pending">("today");
  const reviewRecords = [
    ...payments
      .filter(
        (payment) =>
          paymentReviewProfileId(payment) === summary.profile.id &&
          payment.record_status === "active" &&
          belongsToClosingReview(payment.payment_date, date, payment.approval_status),
      )
      .map((payment) => ({
        id: payment.id,
        recordType: "payment" as const,
        title: paymentDisplayTitle(payment, t),
        amount: numberValue(payment.amount),
        mode: paymentModeLabel(payment, t),
        status: payment.approval_status,
        recordDate: payment.payment_date,
        isBacklog: payment.payment_date < date,
        createdAt: payment.created_at,
        businessLabel: labelForBusiness(payment.business_type, t),
        cashAmount: paymentCashAmount(payment),
        onlineAmount: paymentOnlineAmount(payment),
        note: paymentReference(payment, t),
        transferLines: transferSummaryLines(paymentTransfers(movements, payment.id), profiles, t),
        hasPendingTransfer: Boolean(pendingPaymentTransfer(movements, payment.id)),
        tone: "positive" as const,
        icon: payment.business_type === "guest_house" ? <Hotel size={22} /> : payment.business_type === "library" ? <BookOpen size={22} /> : <WalletCards size={22} />,
      })),
    ...expenses
      .filter(
        (expense) =>
          expense.spent_by === summary.profile.id &&
          expense.record_status === "active" &&
          belongsToClosingReview(expense.expense_date, date, expense.approval_status),
      )
      .map((expense) => ({
        id: expense.id,
        recordType: "expense" as const,
        title: expenseDisplayTitle(expense),
        amount: -numberValue(expense.amount),
        mode: t("cash"),
        status: expense.approval_status,
        recordDate: expense.expense_date,
        isBacklog: expense.expense_date < date,
        createdAt: expense.created_at,
        businessLabel: labelForBusiness(expense.business_type ?? "general", t),
        cashAmount: numberValue(expense.amount),
        onlineAmount: 0,
        note: expenseReference(expense, t),
        transferLines: [] as string[],
        hasPendingTransfer: false,
        tone: "negative" as const,
        icon: <ReceiptText size={22} />,
      })),
  ].sort((a, b) => a.recordDate.localeCompare(b.recordDate) || a.createdAt.localeCompare(b.createdAt));
  const todayRecords = reviewRecords.filter((record) => record.recordDate === date);
  const pendingRecords = reviewRecords.filter((record) => isPendingReviewStatus(record.status));
  const pendingSettlementMovements = movements.filter(
    (movement) =>
      movement.status === "pending" &&
      movement.type === "settlement" &&
      movement.created_at.slice(0, 10) <= date &&
      (movement.from_profile_id === summary.profile.id || movement.to_profile_id === summary.profile.id),
  );
  const pendingReviewAmount =
    pendingRecords.reduce((sum, record) => sum + Math.abs(record.amount), 0) +
    pendingSettlementMovements.reduce((sum, movement) => sum + numberValue(movement.amount), 0);
  const pendingReviewCount = pendingRecords.length + pendingSettlementMovements.length;
  const visibleReviewRecords = reviewTab === "today" ? todayRecords : pendingRecords;
  const createdTime = (createdAt: string) => createdAt.slice(11, 16);
  const reviewInCash = summary.collected + summary.received;
  const reviewInOnline = 0;
  const reviewOutCash = summary.expenses + summary.sent;

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

      <section className="review-summary-grid">
        <article className="review-net-card">
          <span>{t("netCashInHand")}</span>
          <strong>{formatMoney(summary.closing)}</strong>
        </article>
        <article className="positive">
          <span>{t("cashIn")}</span>
          <strong>{formatMoney(reviewInCash + reviewInOnline)}</strong>
          <p className="money-split-line">{t("cash")} {formatMoney(reviewInCash)} · {t("online")} {formatMoney(reviewInOnline)}</p>
        </article>
        <article className="negative">
          <span>{t("cashOut")}</span>
          <strong>{formatMoney(reviewOutCash)}</strong>
          <p className="money-split-line">{t("cash")} {formatMoney(reviewOutCash)}</p>
        </article>
        <article className="pending">
          <span>{t("pending")}{pendingReviewCount > 0 ? ` · ${pendingReviewCount}` : ""}</span>
          <strong>{formatMoney(pendingReviewAmount)}</strong>
        </article>
      </section>

      <section className="closing-info-banner">
        <AlertCircle size={20} />
        <p>{t("reviewSettlementNotice")}</p>
      </section>

      <section className="review-transaction-section">
        <div className="closing-ledger-heading">
          <h2>{reviewTab === "today" ? t("dailyTransactions") : t("pendingReview")}</h2>
          <span>{todayRecords.length} {t("today")} · {pendingRecords.length} {t("pending")}</span>
        </div>
        <div className="review-tab-strip" role="tablist" aria-label={t("reviewAndSettle")}>
          <button
            className={reviewTab === "today" ? "review-tab active" : "review-tab"}
            type="button"
            onClick={() => setReviewTab("today")}
          >
            {t("reviewToday")}
            <span>{todayRecords.length}</span>
          </button>
          <button
            className={reviewTab === "pending" ? "review-tab active" : "review-tab"}
            type="button"
            onClick={() => setReviewTab("pending")}
          >
            {t("reviewPending")}
            <span>{pendingRecords.length}</span>
          </button>
        </div>
        <div className="review-transaction-list">
          {visibleReviewRecords.length > 0 ? visibleReviewRecords.map((record) => {
            const canReview = canApproveRecordStatus(record.status);
            const recordWhen = record.isBacklog ? `${record.recordDate} · ${createdTime(record.createdAt)} · ${t("backlog")}` : createdTime(record.createdAt);
            return (
              <article className={`review-transaction-card ${record.tone}`} key={`${record.recordType}-${record.id}`}>
                <div className="review-transaction-icon">{record.icon}</div>
                <div className="review-transaction-main">
                  <strong>{record.title}</strong>
                  <p>{recordWhen} · {record.businessLabel} · {record.mode}</p>
                  <div className="pending-review-split">
                    <span>{t("cash")} {formatMoney(record.cashAmount)}</span>
                    <span>{t("online")} {formatMoney(record.onlineAmount)}</span>
                  </div>
                  <p>{record.note}</p>
                  {record.transferLines.length > 0 ? (
                    <div className="review-transfer-note">
                      {record.transferLines.map((line, index) => (
                        <span key={`${line}-${index}`}>{line}</span>
                      ))}
                    </div>
                  ) : null}
                  <span className={`status-chip status-${record.status}`}>{labelForStatus(record.status, t)}</span>
                </div>
                <strong className="review-transaction-amount">
                  {record.amount >= 0 ? "+" : "-"}{formatMoney(Math.abs(record.amount))}
                </strong>
                {canReview ? (
                  <div className="review-transaction-actions">
                    {record.recordType === "expense" ? (
                      <MiniAction
                        hidden={{ record_type: record.recordType, id: record.id, decision: "rejected" }}
                        label={t("reject")}
                        tone="reject"
                        icon={<X size={18} />}
                        action={approveRecordAction}
                        setNotice={setNotice}
                        startTransition={startTransition}
                      />
                    ) : null}
                    {record.hasPendingTransfer ? (
                      <button className="mini-action icon-mini-action tone-approve" type="button" disabled title={t("resolveTransferFirst")} aria-label={t("resolveTransferFirst")}>
                        <Check size={18} />
                      </button>
                    ) : (
                      <MiniAction
                        hidden={{ record_type: record.recordType, id: record.id, decision: "approved" }}
                        label={t("approve")}
                        tone="approve"
                        icon={<Check size={18} />}
                        action={approveRecordAction}
                        setNotice={setNotice}
                        startTransition={startTransition}
                      />
                    )}
                  </div>
                ) : null}
              </article>
            );
          }) : (
            <p className="muted">{t("noRecordsForFilter")}</p>
          )}
          {reviewTab === "pending" && pendingSettlementMovements.length > 0 ? (
            <div className="pending-context-group">
              <h3>{t("settlementLikePending")}</h3>
              {pendingSettlementMovements.map((movement) => (
                <article className="review-transaction-card neutral" key={movement.id}>
                  <div className="review-transaction-icon"><ShieldCheck size={22} /></div>
                  <div className="review-transaction-main">
                    <strong>{t("settlements")}</strong>
                    <p>{movement.created_at.slice(0, 10)} · {profileName(profiles, movement.from_profile_id === summary.profile.id ? movement.to_profile_id : movement.from_profile_id, t)}</p>
                    <p>{movement.note ?? t("noReason")}</p>
                    <span className="status-chip status-pending">{labelForStatus(movement.status, t)}</span>
                  </div>
                  <strong className="review-transaction-amount">{formatMoney(movement.amount)}</strong>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function SettingsBranch({
  title,
  subtitle,
  icon,
  defaultOpen = false,
  nested = false,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  defaultOpen?: boolean;
  nested?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      className={`settings-branch${nested ? " settings-branch-nested" : ""}`}
      open={defaultOpen}
    >
      <summary className="settings-branch-summary">
        <ChevronRight size={18} className="settings-branch-chevron" />
        <div className="settings-branch-icon">
          {icon}
        </div>
        <div className="settings-branch-copy">
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </summary>
      <div className="settings-branch-body">{children}</div>
    </details>
  );
}

function ProfileSettingsPanel({
  profile,
  setNotice,
  startTransition,
}: {
  profile: Profile;
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const { t } = useLanguage();

  return (
    <section className="bg-surface-container-lowest p-6 rounded-xl shadow-soft border border-outline-variant/10">
      <div className="flex items-start gap-4">
        <img
          alt="User profile"
          className="size-16 rounded-full object-cover shadow-sm border border-outline-variant/30"
          src={getProfileImage(profile.full_name, profile.avatar_url)}
        />
        <div className="min-w-0">
          <h2 className="font-headline text-xl font-bold text-primary">Profile</h2>
          <p className="text-sm text-on-surface-variant truncate">{profile.email}</p>
        </div>
      </div>

      <form
        className="form-grid two mt-5"
        onSubmit={(event) => submitWith(event, updateProfileAction, setNotice, startTransition, false)}
      >
        <label className="text-xs text-on-surface-variant font-bold">
          {t("fullName")}
          <input
            name="full_name"
            defaultValue={profile.full_name}
            required
            className="w-full mt-1 p-2 rounded-lg border border-outline-variant bg-surface"
          />
        </label>
        <label className="text-xs text-on-surface-variant font-bold">
          {t("photo")}
          <input
            name="photo"
            type="file"
            accept="image/*"
            className="w-full mt-1 p-2 rounded-lg border border-outline-variant bg-surface"
          />
        </label>
        <div className="full-span flex justify-end">
          <button type="submit" className="px-4 py-2 text-xs font-bold bg-primary text-on-primary rounded-lg border-0 cursor-pointer">
            {t("save")}
          </button>
        </div>
      </form>
    </section>
  );
}

function SettingsView({
  owner,
  profile,
  profiles,
  rooms,
  courses,
  referrals,
  salesAgents,
  changeRequests,
  permissionsByProfile,
  setNotice,
  startTransition,
}: {
  owner: boolean;
  profile: Profile;
  profiles: Profile[];
  rooms: { id: string; room_number: string; label: string | null; active: boolean }[];
  courses: Course[];
  referrals: ReferralCode[];
  salesAgents: Profile[];
  changeRequests: { id: string; record_type: string; request_type: string; reason: string | null; status: string; requested_by: string }[];
  permissionsByProfile: Record<string, string[]>;
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const { language, setLanguage, t } = useLanguage();
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [showAddReferral, setShowAddReferral] = useState(false);
  const [newUserRole, setNewUserRole] = useState<AppRole>("staff");
  const activeRoomsCount = rooms.filter((room) => room.active).length;
  const activeCoursesCount = courses.filter((course) => course.active).length;
  const activeReferralCount = referrals.filter((referral) => referral.active).length;

  if (!owner) {
    return (
      <div className="space-y-6 max-w-xl">
        <ProfileSettingsPanel profile={profile} setNotice={setNotice} startTransition={startTransition} />
        <section className="bg-surface-container-lowest p-6 rounded-xl shadow-soft border border-outline-variant/10">
          <h2 className="font-headline text-xl font-bold text-primary mb-4">{t("languageSettings")}</h2>
          <div className="flex gap-4">
            <button
              className={`flex-1 py-3 px-4 rounded-lg font-bold transition-all cursor-pointer border-0 ${language === "en" ? "bg-primary text-on-primary" : "bg-surface-container-low text-on-surface-variant hover:bg-surface-variant/50"}`}
              type="button"
              onClick={() => setLanguage("en")}
            >
              English
            </button>
            <button
              className={`flex-1 py-3 px-4 rounded-lg font-bold transition-all cursor-pointer border-0 ${language === "hi" ? "bg-primary text-on-primary" : "bg-surface-container-low text-on-surface-variant hover:bg-surface-variant/50"}`}
              type="button"
              onClick={() => setLanguage("hi")}
            >
              हिंदी
            </button>
          </div>
        </section>
        <section className="bg-surface-container-lowest p-6 rounded-xl shadow-soft border border-outline-variant/10 text-center">
          <p className="text-on-surface-variant font-medium">{t("adminOnlySettings")}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-4">
      <ProfileSettingsPanel profile={profile} setNotice={setNotice} startTransition={startTransition} />

      <SettingsBranch
        title="Business setup"
        subtitle={`${activeRoomsCount} rooms, ${activeCoursesCount} courses, ${activeReferralCount} coupons`}
        icon={<Settings size={20} />}
        defaultOpen
      >
        <div className="space-y-4">
          <SettingsBranch
            title={t("rooms")}
            subtitle={`${rooms.length} total`}
            icon={<Hotel size={20} />}
            nested
            defaultOpen
          >
            <div className="overflow-hidden rounded-lg border border-outline-variant/30 divide-y divide-outline-variant/20">
              {rooms.map((room) => (
                <div key={room.id} className="flex items-center justify-between gap-3 p-4 hover:bg-surface-container-low/50 transition-colors">
                  <div className="min-w-0">
                    <span className="font-body font-semibold text-on-surface">{room.label ?? room.room_number}</span>
                    {room.label ? <p className="text-xs text-on-surface-variant">{room.room_number}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`font-label text-xs ${room.active ? "text-primary bg-primary-fixed/30" : "text-secondary bg-secondary-fixed/50"} px-2.5 py-1 rounded-md font-bold`}>
                      {room.active ? t("active") : t("hidden")}
                    </span>
                    <form
                      onSubmit={(event) => submitWith(event, deleteRoomAction, setNotice, startTransition, false)}
                    >
                      <input type="hidden" name="id" value={room.id} />
                      <button
                        type="submit"
                        aria-label={`Delete ${room.label ?? room.room_number}`}
                        className="grid size-9 place-items-center rounded-lg border border-error/20 bg-transparent text-error hover:bg-error-container/50 cursor-pointer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </form>
                  </div>
                </div>
              ))}
              {rooms.length === 0 ? <p className="p-4 text-sm text-on-surface-variant">{t("noRecordsForFilter")}</p> : null}
            </div>

            {showAddRoom ? (
              <form className="mt-4 form-grid two rounded-lg bg-surface-container-low/30 p-4" onSubmit={(event) => {
                submitWith(event, saveRoomAction, setNotice, startTransition);
                setShowAddRoom(false);
              }}>
                <label className="text-xs text-on-surface-variant font-bold">
                  {t("roomNo")}
                  <input name="room_number" required className="w-full mt-1 p-2 rounded-lg border border-outline-variant bg-surface" />
                </label>
                <label className="text-xs text-on-surface-variant font-bold">
                  {t("label")}
                  <input name="label" className="w-full mt-1 p-2 rounded-lg border border-outline-variant bg-surface" />
                </label>
                <div className="full-span flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowAddRoom(false)} className="px-4 py-2 text-xs font-bold text-on-surface-variant hover:bg-surface-variant rounded-lg border-0 cursor-pointer">
                    Cancel
                  </button>
                  <button type="submit" className="px-4 py-2 text-xs font-bold bg-primary text-on-primary rounded-lg border-0 cursor-pointer">
                    {t("save")}
                  </button>
                </div>
              </form>
            ) : (
              <button onClick={() => setShowAddRoom(true)} className="mt-4 w-full py-3 font-body text-primary font-bold hover:bg-primary-container/20 transition-colors flex items-center justify-center gap-2 border border-dashed border-primary/30 rounded-lg bg-transparent cursor-pointer">
                <Plus size={16} />
                {t("addRoom")}
              </button>
            )}
          </SettingsBranch>

          <SettingsBranch
            title={t("courses")}
            subtitle={`${courses.length} total`}
            icon={<GraduationCap size={20} />}
            nested
          >
            <div className="overflow-hidden rounded-lg border border-outline-variant/30 divide-y divide-outline-variant/20">
              {courses.map((course) => (
                <div key={course.id} className="flex items-center justify-between gap-3 p-4 hover:bg-surface-container-low/50 transition-colors">
                  <span className="min-w-0 font-body font-semibold text-on-surface">{course.name}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`font-label text-xs ${course.kind === "main" ? "text-primary bg-primary-fixed/30" : "text-secondary bg-secondary-fixed/50"} px-2.5 py-1 rounded-md font-bold uppercase`}>
                      {t(course.kind)}
                    </span>
                    <form
                      onSubmit={(event) => submitWith(event, deleteCourseAction, setNotice, startTransition, false)}
                    >
                      <input type="hidden" name="id" value={course.id} />
                      <button
                        type="submit"
                        aria-label={`Delete ${course.name}`}
                        className="grid size-9 place-items-center rounded-lg border border-error/20 bg-transparent text-error hover:bg-error-container/50 cursor-pointer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </form>
                  </div>
                </div>
              ))}
              {courses.length === 0 ? <p className="p-4 text-sm text-on-surface-variant">{t("noRecordsForFilter")}</p> : null}
            </div>

            {showAddCourse ? (
              <form className="mt-4 form-grid two rounded-lg bg-surface-container-low/30 p-4" onSubmit={(event) => {
                submitWith(event, saveCourseAction, setNotice, startTransition);
                setShowAddCourse(false);
              }}>
                <label className="text-xs text-on-surface-variant font-bold">
                  {t("courseName")}
                  <input name="name" required className="w-full mt-1 p-2 rounded-lg border border-outline-variant bg-surface" />
                </label>
                <label className="text-xs text-on-surface-variant font-bold">
                  Type
                  <select name="kind" className="w-full mt-1 p-2 rounded-lg border border-outline-variant bg-surface">
                    <option value="main">{t("main")}</option>
                    <option value="skill">{t("skill")}</option>
                  </select>
                </label>
                <div className="full-span flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowAddCourse(false)} className="px-4 py-2 text-xs font-bold text-on-surface-variant hover:bg-surface-variant rounded-lg border-0 cursor-pointer">
                    Cancel
                  </button>
                  <button type="submit" className="px-4 py-2 text-xs font-bold bg-primary text-on-primary rounded-lg border-0 cursor-pointer">
                    {t("save")}
                  </button>
                </div>
              </form>
            ) : (
              <button onClick={() => setShowAddCourse(true)} className="mt-4 w-full py-3 font-body text-primary font-bold hover:bg-primary-container/20 transition-colors flex items-center justify-center gap-2 border border-dashed border-primary/30 rounded-lg bg-transparent cursor-pointer">
                <Plus size={16} />
                {t("addCourse")}
              </button>
            )}
          </SettingsBranch>

          <SettingsBranch
            title="Coupons"
            subtitle={`${referrals.length} total`}
            icon={<ReceiptText size={20} />}
            nested
          >
            <div className="overflow-hidden rounded-lg border border-outline-variant/30 divide-y divide-outline-variant/20">
              {referrals.map((referral) => (
                <div key={referral.id} className="flex items-center justify-between gap-3 p-4 hover:bg-surface-container-low/50 transition-colors">
                  <div className="min-w-0">
                    <span className="font-body font-bold text-on-surface">{referral.code}</span>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      {referral.agent_id ? profileName(profiles, referral.agent_id, t) : t("noAgent")}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-1">
                      {referral.discount_type === "percentage" ? `${referral.discount_value}%` : formatMoney(referral.discount_value)} Discount / {referral.incentive_type === "percentage" ? `${referral.incentive_value}%` : formatMoney(referral.incentive_value)} Incentive
                    </p>
                  </div>
                  <form
                    className="shrink-0"
                    onSubmit={(event) => submitWith(event, deleteReferralAction, setNotice, startTransition, false)}
                  >
                    <input type="hidden" name="id" value={referral.id} />
                    <button
                      type="submit"
                      aria-label={`Delete ${referral.code}`}
                      className="grid size-9 place-items-center rounded-lg border border-error/20 bg-transparent text-error hover:bg-error-container/50 cursor-pointer"
                    >
                      <Trash2 size={16} />
                    </button>
                  </form>
                </div>
              ))}
              {referrals.length === 0 ? <p className="p-4 text-sm text-on-surface-variant">{t("noRecordsForFilter")}</p> : null}
            </div>

            {showAddReferral ? (
              <form className="mt-4 form-grid two rounded-lg bg-surface-container-low/30 p-4" onSubmit={(event) => {
                submitWith(event, saveReferralAction, setNotice, startTransition);
                setShowAddReferral(false);
              }}>
                <label className="text-xs text-on-surface-variant font-bold">
                  {t("code")}
                  <input name="code" required className="w-full mt-1 p-2 rounded-lg border border-outline-variant bg-surface" />
                </label>
                <label className="text-xs text-on-surface-variant font-bold">
                  Agent
                  <select name="agent_id" className="w-full mt-1 p-2 rounded-lg border border-outline-variant bg-surface">
                    <option value="">{t("noAgent")}</option>
                    {salesAgents.map((agent) => (
                      <option key={agent.id} value={agent.id}>{agent.full_name}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-on-surface-variant font-bold">
                  {t("discountType")}
                  <select name="discount_type" className="w-full mt-1 p-2 rounded-lg border border-outline-variant bg-surface">
                    <option value="amount">{t("discountAmount")}</option>
                    <option value="percentage">{t("discountPercent")}</option>
                  </select>
                </label>
                <label className="text-xs text-on-surface-variant font-bold">
                  Discount Value
                  <input name="discount_value" type="number" min="0" step="0.01" required className="w-full mt-1 p-2 rounded-lg border border-outline-variant bg-surface" />
                </label>
                <label className="text-xs text-on-surface-variant font-bold">
                  {t("incentiveType")}
                  <select name="incentive_type" className="w-full mt-1 p-2 rounded-lg border border-outline-variant bg-surface">
                    <option value="amount">{t("incentiveAmount")}</option>
                    <option value="percentage">{t("incentivePercent")}</option>
                  </select>
                </label>
                <label className="text-xs text-on-surface-variant font-bold">
                  Incentive Value
                  <input name="incentive_value" type="number" min="0" step="0.01" required className="w-full mt-1 p-2 rounded-lg border border-outline-variant bg-surface" />
                </label>
                <div className="full-span flex gap-2 justify-end mt-2">
                  <button type="button" onClick={() => setShowAddReferral(false)} className="px-4 py-2 text-xs font-bold text-on-surface-variant hover:bg-surface-variant rounded-lg border-0 cursor-pointer">
                    Cancel
                  </button>
                  <button type="submit" className="px-4 py-2 text-xs font-bold bg-primary text-on-primary rounded-lg border-0 cursor-pointer">
                    {t("save")}
                  </button>
                </div>
              </form>
            ) : (
              <button onClick={() => setShowAddReferral(true)} className="mt-4 w-full py-3 font-body text-primary font-bold hover:bg-primary-container/20 transition-colors flex items-center justify-center gap-2 border border-dashed border-primary/30 rounded-lg bg-transparent cursor-pointer">
                <Plus size={16} />
                Add coupon
              </button>
            )}
          </SettingsBranch>
        </div>
      </SettingsBranch>

      <SettingsBranch
        title="Users"
        subtitle={`${profiles.length} accounts`}
        icon={<UserPlus size={20} />}
      >
        <div className="space-y-6">
          <section>
            <h2 className="font-headline text-xl font-bold text-primary mb-4">{t("addStaff")}</h2>
            <form
              className="form-grid three"
              onSubmit={(event) => submitWith(event, createStaffAction, setNotice, startTransition)}
            >
              <label className="text-xs text-on-surface-variant font-bold">
                {t("fullName")}
                <input name="full_name" required className="w-full mt-1 p-2 rounded-lg border border-outline-variant bg-surface" />
              </label>
              <label className="text-xs text-on-surface-variant font-bold">
                {t("email")}
                <input name="email" type="email" required className="w-full mt-1 p-2 rounded-lg border border-outline-variant bg-surface" />
              </label>
              <label className="text-xs text-on-surface-variant font-bold">
                {t("password")}
                <input name="password" type="password" minLength={8} required className="w-full mt-1 p-2 rounded-lg border border-outline-variant bg-surface" />
              </label>
              <label className="text-xs text-on-surface-variant font-bold">
                {t("role")}
                <select
                  name="role"
                  value={newUserRole}
                  onChange={(event) => setNewUserRole(event.target.value as AppRole)}
                  className="w-full mt-1 p-2 rounded-lg border border-outline-variant bg-surface"
                >
                  <option value="staff">{t("staff")}</option>
                  <option value="sales_agent">{t("salesAgent")}</option>
                  <option value="owner">{t("owner")}</option>
                  <option value="admin">{t("admin")}</option>
                </select>
              </label>
              {newUserRole === "staff" ? (
                <div className="checkbox-grid full-span p-4 bg-surface rounded-lg border border-outline-variant/30 space-y-2 mt-2">
                  <span className="block text-xs text-on-surface-variant font-bold mb-2">Permissions</span>
                  {permissionOptions.map((permission) => (
                    <label key={permission.value} className="flex items-center gap-2 cursor-pointer font-medium text-sm text-on-surface">
                      <input name="permissions" type="checkbox" value={permission.value} className="rounded border-outline text-primary focus:ring-primary" />
                      {t(permissionLabelKeys[permission.value] ?? permission.label)}
                    </label>
                  ))}
                </div>
              ) : null}
              <button className="primary-button full-span cursor-pointer py-3" type="submit">
                {t("createAccount")}
              </button>
            </form>
          </section>

          <section>
            <h2 className="font-headline text-xl font-bold text-primary mb-4">{t("allAccounts")}</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {profiles.map((item) => (
                <article
                  className="p-4 bg-surface rounded-xl border border-outline-variant/30 flex flex-col gap-4"
                  key={item.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <strong className="text-on-surface text-base block truncate">{item.full_name}</strong>
                      <span className="text-xs text-on-surface-variant block truncate">{item.email}</span>
                      <span className="text-xs text-on-surface-variant uppercase font-bold tracking-wider">
                        {t(roleLabelKeys[item.role] ?? item.role)}
                      </span>
                    </div>
                    <span className={`status-chip ${item.active ? "status-approved" : "status-rejected"} shrink-0`}>
                      {item.active ? t("active") : t("inactive")}
                    </span>
                  </div>

                  <form
                    className="grid gap-2"
                    onSubmit={(event) => submitWith(event, changeUserPasswordAction, setNotice, startTransition)}
                  >
                    <input type="hidden" name="profile_id" value={item.id} />
                    <label className="text-xs text-on-surface-variant font-bold">
                      {t("newPassword")}
                      <input
                        name="new_password"
                        type="password"
                        minLength={8}
                        required
                        disabled={!item.active}
                        className="w-full mt-1 p-2 rounded-lg border border-outline-variant bg-surface"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={!item.active}
                      className="py-2 bg-primary-container text-on-primary-container font-bold rounded-lg hover:bg-primary-container/80 transition-colors border-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 text-sm"
                    >
                      {t("changePassword")}
                    </button>
                  </form>

                  <form
                    onSubmit={(event) => {
                      if (!window.confirm(`Delete ${item.full_name}? This will deactivate the account when history must be preserved.`)) {
                        event.preventDefault();
                        return;
                      }
                      submitWith(event, deleteUserAction, setNotice, startTransition, false);
                    }}
                  >
                    <input type="hidden" name="profile_id" value={item.id} />
                    <button
                      type="submit"
                      disabled={item.id === profile.id}
                      className="w-full py-2 border border-error/30 bg-transparent text-error font-bold rounded-lg hover:bg-error-container/50 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                    >
                      <Trash2 size={16} />
                      {t("deleteUser")}
                    </button>
                  </form>
                </article>
              ))}
            </div>
          </section>

          <section>
            <h2 className="font-headline text-xl font-bold text-primary mb-4">{t("staffPermissions")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {profiles.filter((item) => item.role === "staff").map((item) => (
                <form
                  className="p-4 bg-surface rounded-xl border border-outline-variant/30 flex flex-col gap-3 justify-between"
                  key={item.id}
                  onSubmit={(event) => submitWith(event, saveStaffPermissionsAction, setNotice, startTransition, false)}
                >
                  <input type="hidden" name="profile_id" value={item.id} />
                  <div>
                    <strong className="text-on-surface text-base block">{item.full_name}</strong>
                    <span className="text-xs text-on-surface-variant uppercase font-bold tracking-wider">{t(roleLabelKeys[item.role] ?? item.role)}</span>
                  </div>
                  <div className="space-y-2 border-t border-outline-variant/10 pt-3">
                    {permissionOptions.map((permission) => (
                      <label key={permission.value} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input
                          name="permissions"
                          type="checkbox"
                          value={permission.value}
                          defaultChecked={permissionsByProfile[item.id]?.includes(permission.value)}
                          className="rounded border-outline text-primary focus:ring-primary"
                        />
                        {t(permissionLabelKeys[permission.value] ?? permission.label)}
                      </label>
                    ))}
                  </div>
                  <button type="submit" className="mt-2 py-2 bg-primary-container text-on-primary-container font-bold rounded-lg hover:bg-primary-container/80 transition-colors border-0 cursor-pointer text-sm">
                    {t("save")}
                  </button>
                </form>
              ))}
            </div>
          </section>
        </div>
      </SettingsBranch>

      <SettingsBranch
        title="Security"
        subtitle={`${changeRequests.length} change requests`}
        icon={<ShieldCheck size={20} />}
      >
        <div className="space-y-4">
          {changeRequests.map((request) => (
            <article className="p-4 bg-surface rounded-xl border border-outline-variant/30 flex justify-between items-center gap-4" key={request.id}>
              <div>
                <strong className="text-on-surface text-base block capitalize">
                  {request.request_type} {request.record_type}
                </strong>
                <p className="text-xs text-on-surface-variant mt-1">
                  {profileName(profiles, request.requested_by, t)} · <span className={`status-chip status-${request.status}`}>{labelForStatus(request.status, t)}</span> · {request.reason ?? t("noReason")}
                </p>
              </div>
              {request.status === "pending" ? (
                <div className="flex gap-2 flex-shrink-0">
                  <MiniAction
                    hidden={{ request_id: request.id, decision: "accepted" }}
                    label={t("approve")}
                    tone="approve"
                    action={reviewChangeRequestAction}
                    setNotice={setNotice}
                    startTransition={startTransition}
                  />
                  <MiniAction
                    hidden={{ request_id: request.id, decision: "rejected" }}
                    label={t("reject")}
                    tone="reject"
                    action={reviewChangeRequestAction}
                    setNotice={setNotice}
                    startTransition={startTransition}
                  />
                </div>
              ) : null}
            </article>
          ))}
          {changeRequests.length === 0 && (
            <p className="text-on-surface-variant text-center py-6">{t("noRecordsForFilter")}</p>
          )}
        </div>
      </SettingsBranch>

      <SettingsBranch
        title={t("languageSettings")}
        subtitle={language === "en" ? "English (US)" : "हिंदी (Hindi)"}
        icon={<Settings size={20} />}
      >
        <p className="text-on-surface-variant text-sm mb-4">{t("languageHelp")}</p>
        <div className="flex gap-4">
          <button
            className={`flex-1 py-4 px-4 rounded-xl font-bold transition-all cursor-pointer border-0 ${language === "en" ? "bg-primary text-on-primary shadow-md" : "bg-surface text-on-surface-variant hover:bg-surface-container-low"}`}
            type="button"
            onClick={() => setLanguage("en")}
          >
            English (US)
          </button>
          <button
            className={`flex-1 py-4 px-4 rounded-xl font-bold transition-all cursor-pointer border-0 ${language === "hi" ? "bg-primary text-on-primary shadow-md" : "bg-surface text-on-surface-variant hover:bg-surface-container-low"}`}
            type="button"
            onClick={() => setLanguage("hi")}
          >
            हिंदी (Hindi)
          </button>
        </div>
      </SettingsBranch>
    </div>
  );
}
