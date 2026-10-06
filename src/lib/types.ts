export type AppRole = "admin" | "owner" | "staff" | "sales_agent";
export type PlatformRole = "user" | "platform_admin";
export type BusinessRole = "primary_owner" | "co_owner" | "staff" | "sales_agent";
export type BusinessStatus = "active" | "suspended";
export type MembershipStatus = "active" | "suspended";
export type BusinessInvitationState = "pending" | "accepted" | "declined" | "revoked" | "expired";
export type BusinessCreationRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type SettingsSection = "profile" | "businesses" | "contact" | "preferences";
export type BusinessType = "guest_house" | "library" | "course" | "general";
export type PaymentMode = "cash" | "online" | "mixed";
export type ApprovalStatus =
  | "pending"
  | "approved"
  | "reapproval_required"
  | "cancel_requested"
  | "cancelled"
  | "rejected";
export type MovementStatus = "pending" | "accepted" | "rejected";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  platform_role: PlatformRole;
  account_status: BusinessStatus;
  must_change_password: boolean;
  last_business_id: string | null;
  membership_role: BusinessRole;
  membership_status: MembershipStatus;
  /** UI compatibility projection only. Server authorization uses membership_role. */
  role: AppRole;
  active: boolean;
};

export type Business = {
  id: string;
  name: string;
  slug: string;
  status: BusinessStatus;
  timezone: string;
  currency: string;
  created_at: string;
};

