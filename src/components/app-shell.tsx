"use client";

import { createContext, FormEvent, ReactNode, useCallback, useContext, useEffect, useMemo, useState, useTransition } from "react";
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
  Info,
  Landmark,
  LogOut,
  Menu,
  Minus,
  MoreHorizontal,
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
  deleteCourseAction,
  deleteReferralAction,
  deleteRoomAction,
  logoutAction,
  markNotificationsReadAction,
  reviewChangeRequestAction,
  requestPaymentTransferAction,
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
import type { AgentSettlement, AppData, AppNotification, AppRole, BootstrapPayload, BusinessType, Course, DashboardPayload, Expense, LedgerEntry, LibraryStudent, LibraryStudentSubscriptionEvent, MoneyMovement, Payment, PaymentMode, Profile, ReferralCode } from "@/lib/types";
import { rangeForPreset, type AppTab, type AppViewState, type DateRangePreset, type DateRangeState, type TransactionFilter } from "@/lib/view-state";

type Tab = AppTab;
type Language = "en" | "hi";
type ActionResult = { ok: true; message?: string } | { ok: false; message: string };
type ToastNotice = ActionResult & { id: string };
type ActionModal = "positive" | "negative" | null;
type PositiveFlow = BusinessType | "receive_money";
type NegativeFlow = "expense" | "send_money" | "agent_settlement";
type SettlementDirection = "received_from_user" | "sent_to_user";
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
    allStaff: "All Staff",
    allTypes: "All types",
    advance: "Advance",
    agent: "Agent",
    agentAccessNote: "Read-only incentive access",
    agentCode: "Agent code",
    agentPayout: "Agent Incentive",
    agentPayoutLower: "Agent incentive",
    amount: "Amount",
    approve: "Approve",
    back: "Back",
    backlog: "Backlog",
    balanceIncentive: "Yet to settle",
    business: "Business",
    cancelWrongEntry: "Cancel wrong entry",
    cash: "Cash",
    cashAndOnline: "Cash and online",
    cashBalances: "Cash balances",
    cashCollection: "Cash collection",
    cashIn: "Cash in",
    cashInCollected: "Cash in (+)",
    cashOut: "Cash out",
    cashOutExpenses: "Out (-)",
    cashWithStaff: "Cash with staff",
    currentHolder: "Current holder",
    changeRequests: "Change requests",
    closing: "Closing",
    closingBalance: "Closing balance",
    closingCash: "Closing cash",
    code: "Code",
    closeNavigation: "Close navigation",
    closeModal: "Close modal",
    collectPayment: "Collect payment",
    collectMoney: "Collect money",
    collections: "Collections",
    collected: "Collected",
    copyReferralCode: "Copy code",
    confirmReceived: "Confirm received",
    confirmedPayouts: "Settled incentive",
    collectedByStaff: "Collected payment",
    businessStatus: "Business status",
    businessStatusHelp: "Collection, expenses, settlement, and pending review by business.",
    cashImpact: "Cash impact",
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
    deleted: "Deleted",
    description: "Description",
    direction: "Direction",
    discount: "Discount",
    discountAmount: "Discount amount",
    discountPercent: "Discount %",
    discountType: "Discount type",
    dues: "Dues",
    email: "Email",
    endDate: "End date",
    endTime: "End time",
    editTransaction: "Edit",
    expense: "Expense",
    expenseDate: "Expense date",
    expenses: "Expenses",
    exportCsv: "Export CSV",
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
    incentivePercent: "Incentive %",
    incentiveType: "Incentive type",
    label: "Label",
    language: "Language",
    languageHelp: "Choose the language used in this app.",
    languageSettings: "Language setting",
    ledger: "Ledger",
    ledgerEntry: "Ledger entry",
    library: "Library",
    libraryStudent: "Library student",
    libraryStudents: "Library Students",
    studentDetails: "Student details",
    studentRecords: "Student records",
    studentSearch: "Search student",
    activeStudents: "Active students",
    inactiveStudents: "Inactive students",
    expiredSubscription: "Expired subscription",
    expiresOn: "Expires on",
    lastPayment: "Last payment",
    lockerNumber: "Locker number",
    markInactive: "Mark inactive",
    reactivate: "Reactivate",
    newStudent: "New student",
    selectStudent: "Select student",
    subscription: "Subscription",
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
    openNavigation: "Open navigation",
    openingCash: "Opening cash",
    openingBalance: "Opening balance",
    openingCashBalance: "Opening",
    optional: "Optional",
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
    pendingPayout: "Pending payout",
    pendingReview: "Pending review",
    photo: "Photo",
    phone: "Phone",
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
    reviewAndSettle: "Review & Settle",
    reviewToday: "Today",
    reviewPending: "Pending",
    reviewPendingFirst: "Review pending first",
    reviewSettlementNotice: "Only approved transactions will be locked and settled. Post-approval, only the owner can edit records. Please review carefully.",
    role: "Role",
    roll: "Roll",
    rollNumber: "Roll number",
    room: "Room",
    roomBooking: "Room Booking",
    roomNo: "Room no.",
    rooms: "Rooms",
    salesAgent: "Sales agent",
    save: "Save",
    saving: "Saving...",
    select: "Select",
    selectAgent: "Select agent",
    selectAnotherType: "Select another type",
    selectCourse: "Select course",
    selectRoom: "Select room",
    selectSkill: "Select skill",
    selectStaff: "Select staff",
    selectUser: "Select user",
    sendPayout: "Mark incentive settled",
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
    settlementDate: "Settlement date",
    settlementHistory: "Settlement history",
    settlements: "Settlements",
    shikshanSansthan: "Shikshan Sansthan",
    skill: "Skill",
    slotHours: "Slot hours",
    staff: "Staff",
    staffDailyLedger: "Staff Daily Ledger",
    staffPermissions: "Staff permissions",
    startDate: "Start date",
    startTime: "Start time",
    status: "Status",
    to: "to",
    toEmployee: "To employee",
    today: "Today",
    totalClosing: "Total closing",
    totalCollected: "Total collected",
    totalExpenses: "Total expenses",
    totalIn: "Total In",
    totalOut: "Total Out",
    totalCollection: "Total collection",
    ownerAccountCredit: "Owner account credit",
    totalOpening: "Total opening",
    transferCash: "Transfer cash",
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
    allStaff: "सारा स्टाफ",
    allTypes: "सब तरह",
    advance: "अधिक जमा",
    agent: "एजेंट",
    agentAccessNote: "सिर्फ कमिशन देखने का अधिकार",
    agentCode: "एजेंट कोड",
    agentPayout: "एजेंट कमिशन",
    agentPayoutLower: "एजेंट कमिशन",
    amount: "रकम",
    approve: "ठीक है",
    back: "वापस",
    backlog: "बैकलॉग",
    balanceIncentive: "सेटल होना बाकी",
    business: "काम",
    cancelWrongEntry: "गलत एंट्री हटाएं",
    cash: "नकद",
    cashAndOnline: "नकद और ऑनलाइन",
    cashBalances: "नकद बाकी",
    cashCollection: "नकद जमा",
    cashIn: "नकद आया",
    cashInCollected: "नकद आया (+)",
    cashOut: "नकद गया",
    cashOutExpenses: "गया (-)",
    cashWithStaff: "स्टाफ के पास नकद",
    currentHolder: "मौजूदा होल्डर",
    changeRequests: "बदलाव की मांग",
    closing: "दिन बंद",
    closingBalance: "बंद हिसाब",
    closingCash: "दिन के अंत का नकद",
    code: "कोड",
    closeNavigation: "मेनू बंद करें",
    closeModal: "बंद करें",
    collectPayment: "पैसा जमा करें",
    collectMoney: "पैसा लें",
    collections: "कलेक्शन",
    collected: "जमा",
    copyReferralCode: "कोड कॉपी करें",
    confirmReceived: "मिल गया",
    confirmedPayouts: "सेटल कमिशन",
    collectedByStaff: "जमा पैसा",
    businessStatus: "काम का स्टेटस",
    businessStatusHelp: "काम के हिसाब से जमा, खर्च, सेटलमेंट और बाकी जांच।",
    cashImpact: "नकद असर",
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
    deleted: "हटाए गए",
    description: "जानकारी",
    direction: "किस तरफ",
    discount: "छूट",
    discountAmount: "छूट रकम",
    discountPercent: "छूट %",
    discountType: "छूट प्रकार",
    dues: "बाकी",
    email: "ईमेल",
    endDate: "खत्म तारीख",
    endTime: "खत्म समय",
    editTransaction: "बदलें",
    expense: "खर्च",
    expenseDate: "खर्च तारीख",
    expenses: "खर्च",
    exportCsv: "CSV निकालें",
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
    incentivePercent: "कमिशन %",
    incentiveType: "कमिशन प्रकार",
    label: "लेबल",
    language: "भाषा",
    languageHelp: "ऐप में कौन सी भाषा दिखेगी।",
    languageSettings: "भाषा सेटिंग",
    ledger: "हिसाब",
    ledgerEntry: "हिसाब एंट्री",
    library: "लाइब्रेरी",
    libraryStudent: "लाइब्रेरी छात्र",
    libraryStudents: "लाइब्रेरी छात्र",
    studentDetails: "छात्र जानकारी",
    studentRecords: "छात्र रिकॉर्ड",
    studentSearch: "छात्र खोजें",
    activeStudents: "चालू छात्र",
    inactiveStudents: "बंद छात्र",
    expiredSubscription: "सब्सक्रिप्शन खत्म",
    expiresOn: "खत्म तारीख",
    lastPayment: "आखिरी भुगतान",
    lockerNumber: "लॉकर नंबर",
    markInactive: "बंद करें",
    reactivate: "फिर चालू करें",
    newStudent: "नया छात्र",
    selectStudent: "छात्र चुनें",
    subscription: "सब्सक्रिप्शन",
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
    openNavigation: "मेनू खोलें",
    openingCash: "शुरू का नकद",
    openingBalance: "शुरू हिसाब",
    openingCashBalance: "शुरू",
    optional: "जरूरी नहीं",
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
    pendingPayout: "बाकी भुगतान",
    pendingReview: "बाकी जांच",
    photo: "फोटो",
    phone: "फोन",
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
    reviewAndSettle: "जांचें और जमा करें",
    reviewToday: "आज",
    reviewPending: "बाकी",
    reviewPendingFirst: "पहले बाकी जांचें",
    reviewSettlementNotice: "सिर्फ मंजूर एंट्री लॉक और सेटल होंगी। मंजूरी के बाद सिर्फ मालिक रिकॉर्ड बदल सकता है। ध्यान से जांचें।",
    role: "काम",
    roll: "रोल",
    rollNumber: "रोल नंबर",
    room: "कमरा",
    roomBooking: "कमरा बुकिंग",
    roomNo: "कमरा नं.",
    rooms: "कमरे",
    salesAgent: "सेल्स एजेंट",
    save: "सेव",
    saving: "सेव हो रहा है...",
    select: "चुनें",
    selectAgent: "एजेंट चुनें",
    selectAnotherType: "दूसरा प्रकार चुनें",
    selectCourse: "कोर्स चुनें",
    selectRoom: "कमरा चुनें",
    selectSkill: "स्किल चुनें",
    selectStaff: "स्टाफ चुनें",
    selectUser: "यूजर चुनें",
    sendPayout: "कमिशन सेटल करें",
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
    settlementDate: "सेटलमेंट तारीख",
    settlementHistory: "सेटलमेंट हिसाब",
    settlements: "सेटलमेंट",
    shikshanSansthan: "शिक्षण संस्थान",
    skill: "स्किल",
    slotHours: "घंटा",
    staff: "स्टाफ",
    staffDailyLedger: "स्टाफ का दिन का हिसाब",
    staffPermissions: "स्टाफ अधिकार",
    startDate: "शुरू तारीख",
    startTime: "शुरू समय",
    status: "हाल",
    to: "को",
    toEmployee: "किस स्टाफ को",
    today: "आज",
    totalClosing: "कुल बंद हिसाब",
    totalCollected: "कुल जमा",
    totalExpenses: "कुल खर्च",
    totalIn: "कुल आया",
    totalOut: "कुल गया",
    totalCollection: "कुल जमा",
    ownerAccountCredit: "मालिक खाते में जमा",
    totalOpening: "कुल शुरू हिसाब",
    transferCash: "नकद भेजें",
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

