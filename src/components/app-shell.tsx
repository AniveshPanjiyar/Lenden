"use client";

import { createContext, FormEvent, ReactNode, useCallback, useContext, useEffect, useMemo, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Banknote,
  Bell,
  BellRing,
  BookOpen,
  CalendarDays,
  Camera,
  Check,
  ClipboardList,
  EllipsisVertical,
  GraduationCap,
  Hotel,
  Landmark,
  Menu,
  Minus,
  Plus,
  ReceiptText,
  Settings,
  ShieldCheck,
  Trash2,
  UserPlus,
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
  logoutAction,
  markNotificationsReadAction,
  respondAgentSettlementAction,
  respondTransferAction,
  reviewChangeRequestAction,
  saveCourseAction,
  saveReferralAction,
  saveRoomAction,
  saveStaffPermissionsAction,
  settleCashAction,
  updateRecordAction,
} from "@/app/actions";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import { addMonthsIso, businessLabels, businessPermissions, formatMoney, isOwnerish, permissionOptions, todayIso } from "@/lib/constants";
import type { AgentSettlement, AppData, AppNotification, BusinessType, Course, Expense, LedgerEntry, MoneyMovement, Payment, PaymentMode, Profile, ReferralCode } from "@/lib/types";
import { rangeForPreset, type AppTab, type AppViewState, type DateRangePreset, type DateRangeState, type SettlementFilter, type TransactionFilter } from "@/lib/view-state";

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

