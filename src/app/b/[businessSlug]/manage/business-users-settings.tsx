"use client";

import { useActionState, type FormEvent } from "react";
import { permissionOptions } from "@/lib/constants";
import type { BusinessRole, MembershipStatus } from "@/lib/types";
import {
  createBusinessUserAction,
  resendBusinessInvitationAction,
  resolveBusinessUserEmailAction,
  revokeBusinessInvitationAction,
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
  permissions: string[];
};

type PendingInvitation = {
  id: string;
  email: string;
  role: Exclude<BusinessRole, "primary_owner">;
  permissions: string[];
  state: "pending" | "expired";
  expiresAt: string;
  deliveryStatus: "pending" | "sent" | "failed";
  deliveryError: string | null;
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
    <div className={`business-user-action-message ${state.ok ? "success" : "error"}`} role={state.ok ? "status" : "alert"} aria-live="polite">
      <p>{state.message}</p>
      {state.inviteUrl ? <a href={state.inviteUrl}>Open or copy the new invitation link</a> : null}
    </div>
  );
}

function AddBusinessUserForm({ canCreateManager }: { canCreateManager: boolean }) {
  const [lookupState, lookupAction, lookupPending] = useActionState(resolveBusinessUserEmailAction, initialActionState);
  const [state, formAction, pending] = useActionState(createBusinessUserAction, initialActionState);
  const canConfigure = Boolean(lookupState.lookup)
    && !(lookupState.lookup === "already_active" && lookupState.existingRole === "primary_owner")
    && !(!canCreateManager && lookupState.existingRole === "co_owner");
  const defaultRole = lookupState.existingRole === "co_owner" ? "owner" : lookupState.existingRole === "sales_agent" ? "sales_agent" : "staff";

  return (
    <div className="business-user-create-form">
      <form action={lookupAction} className="business-user-email-lookup">
        <label>
          User email
          <input name="email" type="email" required autoComplete="email" defaultValue={lookupState.email} />
        </label>
        <button className="secondary-button" type="submit" disabled={lookupPending}>{lookupPending ? "Checking…" : "Continue"}</button>
      </form>
      <ActionMessage state={lookupState} />
      {canConfigure ? <form key={`${lookupState.email}-${lookupState.lookup}-${lookupState.existingRole ?? "new"}`} action={formAction} className="business-user-create-form">
      <input name="email" type="hidden" value={lookupState.email} />
      <div className="business-user-form-grid">
        <div className="business-user-resolution"><span>{lookupState.lookup === "invite" ? "New invitation" : lookupState.lookup === "suspended" ? "Reactivate access" : lookupState.lookup === "already_active" ? "Update active access" : "Registered user"}</span><strong>{lookupState.fullName ?? lookupState.email}</strong></div>
        <label>
          Business role
          <select name="role" defaultValue={defaultRole}>
            <option value="staff">Staff</option>
            <option value="sales_agent">Sales Agent</option>
            {canCreateManager ? <option value="owner">Manager</option> : null}
          </select>
        </label>
      </div>
        <fieldset className="business-user-permission-grid">
          <legend>Staff permissions</legend>
          {permissionOptions.map((permission) => (
            <label key={permission.value}>
              <input name="permissions" type="checkbox" value={permission.value} />
              <span>{permissionLabels[permission.value] ?? permission.label}</span>
            </label>
          ))}
        </fieldset>
      <p className="business-user-help">Permissions apply only when the selected role is Staff.</p>
      <p className="business-user-help">{lookupState.lookup === "invite" ? "The person will set their own password or use Google, then accept the invitation." : lookupState.lookup === "suspended" ? "Confirm to reactivate the preserved membership. Their password and other businesses are unchanged." : lookupState.lookup === "already_active" ? "Confirm the role and permissions change. Their login and other businesses are unchanged." : "Access is added immediately without changing the user's password or other businesses."}</p>
      <ActionMessage state={state} />
      <button className="primary-button" type="submit" disabled={pending}>
        {pending ? "Saving access…" : lookupState.lookup === "invite" ? "Send invitation" : lookupState.lookup === "suspended" ? "Reactivate access" : lookupState.lookup === "already_active" ? "Update access" : "Grant access"}
      </button>
      </form> : null}
    </div>
  );
}