function formValidationMessage(form: HTMLFormElement) {
  const invalid = form.querySelector(":invalid") as
    | (HTMLInputElement & { validationMessage?: string; reportValidity?: () => boolean })
    | null;
  invalid?.reportValidity?.();
  return invalid?.validationMessage || "Please fix the highlighted field and try again.";
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

function formDataWithIdempotencyKey(form: HTMLFormElement) {
  const existingKey = form.dataset.idempotencyKey;
  const key = existingKey && existingKey.trim() ? existingKey : createActionRequestKey();
  form.dataset.idempotencyKey = key;
  const formData = new FormData(form);
  formData.set(actionIdempotencyField, key);
  return formData;
}

function clearFormIdempotencyKey(form: HTMLFormElement) {
  delete form.dataset.idempotencyKey;
}

function submitWith(
  event: FormEvent<HTMLFormElement>,
  action: (formData: FormData) => Promise<ActionResult>,
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
  if (form.dataset.submitting === "true") return;
  const formData = formDataWithIdempotencyKey(form);
  setFormSubmitting(form, true);
  startTransition(async () => {
    try {
      const result = await action(formData);
      clearFormIdempotencyKey(form);
      setNotice(result);
      if (result.ok) {
        window.dispatchEvent(new CustomEvent("lenden:mutation-success"));
        if (reset) form.reset();
        form.closest("details.history-actions-menu")?.removeAttribute("open");
      }
    } catch (error) {
      setNotice({
        ok: false,
        message: error instanceof Error ? error.message : "Network error. Please check your connection and try again.",
      });
    } finally {
      setFormSubmitting(form, false);
    }
  });
}

function submitAndClose(
  event: FormEvent<HTMLFormElement>,
  action: (formData: FormData) => Promise<ActionResult>,
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
  if (form.dataset.submitting === "true") return;
  const formData = formDataWithIdempotencyKey(form);
  setFormSubmitting(form, true);
  startTransition(async () => {
    try {
      const result = await action(formData);
      clearFormIdempotencyKey(form);
      setNotice(result);
      if (result.ok) {
        window.dispatchEvent(new CustomEvent("lenden:mutation-success"));
        form.reset();
        onSuccess();
      }
    } catch (error) {
      setNotice({
        ok: false,
        message: error instanceof Error ? error.message : "Network error. Please check your connection and try again.",
      });
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

function transferSummaryLines(
  payment: Payment,
  transfers: MoneyMovement[],
  profiles: Profile[],
  t: (key: string) => string,
) {
  const cashAmount = paymentCashAmount(payment);
  const lines = cashAmount > 0
    ? [`${t("currentHolder")}: ${profileName(profiles, payment.current_holder_id ?? payment.collected_by, t)} · ${t("transferCashAmount")} ${formatMoney(cashAmount)}`]
    : [];

  transfers.forEach((movement) => {
    const from = profileName(profiles, movement.from_profile_id, t);
    const to = profileName(profiles, movement.to_profile_id, t);
    const label = movement.status === "pending"
      ? t("pendingTransfer")
      : movement.status === "accepted"
        ? t("acceptedTransfer")
        : t("rejectedTransfer");
    lines.push(`${label}: ${from} → ${to}`);
  });

  return lines;
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

function isPendingReviewStatus(status: string) {
  return status !== "approved" && status !== "rejected" && status !== "cancelled";
}

function belongsToClosingReview(recordDate: string, closingDate: string, status: string) {
  const date = recordDate.slice(0, 10);
  return date === closingDate || (date < closingDate && isPendingReviewStatus(status));
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
  const initialTransactionFilter = initialUserIsSalesAgent && initialViewState.transactionFilter === "expenses"
    ? "all"
    : initialViewState.transactionFilter;
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
  const visibleTabItems = currentUserIsSalesAgent
    ? tabItems.filter((item) => item.id === "home" || item.id === "payments")
    : tabItems.filter((item) => item.id !== "library_students" || canViewLibraryStudents);
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
    function refreshCachedData() {
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      void queryClient.invalidateQueries({ queryKey: ["library-student-history"] });
    }

    window.addEventListener("lenden:mutation-success", refreshCachedData);
    return () => window.removeEventListener("lenden:mutation-success", refreshCachedData);
  }, [queryClient]);

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
    if (currentUserIsSalesAgent || !item.active || item.id === appData.profile.id || item.role === "sales_agent") return false;
    if (owner) return item.role === "staff";
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

            return {
              profile,
              opening: numberValue(summary.opening),
              collected: numberValue(summary.collected),
              expenses: numberValue(summary.expenses),
              received: numberValue(summary.received),
              sent: numberValue(summary.sent),
              adjustments: numberValue(summary.adjustments),
              closing: numberValue(summary.closing),
              dayEntries,
            };
          })
          .filter((summary): summary is UserClosingSummary => Boolean(summary));
      }

      return closingProfiles.map((profile) => buildClosingSummary(profile, appData.ledger, closingDate));
    },
    [appData.closingSummaries, appData.ledger, appData.profiles, closingDate, closingProfiles],
  );
  const agentIncentiveSummary = useMemo<AgentIncentiveSummary>(() => {
    const agentPayments = appData.payments.filter(
      (payment) =>
        payment.referral_agent_id === appData.profile.id &&
        payment.record_status === "active" &&
        payment.approval_status === "approved",
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
  }, [appData.agentSettlements, appData.payments, appData.profile.id]);

  const agentIncentiveBalances = useMemo<AgentIncentiveBalance[]>(() => {
    return salesAgents
      .map((agent) => {
        const earned = appData.payments
          .filter(
            (payment) =>
              payment.referral_agent_id === agent.id &&
              payment.record_status === "active" &&
              payment.approval_status === "approved",
          )
          .reduce((sum, payment) => sum + numberValue(payment.incentive_amount), 0);
        const committed = appData.agentSettlements
          .filter((settlement) => settlement.agent_id === agent.id && (settlement.status === "pending" || settlement.status === "accepted"))
          .reduce((sum, settlement) => sum + numberValue(settlement.amount), 0);
        return { agent, balance: Math.max(earned - committed, 0) };
      })
      .filter((item) => item.balance > 0);
  }, [appData.agentSettlements, appData.payments, salesAgents]);

  const totals = useMemo(() => {
    const activePayments = filteredPayments.filter(
      (payment) => payment.record_status === "active" && payment.approval_status === "approved",
    );
    const activeExpenses = filteredExpenses.filter(
      (expense) => expense.record_status === "active" && expense.approval_status === "approved",
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
  }, [filteredExpenses, filteredPayments]);

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
    } else if (nextTab === "library_students" && !canViewLibraryStudents) {
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

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
    <div className="app-root bg-surface text-on-surface antialiased min-h-screen flex flex-col selection:bg-primary-container selection:text-on-primary-container pb-24 md:pb-0">
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

        <main className="app-main flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8 w-full" onInvalidCapture={handleInvalid}>
          <div className="app-main-inner max-w-4xl mx-auto space-y-8">
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
                ) : tab !== "settings" ? (
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

            {!currentUserIsSalesAgent ? (
              <BottomActions
                canAddPositive={(Object.keys(businessPermissions) as BusinessType[]).some((type) => canUsePayment(type)) || moneyMovementProfiles.length > 0}
                canAddNegative={canUsePayment("expense") || moneyMovementProfiles.length > 0 || (owner && staffProfiles.length > 0)}
                onPositive={() => openAction("positive")}
                onNegative={() => openAction("negative")}
              />
            ) : null}

            <ToastStack toasts={toasts} pending={pending} savingLabel={t("saving")} dismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
            {pending ? <div className="action-lock" aria-hidden="true" /> : null}
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
                agentIncentiveSummary={agentIncentiveSummary}
                agentReferralCodes={agentReferralCodes}
                changeTab={changeTab}
                setNotice={pushNotice}
              />
            ) : null}

            {tab === "payments" ? (
              <TransactionsView
                dateLabel={selectedDateRangeLabel}
                dateRange={selectedDateRange}
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

            {tab === "library_students" && canViewLibraryStudents ? (
              <LibraryStudentsView
                students={appData.libraryStudents}
                payments={appData.payments}
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

function HomeView({
  totals,
  cashBalances,
  owner,
  data,
  agentIncentiveSummary,
  agentReferralCodes,
  changeTab,
  setNotice,
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
  agentIncentiveSummary: AgentIncentiveSummary;
  agentReferralCodes: ReferralCode[];
  changeTab: (tab: AppTab) => void;
  setNotice: (notice: ActionResult | null) => void;
}) {
  const { t } = useLanguage();

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
    const myBalance = cashBalances.find((cb) => cb.profile.id === data.profile.id)?.balance ?? 0;
    const myPayments = data.payments.filter((p) => p.collected_by === data.profile.id);
    const myExpenses = data.expenses.filter((e) => e.spent_by === data.profile.id);
    const myPendingMovements = data.movements.filter(
      (m) => m.status === "pending" && (m.from_profile_id === data.profile.id || m.to_profile_id === data.profile.id)
    );
    const myPendingAmount = myPendingMovements.reduce((sum, m) => sum + numberValue(m.amount), 0);

    return (
      <div className="space-y-8">
        <div>
          <h2 className="font-headline text-2xl font-bold text-on-surface mb-2">
            Welcome, {data.profile.full_name}
          </h2>
          <p className="text-on-surface-variant text-body-md">
            Here is your personal collection summary for today.
          </p>
        </div>

        <section className="dashboard-stat-grid grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-primary-container/20 rounded-xl p-6 shadow-soft flex flex-col justify-between h-40 relative overflow-hidden group">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-primary/10 rounded-full blur-2xl group-hover:bg-primary/20 transition-all duration-500"></div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <WalletCards size={20} className="text-primary" />
                <h3 className="font-label text-sm font-semibold text-on-surface-variant uppercase tracking-wider">My Cash Balance</h3>
              </div>
            </div>
            <div>
              <p className="font-headline text-4xl font-bold text-primary">{formatMoney(myBalance)}</p>
              <p className="text-xs text-on-surface-variant font-medium mt-1">Cash in hand</p>
            </div>
          </div>

          <div className="bg-error-container/40 rounded-xl p-6 shadow-soft flex flex-col justify-between h-40 relative overflow-hidden group">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-error/10 rounded-full blur-2xl group-hover:bg-error/20 transition-all duration-500"></div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ReceiptText size={20} className="text-error" />
                <h3 className="font-label text-sm font-semibold text-on-surface-variant uppercase tracking-wider">My Expenses</h3>
              </div>
            </div>
            <div>
              <p className="font-headline text-4xl font-bold text-on-error-container">
                {formatMoney(myExpenses.reduce((sum, e) => sum + numberValue(e.amount), 0))}
              </p>
              <p className="text-xs text-error font-medium mt-1">Total recorded today</p>
            </div>
          </div>

          <div className="bg-tertiary-container/20 rounded-xl p-6 shadow-soft flex flex-col justify-between h-40 relative overflow-hidden group">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-tertiary/10 rounded-full blur-2xl group-hover:bg-tertiary/20 transition-all duration-500"></div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ClipboardList size={20} className="text-tertiary" />
                <h3 className="font-label text-sm font-semibold text-on-surface-variant uppercase tracking-wider">Pending Transfer</h3>
              </div>
            </div>
            <div>
              <p className="font-headline text-4xl font-bold text-on-tertiary-container">{formatMoney(myPendingAmount)}</p>
              <p className="text-xs text-tertiary font-medium mt-1">Awaiting approval</p>
            </div>
          </div>
        </section>

        <section className="bg-surface-bright rounded-2xl p-6 shadow-soft border border-outline-variant/20">
          <h3 className="font-headline text-xl font-bold text-on-surface mb-4">My Recent Activity</h3>
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
              <p className="text-on-surface-variant text-sm py-4 text-center">No recent transactions recorded today.</p>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  const activePayments = data.payments.filter((payment) => payment.record_status === "active");
  const activeExpenses = data.expenses.filter((expense) => expense.record_status === "active");
  const approvedPayments = activePayments.filter((payment) => payment.approval_status === "approved");
  const approvedExpenses = activeExpenses.filter((expense) => expense.approval_status === "approved");
  const pendingPayments = activePayments.filter((payment) => isPendingReviewStatus(payment.approval_status));
  const pendingExpenses = activeExpenses.filter((expense) => isPendingReviewStatus(expense.approval_status));
  const pendingMovements = data.movements.filter((movement) => movement.status === "pending");
  const pendingAgentSettlements = data.agentSettlements.filter((settlement) => settlement.status === "pending");
  const pendingAmount =
    pendingPayments.reduce((sum, payment) => sum + numberValue(payment.amount), 0) +
    pendingExpenses.reduce((sum, expense) => sum + numberValue(expense.amount), 0) +
    pendingMovements.reduce((sum, movement) => sum + numberValue(movement.amount), 0) +
    pendingAgentSettlements.reduce((sum, settlement) => sum + numberValue(settlement.amount), 0);
  const netSettlement = Math.max(totals.cash - totals.expense, 0);
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
      <section className="dashboard-stat-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="dashboard-top-card dashboard-detail-card dashboard-detail-card-collection bg-primary-container/20 rounded-xl p-6 shadow-soft flex flex-col gap-4 relative overflow-hidden group md:col-span-1">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-primary/10 rounded-full blur-2xl group-hover:bg-primary/20 transition-all duration-500"></div>
          <div className="dashboard-card-main relative z-10">
            <div className="dashboard-card-title-row">
              <WalletCards size={20} className="text-primary" />
              <h3 className="font-label text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Total Collection</h3>
            </div>
            <p className="dashboard-card-value font-headline text-3xl font-bold text-on-primary-container">{formatMoney(totals.total)}</p>
            <p className="dashboard-card-note text-xs text-primary font-medium mt-1 flex items-center gap-1">
              <Landmark size={14} />
              {formatMoney(totals.online)} {t("ownerAccountCredit")}
            </p>
          </div>
          <div className="dashboard-breakdown-grid grid grid-cols-2 gap-3 pt-2 border-t border-primary/10 relative z-10">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Library</span>
              <span className="text-sm font-bold text-on-surface">{formatMoney(totals.byBusiness.library)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Rooms</span>
              <span className="text-sm font-bold text-on-surface">{formatMoney(totals.byBusiness.guest_house)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Coaching</span>
              <span className="text-sm font-bold text-on-surface">{formatMoney(totals.byBusiness.course)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Others</span>
              <span className="text-sm font-bold text-on-surface">{formatMoney(totals.byBusiness.general)}</span>
            </div>
          </div>
        </div>

        <div className="dashboard-top-card dashboard-detail-card dashboard-detail-card-expense bg-error-container/40 rounded-xl p-6 shadow-soft flex flex-col gap-4 relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-error/10 rounded-full blur-2xl group-hover:bg-error/20 transition-all duration-500"></div>
          <div className="dashboard-card-main relative z-10">
            <div className="dashboard-card-title-row">
              <ReceiptText size={20} className="text-error" />
              <h3 className="font-label text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Total Expenses</h3>
            </div>
            <p className="dashboard-card-value font-headline text-3xl font-bold text-on-error-container">{formatMoney(totals.expense)}</p>
            <p className="dashboard-card-note text-xs text-error font-medium mt-1 flex items-center gap-1">
              <Info size={14} /> {t("approved")}
            </p>
          </div>
          <div className="dashboard-breakdown-grid dashboard-breakdown-expense grid grid-cols-2 gap-3 pt-2 border-t border-error/10 relative z-10">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Library</span>
              <span className="text-sm font-bold text-on-surface">{formatMoney(totals.expenseByBusiness.library)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Rooms</span>
              <span className="text-sm font-bold text-on-surface">{formatMoney(totals.expenseByBusiness.guest_house)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Coaching</span>
              <span className="text-sm font-bold text-on-surface">{formatMoney(totals.expenseByBusiness.course)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Others</span>
              <span className="text-sm font-bold text-on-surface">{formatMoney(totals.expenseByBusiness.general)}</span>
            </div>
          </div>
        </div>

        <div className="dashboard-top-card dashboard-compact-card bg-surface-container-low border border-primary/20 rounded-xl p-6 shadow-soft flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-all duration-500"></div>
          <div className="dashboard-card-main">
            <div className="dashboard-card-title-row">
              <ShieldCheck size={20} className="text-primary" />
              <h3 className="font-label text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{t("settlementDue")}</h3>
            </div>
          </div>
          <div>
            <p className="dashboard-card-value font-headline text-3xl font-bold text-primary">{formatMoney(netSettlement)}</p>
            <p className="dashboard-card-note text-xs text-on-surface-variant font-medium mt-1">{t("cashCollection")} - {t("expenses")}</p>
          </div>
        </div>

        <div className="dashboard-top-card dashboard-compact-card bg-tertiary-container/20 rounded-xl p-6 shadow-soft flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-tertiary/10 rounded-full blur-2xl group-hover:bg-tertiary/20 transition-all duration-500"></div>
          <div className="dashboard-card-main">
            <div className="dashboard-card-title-row">
              <ClipboardList size={20} className="text-tertiary" />
              <h3 className="font-label text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Pending</h3>
            </div>
          </div>
          <div>
            <p className="dashboard-card-value font-headline text-3xl font-bold text-on-tertiary-container">{formatMoney(pendingAmount)}</p>
            <p className="dashboard-card-note text-xs text-tertiary font-medium mt-1">Awaiting verification</p>
          </div>
        </div>
      </section>

      <section className="business-status-panel">
        <div className="business-status-heading">
          <div>
            <h3>{t("businessStatus")}</h3>
            <p>{t("businessStatusHelp")}</p>
          </div>
          <button onClick={() => changeTab("closing")} className="text-primary text-sm font-medium hover:underline flex items-center gap-1 cursor-pointer border-0 bg-transparent">
            View All <ChevronRight size={16} />
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
                <span>{t("collections")}</span>
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
                  <small>{t("expenses")}</small>
                  <strong>{formatMoney(item.expenses)}</strong>
                </span>
                <span className={item.settlement < 0 ? "negative" : "positive"}>
                  <small>{t("settlementDue")}</small>
                  <strong>{formatMoney(item.settlement)}</strong>
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
  const currentUserIsSalesAgent = isSalesAgent(profile.role);
  const canUseProfileFilter = !currentUserIsSalesAgent && (owner || sharedBusinessHistory);
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
  const transactionRecords = useMemo(() => {
    type HistoryRecord = {
      id: string;
      kind: "collection" | "expense" | "settlement" | "agent_payout";
      filter: Exclude<TransactionFilter, "all">;
      date: string;
      sortAt: string;
      amount: number;
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
    };
    const selectedUserId = canUseProfileFilter ? transactionProfileId : profile.id;
    const userMatches = (userId: string | null | undefined) => selectedUserId === "all" || userId === selectedUserId;
    const agentReferralIds = new Set(agentReferralCodes.map((referral) => referral.id));
    const isAgentReferralPayment = (payment: Payment) =>
      payment.referral_agent_id === profile.id || (payment.referral_code_id ? agentReferralIds.has(payment.referral_code_id) : false);
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
      if (onlineOnly && owner) return t("receivedStatus");
      return labelForStatus(payment.approval_status, t);
    };
    const collectionStatusTone = (payment: Payment) =>
      payment.approval_status === "approved" && paymentOnlineAmount(payment) > 0 && paymentCashAmount(payment) === 0
        ? "approved"
        : payment.approval_status;

    const paymentRows = payments
      .filter((payment) => dateInRange(payment.payment_date, dateRange))
      .filter((payment) => payment.record_status === "active")
      .filter((payment) => {
        if (currentUserIsSalesAgent) return isAgentReferralPayment(payment);
        const linkedTransfers = paymentTransfers(movements, payment.id);
        return (
          userMatches(payment.collected_by) ||
          userMatches(payment.current_holder_id) ||
          linkedTransfers.some((movement) => userMatches(movement.from_profile_id) || userMatches(movement.to_profile_id))
        );
      })
      .map((payment): HistoryRecord => {
        if (currentUserIsSalesAgent) {
          const paymentAmount = numberValue(payment.amount);
          const incentiveAmount = numberValue(payment.incentive_amount);
          return {
            id: payment.id,
            kind: "collection",
            filter: "collections",
            date: payment.payment_date,
            sortAt: payment.created_at,
            amount: incentiveAmount,
            title: payment.referral_code_snapshot ? `${t("incentive")} · ${payment.referral_code_snapshot}` : t("incentiveEarned"),
            meta: `${paymentDisplayTitle(payment, t)} · ${labelForBusiness(payment.business_type, t)} · ${t("paymentAmount")} ${formatMoney(paymentAmount)}`,
            status: labelForStatus(payment.approval_status, t),
            statusTone: payment.approval_status,
            modeLabel: paymentModeLabel(payment, t),
            recordStatus: payment.record_status,
            ownerId: profile.id,
            description: payment.description ?? "",
            remark: payment.remark ?? "",
            reason: payment.cancel_reason,
            icon: <WalletCards size={24} />,
          };
        }

        const cashImpact = paymentCashAmount(payment);
        const onlineImpact = paymentOnlineAmount(payment);
        const onlineOnly = onlineImpact > 0 && cashImpact === 0;
        const paymentStatus = collectionStatus(payment);
        const linkedTransfers = paymentTransfers(movements, payment.id);
        const pendingTransfer = linkedTransfers.find((movement) => movement.status === "pending") ?? null;
        const activeTransfer = linkedTransfers.some((movement) => movement.status === "pending" || movement.status === "accepted");
        const shownAmount = canUseProfileFilter
          ? numberValue(payment.amount)
          : payment.current_holder_id === profile.id
            ? cashImpact
            : 0;
        const requiredPermission = businessPermissions[payment.business_type];
        const transferRecipients = cashImpact > 0 && requiredPermission
          ? profiles.filter((item) =>
              item.active &&
              item.id !== (payment.current_holder_id ?? payment.collected_by) &&
              !isOwnerish(item.role) &&
              (permissionsByProfile[item.id] ?? []).includes(requiredPermission),
            )
          : [];
        const canRequestTransfer =
          payment.current_holder_id === profile.id &&
          isPendingReviewStatus(payment.approval_status) &&
          cashImpact > 0 &&
          !pendingTransfer &&
          transferRecipients.length > 0;
        const incomingTransferId = pendingTransfer?.to_profile_id === profile.id ? pendingTransfer.id : null;

        return {
          id: payment.id,
          kind: "collection",
          filter: "collections",
          date: payment.payment_date,
          sortAt: payment.created_at,
          amount: shownAmount,
          title: paymentDisplayTitle(payment, t),
          meta: `${profileName(profiles, payment.collected_by, t)} · ${labelForBusiness(payment.business_type, t)}${!canUseProfileFilter && onlineOnly ? ` · ${t("ownerAccountCredit")}` : ""}`,
          status: paymentStatus,
          statusTone: collectionStatusTone(payment),
          modeLabel: !canUseProfileFilter && onlineOnly ? t("cashImpact") : paymentModeLabel(payment, t),
          recordStatus: payment.record_status,
          ownerId: payment.collected_by,
          description: payment.description ?? "",
          remark: payment.remark ?? "",
          reason: payment.cancel_reason,
          recordType: "payment",
          editDate: payment.payment_date,
          editAmount: numberValue(payment.amount),
          canEdit: payment.collected_by === profile.id && isPendingReviewStatus(payment.approval_status) && !activeTransfer,
          canDelete: owner,
          transferLines: cashImpact > 0 ? transferSummaryLines(payment, linkedTransfers, profiles, t) : [],
          transferRecipients,
          canRequestTransfer,
          incomingTransferId,
          icon: payment.business_type === "guest_house"
            ? <Hotel size={24} />
            : payment.business_type === "library"
              ? <BookOpen size={24} />
              : payment.business_type === "course"
                ? <GraduationCap size={24} />
                : <WalletCards size={24} />,
        };
      });
    const expenseRows = currentUserIsSalesAgent ? [] : expenses
      .filter((expense) => dateInRange(expense.expense_date, dateRange))
      .filter((expense) => expense.record_status === "active")
      .filter((expense) => userMatches(expense.spent_by))
      .map((expense): HistoryRecord => ({
        id: expense.id,
        kind: "expense" as const,
        filter: "expenses",
        date: expense.expense_date,
        sortAt: expense.created_at,
        amount: -numberValue(expense.amount),
        title: expenseDisplayTitle(expense),
        meta: `${profileName(profiles, expense.spent_by, t)}${expense.spent_by === profile.id ? ` (${t("self")})` : ""}`,
        status: labelForStatus(expense.approval_status, t),
        statusTone: expense.approval_status,
        modeLabel: labelForMode(expense.mode, t),
        recordStatus: expense.record_status,
        ownerId: expense.spent_by,
        description: expense.description,
        remark: expense.remark ?? "",
        reason: expense.cancel_reason,
        recordType: "expense",
        editDate: expense.expense_date,
        editAmount: numberValue(expense.amount),
        canEdit: expense.spent_by === profile.id && isPendingReviewStatus(expense.approval_status),
        canDelete: owner,
        icon: <ReceiptText size={24} />,
      }));
    const settlementRows = currentUserIsSalesAgent ? [] : movements.flatMap((movement): HistoryRecord[] => {
      if (movement.status !== "accepted" || movement.payment_id) return [];
      const fromProfile = profiles.find((item) => item.id === movement.from_profile_id);
      const toProfile = profiles.find((item) => item.id === movement.to_profile_id);
      const fromOwnerish = isOwnerish(fromProfile?.role ?? "");
      const toOwnerish = isOwnerish(toProfile?.role ?? "");
      const movementAmount = numberValue(movement.amount);

      if (owner) {
        const ownerFacingAmount = !fromOwnerish && toOwnerish ? movementAmount : fromOwnerish && !toOwnerish ? -movementAmount : 0;
        if (ownerFacingAmount === 0) return [];
        const counterpartyId = ownerFacingAmount > 0 ? movement.from_profile_id : movement.to_profile_id;
        if (!userMatches(counterpartyId)) return [];
        const entry = movementEntry(movement, ownerFacingAmount);
        const date = entry?.entry_date ?? movement.created_at.slice(0, 10);
        if (!dateInRange(date, dateRange)) return [];
        const counterpartyName = profileName(profiles, counterpartyId, t);
        return [{
          id: `movement-${movement.id}`,
          kind: "settlement",
          filter: "settlements",
          date,
          sortAt: movement.responded_at ?? movement.created_at,
          amount: ownerFacingAmount,
          title: ownerFacingAmount > 0 ? t("cashReceived") : t("cashSent"),
          meta: `${ownerFacingAmount > 0 ? t("from") : t("to")}: ${counterpartyName}${movement.note ? ` · ${movement.note}` : ""}`,
          status: t("verified"),
          statusTone: "accepted",
          modeLabel: labelForMode(movement.mode, t),
          recordStatus: "active",
          ownerId: counterpartyId ?? profile.id,
          description: entry?.description ?? "",
          remark: movement.note ?? "",
          reason: null,
          icon: <ArrowDown size={24} />,
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
      const entry = movementEntry(movement, staffFacingAmount, profile.id);
      const date = entry?.entry_date ?? movement.created_at.slice(0, 10);
      if (!dateInRange(date, dateRange)) return [];
      return [{
        id: `movement-${movement.id}`,
        kind: "settlement",
        filter: "settlements",
        date,
        sortAt: movement.responded_at ?? movement.created_at,
        amount: staffFacingAmount,
        title: staffFacingAmount < 0 ? t("cashSettled") : t("cashReceived"),
        meta: `${staffFacingAmount < 0 ? t("to") : t("from")}: ${profileName(profiles, counterpartyId, t)}${movement.note ? ` · ${movement.note}` : ""}`,
        status: t("verified"),
        statusTone: "accepted",
        modeLabel: labelForMode(movement.mode, t),
        recordStatus: "active",
        ownerId: profile.id,
        description: entry?.description ?? "",
        remark: movement.note ?? "",
        reason: null,
        icon: <ArrowDown size={24} />,
      }];
    });
    const agentRows = agentSettlements.flatMap((settlement): HistoryRecord[] => {
      if (settlement.status === "rejected") return [];
      const amount = numberValue(settlement.amount);
      const visibleToOwner = owner && userMatches(settlement.agent_id);
      const visibleToAgent = !owner && settlement.agent_id === profile.id && userMatches(settlement.agent_id);
      if (!visibleToOwner && !visibleToAgent) return [];
      if (!dateInRange(settlement.created_at, dateRange)) return [];
      return [{
        id: `agent-${settlement.id}`,
        kind: "agent_payout",
        filter: "settlements",
        date: settlement.created_at.slice(0, 10),
        sortAt: settlement.responded_at ?? settlement.created_at,
        amount: visibleToOwner ? -amount : amount,
        title: t("agentPayout"),
        meta: `${visibleToOwner ? t("to") : t("from")}: ${profileName(profiles, visibleToOwner ? settlement.agent_id : settlement.paid_by, t)}${settlement.note ? ` · ${settlement.note}` : ""}`,
        status: labelForStatus(settlement.status, t),
        statusTone: settlement.status,
        modeLabel: t("online"),
        recordStatus: "active",
        ownerId: visibleToOwner ? settlement.agent_id : profile.id,
        description: "",
        remark: settlement.note ?? "",
        reason: null,
        icon: <WalletCards size={24} />,
      }];
    });

    return [...paymentRows, ...expenseRows, ...settlementRows, ...agentRows]
      .filter((record) => transactionFilter === "all" || record.filter === transactionFilter)
      .sort((a, b) => `${b.date}-${b.sortAt}-${b.id}`.localeCompare(`${a.date}-${a.sortAt}-${a.id}`));
  }, [agentReferralCodes, agentSettlements, canUseProfileFilter, currentUserIsSalesAgent, dateRange, expenses, ledger, movements, owner, payments, permissionsByProfile, profile.id, profiles, t, transactionFilter, transactionProfileId]);
  const positiveTotal = transactionRecords
    .filter((record) => numberValue(record.amount) > 0)
    .reduce((sum, record) => sum + numberValue(record.amount), 0);
  const negativeTotal = transactionRecords
    .filter((record) => numberValue(record.amount) < 0)
    .reduce((sum, record) => sum + Math.abs(numberValue(record.amount)), 0);
  const groupedRecords = transactionRecords.reduce<{ date: string; records: typeof transactionRecords }[]>((groups, record) => {
    const lastGroup = groups.at(-1);
    if (lastGroup?.date === record.date) {
      lastGroup.records.push(record);
      return groups;
    }
    groups.push({ date: record.date, records: [record] });
    return groups;
  }, []);
  const visibleTransactionFilters = currentUserIsSalesAgent
    ? (["all", "collections", "settlements"] as TransactionFilter[])
    : (["all", "collections", "expenses", "settlements"] as TransactionFilter[]);

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
            </div>
            <div className="history-total-divider" />
            <div>
              <span>{t("totalOut")}</span>
              <strong className="negative">-{formatMoney(negativeTotal)}</strong>
            </div>
          </div>
        ) : (
          <div className="agent-history-total">
            <span>{t("incentiveEarned")}</span>
            <strong>{formatMoney(positiveTotal)}</strong>
          </div>
        )}
        <div className="history-tab-strip" role="tablist" aria-label={t("transactions")}>
          {visibleTransactionFilters.map((filter) => (
            <button
              className={transactionFilter === filter ? "history-tab active" : "history-tab"}
              key={filter}
              type="button"
              onClick={() => setTransactionFilter(filter)}
            >
              {filter === "all" ? t("all") : filter === "collections" ? (currentUserIsSalesAgent ? t("referralTransactions") : t("collections")) : filter === "expenses" ? t("expenses") : t("settlements")}
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
                    className={`history-card ${record.filter === "settlements" ? "settlement" : record.amount === 0 ? "neutral" : record.amount > 0 ? "positive" : "negative"}`}
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
                          {record.transferLines.map((line) => (
                            <span key={line}>{line}</span>
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
                      <strong className={record.amount === 0 ? "neutral" : record.amount > 0 ? "positive" : "negative"}>
                        {record.amount === 0 ? "" : record.amount > 0 ? "+" : "-"}{formatMoney(Math.abs(record.amount))}
                      </strong>
                      {record.filter === "settlements" ? <span>{t("settlements")}</span> : null}
                      {record.recordType && (record.canEdit || record.canDelete || record.canRequestTransfer) ? (
                        <details className="history-actions-menu">
                          <summary aria-label={t("moreOptions")}>
                            <MoreHorizontal size={18} />
                          </summary>
                          <div className="details-menu transaction-options-menu">
                            {record.canRequestTransfer ? (
                              <form onSubmit={(event) => submitWith(event, requestPaymentTransferAction, setNotice, startTransition, false)}>
                                <input type="hidden" name="payment_id" value={record.id} />
                                <label>
                                  {t("transferToStaff")}
                                  <select name="to_profile_id" required>
                                    {record.transferRecipients?.map((recipient) => (
                                      <option key={recipient.id} value={recipient.id}>
                                        {recipient.full_name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  {t("note")}
                                  <input name="note" placeholder={t("optional")} />
                                </label>
                                <button type="submit">{t("transferTransaction")}</button>
                              </form>
                            ) : null}
                            {record.canEdit ? (
                              <form onSubmit={(event) => submitWith(event, updateRecordAction, setNotice, startTransition, false)}>
                                <input type="hidden" name="record_type" value={record.recordType} />
                                <input type="hidden" name="id" value={record.id} />
                                <label>
                                  {t("amount")}
                                  <input name="amount" type="number" min="1" step="0.01" defaultValue={record.editAmount} required />
                                </label>
                                <label>
                                  {record.recordType === "payment" ? t("paymentDate") : t("expenseDate")}
                                  <input name="date" type="date" defaultValue={record.editDate} required />
                                </label>
                                <label>
                                  {t("description")}
                                  <input name="description" defaultValue={record.description} required={record.recordType === "expense"} />
                                </label>
                                <label>
                                  {t("remark")}
                                  <input name="remark" defaultValue={record.remark} />
                                </label>
                                <button type="submit">{t("editTransaction")}</button>
                              </form>
                            ) : null}
                            {record.canDelete ? (
                              <form onSubmit={(event) => submitWith(event, cancelRecordAction, setNotice, startTransition, false)}>
                                <input type="hidden" name="record_type" value={record.recordType} />
                                <input type="hidden" name="id" value={record.id} />
                                <input name="reason" placeholder={t("reasonRequired")} required />
                                <button className="tone-cancel" type="submit">{t("deleteTransaction")}</button>
                              </form>
                            ) : null}
                          </div>
                        </details>
                      ) : null}
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
        <span className="quick-action-label">{t("collectPayment")}</span>
      </button>
      <button
        className="quick-action-button quick-action-negative flex items-center gap-2 bg-error text-on-error px-5 py-3 rounded-full shadow-soft hover:scale-105 transition-all active:scale-95 font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        type="button"
        aria-label={t("addExpense")}
        disabled={!canAddNegative}
        onClick={onNegative}
      >
        <Minus size={19} />
        <span className="quick-action-label">{t("addExpense")}</span>
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

function displayTimeRange(startTime: string | null, endTime: string | null) {
  const start = displayTime(startTime);
  const end = displayTime(endTime);
  if (start && end) return `${start}-${end}`;
  return start || end || "-";
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

function studentNameInputValue(student: LibraryStudent) {
  return studentHasSwappedRollAndName(student) ? student.roll_number : student.student_name ?? "";
}

function isRealLibraryStudentId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function paymentMatchesLibraryStudent(payment: Payment, student: LibraryStudent) {
  if (payment.library_student_id === student.id) return true;
  const paymentRollNumber = normalizeLibraryRollNumberForView(payment.roll_number);
  const studentRollNumber = normalizeLibraryRollNumberForView(student.roll_number);
  return Boolean(paymentRollNumber && studentRollNumber && paymentRollNumber === studentRollNumber);
}

function mergePaymentHistory(...groups: Payment[][]) {
  const rows = new Map<string, Payment>();
  groups.flat().forEach((payment) => rows.set(payment.id, payment));

  return [...rows.values()].sort((a, b) =>
    `${b.payment_date}-${b.created_at}-${b.id}`.localeCompare(`${a.payment_date}-${a.created_at}-${a.id}`),
  );
}

function LibraryStudentsView({
  students,
  payments,
  setNotice,
  startTransition,
}: {
  students: LibraryStudent[];
  payments: Payment[];
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [listMode, setListMode] = useState<"active" | "inactive">("active");
  const [selectedId, setSelectedId] = useState("");
  const today = todayIso();
  const activeStudents = students.filter((student) => student.active && !student.placeholder);
  const inactiveStudents = students.filter((student) => !student.active && !student.placeholder);
  const expired = (student: LibraryStudent) => isExpiredLibraryStudent(student, today);
  const sourceStudents = listMode === "active" ? activeStudents : inactiveStudents;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleStudents = sourceStudents
    .filter((student) => {
      if (!normalizedQuery) return true;
      return [studentDisplayRollNumber(student), studentDisplayName(student, t), student.phone_number, student.seat_number, student.locker_number]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    })
    .sort((a, b) => {
      const aExpired = isExpiredLibraryStudent(a, today);
      const bExpired = isExpiredLibraryStudent(b, today);
      if (listMode === "active" && aExpired !== bExpired) return aExpired ? -1 : 1;
      return (
        compareLibraryRollNumbers(studentDisplayRollNumber(a), studentDisplayRollNumber(b)) ||
        studentDisplayName(a, t).localeCompare(studentDisplayName(b, t), undefined, { sensitivity: "base" })
      );
    });
  const selectedStudent = students.find((student) => student.id === selectedId) ?? null;
  const historyQuery = useQuery({
    queryKey: ["library-student-history", selectedStudent?.id ?? ""],
    queryFn: () => fetchJson<LibraryStudentHistory>(`/api/app/library-students/${encodeURIComponent(selectedStudent?.id ?? "")}/payments`),
    enabled: Boolean(selectedStudent?.id),
    placeholderData: (previousHistory) => previousHistory,
  });
  const localHistoryPayments = useMemo(
    () => selectedStudent ? payments.filter((payment) => paymentMatchesLibraryStudent(payment, selectedStudent)) : [],
    [payments, selectedStudent],
  );
  const historyPayments = useMemo(
    () => mergePaymentHistory(historyQuery.data?.payments ?? [], localHistoryPayments),
    [historyQuery.data?.payments, localHistoryPayments],
  );
  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow">{t("library")}</p>
          <h2 className="font-headline text-2xl font-bold text-on-surface">{t("studentRecords")}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`filter-chip ${listMode === "active" ? "active" : ""}`}
            onClick={() => setListMode("active")}
          >
            {t("activeStudents")} · {activeStudents.length}
          </button>
          <button
            type="button"
            className={`filter-chip ${listMode === "inactive" ? "active" : ""}`}
            onClick={() => setListMode("inactive")}
          >
            {t("inactiveStudents")} · {inactiveStudents.length}
          </button>
        </div>
      </div>

      <section className="rounded-lg border border-outline-variant/30 bg-surface-container-low p-4">
        <label className="form-grid block">
          <span className="mb-2 block text-sm font-bold text-on-surface-variant">{t("studentSearch")}</span>
          <span className="input-with-icon">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`${t("rollNumber")} / ${t("name")}`} />
          </span>
        </label>
        <div className="mt-4 max-h-[68vh] space-y-2 overflow-y-auto pr-1">
          {visibleStudents.map((student) => (
            <button
              key={student.id}
              type="button"
              onClick={() => setSelectedId(student.id)}
              className={`group w-full rounded-lg border p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                selectedStudent?.id === student.id ? "border-primary bg-primary-container/60" : "border-outline-variant/25 bg-surface"
              } ${expired(student) ? "border-yellow-400 bg-yellow-50" : ""}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="inline-flex rounded-full bg-surface-container-high px-2 py-0.5 text-xs font-bold text-on-surface-variant">
                    #{studentDisplayRollNumber(student)}
                  </span>
                  <strong className="mt-2 block truncate text-base text-on-surface">{studentDisplayName(student, t)}</strong>
                </div>
                <span className={`status-chip ${expired(student) ? "status-pending" : student.active ? "status-approved" : "status-rejected"}`}>
                  {expired(student) ? t("expiredSubscription") : student.active ? t("active") : t("inactiveStudents")}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-on-surface-variant sm:grid-cols-2">
                <span className="rounded-lg bg-surface-container-low px-3 py-2">
                  <strong className="block text-[11px] uppercase tracking-wide text-on-surface-variant">{t("timing")}</strong>
                  <span className="text-sm font-semibold text-on-surface">{displayTimeRange(student.start_time, student.end_time)}</span>
                </span>
                <span className="rounded-lg bg-surface-container-low px-3 py-2">
                  <strong className="block text-[11px] uppercase tracking-wide text-on-surface-variant">{t("subscriptionPeriod")}</strong>
                  <span className="text-sm font-semibold text-on-surface">{displayDateRange(student.subscription_start_date, student.subscription_end_date, t)}</span>
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-on-surface-variant">
                <span>{student.phone_number ?? t("unknown")}</span>
                <span>·</span>
                <span>{t("seat")} {student.seat_number ?? "-"}</span>
                {student.locker_number ? (
                  <>
                    <span>·</span>
                    <span>{t("lockerNumber")} {student.locker_number}</span>
                  </>
                ) : null}
              </div>
            </button>
          ))}
          {visibleStudents.length === 0 ? <p className="text-sm text-on-surface-variant">{t("noRecords")}</p> : null}
        </div>
      </section>

      {selectedStudent ? (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-label={studentDisplayName(selectedStudent, t)}>
          <button className="modal-backdrop" aria-label={t("closeModal")} type="button" onClick={() => setSelectedId("")} />
          <section className="action-sheet library-student-sheet">
            <header className="sheet-header">
              <div>
                <p className="eyebrow">{t("studentDetails")}</p>
                <h2>{studentDisplayName(selectedStudent, t)}</h2>
                <p className="text-sm text-on-surface-variant">
                  {t("rollNumber")} {studentDisplayRollNumber(selectedStudent)} · {t("expiresOn")} {displayDate(selectedStudent.subscription_end_date)}
                </p>
                <p className="text-sm text-on-surface-variant">
                  {t("timing")} {displayTimeRange(selectedStudent.start_time, selectedStudent.end_time)} · {t("subscriptionPeriod")} {displayDateRange(selectedStudent.subscription_start_date, selectedStudent.subscription_end_date, t)}
                </p>
              </div>
              <button className="icon-button" type="button" aria-label={t("closeModal")} onClick={() => setSelectedId("")}>
                <X size={18} />
              </button>
            </header>

            <div className="space-y-5">
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

              <form
                key={selectedStudent.id}
                className="form-grid two"
                onSubmit={(event) => submitWith(event, saveLibraryStudentAction, setNotice, startTransition, false)}
              >
                <input type="hidden" name="id" value={selectedStudent.id} />
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
                <label>
                  {t("seatNumber")}
                  <input name="seat_number" defaultValue={selectedStudent.seat_number ?? ""} />
                </label>
                <label>
                  {t("lockerNumber")}
                  <input name="locker_number" defaultValue={selectedStudent.locker_number ?? ""} />
                </label>
                <label>
                  {t("startDate")}
                  <input name="start_date" type="date" defaultValue={selectedStudent.subscription_start_date ?? todayIso()} required />
                </label>
                <label>
                  {t("endDate")}
                  <input name="end_date" type="date" defaultValue={selectedStudent.subscription_end_date ?? addMonthsIso()} required />
                </label>
                <label>
                  {t("startTime")}
                  <input name="start_time" type="time" min="06:00" max="22:00" step="3600" defaultValue={displayTime(selectedStudent.start_time) || "06:00"} required />
                </label>
                <label>
                  {t("endTime")}
                  <input name="end_time" type="time" min="06:00" max="22:00" step="3600" defaultValue={displayTime(selectedStudent.end_time) || "07:00"} required />
                </label>
                <label>
                  {t("fee")}
                  <input name="fee_amount" type="number" min="0" step="1" defaultValue={selectedStudent.fee_amount ?? ""} />
                </label>
                <label>
                  {t("paid")}
                  <input name="paid_amount" type="number" min="0" step="1" defaultValue={selectedStudent.paid_amount ?? ""} />
                </label>
                <label className="flex-row items-center gap-2">
                  <input name="inactive" type="checkbox" defaultChecked={!selectedStudent.active} />
                  <span>{t("inactiveStudents")}</span>
                </label>
                <button className="primary-button full-span" type="submit">
                  {t("save")}
                </button>
              </form>

              <div className="rounded-lg bg-surface-container-low p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="font-headline text-base font-bold">{t("paymentHistory")}</h4>
                  <span className="text-xs text-on-surface-variant">{historyQuery.isFetching ? t("saving") : `${historyPayments.length}`}</span>
                </div>
                <div className="space-y-2">
                  {historyQuery.error ? <p className="text-sm text-error">{historyQuery.error instanceof Error ? historyQuery.error.message : "Could not load history."}</p> : null}
                  {historyPayments.slice(0, 8).map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2">
                      <div>
                        <strong className="text-sm">{payment.payment_date}</strong>
                        <p className="text-xs text-on-surface-variant">{paymentModeLabel(payment, t)} · {labelForStatus(payment.approval_status, t)}</p>
                      </div>
                      <strong className="text-sm">{formatMoney(payment.amount)}</strong>
                    </div>
                  ))}
                  {historyPayments.length === 0 ? <p className="text-sm text-on-surface-variant">{t("noRecords")}</p> : null}
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
  libraryStudents,
  setNotice,
  startTransition,
  onSuccess,
}: {
  type: BusinessType;
  rooms: { id: string; room_number: string; label: string | null }[];
  mainCourses: Course[];
  skillCourses: Course[];
  referrals: Pick<ReferralCode, "code">[];
  libraryStudents: LibraryStudent[];
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
  onSuccess?: () => void;
}) {
  const { t } = useLanguage();
  const [fee, setFee] = useState("");
  const [paid, setPaid] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [cashCollection, setCashCollection] = useState("");
  const [onlineCollection, setOnlineCollection] = useState("");
  const [startTime, setStartTime] = useState("06:00");
  const [endTime, setEndTime] = useState("07:00");
  const [courseName, setCourseName] = useState("");
  const [librarySearch, setLibrarySearch] = useState("");
  const [selectedLibraryStudentId, setSelectedLibraryStudentId] = useState("");
  const [studentName, setStudentName] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [seatNumber, setSeatNumber] = useState("");
  const [lockerNumber, setLockerNumber] = useState("");
  const [subscriptionStartDate, setSubscriptionStartDate] = useState(todayIso());
  const [subscriptionEndDate, setSubscriptionEndDate] = useState(addMonthsIso());
  const feeNumber = Number(fee || 0);
  const paidNumber = Number(paid || 0);
  const amountNumber = Number(amount || 0);
  const splitCollectionNumber = Number(cashCollection || 0) + Number(onlineCollection || 0);
  const collectedNumber = mode === "mixed" ? splitCollectionNumber : paidNumber;
  const splitTotal = type === "library" || type === "course" ? feeNumber : amountNumber;
  const splitRemaining = Math.max(splitTotal - splitCollectionNumber, 0);
  const dues = Math.max(feeNumber - collectedNumber, 0);
  const advance = Math.max(collectedNumber - feeNumber, 0);
  const slotHours = Math.max((Number(endTime.slice(0, 2)) || 0) - (Number(startTime.slice(0, 2)) || 0), 0);
  const searchableLibraryStudents = useMemo(() => {
    if (type !== "library") return [];
    const query = librarySearch.trim().toLowerCase();
    return libraryStudents
      .filter((student) => {
        if (student.placeholder) return false;
        if (!query) return !student.placeholder;
        return [student.roll_number, student.student_name, student.phone_number, student.seat_number]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      })
      .slice(0, 40);
  }, [librarySearch, libraryStudents, type]);

  function selectLibraryStudent(studentId: string) {
    setSelectedLibraryStudentId(studentId);
    const student = libraryStudents.find((item) => item.id === studentId);
    if (!student) {
      setStudentName("");
      setRollNumber("");
      setPhoneNumber("");
      setSeatNumber("");
      setLockerNumber("");
      setStartTime("06:00");
      setEndTime("07:00");
      setFee("");
      setLibrarySearch("");
      return;
    }
    setStudentName(student.student_name ?? "");
    setRollNumber(student.roll_number);
    setPhoneNumber(student.phone_number ?? "");
    setSeatNumber(student.seat_number ?? "");
    setLockerNumber(student.locker_number ?? "");
    setStartTime((student.start_time ?? "06:00").slice(0, 5));
    setEndTime((student.end_time ?? "07:00").slice(0, 5));
    setFee(student.fee_amount ? String(student.fee_amount) : "");
    setLibrarySearch(`${student.roll_number} · ${student.student_name ?? t("unknown")}`);
  }

  return (
    <form
      className="form-grid two"
      onSubmit={(event) =>
        onSuccess
          ? submitAndClose(event, createPaymentAction, setNotice, startTransition, onSuccess)
          : submitWith(event, createPaymentAction, setNotice, startTransition)
      }
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

      {type === "library" ? (
        <>
          <label className="full-span">
            {t("studentSearch")}
            <span className="input-with-icon">
              <Search size={16} />
              <input
                type="search"
                value={librarySearch}
                onChange={(event) => setLibrarySearch(event.target.value)}
                placeholder={`${t("rollNumber")} / ${t("name")}`}
              />
            </span>
          </label>
          <label className="full-span">
            {t("selectStudent")}
            <select value={selectedLibraryStudentId} onChange={(event) => selectLibraryStudent(event.target.value)}>
              <option value="">{t("newStudent")}</option>
              {searchableLibraryStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.roll_number} · {student.student_name ?? t("unknown")}
                  {student.subscription_end_date ? ` · ${student.subscription_end_date}` : ""}
                  {!student.active ? ` · ${t("inactiveStudents")}` : ""}
                </option>
              ))}
            </select>
          </label>
          <input type="hidden" name="library_student_id" value={selectedLibraryStudentId} />
          <label>
            {t("name")}
            <input name="customer_name" value={studentName} onChange={(event) => setStudentName(event.target.value)} required />
          </label>
          <label>
            {t("rollNumber")}
            <input name="roll_number" value={rollNumber} onChange={(event) => setRollNumber(event.target.value)} required />
          </label>
          <label>
            {t("phone")}
            <input name="phone_number" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} inputMode="tel" />
          </label>
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
            {t("seatNumber")}
            <input name="seat_number" value={seatNumber} onChange={(event) => setSeatNumber(event.target.value)} />
          </label>
          <label>
            {t("lockerNumber")}
            <input name="locker_number" value={lockerNumber} onChange={(event) => setLockerNumber(event.target.value)} />
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
      ) : null}

      {type === "course" ? (
        <>
          <label>
            {t("name")}
            <input name="customer_name" required />
          </label>
          <label>
            {t("rollNumber")}
            <input name="roll_number" />
          </label>
          <DatePair subscription />
          <label>
            {t("paymentDate")}
            <input name="payment_date" type="date" defaultValue={todayIso()} required />
          </label>
          <label>
            {t("seatNumber")}
            <input name="seat_number" />
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
            {t("course")}
            <select
              name="course_id"
              required
              onChange={(event) =>
                setCourseName(mainCourses.find((course) => course.id === event.target.value)?.name ?? "")
              }
            >
              <option value="">{t("selectCourse")}</option>
              {mainCourses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </label>
          {courseName === "Skills" ? (
            <label>
              {t("skill")}
              <select name="skill_course_id" required>
                <option value="">{t("selectSkill")}</option>
                {skillCourses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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

      {type === "library" || type === "course" ? (
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
        {t("collectPayment")}
      </button>
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
        {t("mode")}
        <select name="mode" defaultValue="cash">
          <option value="cash">{t("cash")}</option>
          <option value="online">{t("online")}</option>
        </select>
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
      <label>
        {t("user")}
        <select
          name="profile_id"
          required
          value={selectedProfileId}
          onChange={(event) => setSelectedProfileId(event.target.value)}
        >
          <option value="">{t("selectUser")}</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.full_name} · {t(roleLabelKeys[profile.role] ?? profile.role)}
            </option>
          ))}
        </select>
      </label>
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
  action: (formData: FormData) => Promise<ActionResult>;
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
  const visibleSummaries = owner
    ? summaries.filter((summary) => summary.profile.active && summary.profile.role === "staff")
    : summaries.filter((summary) => summary.profile.id === profile.id);
  const selectedReviewSummary = reviewProfileId ? visibleSummaries.find((summary) => summary.profile.id === reviewProfileId) ?? null : null;
  const pendingReviewCount = (summary: UserClosingSummary) =>
    payments.filter(
      (payment) =>
        paymentReviewProfileId(payment) === summary.profile.id &&
        payment.record_status === "active" &&
        belongsToClosingReview(payment.payment_date, date, payment.approval_status) &&
        isPendingReviewStatus(payment.approval_status),
    ).length +
    expenses.filter(
      (expense) =>
        expense.spent_by === summary.profile.id &&
        expense.record_status === "active" &&
        belongsToClosingReview(expense.expense_date, date, expense.approval_status) &&
        isPendingReviewStatus(expense.approval_status),
    ).length;
  const overview = {
    opening: visibleSummaries.reduce((sum, summary) => sum + summary.opening, 0),
    collected: visibleSummaries.reduce((sum, summary) => sum + summary.collected, 0),
    expenses: visibleSummaries.reduce((sum, summary) => sum + summary.expenses, 0),
    closing: visibleSummaries.reduce((sum, summary) => sum + summary.closing, 0),
  };

  if (selectedReviewSummary && owner) {
    return (
      <ClosingReviewDetail
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
          <article className="closing-overview-card">
            <span>{t("totalOpening")}</span>
            <strong>{formatMoney(overview.opening)}</strong>
          </article>
          <article className="closing-overview-card positive">
            <span>{t("totalCollected")}</span>
            <strong>{formatMoney(overview.collected)}</strong>
          </article>
          <article className="closing-overview-card negative">
            <span>{t("totalExpenses")}</span>
            <strong>{formatMoney(overview.expenses)}</strong>
          </article>
          <article className="closing-overview-card net">
            <span>{t("netSettlement")}</span>
            <strong>{formatMoney(overview.closing)}</strong>
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
            const pendingCount = pendingReviewCount(summary);
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
                  <span className={pendingCount > 0 ? "closing-status warning" : "closing-status"}>
                    {pendingCount > 0 ? `${pendingCount} ${t("pending")}` : t("active")}
                  </span>
                </div>
                <div className="closing-ledger-parts">
                  <span>
                    <small>{t("openingCashBalance")}</small>
                    <strong>{formatMoney(summary.opening)}</strong>
                  </span>
                  <span className="positive">
                    <small>{t("cashInCollected")}</small>
                    <strong>{formatMoney(summary.collected)}</strong>
                  </span>
                  <span className="negative">
                    <small>{t("cashOutExpenses")}</small>
                    <strong>{formatMoney(summary.expenses)}</strong>
                  </span>
                  <span>
                    <small>{t("settledAmount")}</small>
                    <strong>{formatMoney(summary.sent + summary.received)}</strong>
                  </span>
                </div>
                <div className="closing-net-row">
                  <span>{t("netBalance")}</span>
                  <strong>{formatMoney(summary.closing)}</strong>
                </div>
                {owner ? (
                  <button className="closing-review-button" type="button" onClick={() => setReviewProfileId(summary.profile.id)}>
                    {t("reviewAndSettle")}
                  </button>
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
        transferLines: transferSummaryLines(payment, paymentTransfers(movements, payment.id), profiles, t),
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
        mode: labelForMode(expense.mode, t),
        status: expense.approval_status,
        recordDate: expense.expense_date,
        isBacklog: expense.expense_date < date,
        createdAt: expense.created_at,
        transferLines: [] as string[],
        hasPendingTransfer: false,
        tone: "negative" as const,
        icon: <ReceiptText size={22} />,
      })),
  ].sort((a, b) => a.recordDate.localeCompare(b.recordDate) || a.createdAt.localeCompare(b.createdAt));
  const todayRecords = reviewRecords.filter((record) => record.recordDate === date);
  const pendingRecords = reviewRecords.filter((record) => isPendingReviewStatus(record.status));
  const visibleReviewRecords = reviewTab === "today" ? todayRecords : pendingRecords;
  const actionableRecords = pendingRecords;
  const settlementAmount = Math.abs(summary.closing);
  const settlementDirection: SettlementDirection = summary.closing >= 0 ? "received_from_user" : "sent_to_user";
  const canFinalize = actionableRecords.length === 0 && settlementAmount > 0;
  const createdTime = (createdAt: string) => createdAt.slice(11, 16);

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
        <article>
          <span>{t("openingCashBalance")}</span>
          <strong>{formatMoney(summary.opening)}</strong>
        </article>
        <article className="positive">
          <span>{t("cashInCollected")}</span>
          <strong>{formatMoney(summary.collected)}</strong>
        </article>
        <article className="negative">
          <span>{t("cashOutExpenses")}</span>
          <strong>{formatMoney(summary.expenses)}</strong>
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
            const canReview = isPendingReviewStatus(record.status);
            const recordWhen = record.isBacklog ? `${record.recordDate} · ${createdTime(record.createdAt)} · ${t("backlog")}` : createdTime(record.createdAt);
            return (
              <article className={`review-transaction-card ${record.tone}`} key={`${record.recordType}-${record.id}`}>
                <div className="review-transaction-icon">{record.icon}</div>
                <div className="review-transaction-main">
                  <strong>{record.title}</strong>
                  <p>{recordWhen} · {record.mode}</p>
                  {record.transferLines.length > 0 ? (
                    <div className="review-transfer-note">
                      {record.transferLines.map((line) => (
                        <span key={line}>{line}</span>
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
                    <MiniAction
                      hidden={{ record_type: record.recordType, id: record.id, decision: "rejected" }}
                      label={t("reject")}
                      tone="reject"
                      icon={<X size={18} />}
                      action={approveRecordAction}
                      setNotice={setNotice}
                      startTransition={startTransition}
                    />
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
        </div>
      </section>

      <form
        className="review-settle-bar"
        onSubmit={(event) => submitAndClose(event, settleCashAction, setNotice, startTransition, close)}
      >
        <input type="hidden" name="settlement_direction" value={settlementDirection} />
        <input type="hidden" name="profile_id" value={summary.profile.id} />
        <input type="hidden" name="settlement_date" value={date} />
        <input type="hidden" name="amount" value={settlementAmount} />
        <button type="submit" disabled={!canFinalize}>
          <ShieldCheck size={18} />
          {canFinalize ? t("finalizeAndSettle") : t("reviewPendingFirst")}
        </button>
      </form>
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