function getProfileImage(fullName: string) {
  const name = fullName.toLowerCase();
  if (name.includes("alex")) return "https://lh3.googleusercontent.com/aida-public/AB6AXuCKWCI0NmjmpzJ1Ou2dOGYzT_SqCk-zMQSUHuWDPj_63UFU9HjpIXkgUGc6quxycauzhwBCadMr96AaOYuGtlG7LHci7q461fo8T55rkGDe7_eQ0vTJk1QLVn85jsmc8uyNmIc7EEcm64Y41gKH7DCfPXadqRCa8Zocve1EXXVsoeOy4Rcw0MpArfkFOe5Yx2gk2NP5t-_v6Zz7bx53fJX1q2x3IFMcLa6QtRKAGn5HLXzeTXxPIuYoEKeCR9uxzztIDpwnkpr_4Q";
  if (name.includes("altamash")) return "https://lh3.googleusercontent.com/aida-public/AB6AXuDf2QPj4Z950V9MxBXiG9oe269_76pWubhnTjuc1HBILwGR7F0slFHrB4jw0PyJA51rGSxLWI1FbNTd6dw_KUdOjw8THKM9Z_OYZkBIFPuwTQBTpjpMJ3W1GP25VBmEwH9wPZjcBI0ViMlbEQAzkhpxHgeEB8Csnvmvwa4NvX_KCoJbUM3bdSMljm--QQKi6fh_NMng8kYlyUg835dC2ViVLTviZK3o-4RRpvTrL4UlC2sHihyILbk6Iwcs-zKrWyNj-QLNpkuH_A";
  if (name.includes("anivesh")) return "https://lh3.googleusercontent.com/aida-public/AB6AXuBHMvZIaJASvGEBfDthL6ypfh1vBLMwtCra6pNz6Tcy_bKUPIvvZhyctDwQOmMUmAsluHA6sjentAvFQuR6sGxpITLJDo9CoSakBvFmft5f4XejNWMnUC30uKKxpmImL_przYNWVIz3tGGH0qessaEuFgkIixw3DuLoFqZYacrYdwEvPWJzmWLroLHn62gd1u7dY9xmsVh2G0F7JAlbGZE4ELXsjTNh4rka97FDKl7Dde1uA0hoq8JtuJjyJM0whgwALe5LLDdLAQ";
  if (name.includes("monira")) return "https://lh3.googleusercontent.com/aida-public/AB6AXuDh99_4mUjnxTvzPDseWFd1yGf9701A2EOZW4Adntw-5OZ3G-QaYf0EAqPk07G4Abw_OtyuAJmGyNoGdIigFBwtmJpnd0FDH59zzqOv6l_tasJDX3QXL_PCsMOCpsMi283ShI_gVr1uN4e6UZQf7ygF5gNpda1NEAUnXfWWCPbYseV6bqdfqhJqemeiT-vtIsikhxwlVUQekxRRUhJPKcq-qm_8dp20QW03GZLzc1owf1G463EhcL8oKxQ7zZRcv7BvaSxWh4jDKQ";
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=c8e8d0&color=002110`;
}

function getTabIcon(id: Tab, active: boolean) {
  const fillClass = active ? "icon-fill" : "";
  switch (id) {
    case "home":
      return <span className={`material-symbols-outlined ${fillClass}`}>home</span>;
    case "payments":
      return <span className={`material-symbols-outlined ${fillClass}`}>payments</span>;
    case "closing":
      return <span className={`material-symbols-outlined ${fillClass}`}>event_repeat</span>;
    case "transfers":
      return <span className={`material-symbols-outlined ${fillClass}`}>handshake</span>;
    case "settings":
      return <span className={`material-symbols-outlined ${fillClass}`}>settings</span>;
  }
}

const tabItems: { id: Tab; labelKey: string; icon: ReactNode }[] = [
  { id: "home", labelKey: "dashboard", icon: <Landmark size={17} /> },
  { id: "payments", labelKey: "transactions", icon: <ReceiptText size={17} /> },
  { id: "closing", labelKey: "closing", icon: <ClipboardList size={17} /> },
  { id: "transfers", labelKey: "settlements", icon: <ArrowLeftRight size={17} /> },
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

const settlementDateRangeOptions = dateRangeOptions.filter((option) => option.value !== "this_month");

const messages: Record<Language, Record<string, string>> = {
  en: {
    accept: "Accept",
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
    allTypes: "All types",
    advance: "Advance",
    agent: "Agent",
    agentPayout: "Agent Incentive",
    agentPayoutLower: "Agent incentive",
    amount: "Amount",
    approve: "Approve",
    balanceIncentive: "Balance incentive",
    business: "Business",
    cancelWrongEntry: "Cancel wrong entry",
    cash: "Cash",
    cashAndOnline: "Cash and online",
    cashBalances: "Cash balances",
    cashCollection: "Cash collection",
    cashIn: "Cash in",
    cashOut: "Cash out",
    cashWithStaff: "Cash with staff",
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
    confirmReceived: "Confirm received",
    confirmedPayouts: "Confirmed payouts",
    collectedByStaff: "Collected payment",
    course: "Course",
    courseName: "Course name",
    courses: "Courses",
    createAccount: "Create account",
    customRange: "Custom range",
    dailyClosing: "Daily closing",
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
    fee: "Fee",
    filterPayments: "Filter payments",
    fullName: "Full name",
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
    noAgent: "No agent",
    noNotifications: "No notifications yet.",
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
    optional: "Optional",
    owner: "Owner",
    ownerSettlement: "Owner Settlement",
    ownerSettlementLower: "Owner settlement",
    outflowsOnly: "Outflows only",
    paid: "Paid",
    password: "Password",
    paymentDate: "Payment date",
    paymentHistory: "Payment history",
    paymentType: "Payment type",
    payments: "Payments",
    paymentsFor: "Payments for",
    paymentsOnly: "Payments only",
    pendingPayout: "Pending payout",
    photo: "Photo",
    quickActions: "Quick actions",
    rangeTo: "to",
    reasonOptional: "Reason optional",
    reasonRequired: "Reason required",
    referral: "Referral",
    referralCode: "Referral code",
    referralCodes: "Referral codes",
    received: "Received",
    receiveMoney: "Receive money",
    receivedFormTitle: "RECEIVED",
    reject: "Reject",
    rejectForReverification: "Reject for reverification",
    remaining: "Remaining",
    remark: "Remark",
    requestCancel: "Request cancel",
    requestTransfer: "Request transfer",
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
    sendPayout: "Send incentive for confirmation",
    sendMoney: "Send money",
    sendFormTitle: "SEND",
    sendMoneyLower: "send money",
    sent: "Sent",
    sentToStaff: "Sent to staff",
    sentToUser: "Sent to user",
    seat: "Seat",
    seatNumber: "Seat number",
    settings: "Settings",
    settled: "Settled",
    settlementDate: "Settlement date",
    settlementHistory: "Settlement history",
    settlements: "Settlements",
    shikshanSansthan: "Shikshan Sansthan",
    skill: "Skill",
    slotHours: "Slot hours",
    staff: "Staff",
    staffPermissions: "Staff permissions",
    startDate: "Start date",
    startTime: "Start time",
    status: "Status",
    to: "to",
    toEmployee: "To employee",
    today: "Today",
    totalClosing: "Total closing",
    totalCollection: "Total collection",
    totalOpening: "Total opening",
    transferCash: "Transfer cash",
    transferHistory: "Transfer history",
    transfers: "Transfers",
    transactionHistory: "Transaction history",
    transactionReview: "Transactions review",
    transactions: "Transactions",
    thisMonth: "This month",
    unknown: "Unknown",
    unreadNotifications: "Unread notifications",
    user: "User",
    verifyPayment: "Verify payment",
    yesterday: "Yesterday",
    receivedFromStaff: "Received from staff",
    receivedFromUser: "Received from user",
    recordReceived: "Record received",
    recordSent: "Record sent",
    self: "Self",
    adjustments: "Adjustments",
  },
  hi: {
    accept: "मान लें",
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
    allTypes: "सब तरह",
    advance: "अधिक जमा",
    agent: "एजेंट",
    agentPayout: "एजेंट कमिशन",
    agentPayoutLower: "एजेंट कमिशन",
    amount: "रकम",
    approve: "ठीक है",
    balanceIncentive: "बाकी कमिशन",
    business: "काम",
    cancelWrongEntry: "गलत एंट्री हटाएं",
    cash: "नकद",
    cashAndOnline: "नकद और ऑनलाइन",
    cashBalances: "नकद बाकी",
    cashCollection: "नकद जमा",
    cashIn: "नकद आया",
    cashOut: "नकद गया",
    cashWithStaff: "स्टाफ के पास नकद",
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
    confirmReceived: "मिल गया",
    confirmedPayouts: "दिया गया भुगतान",
    collectedByStaff: "जमा पैसा",
    course: "कोर्स",
    courseName: "कोर्स नाम",
    courses: "कोर्स",
    createAccount: "खाता बनाएं",
    customRange: "कस्टम रेंज",
    dailyClosing: "आज का हिसाब",
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
    fee: "फीस",
    filterPayments: "छांटें",
    fullName: "पूरा नाम",
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
    noAgent: "एजेंट नहीं",
    noNotifications: "अभी कोई सूचना नहीं।",
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
    optional: "जरूरी नहीं",
    owner: "मालिक",
    ownerSettlement: "मालिक को जमा",
    ownerSettlementLower: "मालिक को जमा",
    outflowsOnly: "सिर्फ खर्च",
    paid: "जमा",
    password: "पासवर्ड",
    paymentDate: "जमा तारीख",
    paymentHistory: "पैसे का हिसाब",
    paymentType: "किस काम का पैसा",
    payments: "पैसा",
    paymentsFor: "इस तारीख का पैसा",
    paymentsOnly: "सिर्फ जमा पैसा",
    pendingPayout: "बाकी भुगतान",
    photo: "फोटो",
    quickActions: "जल्दी काम",
    rangeTo: "से",
    reasonOptional: "कारण जरूरी नहीं",
    reasonRequired: "कारण जरूरी",
    referral: "रेफरल",
    referralCode: "रेफरल कोड",
    referralCodes: "रेफरल कोड",
    received: "मिला",
    receiveMoney: "पैसा प्राप्त करें",
    receivedFormTitle: "मिला",
    reject: "नहीं मानें",
    rejectForReverification: "फिर जांच के लिए लौटाएं",
    remaining: "बाकी",
    remark: "बात",
    requestCancel: "हटाने की मांग",
    requestTransfer: "भेजने की मांग",
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
    sendPayout: "पक्का करने के लिए कमिशन भेजें",
    sendMoney: "पैसा भेजें",
    sendFormTitle: "भेजें",
    sendMoneyLower: "पैसा भेजें",
    sent: "भेजा",
    sentToStaff: "स्टाफ को भेजा",
    sentToUser: "यूजर को भेजा",
    seat: "सीट",
    seatNumber: "सीट नंबर",
    settings: "सेटिंग",
    settled: "जमा हुआ",
    settlementDate: "सेटलमेंट तारीख",
    settlementHistory: "सेटलमेंट हिसाब",
    settlements: "सेटलमेंट",
    shikshanSansthan: "शिक्षण संस्थान",
    skill: "स्किल",
    slotHours: "घंटा",
    staff: "स्टाफ",
    staffPermissions: "स्टाफ अधिकार",
    startDate: "शुरू तारीख",
    startTime: "शुरू समय",
    status: "हाल",
    to: "को",
    toEmployee: "किस स्टाफ को",
    today: "आज",
    totalClosing: "कुल बंद हिसाब",
    totalCollection: "कुल जमा",
    totalOpening: "कुल शुरू हिसाब",
    transferCash: "नकद भेजें",
    transferHistory: "भेजने का हिसाब",
    transfers: "पैसा भेजना",
    transactionHistory: "लेनदेन हिसाब",
    transactionReview: "लेनदेन जांच",
    transactions: "लेनदेन",
    thisMonth: "इस महीने",
    unknown: "पता नहीं",
    unreadNotifications: "नई सूचनाएं",
    user: "यूजर",
    verifyPayment: "पैसा जांचें",
    yesterday: "कल",
    receivedFromStaff: "स्टाफ से मिला",
    receivedFromUser: "यूजर से मिला",
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
  const formData = new FormData(form);
  setFormSubmitting(form, true);
  startTransition(async () => {
    try {
      const result = await action(formData);
      setNotice(result);
      if (result.ok) {
        if (reset) form.reset();
        form.closest("details")?.removeAttribute("open");
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
  const formData = new FormData(form);
  setFormSubmitting(form, true);
  startTransition(async () => {
    try {
      const result = await action(formData);
      setNotice(result);
      if (result.ok) {
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

function paymentModeLabel(payment: Payment, t: (key: string) => string) {
  if (payment.mode !== "mixed") return labelForMode(payment.mode, t);
  return `${labelForMode("mixed", t)}: ${t("cash")} ${formatMoney(paymentCashAmount(payment))}, ${t("online")} ${formatMoney(paymentOnlineAmount(payment))}`;
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

function formatDateRange(range: NormalizedDateRange, t: (key: string) => string) {
  if (range.from === range.to) return range.from;
  return `${range.from} ${t("rangeTo")} ${range.to}`;
}

function activePermissions(role: string, permissions: string[]) {
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

function balanceTone(value: number) {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

function roleBadge(profile: Profile) {
  if (profile.role === "sales_agent") return "A";
  if (profile.role === "staff") return "S";
  return "O";
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
  const initialTransactionProfileId = data.profiles.some((profile) => profile.id === initialViewState.transactionProfileId)
    ? initialViewState.transactionProfileId
    : data.profile.id;
  const [tab, setTab] = useState<Tab>(initialViewState.tab);
  const [language, setLanguageState] = useState<Language>("en");
  const [dateRange, setDateRange] = useState<DateRangeState>(initialViewState.dateRange);
  const [transactionProfileId, setTransactionProfileId] = useState(initialTransactionProfileId);
  const [transactionFilter, setTransactionFilter] = useState<TransactionFilter>(initialViewState.transactionFilter);
  const [settlementFilter, setSettlementFilter] = useState<SettlementFilter>(initialViewState.settlementFilter);
  const [closingSettlement, setClosingSettlement] = useState<{
    profile: Profile;
    direction: SettlementDirection;
    defaultAmount: number;
  } | null>(null);
  const [toasts, setToasts] = useState<ToastNotice[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>(data.notifications);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [actionModal, setActionModal] = useState<ActionModal>(null);
  const [selectedPositive, setSelectedPositive] = useState<PositiveFlow | null>(null);
  const [selectedNegative, setSelectedNegative] = useState<NegativeFlow | null>(null);
  const [pending, startTransition] = useTransition();
  const t = useMemo(() => (key: string) => messages[language][key] ?? messages.en[key] ?? key, [language]);
  const unreadNotifications = notifications.filter((notification) => !notification.read_at).length;

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
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tab);
    params.set("range", dateRange.preset);
    params.set("txUser", transactionProfileId);
    params.set("txFilter", transactionFilter);
    params.set("settlementFilter", settlementFilter);

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
  }, [dateRange, settlementFilter, tab, transactionFilter, transactionProfileId]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`app-notifications-${data.profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "app_notifications",
          filter: `recipient_id=eq.${data.profile.id}`,
        },
        (payload) => {
          const notification = payload.new as AppNotification;
          setNotifications((current) => [notification, ...current.filter((item) => item.id !== notification.id)]);
          pushNotice({ ok: true, message: `${notification.title}: ${notification.body}` });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [data.profile.id, pushNotice]);

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
        setNotifications((current) =>
          current.map((notification) => notification.read_at ? notification : { ...notification, read_at: readAt }),
        );
        startTransition(async () => {
          const result = await markNotificationsReadAction();
          if (!result.ok) pushNotice(result);
        });
      }
      return nextOpen;
    });
  }

  const owner = isOwnerish(data.profile.role);
  const permissions = activePermissions(data.profile.role, data.permissions);
  const mainCourses = data.courses.filter((course) => course.kind === "main" && course.active);
  const skillCourses = data.courses.filter((course) => course.kind === "skill" && course.active);
  const activeRooms = data.rooms.filter((room) => room.active);
  const salesAgents = data.profiles.filter((profile) => profile.active && profile.role === "sales_agent");
  const staffAndAgentProfiles = data.profiles.filter(
    (profile) => profile.active && (profile.role === "staff" || profile.role === "sales_agent") && profile.id !== data.profile.id,
  );
  const moneyMovementProfiles = data.profiles.filter((profile) => {
    if (!profile.active || profile.id === data.profile.id) return false;
    return owner || isOwnerish(profile.role);
  });
  const permissionsByProfile = useMemo(() => {
    return data.profiles.reduce<Record<string, string[]>>((acc, profile) => {
      acc[profile.id] = data.allPermissions
        .filter((permission) => permission.profile_id === profile.id)
        .map((permission) => permission.permission);
      return acc;
    }, {});
  }, [data.allPermissions, data.profiles]);

  const selectedDateRange = normalizeDateRange(dateRange);
  const selectedDateRangeLabel = formatDateRange(selectedDateRange, t);
  const closingDate = selectedDateRange.to;
  const filteredPayments = data.payments.filter((payment) => dateInRange(payment.payment_date, selectedDateRange));
  const filteredExpenses = data.expenses.filter((expense) => dateInRange(expense.expense_date, selectedDateRange));
  const transactionUserId = owner ? transactionProfileId : data.profile.id;
  const transactionEntries = useMemo(() => {
    if (transactionFilter === "deleted") return [];
    return data.ledger
      .filter((entry) => entry.account_profile_id === transactionUserId && dateInRange(entry.entry_date, selectedDateRange))
      .filter((entry) => {
        const amount = numberValue(entry.amount);
        if (transactionFilter === "received") return amount > 0;
        if (transactionFilter === "sent") return amount < 0;
        return true;
      })
      .sort((a, b) => `${b.entry_date}-${b.created_at}`.localeCompare(`${a.entry_date}-${a.created_at}`));
  }, [data.ledger, selectedDateRange, transactionFilter, transactionUserId]);
  const closingProfiles = data.profiles.filter((profile) => profile.active);
  const closingSummaries = useMemo(
    () => closingProfiles.map((profile) => buildClosingSummary(profile, data.ledger, closingDate)),
    [closingDate, closingProfiles, data.ledger],
  );
  const closingTotals = useMemo(
    () => ({
      opening: closingSummaries.reduce((sum, summary) => sum + summary.opening, 0),
      closing: closingSummaries.reduce((sum, summary) => sum + summary.closing, 0),
    }),
    [closingSummaries],
  );
  const agentIncentiveSummary = useMemo<AgentIncentiveSummary>(() => {
    const agentPayments = data.payments.filter(
      (payment) =>
        payment.referral_agent_id === data.profile.id &&
        payment.record_status === "active" &&
        payment.approval_status === "approved",
    );
    const earned = agentPayments.reduce((sum, payment) => sum + numberValue(payment.incentive_amount), 0);
    const settled = data.agentSettlements
      .filter((settlement) => settlement.agent_id === data.profile.id && settlement.status === "accepted")
      .reduce((sum, settlement) => sum + numberValue(settlement.amount), 0);
    const pending = data.agentSettlements
      .filter((settlement) => settlement.agent_id === data.profile.id && settlement.status === "pending")
      .reduce((sum, settlement) => sum + numberValue(settlement.amount), 0);

    return {
      earned,
      settled,
      pending,
      balance: Math.max(earned - settled - pending, 0),
      count: agentPayments.length,
    };
  }, [data.agentSettlements, data.payments, data.profile.id]);

  const agentIncentiveBalances = useMemo<AgentIncentiveBalance[]>(() => {
    return salesAgents
      .map((agent) => {
        const earned = data.payments
          .filter(
            (payment) =>
              payment.referral_agent_id === agent.id &&
              payment.record_status === "active" &&
              payment.approval_status === "approved",
          )
          .reduce((sum, payment) => sum + numberValue(payment.incentive_amount), 0);
        const committed = data.agentSettlements
          .filter((settlement) => settlement.agent_id === agent.id && (settlement.status === "pending" || settlement.status === "accepted"))
          .reduce((sum, settlement) => sum + numberValue(settlement.amount), 0);
        return { agent, balance: Math.max(earned - committed, 0) };
      })
      .filter((item) => item.balance > 0);
  }, [data.agentSettlements, data.payments, salesAgents]);

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
    };
  }, [filteredExpenses, filteredPayments]);

  const cashBalances = useMemo(() => {
    return data.profiles.map((profile) => ({
      profile,
      balance: data.ledger
        .filter((entry) => entry.account_profile_id === profile.id)
        .reduce((sum, entry) => sum + numberValue(entry.amount), 0),
    }));
  }, [data.ledger, data.profiles]);

  function canUsePayment(type: BusinessType | "expense") {
    if (type === "expense") return permissions.includes("add_expense");
    return permissions.includes(businessPermissions[type]);
  }

  function changeTab(nextTab: Tab) {
    if (nextTab === "transfers" && dateRange.preset === "this_month") {
      setDateRange(rangeForPreset("today"));
    }
    setTab(nextTab);
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

  const activeDateRangeOptions = tab === "transfers" ? settlementDateRangeOptions : dateRangeOptions;

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
    <div className="bg-surface text-on-surface antialiased min-h-screen flex flex-col selection:bg-primary-container selection:text-on-primary-container pb-24 md:pb-0">
      <header className="bg-surface dark:bg-surface flex justify-between items-center px-4 py-3 w-full sticky top-0 z-40 transition-shadow border-b border-outline-variant/10 shadow-xs" id="main-header">
        <div className="flex items-center gap-3">
          <button aria-label="Open Menu" className="text-primary dark:text-inverse-primary hover:bg-surface-container-low dark:hover:bg-surface-container-highest transition-colors rounded-full p-2 scale-95 duration-100 ease-in-out md:hidden cursor-pointer" onClick={() => setSidebarOpen(true)}>
            <span className="material-symbols-outlined">menu</span>
          </button>
          <span className="font-headline text-xl font-bold text-primary dark:text-inverse-primary">Lenden</span>
        </div>
        <div className="font-headline text-headline-sm font-semibold tracking-tight text-primary dark:text-inverse-primary hidden md:block">
          {t(tabItems.find((item) => item.id === tab)?.labelKey ?? "dashboard")}
        </div>
        <div className="flex items-center gap-3">
          <button
            className="text-on-surface-variant hover:bg-surface-container-low transition-colors rounded-full p-2 relative cursor-pointer"
            onClick={toggleNotifications}
            aria-label={t("notifications")}
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>notifications</span>
            {unreadNotifications > 0 ? (
              <span className="absolute top-2 right-2.5 w-2 h-2 bg-error rounded-full border-2 border-surface"></span>
            ) : null}
          </button>
          <button className="rounded-full overflow-hidden w-9 h-9 border border-outline-variant/30 shadow-soft focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface">
            <img alt="Profile picture of user" className="w-full h-full object-cover" src={getProfileImage(data.profile.full_name)}/>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative w-full max-w-7xl mx-auto">
        {sidebarOpen && (
          <button
            className="fixed inset-0 z-45 bg-black/40 backdrop-blur-xs md:hidden border-0 cursor-pointer"
            aria-label={t("closeNavigation")}
            type="button"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-surface-container-low dark:bg-surface-container-lowest h-full w-80 shadow-2xl py-6 overflow-y-auto transition-transform duration-300 md:sticky md:top-[64px] md:h-[calc(100vh-64px)] md:shadow-xl md:rounded-r-xl ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:flex'}`}>
          <div className="px-6 mb-8 flex items-center gap-4">
            <img alt="User profile" className="w-12 h-12 rounded-full object-cover shadow-sm" src={getProfileImage(data.profile.full_name)}/>
            <div>
              <h2 className="font-headline text-lg font-bold text-primary">{data.profile.full_name}</h2>
              <p className="font-body text-body-md text-on-surface-variant">{t(roleLabelKeys[data.profile.role] ?? data.profile.role)}</p>
            </div>
          </div>
          <nav className="flex-1 px-4 space-y-1">
            {tabItems.map((item) => (
              <button
                key={item.id}
                onClick={() => changeTab(item.id)}
                className={`flex items-center gap-3 px-4 py-3 m-2 p-2 rounded-lg transition-all duration-200 w-full text-left cursor-pointer border-0 ${tab === item.id ? 'bg-primary-container text-on-primary-container font-bold shadow-xs' : 'text-on-surface-variant dark:text-on-surface-variant hover:bg-surface-variant/50 dark:hover:bg-surface-variant/20'}`}
              >
                {getTabIcon(item.id, tab === item.id)}
                <span className="font-body text-body-md">{t(item.labelKey)}</span>
              </button>
            ))}
          </nav>
          <div className="px-4 mt-auto">
            <form action={logoutAction}>
              <button className="flex items-center gap-3 px-4 py-3 text-error m-2 p-2 rounded-lg hover:bg-error-container/50 transition-all duration-200 w-full text-left cursor-pointer border-0" type="submit">
                <span className="material-symbols-outlined">logout</span>
                <span className="font-body text-body-md">{t("logout")}</span>
              </button>
            </form>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8 w-full" onInvalidCapture={handleInvalid}>
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3 md:hidden">
                <h1 className="font-headline text-2xl font-bold text-on-surface">
                  {t(tabItems.find((item) => item.id === tab)?.labelKey ?? "dashboard")}
                </h1>
              </div>
              
              <div className="controls-row flex items-center gap-2 ml-auto">
                {tab === "closing" ? (
                  <div className="date-filter date-range-filter flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-lg border border-outline-variant/30">
                    <span className="material-symbols-outlined text-primary text-lg">calendar_today</span>
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
                  <div className="date-filter date-range-filter flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-lg border border-outline-variant/30">
                    <span className="material-symbols-outlined text-primary text-lg">calendar_today</span>
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

            <ToastStack toasts={toasts} pending={pending} savingLabel={t("saving")} dismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
            {pending ? <div className="action-lock" aria-hidden="true" /> : null}
            {notificationsOpen ? (
              <NotificationSheet
                notifications={notifications}
                profiles={data.profiles}
                close={() => setNotificationsOpen(false)}
              />
            ) : null}

            {tab === "home" ? (
              <HomeView
                totals={totals}
                cashBalances={cashBalances}
                owner={owner}
                data={data}
                changeTab={changeTab}
              />
            ) : null}

            {tab === "payments" ? (
              <TransactionsView
                dateLabel={selectedDateRangeLabel}
                dateRange={selectedDateRange}
                entries={transactionEntries}
                transactionFilter={transactionFilter}
                setTransactionFilter={setTransactionFilter}
                transactionProfileId={transactionUserId}
                setTransactionProfileId={setTransactionProfileId}
                payments={data.payments}
                expenses={data.expenses}
                movements={data.movements}
                profiles={data.profiles}
                profile={data.profile}
                owner={owner}
                agentIncentiveSummary={agentIncentiveSummary}
                setNotice={pushNotice}
                startTransition={startTransition}
              />
            ) : null}

            {tab === "closing" ? (
              <ClosingView
                date={closingDate}
                owner={owner}
                profile={data.profile}
                summaries={closingSummaries}
                totals={closingTotals}
                setSettlementDraft={setClosingSettlement}
              />
            ) : null}

            {tab === "transfers" ? (
              <SettlementsView
                profile={data.profile}
                owner={owner}
                profiles={data.profiles}
                movements={data.movements}
                agentSettlements={data.agentSettlements}
                dateRange={selectedDateRange}
                settlementFilter={settlementFilter}
                setSettlementFilter={setSettlementFilter}
                setNotice={pushNotice}
                startTransition={startTransition}
              />
            ) : null}

            {tab === "settings" ? (
              <SettingsView
                owner={owner}
                profile={data.profile}
                profiles={data.profiles}
                rooms={data.rooms}
                courses={data.courses}
                referrals={data.referrals}
                salesAgents={salesAgents}
                changeRequests={data.changeRequests}
                permissionsByProfile={permissionsByProfile}
                                setNotice={pushNotice}
                startTransition={startTransition}
              />
            ) : null}
          </div>
        </main>
      </div>

      <nav className="md:hidden fixed bottom-0 left-0 w-full flex justify-around items-center pt-2 pb-safe-bottom bg-surface-container dark:bg-surface-container-highest z-45 border-t border-outline-variant/10 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        {tabItems.map((item) => (
          <button
            key={item.id}
            onClick={() => changeTab(item.id)}
            className={`flex flex-col items-center justify-center px-3 py-1.5 active:scale-90 transition-all w-16 cursor-pointer border-0 ${tab === item.id ? 'bg-primary-fixed text-on-primary-fixed rounded-xl mb-1' : 'text-on-surface-variant dark:text-on-surface-variant hover:text-primary dark:hover:text-inverse-primary'}`}
          >
            {getTabIcon(item.id, tab === item.id)}
            <span className="font-label text-[10px] font-medium truncate w-full text-center mt-1">{t(item.labelKey)}</span>
          </button>
        ))}
      </nav>

      <BottomActions
        canAddPositive={(Object.keys(businessPermissions) as BusinessType[]).some((type) => canUsePayment(type)) || moneyMovementProfiles.length > 0}
        canAddNegative={canUsePayment("expense") || moneyMovementProfiles.length > 0 || (owner && staffAndAgentProfiles.length > 0)}
        onPositive={() => openAction("positive")}
        onNegative={() => openAction("negative")}
      />

      {actionModal ? (
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
          referrals={data.referrals}
          moneyMovementProfiles={moneyMovementProfiles}
          settlementDate={closingDate}
          agentIncentiveBalances={agentIncentiveBalances}
          closeAction={closeAction}
          setNotice={pushNotice}
          startTransition={startTransition}
        />
      ) : null}

      {closingSettlement ? (
        <ClosingSettlementModal
          draft={closingSettlement}
          date={closingDate}
          close={() => setClosingSettlement(null)}
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
  changeTab,
}: {
  totals: {
    total: number;
    cash: number;
    online: number;
    expense: number;
    byBusiness: Record<BusinessType, number>;
  };
  cashBalances: { profile: Profile; balance: number }[];
  owner: boolean;
  data: AppData;
  changeTab: (tab: AppTab) => void;
}) {
  const { t } = useLanguage();

  // Outline: Calculate pending amounts and render either a personalized staff dashboard or a detailed bento-grid owner dashboard with daily closing status list.
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

        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-primary-container/20 rounded-xl p-6 shadow-soft flex flex-col justify-between h-40 relative overflow-hidden group">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-primary/10 rounded-full blur-2xl group-hover:bg-primary/20 transition-all duration-500"></div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-primary">account_balance_wallet</span>
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
                <span className="material-symbols-outlined text-error">receipt_long</span>
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
                <span className="material-symbols-outlined text-tertiary">pending_actions</span>
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

  const pendingMovements = data.movements.filter((m) => m.status === "pending");
  const pendingAgentSettlements = data.agentSettlements.filter((s) => s.status === "pending");
  const pendingAmount = pendingMovements.reduce((sum, m) => sum + numberValue(m.amount), 0) +
                         pendingAgentSettlements.reduce((sum, s) => sum + numberValue(s.amount), 0);

  const netSettlement = Math.max(totals.total - totals.expense, 0);

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-primary-container/20 rounded-xl p-6 shadow-soft flex flex-col gap-4 relative overflow-hidden group md:col-span-1">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-primary/10 rounded-full blur-2xl group-hover:bg-primary/20 transition-all duration-500"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-primary icon-fill">account_balance_wallet</span>
                <h3 className="font-label text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Total Collection</h3>
              </div>
              <p className="font-headline text-3xl font-bold text-on-primary-container">{formatMoney(totals.total)}</p>
              <p className="text-xs text-primary font-medium mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">trending_up</span> +12% from yesterday
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-primary/10 relative z-10">
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

        <div className="bg-error-container/40 rounded-xl p-6 shadow-soft flex flex-col justify-between h-40 relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-error/10 rounded-full blur-2xl group-hover:bg-error/20 transition-all duration-500"></div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-error icon-fill">receipt_long</span>
              <h3 className="font-label text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Total Expenses</h3>
            </div>
          </div>
          <div>
            <p className="font-headline text-3xl font-bold text-on-error-container">{formatMoney(totals.expense)}</p>
            <p className="text-xs text-error font-medium mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">info</span> Needs review
            </p>
          </div>
        </div>

        <div className="bg-surface-container-low border border-primary/20 rounded-xl p-6 shadow-soft flex flex-col justify-between h-40 relative overflow-hidden group">
          <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-all duration-500"></div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-primary icon-fill">price_check</span>
              <h3 className="font-label text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Net Settlement</h3>
            </div>
          </div>
          <div>
            <p className="font-headline text-3xl font-bold text-primary">{formatMoney(netSettlement)}</p>
            <p className="text-xs text-on-surface-variant font-medium mt-1">Available for transfer</p>
          </div>
        </div>

        <div className="bg-tertiary-container/20 rounded-xl p-6 shadow-soft flex flex-col justify-between h-40 relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-tertiary/10 rounded-full blur-2xl group-hover:bg-tertiary/20 transition-all duration-500"></div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-tertiary icon-fill">pending_actions</span>
              <h3 className="font-label text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Pending</h3>
            </div>
          </div>
          <div>
            <p className="font-headline text-3xl font-bold text-on-tertiary-container">{formatMoney(pendingAmount)}</p>
            <p className="text-xs text-tertiary font-medium mt-1">Awaiting verification</p>
          </div>
        </div>
      </section>

      <section className="bg-surface-bright rounded-2xl p-1 shadow-soft border border-outline-variant/20">
        <div className="px-5 pt-5 pb-3 flex justify-between items-center border-b border-outline-variant/10">
          <h3 className="font-headline text-xl font-bold text-on-surface">Daily Closing Status</h3>
          <button onClick={() => changeTab("closing")} className="text-primary text-sm font-medium hover:underline flex items-center gap-1 cursor-pointer border-0 bg-transparent">
            View All <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>
        <div className="divide-y divide-outline-variant/10">
          {cashBalances
            .filter(({ profile }) => profile.role !== "sales_agent")
            .map(({ profile, balance }) => {
              const userPendingMovements = data.movements.filter(
                (m) => m.status === "pending" && (m.from_profile_id === profile.id || m.to_profile_id === profile.id)
              );
              const userPendingAgent = data.agentSettlements.filter(
                (s) => s.status === "pending" && s.agent_id === profile.id
              );
              const hasPending = userPendingMovements.length > 0 || userPendingAgent.length > 0;
              const pendingUserAmount = userPendingMovements.reduce((sum, m) => sum + numberValue(m.amount), 0) +
                                       userPendingAgent.reduce((sum, s) => sum + numberValue(s.amount), 0);

              let statusText = "Net Balance";
              let statusColor = "text-primary";
              let amountValue = balance;
              let isWarning = false;

              if (hasPending) {
                statusText = "Action Needed";
                statusColor = "text-error";
                amountValue = pendingUserAmount;
                isWarning = true;
              } else if (balance < 0) {
                statusText = "Shortfall";
                statusColor = "text-error";
                amountValue = balance;
              }

              return (
                <div
                  key={profile.id}
                  onClick={() => changeTab("closing")}
                  className={`flex items-center justify-between p-4 hover:bg-surface-container-lowest transition-colors rounded-xl m-1 group cursor-pointer border border-transparent ${isWarning ? 'bg-error-container/10 border-error/10' : ''}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <img alt={`${profile.full_name} profile`} className="w-12 h-12 rounded-full object-cover shadow-sm" src={getProfileImage(profile.full_name)}/>
                      <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-surface-bright ${isWarning ? 'bg-tertiary' : 'bg-primary'}`}></div>
                    </div>
                    <div>
                      <p className="font-bold text-on-surface text-lg">{profile.full_name}</p>
                      {isWarning ? (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="material-symbols-outlined text-error text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                          <p className="text-xs text-error font-medium">Action Needed</p>
                        </div>
                      ) : (
                        <p className="text-sm text-on-surface-variant">{t(roleLabelKeys[profile.role] ?? profile.role)}</p>
                      )}
                    </div>
                  </div>

                  <div className="text-right flex items-center gap-4">
                    <div>
                      <p className={`font-headline font-bold text-lg ${amountValue < 0 ? 'text-error' : 'text-on-surface'}`}>{formatMoney(amountValue)}</p>
                      <p className={`text-xs flex items-center justify-end gap-1 font-medium ${isWarning ? 'text-tertiary' : amountValue < 0 ? 'text-error' : 'text-primary'}`}>
                        {!isWarning && amountValue > 0 && <span className="material-symbols-outlined text-[14px]">arrow_upward</span>}
                        {!isWarning && amountValue < 0 && <span className="material-symbols-outlined text-[14px]">arrow_downward</span>}
                        {isWarning ? "Pending Approval" : statusText}
                      </p>
                    </div>
                    <button aria-label="View Details" className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant group-hover:bg-primary-container group-hover:text-on-primary-container transition-colors border-0 cursor-pointer">
                      <span className="material-symbols-outlined">chevron_right</span>
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      </section>
    </div>
  );
}

function TransactionsView({
  dateLabel,
  dateRange,
  entries,
  transactionFilter,
  setTransactionFilter,
  transactionProfileId,
  setTransactionProfileId,
  payments,
  expenses,
  movements,
  profiles,
  profile,
  owner,
  agentIncentiveSummary,
  setNotice,
  startTransition,
}: {
  dateLabel: string;
  dateRange: NormalizedDateRange;
  entries: LedgerEntry[];
  transactionFilter: TransactionFilter;
  setTransactionFilter: (filter: TransactionFilter) => void;
  transactionProfileId: string;
  setTransactionProfileId: (id: string) => void;
  payments: Payment[];
  expenses: Expense[];
  movements: MoneyMovement[];
  profiles: Profile[];
  profile: Profile;
  owner: boolean;
  agentIncentiveSummary: AgentIncentiveSummary;
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const { t } = useLanguage();
  const positiveTotal = entries
    .filter((entry) => numberValue(entry.amount) > 0)
    .reduce((sum, entry) => sum + numberValue(entry.amount), 0);
  const negativeTotal = entries
    .filter((entry) => numberValue(entry.amount) < 0)
    .reduce((sum, entry) => sum + Math.abs(numberValue(entry.amount)), 0);
  const isSalesAgent = profile.role === "sales_agent";
  const selectableProfiles = profiles.filter((item) => item.active);
  const transactionRecords = useMemo(() => {
    const paymentRows = payments
      .filter((payment) => dateInRange(payment.payment_date, dateRange))
      .map((payment) => ({
        id: payment.id,
        kind: "payment" as const,
        date: payment.payment_date,
        amount: numberValue(payment.amount),
        title: paymentDisplayTitle(payment, t),
        meta: `${profileName(profiles, payment.collected_by, t)} · ${labelForBusiness(payment.business_type, t)} · ${paymentModeLabel(payment, t)}`,
        status: payment.approval_status,
        recordStatus: payment.record_status,
        ownerId: payment.collected_by,
        description: payment.description ?? "",
        remark: payment.remark ?? "",
        reason: payment.cancel_reason,
      }));
    const expenseRows = expenses
      .filter((expense) => dateInRange(expense.expense_date, dateRange))
      .map((expense) => ({
        id: expense.id,
        kind: "expense" as const,
        date: expense.expense_date,
        amount: -numberValue(expense.amount),
        title: expenseDisplayTitle(expense),
        meta: `${profileName(profiles, expense.spent_by, t)} · ${t("expense")} · ${labelForMode(expense.mode, t)}`,
        status: expense.approval_status,
        recordStatus: expense.record_status,
        ownerId: expense.spent_by,
        description: expense.description,
        remark: expense.remark ?? "",
        reason: expense.cancel_reason,
      }));
    const settlementRows = entries
      .filter((entry) => entry.source_type === "settlement")
      .map((entry) => {
        const movement = movements.find((item) => item.id === entry.source_id);
        const amount = numberValue(entry.amount);
        const counterpartyId = amount < 0 ? movement?.to_profile_id : movement?.from_profile_id;
        return {
          id: entry.id,
          kind: "settlement" as const,
          date: entry.entry_date,
          amount,
          title: t("ownerSettlement"),
          meta: `${profileName(profiles, counterpartyId, t)} · ${t("settlements")}${entry.description ? ` · ${entry.description}` : ""}`,
          status: movement?.status ?? "accepted",
          recordStatus: "active" as const,
          ownerId: entry.account_profile_id,
          description: entry.description ?? "",
          remark: movement?.note ?? "",
          reason: null,
        };
      });

    return [...paymentRows, ...expenseRows, ...settlementRows]
      .filter((record) => {
        const userMatches = owner
          ? record.ownerId === transactionProfileId
          : record.ownerId === profile.id;
        if (!userMatches) return false;
        if (transactionFilter === "deleted") return record.recordStatus === "cancelled";
        if (record.recordStatus === "cancelled") return false;
        if (transactionFilter === "received") return record.kind === "payment";
        if (transactionFilter === "sent") return record.kind === "expense" || (record.kind === "settlement" && record.amount < 0);
        return true;
      })
      .sort((a, b) => `${b.date}-${b.id}`.localeCompare(`${a.date}-${a.id}`));
  }, [dateRange, entries, expenses, movements, owner, payments, profile.id, profiles, t, transactionFilter, transactionProfileId]);

  return (
    <div className="view-stack mobile-clean">
      <section className="payments-hero">
        <div>
          <p className="eyebrow">{t("ledger")}</p>
          <h2>{t("transactions")} · {dateLabel}</h2>
        </div>
        <div className="ledger-totals">
          <span className="ledger-pill positive-pill">+ {formatMoney(positiveTotal)}</span>
          <span className="ledger-pill negative-pill">- {formatMoney(negativeTotal)}</span>
        </div>
      </section>

      <section className="transaction-controls">
        {owner ? (
          <label className="filter-field transaction-user-filter">
            <span>{t("user")}</span>
            <select value={transactionProfileId} onChange={(event) => setTransactionProfileId(event.target.value)}>
              {selectableProfiles.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id === profile.id ? `${item.full_name} (${t("self")})` : item.full_name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="tab-strip transaction-filter-strip" role="tablist" aria-label={t("transactions")}>
          {(["all", "received", "sent", "deleted"] as TransactionFilter[]).map((filter) => (
            <button
              className={transactionFilter === filter ? "tab-button active" : "tab-button"}
              key={filter}
              type="button"
              onClick={() => setTransactionFilter(filter)}
            >
              {filter === "all" ? t("all") : filter === "received" ? t("collected") : filter === "sent" ? t("expense") : t("deleted")}
            </button>
          ))}
        </div>
      </section>

      {isSalesAgent ? <AgentIncentivePanel summary={agentIncentiveSummary} /> : null}

      <section className="panel wide-panel clean-panel">
        <div className="panel-heading">
          <h2>{t("transactions")}</h2>
        </div>
        {transactionRecords.length > 0 ? (
          <div className="record-list transaction-records">
            {transactionRecords.map((record) => (
              <article className={record.amount >= 0 ? "transaction-card positive" : "transaction-card negative"} key={`${record.kind}-${record.id}`}>
                <div className="transaction-main">
                  <strong>{record.title}</strong>
                  <p>{record.date} · {record.meta}</p>
                  {record.status !== "approved" ? (
                    <span className={`status-chip status-${record.status}`}>{labelForStatus(record.status, t)}</span>
                  ) : null}
                  {record.recordStatus === "cancelled" && record.reason ? <p>{t("deleted")}: {record.reason}</p> : null}
                </div>
                <div className="transaction-side">
                  <strong className="transaction-amount">{record.amount >= 0 ? "+" : "-"}{formatMoney(Math.abs(record.amount))}</strong>
                  <div className="transaction-actions">
                    {record.status === "approved" ? (
                      <span className="status-chip status-approved">{labelForStatus(record.status, t)}</span>
                    ) : owner && record.recordStatus !== "cancelled" && record.kind !== "settlement" ? (
                      <MiniAction
                        hidden={{ record_type: record.kind, id: record.id, decision: "approved" }}
                        label={t("approve")}
                        tone="approve"
                        action={approveRecordAction}
                        setNotice={setNotice}
                        startTransition={startTransition}
                      />
                    ) : null}
                    {(record.recordStatus !== "cancelled" && record.kind !== "settlement" && (owner || record.ownerId === profile.id)) ? (
                      <details className="more-menu">
                        <summary aria-label={t("moreOptions")} title={t("moreOptions")}>
                          <EllipsisVertical size={17} />
                        </summary>
                        <div className="details-menu transaction-options-menu">
                          {record.status !== "approved" ? (
                          <form onSubmit={(event) => submitWith(event, updateRecordAction, setNotice, startTransition)}>
                            <input type="hidden" name="record_type" value={record.kind} />
                            <input type="hidden" name="id" value={record.id} />
                            <input name="date" type="date" defaultValue={record.date} required aria-label={t("dateRange")} />
                            <input name="amount" type="number" min="1" step="1" defaultValue={Math.abs(record.amount)} required aria-label={t("amount")} />
                            <input name="description" defaultValue={record.description} placeholder={t("description")} required={record.kind === "expense"} minLength={record.kind === "expense" ? 3 : undefined} />
                            <input name="remark" defaultValue={record.remark} placeholder={t("remark")} />
                            <button type="submit">{t("save")}</button>
                          </form>
                          ) : null}
                          {owner ? (
                            <MiniAction
                              hidden={{ record_type: record.kind, id: record.id }}
                              label={t("deleteTransaction")}
                              reason
                              reasonRequired
                              tone="cancel"
                              icon={<Trash2 size={16} />}
                              action={cancelRecordAction}
                              setNotice={setNotice}
                              startTransition={startTransition}
                            />
                          ) : null}
                        </div>
                      </details>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">{t("noRecordsForFilter")}</p>
        )}
      </section>

    </div>
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
    <div className="fixed bottom-24 md:bottom-8 right-4 md:right-8 flex flex-col gap-3 z-50" aria-label={t("quickActions")}>
      <button
        className="flex items-center gap-2 bg-primary text-on-primary px-5 py-3 rounded-full shadow-soft hover:scale-105 transition-all active:scale-95 font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        type="button"
        disabled={!canAddPositive}
        onClick={onPositive}
      >
        <span className="material-symbols-outlined">add</span>
        <span>{t("collectPayment")}</span>
      </button>
      <button
        className="flex items-center gap-2 bg-error text-on-error px-5 py-3 rounded-full shadow-soft hover:scale-105 transition-all active:scale-95 font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        type="button"
        disabled={!canAddNegative}
        onClick={onNegative}
      >
        <span className="material-symbols-outlined">remove</span>
        <span>{t("addExpense")}</span>
      </button>
    </div>
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
  setNotice,
  startTransition,
  onSuccess,
}: {
  type: BusinessType;
  rooms: { id: string; room_number: string; label: string | null }[];
  mainCourses: Course[];
  skillCourses: Course[];
  referrals: Pick<ReferralCode, "code">[];
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

      {type === "library" || type === "course" ? (
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
          {type === "course" ? (
            <>
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

function ClosingView({
  date,
  owner,
  profile,
  summaries,
  totals,
  setSettlementDraft,
}: {
  date: string;
  owner: boolean;
  profile: Profile;
  summaries: UserClosingSummary[];
  totals: { opening: number; closing: number };
  setSettlementDraft: (draft: { profile: Profile; direction: SettlementDirection; defaultAmount: number } | null) => void;
}) {
  const { t } = useLanguage();
  const [selectedSummary, setSelectedSummary] = useState<UserClosingSummary | null>(null);
  const visibleSummaries = owner ? summaries : summaries.filter((summary) => summary.profile.id === profile.id);

  return (
    <div className="view-stack">
      {owner ? (
        <div className="closing-total-grid">
          <StatCard label={t("totalOpening")} value={formatMoney(totals.opening)} icon={<WalletCards size={20} />} />
          <StatCard label={t("totalClosing")} value={formatMoney(totals.closing)} icon={<ShieldCheck size={20} />} />
        </div>
      ) : null}

      <section className="panel clean-panel">
        <div className="panel-heading">
          <h2>{t("dailyClosing")} · {date}</h2>
        </div>
        <div className="closing-user-grid">
          {visibleSummaries.map((summary) => {
            const canSettle = owner && summary.profile.id !== profile.id;
            return (
              <article
                className="closing-user-card"
                key={summary.profile.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedSummary(summary)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedSummary(summary);
                  }
                }}
              >
                <span className="closing-card-head">
                  <strong>{summary.profile.full_name}</strong>
                  <span className="role-pill">{roleBadge(summary.profile)}</span>
                </span>
                <span className="balance-parts">
                  <span className={`balance-part ${balanceTone(summary.opening)}`}>
                    <small>{t("openingBalance")}</small>
                    <strong>{formatMoney(summary.opening)}</strong>
                  </span>
                  <span className={`balance-part ${balanceTone(summary.closing)}`}>
                    <small>{t("closingBalance")}</small>
                    <strong>{formatMoney(summary.closing)}</strong>
                  </span>
                </span>
                {canSettle ? (
                  <span className="closing-card-actions">
                    <button
                      className="arrow-action arrow-down"
                      type="button"
                      title={t("receivedFromStaff")}
                      aria-label={t("receivedFromStaff")}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSettlementDraft({
                          profile: summary.profile,
                          direction: "received_from_user",
                          defaultAmount: Math.abs(summary.closing),
                        });
                      }}
                    >
                      <ArrowDown size={17} />
                    </button>
                    <button
                      className="arrow-action arrow-up"
                      type="button"
                      title={t("sentToStaff")}
                      aria-label={t("sentToStaff")}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSettlementDraft({ profile: summary.profile, direction: "sent_to_user", defaultAmount: Math.abs(summary.closing) });
                      }}
                    >
                      <ArrowUp size={17} />
                    </button>
                  </span>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      {selectedSummary ? <ClosingDetailModal summary={selectedSummary} close={() => setSelectedSummary(null)} /> : null}
    </div>
  );
}

function ClosingDetailModal({ summary, close }: { summary: UserClosingSummary; close: () => void }) {
  const { t } = useLanguage();
  const rows = [
    { label: t("openingBalance"), value: summary.opening },
    { label: t("collectedByStaff"), value: summary.collected },
    { label: t("expenses"), value: -summary.expenses },
    { label: t("sent"), value: -summary.sent },
    { label: t("received"), value: summary.received },
    ...(summary.adjustments !== 0 ? [{ label: t("adjustments"), value: summary.adjustments }] : []),
    { label: t("closingBalance"), value: summary.closing },
  ];

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label={summary.profile.full_name}>
      <button className="modal-backdrop" aria-label={t("closeModal")} type="button" onClick={close} />
      <section className="action-sheet compact-sheet">
        <header className="sheet-header">
          <div>
            <p className="eyebrow">{t("dailyClosing")}</p>
            <h2>{summary.profile.full_name}</h2>
          </div>
          <button className="icon-button" type="button" aria-label={t("closeModal")} onClick={close}>
            <X size={18} />
          </button>
        </header>
        <div className="detail-balance-list">
          {rows.map((row) => (
            <div className={`detail-balance-row ${balanceTone(row.value)}`} key={row.label}>
              <span>{row.label}</span>
              <strong>{formatMoney(row.value)}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ClosingSettlementModal({
  draft,
  date,
  close,
  setNotice,
  startTransition,
}: {
  draft: { profile: Profile; direction: SettlementDirection; defaultAmount: number };
  date: string;
  close: () => void;
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const { t } = useLanguage();
  const isReceived = draft.direction === "received_from_user";

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label={isReceived ? t("recordReceived") : t("recordSent")}>
      <button className="modal-backdrop" aria-label={t("closeModal")} type="button" onClick={close} />
      <section className="action-sheet compact-sheet">
        <header className="sheet-header">
          <div>
            <p className="eyebrow">{isReceived ? t("receivedFromStaff") : t("sentToStaff")}</p>
            <h2>{isReceived ? t("receivedFormTitle") : t("sendFormTitle")}</h2>
          </div>
          <button className="icon-button" type="button" aria-label={t("closeModal")} onClick={close}>
            <X size={18} />
          </button>
        </header>
        <MoneySettlementForm
          direction={draft.direction}
          profiles={[draft.profile]}
          settlementDate={date}
          setNotice={setNotice}
          startTransition={startTransition}
          onSuccess={close}
          defaultProfileId={draft.profile.id}
          defaultAmount={draft.defaultAmount}
        />
      </section>
    </div>
  );
}

function SettlementsView({
  profile,
  owner,
  profiles,
  movements,
  agentSettlements,
  dateRange,
  settlementFilter,
  setSettlementFilter,
  setNotice,
  startTransition,
}: {
  profile: Profile;
  owner: boolean;
  profiles: Profile[];
  movements: MoneyMovement[];
  agentSettlements: AgentSettlement[];
  dateRange: NormalizedDateRange;
  settlementFilter: SettlementFilter;
  setSettlementFilter: (filter: SettlementFilter) => void;
  setNotice: (notice: ActionResult | null) => void;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const { t } = useLanguage();
  const movementItems = movements.flatMap((movement) => {
    const direction = movement.to_profile_id === profile.id
      ? "received"
      : movement.from_profile_id === profile.id
        ? "sent"
        : owner
          ? movement.type === "settlement" ? "received" : "sent"
          : null;
    if (!direction || !dateInRange(movement.created_at, dateRange)) return [];
    const counterpartyId = direction === "received" ? movement.from_profile_id : movement.to_profile_id;
    const counterparty = profiles.find((item) => item.id === counterpartyId);
    return [{
      id: `movement-${movement.id}`,
      direction,
      amount: numberValue(movement.amount),
      status: movement.status,
      date: movement.created_at,
      note: movement.note,
      user: counterparty,
      record: movement,
      kind: "movement" as const,
    }];
  });
  const agentItems = agentSettlements.flatMap((settlement) => {
    const direction = owner ? "sent" : settlement.agent_id === profile.id ? "received" : null;
    if (!direction || !dateInRange(settlement.created_at, dateRange)) return [];
    const counterpartyId = direction === "received" ? settlement.paid_by : settlement.agent_id;
    const counterparty = profiles.find((item) => item.id === counterpartyId);
    return [{
      id: `agent-${settlement.id}`,
      direction,
      amount: numberValue(settlement.amount),
      status: settlement.status,
      date: settlement.created_at,
      note: settlement.note,
      user: counterparty,
      record: settlement,
      kind: "agent" as const,
    }];
  });
  const items = [...movementItems, ...agentItems]
    .filter((item) => settlementFilter === "all" || item.direction === settlementFilter)
    .sort((a, b) => b.date.localeCompare(a.date));
  const receivedTotal = items
    .filter((item) => item.status === "accepted" && item.direction === "received")
    .reduce((sum, item) => sum + item.amount, 0);
  const sentTotal = items
    .filter((item) => item.status === "accepted" && item.direction === "sent")
    .reduce((sum, item) => sum + item.amount, 0);
  const total = items
    .filter((item) => item.status === "accepted")
    .reduce((sum, item) => sum + item.amount, 0);
  const title = settlementFilter === "all" ? t("settlements") : settlementFilter === "received" ? t("received") : t("sent");

  return (
    <div className="view-stack mobile-clean">
      <section className="payments-hero">
        <div>
          <p className="eyebrow">{t("settlements")}</p>
          <h2>{title}</h2>
        </div>
        <div className="ledger-totals">
          {settlementFilter === "all" ? (
            <>
              <span className="ledger-pill positive-pill">+ {formatMoney(receivedTotal)}</span>
              <span className="ledger-pill negative-pill">- {formatMoney(sentTotal)}</span>
            </>
          ) : (
            <span className={settlementFilter === "received" ? "ledger-pill positive-pill" : "ledger-pill negative-pill"}>
              {formatMoney(total)}
            </span>
          )}
        </div>
      </section>
      <div className="tab-strip" role="tablist" aria-label={t("settlements")}>
        {(["all", "received", "sent"] as SettlementFilter[]).map((filter) => (
          <button
            className={settlementFilter === filter ? "tab-button active" : "tab-button"}
            key={filter}
            type="button"
            onClick={() => setSettlementFilter(filter)}
          >
            {filter === "all" ? t("all") : filter === "received" ? t("received") : t("sent")}
          </button>
        ))}
      </div>
      <section className="panel wide-panel clean-panel">
        <div className="panel-heading">
          <h2>{t("settlementHistory")}</h2>
        </div>
        {items.length > 0 ? (
          <div className="settlement-card-list">
            {items.map((item) => {
              const user = item.user;
              const canRespond =
                item.kind === "movement"
                  ? item.record.status === "pending" && item.record.to_profile_id === profile.id
                  : item.record.status === "pending" && item.record.agent_id === profile.id;
              return (
                <article className={item.direction === "received" ? "settlement-card positive" : "settlement-card negative"} key={item.id}>
                  <div className="settlement-card-top">
                    <strong>{user?.full_name ?? t("unknown")}</strong>
                    <span className="role-pill">{user ? roleBadge(user) : "S"}</span>
                  </div>
                  <div className="settlement-card-amount">
                    <strong>{formatMoney(item.amount)}</strong>
                    <span className={`status-chip status-${item.status}`}>{labelForStatus(item.status, t)}</span>
                  </div>
                  <p>{item.date.slice(0, 10)}{item.note ? ` · ${item.note}` : ""}</p>
                  {canRespond ? (
                    <div className="inline-actions">
                      <MiniAction
                        hidden={item.kind === "movement" ? { movement_id: item.record.id, decision: "accepted" } : { settlement_id: item.record.id, decision: "accepted" }}
                        label={item.kind === "agent" ? t("confirmReceived") : t("accept")}
                        tone="approve"
                        action={item.kind === "movement" ? respondTransferAction : respondAgentSettlementAction}
                        setNotice={setNotice}
                        startTransition={startTransition}
                      />
                      <MiniAction
                        hidden={item.kind === "movement" ? { movement_id: item.record.id, decision: "rejected" } : { settlement_id: item.record.id, decision: "rejected" }}
                        label={t("reject")}
                        tone="reject"
                        action={item.kind === "movement" ? respondTransferAction : respondAgentSettlementAction}
                        setNotice={setNotice}
                        startTransition={startTransition}
                      />
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="muted">{t("noRecordsForFilter")}</p>
        )}
      </section>
    </div>
  );
}

function SettingsView({
  owner,
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
  const [activeSection, setActiveSection] = useState<"categories" | "users" | "security" | "language" | null>(null);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [showAddReferral, setShowAddReferral] = useState(false);

  // Outline: Render settings dashboard with interactive sidebar to toggle between Business Categories config and User, Security, or Language management sub-forms.
  if (!owner) {
    return (
      <div className="space-y-6 max-w-xl">
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
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
      {/* Main content viewport */}
      <div className="md:col-span-8 space-y-6">
        {/* Active Section: Categories (Home) */}
        {activeSection === null && (
          <section className="bg-surface-container-lowest rounded-xl shadow-soft overflow-hidden border border-outline-variant/10">
            <div className="px-6 py-5 border-b border-outline-variant/10 bg-surface-container-low/50">
              <h2 className="font-headline text-xl font-semibold text-primary flex items-center gap-2">
                <span className="material-symbols-outlined">category</span>
                Business Categories
              </h2>
            </div>
            
            <div className="p-6 space-y-8">
              {/* Rooms Sub-category */}
              <div>
                <h3 className="font-label text-sm font-bold tracking-wider text-outline uppercase mb-3">Rooms</h3>
                <div className="bg-surface rounded-lg border border-outline-variant/30 overflow-hidden divide-y divide-outline-variant/20">
                  {rooms.map((room) => (
                    <div key={room.id} className="flex justify-between items-center p-4 hover:bg-surface-container-low/50 transition-colors">
                      <span className="font-body text-on-surface">{room.label ?? room.room_number}</span>
                      <span className={`font-label text-xs ${room.active ? 'text-primary bg-primary-fixed/30' : 'text-secondary bg-secondary-fixed/50'} px-2.5 py-1 rounded-md font-bold`}>
                        {room.active ? t("active") : t("hidden")}
                      </span>
                    </div>
                  ))}
                  
                  {showAddRoom && (
                    <form className="p-4 bg-surface-container-low/30 form-grid two" onSubmit={(event) => {
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
                        <button type="button" onClick={() => setShowAddRoom(false)} className="px-4 py-2 text-xs font-bold text-on-surface-variant hover:bg-surface-variant rounded-lg border-0 cursor-pointer">Cancel</button>
                        <button type="submit" className="px-4 py-2 text-xs font-bold bg-primary text-on-primary rounded-lg border-0 cursor-pointer">Save</button>
                      </div>
                    </form>
                  )}
                  
                  {!showAddRoom && (
                    <button onClick={() => setShowAddRoom(true)} className="w-full py-3 font-body text-primary font-bold hover:bg-primary-container/20 transition-colors flex items-center justify-center gap-2 border-0 bg-transparent cursor-pointer">
                      <span className="material-symbols-outlined text-sm">add</span>
                      Add Room
                    </button>
                  )}
                </div>
              </div>

              {/* Courses Sub-category */}
              <div>
                <h3 className="font-label text-sm font-bold tracking-wider text-outline uppercase mb-3">Courses</h3>
                <div className="bg-surface rounded-lg border border-outline-variant/30 overflow-hidden divide-y divide-outline-variant/20">
                  {courses.map((course) => (
                    <div key={course.id} className="flex justify-between items-center p-4 hover:bg-surface-container-low/50 transition-colors">
                      <span className="font-body text-on-surface">{course.name}</span>
                      <span className={`font-label text-xs ${course.kind === 'main' ? 'text-primary bg-primary-fixed/30' : 'text-secondary bg-secondary-fixed/50'} px-2.5 py-1 rounded-md font-bold uppercase`}>
                        {course.kind}
                      </span>
                    </div>
                  ))}

                  {showAddCourse && (
                    <form className="p-4 bg-surface-container-low/30 form-grid two" onSubmit={(event) => {
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
                        <button type="button" onClick={() => setShowAddCourse(false)} className="px-4 py-2 text-xs font-bold text-on-surface-variant hover:bg-surface-variant rounded-lg border-0 cursor-pointer">Cancel</button>
                        <button type="submit" className="px-4 py-2 text-xs font-bold bg-primary text-on-primary rounded-lg border-0 cursor-pointer">Save</button>
                      </div>
                    </form>
                  )}

                  {!showAddCourse && (
                    <button onClick={() => setShowAddCourse(true)} className="w-full py-3 font-body bg-primary text-on-primary font-bold hover:bg-primary/95 transition-colors flex items-center justify-center gap-2 border-0 cursor-pointer">
                      <span className="material-symbols-outlined text-sm">add</span>
                      Add Course
                    </button>
                  )}
                </div>
              </div>

              {/* Referral Codes Sub-category */}
              <div>
                <h3 className="font-label text-sm font-bold tracking-wider text-outline uppercase mb-3">Referral Codes</h3>
                <div className="bg-surface rounded-lg border border-outline-variant/30 overflow-hidden divide-y divide-outline-variant/20">
                  {referrals.map((referral) => (
                    <div key={referral.id} className="flex justify-between items-center p-4 hover:bg-surface-container-low/50 transition-colors">
                      <div>
                        <span className="font-body font-bold text-on-surface">{referral.code}</span>
                        {referral.agent_id && (
                          <p className="text-xs text-on-surface-variant mt-0.5">{profileName(profiles, referral.agent_id, t)}</p>
                        )}
                      </div>
                      <span className="font-label text-sm text-on-surface-variant font-medium">
                        {referral.discount_type === "percentage" ? `${referral.discount_value}%` : formatMoney(referral.discount_value)} Discount / {referral.incentive_type === "percentage" ? `${referral.incentive_value}%` : formatMoney(referral.incentive_value)} Incentive
                      </span>
                    </div>
                  ))}

                  {showAddReferral && (
                    <form className="p-4 bg-surface-container-low/30 form-grid two" onSubmit={(event) => {
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
                        <button type="button" onClick={() => setShowAddReferral(false)} className="px-4 py-2 text-xs font-bold text-on-surface-variant hover:bg-surface-variant rounded-lg border-0 cursor-pointer">Cancel</button>
                        <button type="submit" className="px-4 py-2 text-xs font-bold bg-primary text-on-primary rounded-lg border-0 cursor-pointer">Save</button>
                      </div>
                    </form>
                  )}

                  {!showAddReferral && (
                    <button onClick={() => setShowAddReferral(true)} className="w-full py-3 font-body bg-primary text-on-primary font-bold hover:bg-primary/95 transition-colors flex items-center justify-center gap-2 border-0 cursor-pointer">
                      <span className="material-symbols-outlined text-sm">add</span>
                      Add Referral Code
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Active Section: User Management */}
        {activeSection === "users" && (
          <div className="space-y-6">
            <section className="bg-surface-container-lowest p-6 rounded-xl shadow-soft border border-outline-variant/10">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-headline text-xl font-bold text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined">person_add</span>
                  {t("addStaff")}
                </h2>
                <button onClick={() => setActiveSection(null)} className="text-xs font-bold hover:underline cursor-pointer border-0 bg-transparent text-primary">Back to Categories</button>
              </div>
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
                  <select name="role" defaultValue="staff" className="w-full mt-1 p-2 rounded-lg border border-outline-variant bg-surface">
                    <option value="staff">{t("staff")}</option>
                    <option value="sales_agent">{t("salesAgent")}</option>
                    <option value="owner">{t("owner")}</option>
                    <option value="admin">{t("admin")}</option>
                  </select>
                </label>
                <div className="checkbox-grid full-span p-4 bg-surface rounded-lg border border-outline-variant/30 space-y-2 mt-2">
                  <span className="block text-xs text-on-surface-variant font-bold mb-2">Permissions</span>
                  {permissionOptions.map((permission) => (
                    <label key={permission.value} className="flex items-center gap-2 cursor-pointer font-medium text-sm text-on-surface">
                      <input name="permissions" type="checkbox" value={permission.value} className="rounded border-outline text-primary focus:ring-primary" />
                      {t(permissionLabelKeys[permission.value] ?? permission.label)}
                    </label>
                  ))}
                </div>
                <button className="primary-button full-span cursor-pointer py-3" type="submit">
                  {t("createAccount")}
                </button>
              </form>
            </section>

            <section className="bg-surface-container-lowest p-6 rounded-xl shadow-soft border border-outline-variant/10">
              <h2 className="font-headline text-xl font-bold text-primary mb-4">{t("staffPermissions")}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {profiles.map((item) => (
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
        )}

        {/* Active Section: Security / Change Requests */}
        {activeSection === "security" && (
          <section className="bg-surface-container-lowest p-6 rounded-xl shadow-soft border border-outline-variant/10">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-headline text-xl font-bold text-primary flex items-center gap-2">
                <span className="material-symbols-outlined">security</span>
                {t("changeRequests")}
              </h2>
              <button onClick={() => setActiveSection(null)} className="text-xs font-bold hover:underline cursor-pointer border-0 bg-transparent text-primary">Back to Categories</button>
            </div>
            
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
          </section>
        )}

        {/* Active Section: Language Selection */}
        {activeSection === "language" && (
          <section className="bg-surface-container-lowest p-6 rounded-xl shadow-soft border border-outline-variant/10">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-headline text-xl font-bold text-primary flex items-center gap-2">
                <span className="material-symbols-outlined">language</span>
                {t("languageSettings")}
              </h2>
              <button onClick={() => setActiveSection(null)} className="text-xs font-bold hover:underline cursor-pointer border-0 bg-transparent text-primary">Back to Categories</button>
            </div>
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
          </section>
        )}
      </div>

      {/* Sidebar navigation column */}
      <div className="md:col-span-4 space-y-6">
        <button
          onClick={() => setActiveSection(null)}
          className={`w-full block bg-surface-container-lowest p-5 rounded-xl shadow-soft hover:shadow-md transition-all group border text-left cursor-pointer ${activeSection === null ? 'border-primary/45 bg-primary/5' : 'border-transparent hover:border-primary/20'}`}
        >
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg transition-colors ${activeSection === null ? 'bg-primary text-on-primary' : 'bg-surface-container text-primary group-hover:bg-primary-container'}`}>
              <span className="material-symbols-outlined">category</span>
            </div>
            <div>
              <h3 className="font-headline font-semibold text-on-surface text-lg">Business Categories</h3>
              <p className="font-body text-sm text-on-surface-variant mt-0.5">Rooms, Courses, Referrals</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setActiveSection("users")}
          className={`w-full block bg-surface-container-lowest p-5 rounded-xl shadow-soft hover:shadow-md transition-all group border text-left cursor-pointer ${activeSection === "users" ? 'border-primary/45 bg-primary/5' : 'border-transparent hover:border-primary/20'}`}
        >
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg transition-colors ${activeSection === "users" ? 'bg-primary text-on-primary' : 'bg-surface-container text-primary group-hover:bg-primary-container'}`}>
              <span className="material-symbols-outlined">manage_accounts</span>
            </div>
            <div>
              <h3 className="font-headline font-semibold text-on-surface text-lg">User Management</h3>
              <p className="font-body text-sm text-on-surface-variant mt-0.5">Staff &amp; Agents</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setActiveSection("security")}
          className={`w-full block bg-surface-container-lowest p-5 rounded-xl shadow-soft hover:shadow-md transition-all group border text-left cursor-pointer ${activeSection === "security" ? 'border-primary/45 bg-primary/5' : 'border-transparent hover:border-primary/20'}`}
        >
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg transition-colors ${activeSection === "security" ? 'bg-primary text-on-primary' : 'bg-surface-container text-secondary group-hover:bg-secondary-container'}`}>
              <span className="material-symbols-outlined">security</span>
            </div>
            <div>
              <h3 className="font-headline font-semibold text-on-surface text-lg">Security &amp; Requests</h3>
              <p className="font-body text-sm text-on-surface-variant mt-0.5">Change Requests</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setActiveSection("language")}
          className={`w-full block bg-surface-container-lowest p-5 rounded-xl shadow-soft hover:shadow-md transition-all group border text-left cursor-pointer ${activeSection === "language" ? 'border-primary/45 bg-primary/5' : 'border-transparent hover:border-primary/20'}`}
        >
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg transition-colors ${activeSection === "language" ? 'bg-primary text-on-primary' : 'bg-surface-container text-secondary group-hover:bg-secondary-container'}`}>
              <span className="material-symbols-outlined">language</span>
            </div>
            <div>
              <h3 className="font-headline font-semibold text-on-surface text-lg">App Language</h3>
              <p className="font-body text-sm text-on-surface-variant mt-0.5">{language === "en" ? "English (US)" : "हिंदी (Hindi)"}</p>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
