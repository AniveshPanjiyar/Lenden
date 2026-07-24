"use client";

import { useEffect, useRef, useState } from "react";
import { permissionOptions } from "@/lib/constants";
import { useSafeActionState as useActionState } from "@/lib/use-safe-action-state";
import type { AdminBusinessInvitation, AdminBusinessMember } from "../../admin-data";
import {
  createBusinessMemberAdminAction,
  resendBusinessInvitationAdminAction,
  revokeBusinessInvitationAdminAction,
  saveBusinessMemberPermissionsAdminAction,
  setBusinessMemberStatusAdminAction,
  type AdminActionState,
} from "../../actions";

const initialState: AdminActionState = { ok: null, message: "" };
const roleLabels = { primary_owner: "Owner", co_owner: "Manager", staff: "Staff", sales_agent: "Sales Agent" } as const;

function ActionMessage({ state }: { state: AdminActionState }) {
  return state.message ? (
    <div
      className={state.ok ? state.warning ? "admin-action-message warning" : "admin-action-message success" : "admin-action-message error"}
      role={state.ok ? "status" : "alert"}
    >
      <p>
        {state.message}
        {state.warning ? ` ${state.warning}` : ""}
        {state.errorId ? ` Reference: ${state.errorId}.` : ""}
      </p>
      {state.inviteUrl ? <a href={state.inviteUrl}>Open or copy invitation link</a> : null}
    </div>
  ) : null;
}

function PendingInvitationCard({ invitation }: { invitation: AdminBusinessInvitation }) {
  const [resendState, resendAction, resendPending] = useActionState(resendBusinessInvitationAdminAction, initialState);
  const [revokeState, revokeAction, revokePending] = useActionState(revokeBusinessInvitationAdminAction, initialState);
  const expired = invitation.expired;
  return <article className="admin-user-card invited">
    <header><div><strong>{invitation.email}</strong><span>Waiting for account signup and acceptance</span></div><div className="admin-user-badges"><span>{roleLabels[invitation.role]}</span><span className={`status-pill ${expired ? "expired" : "pending"}`}>{expired ? "expired" : "pending"}</span></div></header>
    <p className="admin-warning-text">Email: {invitation.deliveryStatus}{invitation.deliveryError ? " · Delivery failed; regenerate or copy the link" : ""} · Expires {new Date(invitation.expiresAt).toLocaleDateString()}</p>
    <div className="admin-form-actions"><form action={resendAction}><input type="hidden" name="business_id" value={invitation.businessId} /><input type="hidden" name="invitation_id" value={invitation.id} /><button className="secondary-button" type="submit" disabled={resendPending}>{resendPending ? "Regenerating…" : "Regenerate & send"}</button></form><form action={revokeAction} onSubmit={(event) => { if (!window.confirm(`Revoke the invitation for ${invitation.email}?`)) event.preventDefault(); }}><input type="hidden" name="business_id" value={invitation.businessId} /><input type="hidden" name="invitation_id" value={invitation.id} /><button className="business-user-suspend-button" type="submit" disabled={revokePending}>{revokePending ? "Revoking…" : "Revoke"}</button></form></div>
    <ActionMessage state={resendState} /><ActionMessage state={revokeState} />
  </article>;
}

function MemberAccessAction({ member }: { member: AdminBusinessMember }) {
  const [state, action, pending] = useActionState(setBusinessMemberStatusAdminAction, initialState);
  const nextStatus = member.status === "active" ? "suspended" : "active";

  if (member.role === "primary_owner") {
    return <p className="admin-owner-lock-note">The active Owner cannot be suspended. Transfer ownership first.</p>;
  }

  return (
    <div className="admin-action-stack compact">
      <form
        action={action}
        onSubmit={(event) => {
          const message = nextStatus === "suspended"
            ? `Suspend ${member.profile.fullName}'s access to this business? Their history and access to other businesses will not change.`
            : `Activate ${member.profile.fullName}'s access to this business?`;
          if (!window.confirm(message)) event.preventDefault();
        }}
      >
        <input type="hidden" name="business_id" value={member.businessId} />
        <input type="hidden" name="membership_id" value={member.id} />
        <input type="hidden" name="status" value={nextStatus} />
        <button className={nextStatus === "active" ? "business-user-activate-button" : "business-user-suspend-button"} type="submit" disabled={pending}>
          {pending ? "Saving…" : nextStatus === "active" ? "Activate access" : "Suspend access"}
        </button>
      </form>
      <ActionMessage state={state} />
    </div>
  );
}

