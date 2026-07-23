export type AppRole = "admin" | "owner" | "staff" | "sales_agent";
export type PlatformRole = "user" | "platform_admin";
export type BusinessRole = "primary_owner" | "co_owner" | "staff" | "sales_agent";
export type BusinessStatus = "active" | "suspended";
export type MembershipStatus = "active" | "suspended";
export type BusinessInvitationState = "pending" | "accepted" | "declined" | "revoked" | "expired";
export type BusinessCreationRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
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
  kind: "main" | "skill";
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
  course_id: string | null;
  skill_course_id: string | null;
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
  created_at: string;
  updated_at: string;
};

export type StudentHistoryPage = {
  payments: Payment[];
  events: LibraryStudentSubscriptionEvent[];
  nextPage: number | null;
  total: number;
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
  balance: number;
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
  | ({ ok: true; message?: string } & T)
  | { ok: false; message: string };

export type AppData = {
  businessContext: BusinessContext;
  profile: Profile;
  permissions: string[];
  allPermissions: StaffPermission[];
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
  changeRequests: ChangeRequest[];
  agentSettlements: AgentSettlement[];
  notifications: AppNotification[];
};

export type BootstrapPayload = Pick<
  AppData,
  "businessContext" | "profile" | "permissions" | "allPermissions" | "profiles" | "rooms" | "courses" | "referrals" | "notifications"
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
