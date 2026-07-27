"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { businessLabels, businessPermissions } from "@/lib/constants";
import type { BusinessRole, BusinessType, MembershipStatus } from "@/lib/types";
import { useSafeActionState as useActionState } from "@/lib/use-safe-action-state";
import {
  createBusinessUserAction,
  resendBusinessInvitationAction,
  resolveBusinessUserEmailAction,
  revokeBusinessInvitationAction,
  setBusinessMemberStatusAction,
  updateBusinessMemberAccessAction,
  type BusinessUserActionState,
} from "./actions";

export type BusinessSettingsMember = {
  membershipId: string;
  profileId: string;
  fullName: string;
  email: string;
  role: BusinessRole;
  status: MembershipStatus;
  profileActive: boolean;
  canManage: boolean;
  permissions: string[];
  unitScopes: BusinessType[];
  unitManagers: Partial<Record<BusinessType, string>>;
  joinedAt: string | null;
  suspendedAt: string | null;
  updatedAt: string | null;
};

export type PendingInvitation = {
  id: string;
  email: string;
  role: Exclude<BusinessRole, "primary_owner">;
  permissions: string[];
  unitScopes: BusinessType[];
  unitManagers: Partial<Record<BusinessType, string>>;
  state: "pending" | "expired";
  expiresAt: string;
  lastSentAt: string | null;
  deliveryStatus: "pending" | "sent" | "failed";
  deliveryError: string | null;
  canManage: boolean;
};

type DrawerState =
  | { kind: "add" }
  | { kind: "member"; id: string }
  | { kind: "invitation"; id: string }
  | null;

type DirectoryTab = "active" | "pending" | "suspended";
type EditableRole = Exclude<BusinessRole, "primary_owner">;
type AccessAction = (state: BusinessUserActionState, formData: FormData) => Promise<BusinessUserActionState>;
type ManagerOption = {
  profileId: string;
  fullName: string;
  unitScopes: BusinessType[];
};

const initialActionState: BusinessUserActionState = { ok: null, message: "" };
const moduleOrder: BusinessType[] = ["library", "guest_house", "course", "general"];
const permissionToModule = Object.fromEntries(
  Object.entries(businessPermissions).map(([moduleKey, permission]) => [permission, moduleKey]),
) as Record<string, BusinessType>;

function roleLabel(role: BusinessRole) {
  if (role === "primary_owner") return "Owner";
  if (role === "co_owner") return "Manager";
  if (role === "sales_agent") return "Sales Agent";
  return "Staff";
}

function roleDescription(role: EditableRole) {
  if (role === "co_owner") return "Runs business operations and manages Staff and Sales Agents.";
  if (role === "sales_agent") return "Uses the referral and incentive experience only.";
  return "Works only in the selected business modules and capabilities.";
}

function formatDate(value: string | null) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) return "Not sent";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function enabledModuleLabels(enabledModules: BusinessType[]) {
  return moduleOrder.filter((module) => enabledModules.includes(module)).map((module) => businessLabels[module]);
}

function accessSummary(
  role: BusinessRole,
  permissions: string[],
  enabledModules: BusinessType[],
  unitScopes: BusinessType[] = [],
) {
  if (role === "primary_owner") return "Full business and ownership control";
  if (role === "co_owner") {
    return `Manager for ${enabledModuleLabels(unitScopes).join(", ") || "no assigned units"}`;
  }
  if (role === "sales_agent") return "Referral and incentive access";

  const capabilities = moduleOrder.flatMap((module) => {
    const permission = businessPermissions[module];
    return permissions.includes(permission) && enabledModules.includes(module) ? [businessLabels[module]] : [];
  });
  if (permissions.includes("add_expense")) capabilities.push("Add expenses");
  if (permissions.includes("transfer_money")) capabilities.push("Transfer assigned transactions");
  const paused = permissions.filter((permission) => {
    const moduleKey = permissionToModule[permission];
    return moduleKey && !enabledModules.includes(moduleKey);
  }).length;
  const unitLabel = enabledModuleLabels(unitScopes).join(", ") || "no assigned units";
  const base = `${unitLabel} · ${capabilities.length ? capabilities.join(", ") : "No operational permissions"}`;
  return paused ? `${base} · ${paused} paused module${paused === 1 ? "" : "s"}` : base;
}