function MemberStatusForm({ member }: { member: BusinessSettingsMember }) {
  const [state, formAction, pending] = useActionState(setBusinessMemberStatusAction, initialActionState);
  const nextStatus = member.status === "active" ? "suspended" : "active";

  function confirmStatusChange(event: FormEvent<HTMLFormElement>) {
    const action = nextStatus === "active" ? "restore" : "remove";
    if (!window.confirm(`${action[0].toUpperCase()}${action.slice(1)} ${member.fullName}'s access to this business?`)) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} className="business-member-status-form" onSubmit={confirmStatusChange}>
      <input type="hidden" name="membership_id" value={member.membershipId} />
      <input type="hidden" name="status" value={nextStatus} />
      <button className={member.status === "active" ? "business-user-suspend-button" : "business-user-activate-button"} type="submit" disabled={pending}>
        {pending ? "Updating…" : member.status === "active" ? "Remove access" : "Restore access"}
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
      {!member.profileActive ? <p className="business-user-action-message error">This login profile is globally inactive. A platform administrator must reactivate it.</p> : null}
    </article>
  );
}

function PendingInvitationCard({ invitation }: { invitation: PendingInvitation }) {
  const [resendState, resendAction, resendPending] = useActionState(resendBusinessInvitationAction, initialActionState);
  const [revokeState, revokeAction, revokePending] = useActionState(revokeBusinessInvitationAction, initialActionState);
  return <article className="business-user-card invited">
    <header className="business-user-card-header"><div><strong>{invitation.email}</strong><span>Waiting for signup and acceptance</span></div><div className="business-user-badges"><span className="status-pill">{roleLabel(invitation.role)}</span><span className={`status-pill ${invitation.state}`}>{invitation.state}</span></div></header>
    <p className="business-user-help">{invitation.state === "expired" ? "This invitation has expired. Regenerate it to create a new 30-day link." : `Expires ${new Date(invitation.expiresAt).toLocaleDateString()}.`} Email: {invitation.deliveryStatus}{invitation.deliveryError ? ` · ${invitation.deliveryError}` : ""}</p>
    <div className="business-invitation-actions"><form action={resendAction}><input type="hidden" name="invitation_id" value={invitation.id} /><button className="secondary-button" type="submit" disabled={resendPending}>{resendPending ? "Regenerating…" : "Regenerate & send"}</button></form><form action={revokeAction} onSubmit={(event) => { if (!window.confirm(`Revoke the invitation for ${invitation.email}?`)) event.preventDefault(); }}><input type="hidden" name="invitation_id" value={invitation.id} /><button className="business-user-suspend-button" type="submit" disabled={revokePending}>{revokePending ? "Revoking…" : "Revoke"}</button></form></div>
    <ActionMessage state={resendState} /><ActionMessage state={revokeState} />
  </article>;
}

export default function BusinessUsersSettings({
  members,
  invitations,
  canCreateManager,
}: {
  members: BusinessSettingsMember[];
  invitations: PendingInvitation[];
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
          <p>Grant business access, manage permissions, and remove or restore each membership. Users own their login and password.</p>
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
      {invitations.length ? <div className="business-pending-invitations"><div className="business-users-heading"><div><p className="eyebrow">Pending</p><h3>Invitations</h3></div><span className="status-pill">{invitations.length} pending</span></div><div className="business-user-list">{invitations.map((invitation) => <PendingInvitationCard key={invitation.id} invitation={invitation} />)}</div></div> : null}
    </section>
  );
}
