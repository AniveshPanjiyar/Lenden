export type AppRole = "admin" | "owner" | "staff" | "sales_agent";
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
  role: AppRole;
  active: boolean;
};

export type StaffPermission = {
  profile_id: string;
  permission: string;
};

export type Room = {
  id: string;
  room_number: string;
  label: string | null;
  active: boolean;
};

export type Course = {
  id: string;
  name: string;
  kind: "main" | "skill";
  active: boolean;
};

export type ReferralCode = {
  id: string;
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
  collected_by: string;
  current_holder_id: string | null;
  client_request_id: string | null;
  approval_status: ApprovalStatus;
  record_status: "active" | "cancelled";
  cancel_reason: string | null;
  created_at: string;
};

export type Expense = {
  id: string;
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
  record_status: "active" | "cancelled";
  cancel_reason: string | null;
  created_at: string;
};

export type MoneyMovement = {
  id: string;
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
  account_profile_id: string;
  amount: number;
  entry_date: string;
  source_type: "payment" | "expense" | "transfer" | "settlement" | "adjustment";
  source_id: string | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
};

export type ChangeRequest = {
  id: string;
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

export type AppData = {
  profile: Profile;
  permissions: string[];
  allPermissions: StaffPermission[];
  profiles: Profile[];
  rooms: Room[];
  courses: Course[];
  referrals: ReferralCode[];
  payments: Payment[];
  expenses: Expense[];
  movements: MoneyMovement[];
  ledger: LedgerEntry[];
  closingSummaries: ClosingSummary[];
  changeRequests: ChangeRequest[];
  agentSettlements: AgentSettlement[];
  notifications: AppNotification[];
};

export type BootstrapPayload = Pick<
  AppData,
  "profile" | "permissions" | "allPermissions" | "profiles" | "rooms" | "courses" | "referrals"
>;

export type DashboardPayload = Pick<
  AppData,
  | "payments"
  | "expenses"
  | "movements"
  | "ledger"
  | "closingSummaries"
  | "changeRequests"
  | "agentSettlements"
  | "notifications"
>;