function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }
  return (
    <div className="business-invite-link">
      <input aria-label="Invitation link" readOnly value={url} />
      <button className="secondary-button" type="button" onClick={copyLink}>{copied ? "Copied" : "Copy link"}</button>
    </div>
  );
}

function ActionMessage({ state }: { state: BusinessUserActionState }) {
  if (!state.message) return null;
  return (
    <div
      className={`business-user-action-message ${state.ok ? state.warning ? "warning" : "success" : "error"}`}
      role={state.ok ? "status" : "alert"}
      aria-live={state.ok ? "polite" : "assertive"}
    >
      <p>
        {state.message}
        {state.warning ? ` ${state.warning}` : ""}
        {state.errorId ? ` Reference: ${state.errorId}.` : ""}
      </p>
      {state.inviteUrl ? <InviteLink url={state.inviteUrl} /> : null}
    </div>
  );
}

function RoleCards({ role, setRole, canCreateManager }: {
  role: EditableRole;
  setRole: (role: EditableRole) => void;
  canCreateManager: boolean;
}) {
  const roles: EditableRole[] = canCreateManager ? ["co_owner", "staff", "sales_agent"] : ["staff", "sales_agent"];
  return (
    <fieldset className="business-role-card-grid">
      <legend>Business role</legend>
      {roles.map((option) => (
        <label className={role === option ? "selected" : ""} key={option}>
          <input
            checked={role === option}
            name="role"
            onChange={() => setRole(option)}
            type="radio"
            value={option}
          />
          <span><strong>{roleLabel(option)}</strong><small>{roleDescription(option)}</small></span>
        </label>
      ))}
    </fieldset>
  );
}

function StaffAccessFields({ permissions, setPermissions, enabledModules, preservedPermissions }: {
  permissions: string[];
  setPermissions: (permissions: string[]) => void;
  enabledModules: BusinessType[];
  preservedPermissions: string[];
}) {
  function toggle(permission: string, checked: boolean) {
    setPermissions(checked
      ? [...new Set([...permissions, permission])]
      : permissions.filter((item) => item !== permission));
  }
  const disabledPreserved = moduleOrder.filter((module) =>
    !enabledModules.includes(module) && preservedPermissions.includes(businessPermissions[module]),
  );

  return (
    <fieldset className="business-access-choice-grid">
      <legend>Staff access</legend>
      <p>Select the parts of this business the person can work in.</p>
      <div className="business-module-access-list">
        {moduleOrder.filter((module) => enabledModules.includes(module)).map((module) => {
          const permission = businessPermissions[module];
          return (
            <label key={module}>
              <input
                checked={permissions.includes(permission)}
                name="permissions"
                onChange={(event) => toggle(permission, event.target.checked)}
                type="checkbox"
                value={permission}
              />
              <span><strong>{businessLabels[module]}</strong><small>Collect and manage payments in this module</small></span>
            </label>
          );
        })}
        <label>
          <input
            checked={permissions.includes("add_expense")}
            name="permissions"
            onChange={(event) => toggle("add_expense", event.target.checked)}
            type="checkbox"
            value="add_expense"
          />
          <span><strong>Can add expenses</strong><small>Create business expense records</small></span>
        </label>
        <label>
          <input
            checked={permissions.includes("transfer_money")}
            name="permissions"
            onChange={(event) => toggle("transfer_money", event.target.checked)}
            type="checkbox"
            value="transfer_money"
          />
          <span><strong>Transfer assigned transactions</strong><small>Request a Staff-to-Staff transfer for transactions currently assigned to them</small></span>
        </label>
      </div>
      {disabledPreserved.length ? (
        <div className="business-paused-access">
          <strong>Preserved while disabled</strong>
          <span>{disabledPreserved.map((module) => businessLabels[module]).join(", ")} access will return if the Owner enables the module.</span>
        </div>
      ) : null}
    </fieldset>
  );
}