function StaffPermissionsForm({ member }: { member: AdminBusinessMember }) {
  const [state, action, pending] = useActionState(saveBusinessMemberPermissionsAdminAction, initialState);
  return (
    <form action={action} className="admin-member-permissions-form">
      <input type="hidden" name="business_id" value={member.businessId} />
      <input type="hidden" name="membership_id" value={member.id} />
      <fieldset>
        <legend>Permissions</legend>
        {permissionOptions.map((permission) => (
          <label key={permission.value}>
            <input type="checkbox" name="permissions" value={permission.value} defaultChecked={member.permissions.includes(permission.value)} />
            {permission.label}
          </label>
        ))}
      </fieldset>
      <button className="secondary-button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save permissions"}</button>
      <ActionMessage state={state} />
    </form>
  );
}

export default function BusinessUsersClient({ businessId, members, invitations }: { businessId: string; members: AdminBusinessMember[]; invitations: AdminBusinessInvitation[] }) {
  const [role, setRole] = useState("staff");
  const [state, action, pending] = useActionState(createBusinessMemberAdminAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      return;
    }
    const firstInvalidField = state.fieldErrors ? Object.keys(state.fieldErrors)[0] : null;
    if (firstInvalidField) {
      formRef.current
        ?.querySelector<HTMLElement>(`[name="${CSS.escape(firstInvalidField)}"]`)
        ?.focus();
    }
  }, [state.fieldErrors, state.ok]);

  return (
    <div className="admin-users-layout">
      <section className="admin-content-card">
        <div className="admin-section-heading">
          <p className="eyebrow">Business membership</p>
          <h2>Add user</h2>
          <p>Registered users receive access immediately. Other emails receive a 30-day invitation.</p>
        </div>
        <form ref={formRef} action={action} className="admin-settings-form">
          <input type="hidden" name="business_id" value={businessId} />
          <div className="admin-form-grid">
            <label>Email<input name="email" type="email" required /></label>
            <label>Business role
              <select name="role" value={role} onChange={(event) => setRole(event.target.value)}>
                <option value="co_owner">Manager</option>
                <option value="staff">Staff</option>
                <option value="sales_agent">Sales Agent</option>
              </select>
            </label>
          </div>
          {role === "staff" ? (
            <fieldset className="admin-permission-grid">
              <legend>Staff permissions</legend>
              {permissionOptions.map((permission) => <label key={permission.value}><input type="checkbox" name="permissions" value={permission.value} />{permission.label}</label>)}
            </fieldset>
          ) : null}
          <div className="admin-info-callout"><strong>User-owned login</strong><p>No password is created or changed. Business access remains separate from every other membership.</p></div>
          <button className="primary-button" type="submit" disabled={pending}>{pending ? "Processing…" : "Grant or invite"}</button>
          <ActionMessage state={state} />
          {state.fieldErrors ? <ul className="admin-field-error-list">{Object.values(state.fieldErrors).map((error) => <li key={error}>{error}</li>)}</ul> : null}
        </form>
      </section>

      <section className="admin-content-card">
        <div className="admin-section-heading">
          <p className="eyebrow">Current access</p>
          <h2>Business users</h2>
          <p>Suspending access here preserves history and leaves other business memberships unchanged.</p>
        </div>
        <div className="admin-user-list">
          {members.map((member) => (
            <article className={`admin-user-card ${member.status}`} key={member.id}>
              <header>
                <div><strong>{member.profile.fullName}</strong><span>{member.profile.email}</span></div>
                <div className="admin-user-badges"><span>{roleLabels[member.role]}</span><span className={`status-pill ${member.status}`}>{member.status}</span></div>
              </header>
              {!member.profile.active || member.profile.accountStatus !== "active" ? <p className="admin-warning-text">This person&apos;s global Lenden account is inactive.</p> : null}
              <MemberAccessAction member={member} />
              {member.role === "staff" ? <StaffPermissionsForm member={member} /> : (
                <div className="admin-role-note"><strong>Permissions</strong><p>{member.role === "co_owner" ? "Manager permissions are defined by the business role." : member.role === "sales_agent" ? "Sales Agent access is limited to its assigned incentive experience." : "Owner permissions cover the full business."}</p></div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="admin-content-card">
        <div className="admin-section-heading"><p className="eyebrow">Pending</p><h2>Invitations</h2><p>Pending invitations do not grant business access.</p></div>
        {invitations.length ? <div className="admin-user-list">{invitations.map((invitation) => <PendingInvitationCard key={invitation.id} invitation={invitation} />)}</div> : <div className="admin-empty-state compact"><p>No pending invitations.</p></div>}
      </section>
    </div>
  );
}
