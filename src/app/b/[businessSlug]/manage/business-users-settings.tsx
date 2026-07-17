"use client";

import { useActionState, useState, type FormEvent } from "react";
import { permissionOptions } from "@/lib/constants";
import type { BusinessRole, MembershipStatus } from "@/lib/types";
import {
  createBusinessUserAction,
  resetBusinessUserPasswordAction,
  saveBusinessUserPermissionsAction,
  setBusinessMemberStatusAction,
  type BusinessUserActionState,
} from "./actions";

type BusinessSettingsMember = {
  membershipId: string;
  profileId: string;
  fullName: string;
  email: string;
  role: BusinessRole;
  status: MembershipStatus;
  profileActive: boolean;
  canChangeStatus: boolean;
  canResetPassword: boolean;
  permissions: string[];
};

const initialActionState: BusinessUserActionState = { ok: null, message: "" };

const permissionLabels: Record<string, string> = {
  collect_guest_house: "Guest house collection",
  collect_library: "Library collection",
  collect_course: "Course collection",
  collect_general: "General collection",
  add_expense: "Add expenses",
};

function roleLabel(role: BusinessRole) {
  if (role === "primary_owner") return "Owner";
  if (role === "co_owner") return "Manager";
  if (role === "sales_agent") return "Sales Agent";
  return "Staff";
}

function ActionMessage({ state }: { state: BusinessUserActionState }) {
  if (!state.message) return null;
  return (
    <p className={`business-user-action-message ${state.ok ? "success" : "error"}`} role={state.ok ? "status" : "alert"} aria-live="polite">
      {state.message}
    </p>
  );
}