function UnitAccessFields({
  role,
  selectedUnits,
  setSelectedUnits,
  unitManagers,
  setUnitManagers,
  enabledModules,
  managers,
  requireSelfManager,
}: {
  role: "co_owner" | "staff";
  selectedUnits: BusinessType[];
  setSelectedUnits: (units: BusinessType[]) => void;
  unitManagers: Partial<Record<BusinessType, string>>;
  setUnitManagers: (managers: Partial<Record<BusinessType, string>>) => void;
  enabledModules: BusinessType[];
  managers: ManagerOption[];
  requireSelfManager: boolean;
}) {
  function toggleUnit(unit: BusinessType, checked: boolean) {
    setSelectedUnits(checked
      ? [...new Set([...selectedUnits, unit])]
      : selectedUnits.filter((item) => item !== unit));
    if (!checked) setUnitManagers({ ...unitManagers, [unit]: "" });
  }

  return (
    <fieldset className="business-access-choice-grid business-unit-access-fields">
      <legend>{role === "co_owner" ? "Manager business units" : "Business visibility and reporting line"}</legend>
      <p>
        {role === "co_owner"
          ? "The Manager sees business activity only for these units and the Staff assigned to them."
          : "Choose the units this Staff member can see. A different Manager may be selected for each unit."}
      </p>
      <div className="business-module-access-list">
        {moduleOrder.filter((unit) => enabledModules.includes(unit)).map((unit) => {
          const selected = selectedUnits.includes(unit);
          const eligibleManagers = managers.filter((manager) => manager.unitScopes.includes(unit));
          const managerValue = unitManagers[unit]
            || (requireSelfManager ? eligibleManagers[0]?.profileId ?? "" : "");
          return (
            <div className={`business-unit-assignment ${selected ? "selected" : ""}`} key={unit}>
              <label>
                <input
                  checked={selected}
                  name="unit_scopes"
                  onChange={(event) => toggleUnit(unit, event.target.checked)}
                  type="checkbox"
                  value={unit}
                />
                <span>
                  <strong>{businessLabels[unit]}</strong>
                  <small>{role === "co_owner" ? "Include this unit in Manager reporting" : "Show this unit and assigned team activity"}</small>
                </span>
              </label>
              {role === "staff" && selected ? (
                <label className="business-unit-manager-select">
                  <span>Reports to</span>
                  <select
                    name={`unit_manager_${unit}`}
                    onChange={(event) => setUnitManagers({ ...unitManagers, [unit]: event.target.value })}
                    value={managerValue}
                  >
                    {!requireSelfManager ? <option value="">Owner-managed</option> : null}
                    {eligibleManagers.map((manager) => (
                      <option key={manager.profileId} value={manager.profileId}>{manager.fullName}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

function AccessConfigurationForm({
  action,
  canCreateManager,
  defaultPermissions,
  defaultRole,
  defaultUnitManagers,
  defaultUnitScopes,
  enabledModules,
  hiddenFields,
  managers,
  profileActive = true,
  submitLabel,
}: {
  action: AccessAction;
  canCreateManager: boolean;
  defaultPermissions: string[];
  defaultRole: EditableRole;
  defaultUnitManagers: Partial<Record<BusinessType, string>>;
  defaultUnitScopes: BusinessType[];
  enabledModules: BusinessType[];
  hiddenFields: Array<{ name: string; value: string }>;
  managers: ManagerOption[];
  profileActive?: boolean;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const [role, setRole] = useState<EditableRole>(defaultRole);
  const [permissions, setPermissions] = useState(defaultPermissions);
  const [selectedUnits, setSelectedUnits] = useState(defaultUnitScopes);
  const [unitManagers, setUnitManagers] = useState(defaultUnitManagers);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const firstInvalidField = !state.ok && state.fieldErrors
      ? Object.keys(state.fieldErrors)[0]
      : null;
    if (firstInvalidField) {
      formRef.current
        ?.querySelector<HTMLElement>(`[name="${CSS.escape(firstInvalidField)}"]`)
        ?.focus();
    }
  }, [state.fieldErrors, state.ok]);

  return (
    <form ref={formRef} action={formAction} className="business-access-editor-form">
      {hiddenFields.map((field) => <input key={field.name} name={field.name} type="hidden" value={field.value} />)}
      <RoleCards role={role} setRole={setRole} canCreateManager={canCreateManager} />
      {role === "co_owner" || role === "staff" ? (
        <UnitAccessFields
          enabledModules={enabledModules}
          managers={managers}
          requireSelfManager={!canCreateManager}
          role={role}
          selectedUnits={selectedUnits}
          setSelectedUnits={setSelectedUnits}
          setUnitManagers={setUnitManagers}
          unitManagers={unitManagers}
        />
      ) : null}
      {role === "staff" ? (
        <StaffAccessFields
          permissions={permissions}
          setPermissions={setPermissions}
          enabledModules={enabledModules}
          preservedPermissions={defaultPermissions}
        />
      ) : (
        <div className="business-role-access-note">
          <strong>{roleLabel(role)} access is role-based</strong>
          <p>{roleDescription(role)} Individual module toggles do not apply to this role.</p>
        </div>
      )}
      <div className="business-access-summary-card">
        <span>Access summary</span>
        <strong>{accessSummary(role, permissions, enabledModules, selectedUnits)}</strong>
      </div>
      {!profileActive ? <p className="business-user-action-message error">A platform administrator must reactivate this global Lenden account before business access can be restored.</p> : null}
      <ActionMessage state={state} />
      <button className="primary-button" disabled={pending || !profileActive} type="submit">
        {pending ? "Saving access…" : submitLabel}
      </button>
    </form>
  );
}

function BusinessAccessDrawer({ title, eyebrow, onClose, children }: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const mountDialog = useCallback((node: HTMLDialogElement | null) => {
    dialogRef.current = node;
    if (node && !node.open) node.showModal();
  }, []);
  function close() {
    dialogRef.current?.close();
  }
  return (
    <dialog
      aria-labelledby="business-access-drawer-title"
      className="business-access-drawer"
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
      onClose={onClose}
      ref={mountDialog}
    >
      <div className="business-access-drawer-panel">
        <header>
          <div><p className="eyebrow">{eyebrow}</p><h2 id="business-access-drawer-title">{title}</h2></div>
          <button aria-label="Close access panel" className="business-drawer-close" onClick={close} type="button">×</button>
        </header>
        <div className="business-access-drawer-body">{children}</div>
      </div>
    </dialog>
  );
}

function AddPersonFlow({ canCreateManager, enabledModules, managers, members, onEditMember }: {
  canCreateManager: boolean;
  enabledModules: BusinessType[];
  managers: ManagerOption[];
  members: BusinessSettingsMember[];
  onEditMember: (id: string) => void;
}) {
  const [lookupState, lookupAction, lookupPending] = useActionState(resolveBusinessUserEmailAction, initialActionState);
  const lookupFormRef = useRef<HTMLFormElement>(null);
  const existingMember = members.find((member) => member.email.toLowerCase() === lookupState.email?.toLowerCase());
  const canConfigure = lookupState.lookup === "registered" || lookupState.lookup === "invite";

  useEffect(() => {
    if (!lookupState.ok && lookupState.fieldErrors?.email) {
      lookupFormRef.current?.querySelector<HTMLInputElement>('[name="email"]')?.focus();
    }
  }, [lookupState.fieldErrors, lookupState.ok]);

  return (
    <div className="business-add-person-flow">
      <div className="business-drawer-intro">
        <strong>Start with their exact email</strong>
        <p>Lenden checks one exact address. It never exposes a browsable directory of users from other businesses.</p>
      </div>
      <form ref={lookupFormRef} action={lookupAction} className="business-user-email-lookup">
        <label>User email<input autoComplete="email" defaultValue={lookupState.email} name="email" placeholder="name@company.com" required type="email" /></label>
        <button className="secondary-button" disabled={lookupPending} type="submit">{lookupPending ? "Checking…" : "Check email"}</button>
      </form>
      <ActionMessage state={lookupState} />
      {existingMember && (lookupState.lookup === "already_active" || lookupState.lookup === "suspended") ? (
        <button className="primary-button" onClick={() => onEditMember(existingMember.membershipId)} type="button">
          {lookupState.lookup === "suspended" ? "Review & restore access" : "Edit current access"}
        </button>
      ) : null}
      {canConfigure ? (
        <AccessConfigurationForm
          key={`${lookupState.email}-${lookupState.lookup}`}
          action={createBusinessUserAction}
          canCreateManager={canCreateManager}
          defaultPermissions={[]}
          defaultRole="staff"
          defaultUnitManagers={{}}
          defaultUnitScopes={[]}
          enabledModules={enabledModules}
          hiddenFields={[{ name: "email", value: lookupState.email ?? "" }]}
          managers={managers}
          submitLabel={lookupState.lookup === "invite" ? "Send invitation" : "Grant access"}
        />
      ) : null}
    </div>
  );
}

function MemberAccessEditor({ member, canCreateManager, enabledModules, managers }: {
  member: BusinessSettingsMember;
  canCreateManager: boolean;
  enabledModules: BusinessType[];
  managers: ManagerOption[];
}) {
  return (
    <div className="business-member-editor">
      <div className="business-member-editor-profile">
        <div className="business-avatar">{member.fullName.slice(0, 1).toUpperCase()}</div>
        <div><strong>{member.fullName}</strong><span>{member.email}</span></div>
        <span className={`status-pill ${member.status}`}>{member.status}</span>
      </div>
      <AccessConfigurationForm
        action={updateBusinessMemberAccessAction}
        canCreateManager={canCreateManager}
        defaultPermissions={member.permissions}
        defaultRole={member.role === "primary_owner" ? "co_owner" : member.role}
        defaultUnitManagers={member.unitManagers}
        defaultUnitScopes={member.unitScopes}
        enabledModules={enabledModules}
        hiddenFields={[{ name: "membership_id", value: member.membershipId }]}
        managers={managers}
        profileActive={member.profileActive}
        submitLabel={member.status === "suspended" ? "Restore access" : "Save access"}
      />
      <dl className="business-access-metadata">
        <div><dt>Joined</dt><dd>{formatDate(member.joinedAt)}</dd></div>
        {member.suspendedAt ? <div><dt>Suspended</dt><dd>{formatDate(member.suspendedAt)}</dd></div> : null}
      </dl>
    </div>
  );
}

function InvitationEditor({ invitation, canCreateManager, enabledModules, managers }: {
  invitation: PendingInvitation;
  canCreateManager: boolean;
  enabledModules: BusinessType[];
  managers: ManagerOption[];
}) {
  return (
    <div className="business-member-editor">
      <div className="business-drawer-intro">
        <strong>{invitation.email}</strong>
        <p>Saving creates a fresh 30-day invitation link and invalidates the previous link.</p>
      </div>
      <AccessConfigurationForm
        action={createBusinessUserAction}
        canCreateManager={canCreateManager}
        defaultPermissions={invitation.permissions}
        defaultRole={invitation.role}
        defaultUnitManagers={invitation.unitManagers}
        defaultUnitScopes={invitation.unitScopes}
        enabledModules={enabledModules}
        hiddenFields={[{ name: "email", value: invitation.email }]}
        managers={managers}
        submitLabel="Save & send fresh invitation"
      />
    </div>
  );
}

function SuspendMemberDialog({ member, onClose }: { member: BusinessSettingsMember; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(setBusinessMemberStatusAction, initialActionState);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const mountDialog = useCallback((node: HTMLDialogElement | null) => {
    dialogRef.current = node;
    if (node && !node.open) node.showModal();
  }, []);
  return (
    <dialog className="business-confirm-dialog" onClose={onClose} ref={mountDialog}>
      <div>
        <p className="eyebrow">Remove business access</p>
        <h2>Suspend {member.fullName}?</h2>
        <p>Their login, historical records, and access to other businesses will not change.</p>
        {member.role === "sales_agent" ? <p>Their referral codes for this business will also be disabled.</p> : null}
        <ActionMessage state={state} />
        <div className="business-confirm-actions">
          <button className="secondary-button" onClick={() => dialogRef.current?.close()} type="button">Cancel</button>
          <form action={formAction}>
            <input name="membership_id" type="hidden" value={member.membershipId} />
            <input name="status" type="hidden" value="suspended" />
            <button className="business-user-suspend-button" disabled={pending} type="submit">{pending ? "Suspending…" : "Suspend access"}</button>
          </form>
        </div>
      </div>
    </dialog>
  );
}

function FreshInvitationAction({ invitation }: { invitation: PendingInvitation }) {
  const [state, action, pending] = useActionState(resendBusinessInvitationAction, initialActionState);
  return (
    <div className="business-invitation-inline-action">
      <form action={action}>
        <input name="invitation_id" type="hidden" value={invitation.id} />
        <button className="business-menu-action" disabled={pending} type="submit">{pending ? "Sending…" : "Send fresh invitation"}</button>
      </form>
      <ActionMessage state={state} />
    </div>
  );
}

function RevokeInvitationAction({ invitation }: { invitation: PendingInvitation }) {
  const [state, action, pending] = useActionState(revokeBusinessInvitationAction, initialActionState);
  function confirmRevoke(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(`Revoke the invitation for ${invitation.email}?`)) event.preventDefault();
  }
  return (
    <div className="business-invitation-inline-action">
      <form action={action} onSubmit={confirmRevoke}>
        <input name="invitation_id" type="hidden" value={invitation.id} />
        <button className="business-menu-action danger" disabled={pending} type="submit">{pending ? "Revoking…" : "Revoke invitation"}</button>
      </form>
      <ActionMessage state={state} />
    </div>
  );
}

function MemberDirectoryRow({ member, currentProfileId, enabledModules, onEdit, onSuspend }: {
  member: BusinessSettingsMember;
  currentProfileId: string;
  enabledModules: BusinessType[];
  onEdit: () => void;
  onSuspend: () => void;
}) {
  const label = `${member.fullName}${member.profileId === currentProfileId ? " (You)" : ""}`;
  const identityContent = <><div className="business-avatar">{member.fullName.slice(0, 1).toUpperCase()}</div><div><strong>{label}</strong><span>{member.email}</span></div></>;
  return (
    <div className="business-people-row" role="row">
      <div className="business-person-cell identity" role="cell">
        {member.canManage
          ? <button aria-label={`Edit access for ${member.fullName}`} className="business-person-open" onClick={onEdit} type="button">{identityContent}</button>
          : <div className="business-person-open">{identityContent}</div>}
      </div>
      <div className="business-person-cell" role="cell"><span className="business-mobile-label">Role</span><span className="status-pill">{roleLabel(member.role)}</span></div>
      <div className="business-person-cell access" role="cell"><span className="business-mobile-label">Access</span><span>{accessSummary(member.role, member.permissions, enabledModules, member.unitScopes)}</span></div>
      <div className="business-person-cell" role="cell"><span className="business-mobile-label">Status</span><span className={`status-pill ${member.profileActive ? member.status : "suspended"}`}>{member.profileActive ? member.status : "account inactive"}</span></div>
      <div className="business-person-cell actions" role="cell">
        {member.canManage ? (
          <details className="business-person-menu">
            <summary aria-label={`Manage ${member.fullName}`}>•••</summary>
            <div>
              <button className="business-menu-action" onClick={onEdit} type="button">{member.status === "suspended" ? "Review & restore" : "Edit access"}</button>
              {member.status === "active" ? <button className="business-menu-action danger" onClick={onSuspend} type="button">Suspend access</button> : null}
            </div>
          </details>
        ) : member.role === "primary_owner" ? <span className="business-protected-label">Protected</span> : <span className="business-protected-label">View only</span>}
      </div>
    </div>
  );
}

function InvitationDirectoryRow({ invitation, enabledModules, onEdit }: {
  invitation: PendingInvitation;
  enabledModules: BusinessType[];
  onEdit: () => void;
}) {
  return (
    <div className="business-people-row invitation" role="row">
      <div className="business-person-cell identity" role="cell"><div className="business-person-open"><div className="business-avatar pending">@</div><div><strong>{invitation.email}</strong><span>Waiting for signup and acceptance</span></div></div></div>
      <div className="business-person-cell" role="cell"><span className="business-mobile-label">Role</span><span className="status-pill">{roleLabel(invitation.role)}</span></div>
      <div className="business-person-cell access" role="cell"><span className="business-mobile-label">Access</span><span>{accessSummary(invitation.role, invitation.permissions, enabledModules, invitation.unitScopes)}</span></div>
      <div className="business-person-cell invitation-state" role="cell">
        <span className={`status-pill ${invitation.state}`}>{invitation.state}</span>
        <small>{invitation.deliveryStatus === "failed" ? "Email failed" : invitation.lastSentAt ? `Sent ${formatDateTime(invitation.lastSentAt)}` : "Not sent"}</small>
        <small>Expires {formatDate(invitation.expiresAt)}</small>
      </div>
      <div className="business-person-cell actions" role="cell">
        {invitation.canManage ? (
          <details className="business-person-menu">
            <summary aria-label={`Manage invitation for ${invitation.email}`}>•••</summary>
            <div>
              <button className="business-menu-action" onClick={onEdit} type="button">Edit invited access</button>
              <FreshInvitationAction invitation={invitation} />
              <RevokeInvitationAction invitation={invitation} />
            </div>
          </details>
        ) : <span className="business-protected-label">View only</span>}
      </div>
      {invitation.deliveryError ? <p className="business-invitation-error">The invitation email could not be delivered. Send a fresh invitation or copy its link.</p> : null}
    </div>
  );
}

export default function BusinessUsersSettings({
  businessName,
  members,
  invitations,
  canCreateManager,
  canManageModules,
  currentProfileId,
  enabledModules,
  managers,
}: {
  businessName: string;
  members: BusinessSettingsMember[];
  invitations: PendingInvitation[];
  canCreateManager: boolean;
  canManageModules: boolean;
  currentProfileId: string;
  enabledModules: BusinessType[];
  managers: ManagerOption[];
}) {
  const [tab, setTab] = useState<DirectoryTab>("active");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [suspendMemberId, setSuspendMemberId] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLowerCase();

  const filteredMembers = useMemo(() => members.filter((member) => {
    if (member.status !== tab) return false;
    if (roleFilter !== "all" && member.role !== roleFilter) return false;
    return !normalizedQuery || member.fullName.toLowerCase().includes(normalizedQuery) || member.email.toLowerCase().includes(normalizedQuery);
  }), [members, normalizedQuery, roleFilter, tab]);
  const filteredInvitations = useMemo(() => invitations.filter((invitation) => {
    if (roleFilter !== "all" && invitation.role !== roleFilter) return false;
    return !normalizedQuery || invitation.email.toLowerCase().includes(normalizedQuery);
  }), [invitations, normalizedQuery, roleFilter]);

  const selectedMember = drawer?.kind === "member" ? members.find((member) => member.membershipId === drawer.id) : null;
  const selectedInvitation = drawer?.kind === "invitation" ? invitations.find((invitation) => invitation.id === drawer.id) : null;
  const suspendMember = suspendMemberId ? members.find((member) => member.membershipId === suspendMemberId) : null;
  const activeCount = members.filter((member) => member.status === "active").length;
  const suspendedCount = members.length - activeCount;

  function openMember(id: string) {
    setDrawer({ kind: "member", id });
  }

  return (
    <section className="admin-panel business-users-panel">
      <div className="business-users-heading">
        <div>
          <p className="eyebrow">People & access</p>
          <h2>Business team</h2>
          <p>Find people quickly, assign clear roles, and manage only their access to {businessName}.</p>
        </div>
        <button className="primary-button" onClick={() => setDrawer({ kind: "add" })} type="button">+ Add person</button>
      </div>

      <div className="business-enabled-summary">
        <div><span>Enabled business modules</span><strong>{enabledModuleLabels(enabledModules).join(", ") || "No modules enabled"}</strong></div>
        <span>{canManageModules ? "Change these from Business modules." : "Only the Owner can change business modules."}</span>
      </div>

      <div className="business-directory-tabs" role="tablist" aria-label="Business access status">
        <button aria-selected={tab === "active"} onClick={() => setTab("active")} role="tab" type="button">Active <span>{activeCount}</span></button>
        <button aria-selected={tab === "pending"} onClick={() => setTab("pending")} role="tab" type="button">Pending <span>{invitations.length}</span></button>
        <button aria-selected={tab === "suspended"} onClick={() => setTab("suspended")} role="tab" type="button">Suspended <span>{suspendedCount}</span></button>
      </div>

      <div className="business-directory-toolbar">
        <label className="business-people-search"><span>Search people</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or email" type="search" value={query} /></label>
        <label><span>Role</span><select onChange={(event) => setRoleFilter(event.target.value)} value={roleFilter}><option value="all">All roles</option><option value="primary_owner">Owner</option><option value="co_owner">Manager</option><option value="staff">Staff</option><option value="sales_agent">Sales Agent</option></select></label>
      </div>

      <div className="business-people-table" role="table" aria-label={`${tab} business access`}>
        <div className="business-people-table-head" role="row">
          <span role="columnheader">Person</span><span role="columnheader">Role</span><span role="columnheader">Access</span><span role="columnheader">Status</span><span role="columnheader">Actions</span>
        </div>
        <div className="business-people-table-body" role="rowgroup">
          {tab === "pending" ? filteredInvitations.map((invitation) => (
            <InvitationDirectoryRow key={invitation.id} invitation={invitation} enabledModules={enabledModules} onEdit={() => setDrawer({ kind: "invitation", id: invitation.id })} />
          )) : filteredMembers.map((member) => (
            <MemberDirectoryRow
              key={member.membershipId}
              member={member}
              currentProfileId={currentProfileId}
              enabledModules={enabledModules}
              onEdit={() => openMember(member.membershipId)}
              onSuspend={() => setSuspendMemberId(member.membershipId)}
            />
          ))}
          {((tab === "pending" && filteredInvitations.length === 0) || (tab !== "pending" && filteredMembers.length === 0)) ? (
            <div className="business-directory-empty"><strong>No matching {tab} access</strong><span>Try another search or role filter.</span></div>
          ) : null}
        </div>
      </div>

      {drawer?.kind === "add" ? (
        <BusinessAccessDrawer eyebrow="People & access" onClose={() => setDrawer(null)} title="Add a person">
          <AddPersonFlow canCreateManager={canCreateManager} enabledModules={enabledModules} managers={managers} members={members} onEditMember={openMember} />
        </BusinessAccessDrawer>
      ) : null}
      {selectedMember ? (
        <BusinessAccessDrawer eyebrow="Member access" onClose={() => setDrawer(null)} title={`Edit ${selectedMember.fullName}`}>
          <MemberAccessEditor member={selectedMember} canCreateManager={canCreateManager} enabledModules={enabledModules} managers={managers} />
        </BusinessAccessDrawer>
      ) : null}
      {selectedInvitation ? (
        <BusinessAccessDrawer eyebrow="Pending invitation" onClose={() => setDrawer(null)} title="Edit invited access">
          <InvitationEditor invitation={selectedInvitation} canCreateManager={canCreateManager} enabledModules={enabledModules} managers={managers} />
        </BusinessAccessDrawer>
      ) : null}
      {suspendMember ? <SuspendMemberDialog member={suspendMember} onClose={() => setSuspendMemberId(null)} /> : null}
    </section>
  );
}