export type BusinessMembership = {
  id: string;
  business_id: string;
  profile_id: string;
  role: BusinessRole;
  status: MembershipStatus;
  invited_at?: string | null;
  joined_at: string | null;
  suspended_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type BusinessInvitation = {
  id: string;
  business_id: string;
  email: string;
  intended_role: Exclude<BusinessRole, "primary_owner">;
  permissions: string[];
  state: BusinessInvitationState;
  expires_at: string;
  delivery_status: "pending" | "sent" | "failed";
  delivery_error: string | null;
  created_at: string;
  updated_at: string;
};

export type BusinessCreationRequest = {
  id: string;
  requested_by: string;
  requested_name: string;
  requested_modules: BusinessType[];
  note: string | null;
  status: BusinessCreationRequestStatus;
  reviewed_by: string | null;
  review_reason: string | null;
  reviewed_at: string | null;
  created_business_id: string | null;
  created_at: string;
  updated_at: string;
};

export type LinkedIdentitySummary = {
  id: string;
  provider: string;
  email: string | null;
  createdAt: string | null;
};

export type UserSettingsPayload = {
  profile: {
    id: string;
    fullName: string;
    email: string;
    avatarPath: string | null;
    avatarUrl: string | null;
    platformRole: PlatformRole;
  };
  identities: LinkedIdentitySummary[];
  accesses: Array<{
    businessId: string;
    name: string;
    slug: string;
    role: BusinessRole;
    status: MembershipStatus;
    businessStatus: BusinessStatus;
    canManage: boolean;
  }>;
  invitations: Array<{
    id: string;
    businessName: string;
    role: Exclude<BusinessRole, "primary_owner">;
    state: BusinessInvitationState;
    expiresAt: string;
  }>;
  requests: Array<{
    id: string;
    name: string;
    modules: BusinessType[];
    status: BusinessCreationRequestStatus;
    reason: string | null;
    createdAt: string;
    businessSlug: string | null;
  }>;
  supportEmail: string;
};

export type BusinessContext = {
  business: Business;
  membership: BusinessMembership | null;
  permissions: string[];
  enabledModules: BusinessType[];
  accessMode: "member" | "support";
  supportSession: {
    id: string;
    reason: string;
    expires_at: string;
  } | null;
  availableBusinesses: Array<{
    business: Business;
    role: BusinessRole;
  }>;
};

export type StaffPermission = {
  profile_id: string;
  permission: string;
};

export type ManagerUnitScope = {
  business_id: string;
  manager_profile_id: string;
  business_type: BusinessType;
};

export type StaffUnitAssignment = {
  business_id: string;
  staff_profile_id: string;
  business_type: BusinessType;
  manager_profile_id: string | null;
};

export type Room = {
  id: string;
  business_id: string;
  room_number: string;
  label: string | null;
  active: boolean;
};

export type Course = {
  id: string;
  business_id: string;
  name: string;
  active: boolean;
};

export type ReferralCode = {
  id: string;
  business_id: string;
  code: string;
  agent_id: string | null;
  discount_amount: number;
  discount_type: "amount" | "percentage";
  discount_value: number;
  incentive_type: "amount" | "percentage";
  incentive_value: number;
  active: boolean;
};

export type Payment = {
  id: string;
  business_id: string;
  business_type: BusinessType;
  mode: PaymentMode;
  amount: number;
  cash_collection: number;
  online_collection: number;
  fee_amount: number | null;
  paid_amount: number | null;
  dues_amount: number | null;
  advance_amount: number | null;
  payment_date: string;
  start_date: string | null;
  end_date: string | null;
  customer_name: string | null;
  roll_number: string | null;
  room_id: string | null;
  room_number_snapshot: string | null;
  seat_number: string | null;
  start_time: string | null;
  end_time: string | null;
  slot_hours: number | null;
  library_student_id: string | null;
  course_student_id: string | null;
  student_subscription_key: string | null;
  course_id: string | null;
  referral_code_id: string | null;
  referral_code_snapshot: string | null;
  referral_agent_id: string | null;
  discount_amount_applied: number;
  incentive_amount: number;
  description: string | null;
  remark: string | null;
  photo_path: string | null;
  aadhar_photo_url: string | null;
  aadhar_back_photo_url: string | null;
  collected_by: string;
  /** Operational owner of the whole transaction. Cash custody stays in current_holder_id. */
  assigned_profile_id: string;
  current_holder_id: string | null;
  client_request_id: string | null;
  approval_status: ApprovalStatus;
  cash_approval_status: ApprovalStatus | null;
  online_approval_status: ApprovalStatus | null;
  cash_approved_at: string | null;
  online_approved_at: string | null;
  cash_posted_on: string | null;
  online_posted_on: string | null;
  cash_approved_by: string | null;
  online_approved_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  record_status: "active" | "cancelled";
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type LibraryStudent = {
  id: string;
  business_id: string;
  roll_number: string;
  phone_number: string | null;
  address: string | null;
  photo_url: string | null;
  aadhar_number: string | null;
  aadhar_photo_url: string | null;
  aadhar_back_photo_url: string | null;
  student_name: string | null;
  seat_number: string | null;
  locker_number: string | null;
  start_time: string | null;
  end_time: string | null;
  slot_hours: number | null;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  fee_amount: number | null;
  paid_amount: number | null;
  dues_amount: number | null;
  advance_amount: number | null;
  active: boolean;
  placeholder: boolean;
  status_note: string | null;
  last_payment_id: string | null;
  current_subscription_key: string | null;
  last_payment_date: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type LibraryStudentSubscriptionEvent = {
  id: string;
  business_id: string;
  library_student_id: string;
  payment_id: string | null;
  event_key: string;
  event_type: "import_row" | "payment_renewal" | "manual_update" | "status_change";
  event_date: string;
  source: string | null;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  fee_amount: number | null;
  paid_amount: number | null;
  dues_amount: number | null;
  advance_amount: number | null;
  seat_number: string | null;
  locker_number: string | null;
  start_time: string | null;
  end_time: string | null;
  active: boolean | null;
  created_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type CourseStudent = {
  id: string;
  business_id: string;
  source_course_id: string;
  identity_key: string;
  roll_number: string | null;
  student_name: string | null;
  photo_url: string | null;
  phone_number: string | null;
  address: string | null;
  aadhar_number: string | null;
  aadhar_photo_url: string | null;
  aadhar_back_photo_url: string | null;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  slot_hours: number | null;
  fee_amount: number | null;
  paid_amount: number | null;
  dues_amount: number | null;
  advance_amount: number | null;
  active: boolean;
  last_payment_id: string | null;
  current_subscription_key: string | null;
  created_at: string;
  updated_at: string;
};

export type TransactionJourneyStep = {
  id: string;
  person: string;
  action: string;
  role: string | null;
  state: "complete" | "sent" | "received" | "pending" | "rejected" | "verified";
  timestamp: string | null;
};

export type TransactionJourneyLane = {
  component: "cash" | "online";
  amount: number;
  status: ApprovalStatus;
  steps: TransactionJourneyStep[];
};

export type StudentSubscriptionTransaction = {
  id: string;
  amount: number;
  paymentDate: string;
  createdAt: string;
  collectedBy: string;
  collectorName: string;
  mode: PaymentMode;
  cashAmount: number;
  onlineAmount: number;
  approvalStatus: ApprovalStatus;
  cashApprovalStatus: ApprovalStatus | null;
  onlineApprovalStatus: ApprovalStatus | null;
  recordStatus: "active" | "cancelled";
  cancelReason: string | null;
};

export type StudentSubscriptionHistoryItem = {
  subscriptionKey: string;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  slotHours: number | null;
  feeAmount: number;
  totalPaid: number;
  duesAmount: number;
  advanceAmount: number;
  transactionCount: number;
  transactions: StudentSubscriptionTransaction[];
};

export type StudentSubscriptionHistoryPage = {
  items: StudentSubscriptionHistoryItem[];
  nextPage: number | null;
  totalSubscriptions: number;
  totalTransactions: number;
};

export type StudentCollectionOption =
  | {
      source: "library";
      student: LibraryStudent;
    }
  | {
      source: "course";
      student: CourseStudent;
    };

export type StudentCollectionPage = {
  items: StudentCollectionOption[];
  nextCursor: string | null;
  total: number;
  nextRollNumber: string | null;
};

export type Expense = {
  id: string;
  business_id: string;
  business_type: BusinessType | null;
  mode: PaymentMode;
  amount: number;
  expense_date: string;
  description: string;
  remark: string | null;
  photo_path: string | null;
  spent_by: string;
  client_request_id: string | null;
  approval_status: ApprovalStatus;
  posted_on: string | null;
  approved_at: string | null;
  approved_by: string | null;
  record_status: "active" | "cancelled";
  cancel_reason: string | null;
  created_at: string;
};

export type MoneyMovement = {
  id: string;
  business_id: string;
  business_type: BusinessType | null;
  type: "transfer" | "settlement";
  mode: PaymentMode;
  amount: number;
  payment_id: string | null;
  from_profile_id: string;
  to_profile_id: string | null;
  status: MovementStatus;
  requested_by: string;
  responded_by: string | null;
  client_request_id: string | null;
  note: string | null;
  created_at: string;
  responded_at: string | null;
};

export type LedgerEntry = {
  id: string;
  business_id: string;
  business_type: BusinessType | null;
  account_profile_id: string;
  amount: number;
  entry_date: string;
  source_type: "payment" | "expense" | "transfer" | "settlement" | "adjustment";
  source_id: string | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
};

export type DailyPostingEvent = {
  id: string;
  source_type: "payment" | "expense" | "transfer" | "settlement" | "agent_settlement";
  source_id: string;
  business_type: BusinessType | null;
  component: "cash" | "online" | null;
  profile_id: string;
  counterparty_profile_id: string | null;
  direction: "in" | "out";
  amount: number;
  cash_amount: number;
  online_amount: number;
  transaction_date: string;
  approval_date: string;
  approved_at: string | null;
  approved_by: string | null;
};

export type ChangeRequest = {
  id: string;
  business_id: string;
  record_type: "payment" | "expense";
  record_id: string;
  request_type: "edit" | "cancel";
  requested_by: string;
  client_request_id: string | null;
  status: MovementStatus;
  reason: string | null;
  proposed_changes: Record<string, unknown>;
  reviewed_by: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export type AgentSettlement = {
  id: string;
  business_id: string;
  agent_id: string;
  amount: number;
  status: MovementStatus;
  paid_by: string;
  responded_by: string | null;
  client_request_id: string | null;
  note: string | null;
  created_at: string;
  responded_at: string | null;
};

export type AppNotification = {
  id: string;
  business_id: string;
  recipient_id: string;
  actor_id: string | null;
  title: string;
  body: string;
  category: "payment" | "expense" | "transfer" | "approval" | "agent" | "settings" | "system";
  tone: "success" | "error" | "warning" | "info";
  event_key: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type ClosingSummary = {
  profile_id: string;
  full_name: string;
  role: AppRole;
  opening: number;
  collected: number;
  expenses: number;
  received: number;
  sent: number;
  adjustments: number;
  closing: number;
};

export type CashBalanceSummary = {
  profile_id: string;
  business_type: BusinessType | null;
  balance: number;
};

export type DashboardSummary = {
  role: BusinessRole;
  cashSelf: number;
  /** Viewer's cash collected (minus cash spent) that still awaits approval. */
  cashSelfPending?: number;
  /** First day of the run since the viewer's cash in hand last stood at zero. */
  cashSelfSince?: string | null;
  cashWithStaff: number;
  collections: { total: number; cash: number; online: number };
  expenses: { total: number; cash: number; online: number };
  personalIn: { total: number; cash: number; online: number };
  personalOut: { total: number; cash: number; online: number };
  personalCashPending?: number;
  personalCashOutPending?: number;
  personalOnlinePending?: number;
  personalPending?: { amount: number; count: number };
  businessPending?: { cashIn: number; onlineIn: number; cashOut: number; onlineOut: number };
  pending: { amount: number; count: number };
  businessUnits: Array<{
    businessType: BusinessType;
    collections: number;
    cashCollections: number;
    onlineCollections: number;
    expenses: number;
    cashExpenses: number;
    onlineExpenses: number;
    pendingAmount: number;
    pendingCount: number;
    pendingCashCollections?: number;
    pendingOnlineCollections?: number;
    pendingCashExpenses?: number;
    pendingOnlineExpenses?: number;
  }>;
};

export type FinancialActivity = {
  activity_id: string;
  source_type: "payment" | "expense" | "transfer" | "settlement";
  source_id: string;
  lens: "business" | "personal";
  category: "collection" | "expense" | "in" | "out" | "pending";
  business_type: BusinessType | null;
  actor_profile_id: string;
  flow_profile_id: string | null;
  counterparty_profile_id: string | null;
  cash_amount: number;
  online_amount: number;
  amount: number;
  status: string;
  transaction_date: string;
  approval_date: string | null;
  created_at: string;
};

export type PaymentTransferMutationPatch = {
  type: "payment-transfer";
  payment: Payment;
  movement: MoneyMovement;
  ledgerEntries: LedgerEntry[];
};

export type StudentMutationPatch = {
  type: "student";
  studentType: "library" | "course";
  student: LibraryStudent | CourseStudent;
  /** Removes a payment-derived virtual row after it is materialized. */
  previousId?: string | null;
  payment?: Payment | null;
};

export type MutationPatch = PaymentTransferMutationPatch | StudentMutationPatch;

export type ActionResult<T extends object = { patch?: MutationPatch }> =
  | ({
      ok: true;
      message?: string;
      warning?: string;
      errorId?: string;
    } & T)
  | {
      ok: false;
      message: string;
      fieldErrors?: Record<string, string>;
      warning?: string;
      errorId?: string;
    };

export type AppData = {
  businessContext: BusinessContext;
  profile: Profile;
  permissions: string[];
  allPermissions: StaffPermission[];
  managerUnitScopes: ManagerUnitScope[];
  staffUnitAssignments: StaffUnitAssignment[];
  profiles: Profile[];
  rooms: Room[];
  courses: Course[];
  referrals: ReferralCode[];
  libraryStudents: LibraryStudent[];
  courseStudents: CourseStudent[];
  studentPayments: Payment[];
  payments: Payment[];
  expenses: Expense[];
  movements: MoneyMovement[];
  ledger: LedgerEntry[];
  closingSummaries: ClosingSummary[];
  cashBalances: CashBalanceSummary[];
  dashboardSummary: DashboardSummary | null;
  financialActivity: FinancialActivity[];
  changeRequests: ChangeRequest[];
  agentSettlements: AgentSettlement[];
  notifications: AppNotification[];
};

export type BootstrapPayload = Pick<
  AppData,
  "businessContext" | "profile" | "permissions" | "allPermissions" | "profiles" | "rooms" | "courses" | "referrals" | "notifications"
  | "managerUnitScopes" | "staffUnitAssignments"
>;

export type WorkspaceBootstrapPayload = BootstrapPayload;

export type DashboardPayload = Pick<
  AppData,
  | "libraryStudents"
  | "courseStudents"
  | "studentPayments"
  | "payments"
  | "expenses"
  | "movements"
  | "ledger"
  | "closingSummaries"
  | "cashBalances"
  | "dashboardSummary"
  | "financialActivity"
  | "changeRequests"
  | "agentSettlements"
  | "notifications"
>;

export type PageResult<T> = {
  items: T[];
  nextCursor: string | null;
  total: number;
};

export type DashboardOverviewPayload = {
  page: "dashboard";
  payments: Payment[];
  expenses: Expense[];
  movements: MoneyMovement[];
  ledger: LedgerEntry[];
  closingSummaries: ClosingSummary[];
  cashBalances: CashBalanceSummary[];
  dashboardSummary: DashboardSummary | null;
  financialActivity: FinancialActivity[];
  changeRequests: ChangeRequest[];
  agentSettlements: AgentSettlement[];
  notifications: AppNotification[];
};

export type TransactionPagePayload = {
  page: "transactions";
  payments: Payment[];
  expenses: Expense[];
  movements: MoneyMovement[];
  ledger: LedgerEntry[];
  financialActivity: FinancialActivity[];
  changeRequests: ChangeRequest[];
  agentSettlements: AgentSettlement[];
  notifications: AppNotification[];
};

export type ClosingOverviewPayload = {
  page: "closing";
  payments: Payment[];
  expenses: Expense[];
  movements: MoneyMovement[];
  ledger: LedgerEntry[];
  closingSummaries: ClosingSummary[];
  notifications: AppNotification[];
};

export type StudentRosterPayload = {
  page: "students";
  sourceId: string;
  status: "active" | "live" | "inactive";
  result: PageResult<LibraryStudent | CourseStudent>;
  libraryStudents: LibraryStudent[];
  courseStudents: CourseStudent[];
  payments: Payment[];
  notifications: AppNotification[];
};

export type StudentDetailPayload =
  | { source: "library"; student: LibraryStudent }
  | { source: "course"; student: CourseStudent };

export type SettingsPagePayload = {
  page: "settings";
  changeRequests: ChangeRequest[];
  notifications: AppNotification[];
};

export type OperationalPagePayload =
  | DashboardOverviewPayload
  | TransactionPagePayload
  | ClosingOverviewPayload
  | StudentRosterPayload
  | SettingsPagePayload;

export type WorkTaskStatus = "todo" | "in_progress" | "done";

export type WorkMember = {
  id: string;
  full_name: string;
  role: BusinessRole;
};

export type WorkTask = {
  id: string;
  title: string;
  notes: string | null;
  assigned_to: string;
  created_by: string;
  due_date: string | null;
  status: WorkTaskStatus;
  completed_at: string | null;
  created_at: string;
};

export type WorkUpdate = {
  id: string;
  task_id: string | null;
  author_id: string;
  entry_date: string;
  body: string | null;
  photo_url: string | null;
  voice_url: string | null;
  voice_seconds: number | null;
  status_change: WorkTaskStatus | null;
  created_at: string;
};

export type WorkAttendance = {
  id: string;
  profile_id: string;
  attendance_date: string;
  check_in_at: string;
  check_out_at: string | null;
};

export type WorkPage = {
  date: string;
  today: string;
  timezone: string;
  members: WorkMember[];
  attendance: WorkAttendance[];
  tasks: WorkTask[];
  updates: WorkUpdate[];
};

export type PendingApprovalsPayload = {
  payments: Payment[];
  expenses: Expense[];
};