function AddBusinessUserForm({ canCreateManager }: { canCreateManager: boolean }) {
  const [state, formAction, pending] = useActionState(createBusinessUserAction, initialActionState);
  const [role, setRole] = useState<"owner" | "staff" | "sales_agent">("staff");

  return (
    <form action={formAction} className="business-user-create-form">
      <div className="business-user-form-grid">
        <label>
          Full name
          <input name="full_name" required autoComplete="name" />
        </label>
        <label>
          Login email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Temporary password (new users)
          <input name="password" type="password" minLength={8} autoComplete="new-password" />
        </label>
        <label>
          Business role
          <select name="role" value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
            <option value="staff">Staff</option>
            <option value="sales_agent">Sales Agent</option>
            {canCreateManager ? <option value="owner">Manager</option> : null}
          </select>
        </label>
      </div>
      {role === "staff" ? (
        <fieldset className="business-user-permission-grid">
          <legend>Starting permissions</legend>
          {permissionOptions.map((permission) => (
            <label key={permission.value}>
              <input name="permissions" type="checkbox" value={permission.value} />
              <span>{permissionLabels[permission.value] ?? permission.label}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <p className="business-user-help">If this email already has a Lenden account, its current password is preserved and only this business membership is added.</p>
      <ActionMessage state={state} />
      <button className="primary-button" type="submit" disabled={pending}>
        {pending ? "Creating user…" : "Create user"}
      </button>
    </form>
  );
}

function MemberStatusForm({ member }: { member: BusinessSettingsMember }) {
  const [state, formAction, pending] = useActionState(setBusinessMemberStatusAction, initialActionState);
  const nextStatus = member.status === "active" ? "suspended" : "active";

  function confirmStatusChange(event: FormEvent<HTMLFormElement>) {
    const action = nextStatus === "active" ? "activate" : "suspend";
    if (!window.confirm(`${action[0].toUpperCase()}${action.slice(1)} ${member.fullName}'s access to this business?`)) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} className="business-member-status-form" onSubmit={confirmStatusChange}>
      <input type="hidden" name="membership_id" value={member.membershipId} />
      <input type="hidden" name="status" value={nextStatus} />
      <button className={member.status === "active" ? "business-user-suspend-button" : "business-user-activate-button"} type="submit" disabled={pending}>
        {pending ? "Updating…" : member.status === "active" ? "Suspend user" : "Activate user"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

function ResetPasswordForm({ member }: { member: BusinessSettingsMember }) {
  const [state, formAction, pending] = useActionState(resetBusinessUserPasswordAction, initialActionState);
  return (
    <form action={formAction} className="business-user-inline-form">
      <input type="hidden" name="profile_id" value={member.profileId} />
      <label>
        New temporary password
        <input name="new_password" type="password" minLength={8} required autoComplete="new-password" />
      </label>
      <button className="secondary-button" type="submit" disabled={pending}>
        {pending ? "Resetting…" : "Reset password"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

function StaffPermissionsForm({ member }: { member: BusinessSettingsMember }) {
  const [state, formAction, pending] = useActionState(saveBusinessUserPermissionsAction, initialActionState);
  return (
    <form action={formAction} className="business-user-inline-form">
      <input type="hidden" name="profile_id" value={member.profileId} />
      <fieldset className="business-user-permission-grid compact">
        <legend>Staff permissions</legend>
        {permissionOptions.map((permission) => (
          <label key={permission.value}>
            <input
              name="permissions"
              type="checkbox"
              value={permission.value}
              defaultChecked={member.permissions.includes(permission.value)}
            />
            <span>{permissionLabels[permission.value] ?? permission.label}</span>
          </label>
        ))}
      </fieldset>
      {member.status === "suspended" ? <p className="business-user-help">These permissions will apply when the user is activated.</p> : null}
      <button className="secondary-button" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save permissions"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

function BusinessMemberCard({ member }: { member: BusinessSettingsMember }) {
  return (
    <article className={`business-user-card ${member.status}`}>
      <header className="business-user-card-header">
        <div>
          <strong>{member.fullName}</strong>
          <span>{member.email}</span>
        </div>
        <div className="business-user-badges">
          <span className="status-pill">{roleLabel(member.role)}</span>
          <span className={`status-pill ${member.status}`}>{member.status}</span>
        </div>
      </header>

      <div className="business-user-access-row">
        <div>
          <strong>{member.status === "active" ? "Business access is active" : "Business access is suspended"}</strong>
          <p>{member.status === "active"
            ? "This user can open this business according to their role and permissions."
            : "Their account and historical records are preserved; only this business is unavailable."}</p>
        </div>
        {member.canChangeStatus ? <MemberStatusForm member={member} /> : member.role === "primary_owner" ? <span className="business-user-owner-note">Transfer ownership before changing Owner access.</span> : null}
      </div>

      {member.role === "staff" ? <StaffPermissionsForm member={member} /> : null}
      {member.canResetPassword ? <ResetPasswordForm member={member} /> : null}
      {!member.profileActive ? <p className="business-user-action-message error">This login profile is globally inactive. A platform administrator must reactivate it.</p> : null}
    </article>
  );
}

export default function BusinessUsersSettings({
  members,
  canCreateManager,
}: {
  members: BusinessSettingsMember[];
  canCreateManager: boolean;
}) {
  const activeCount = members.filter((member) => member.status === "active").length;
  const suspendedCount = members.length - activeCount;

  return (
    <section className="admin-panel business-users-panel">
      <div className="business-users-heading">
        <div>
          <p className="eyebrow">Business users</p>
          <h2>User accounts and access</h2>
          <p>Create users, manage permissions and passwords, and set each membership to ACTIVE or SUSPENDED.</p>
        </div>
        <div className="business-user-counts">
          <span className="status-pill active">{activeCount} active</span>
          <span className="status-pill suspended">{suspendedCount} suspended</span>
        </div>
      </div>

      <details className="business-user-add-panel">
        <summary>+ Add user</summary>
        <AddBusinessUserForm canCreateManager={canCreateManager} />
      </details>

      <div className="business-user-list">
        {members.map((member) => <BusinessMemberCard key={member.membershipId} member={member} />)}
      </div>
    </section>
  );
}
