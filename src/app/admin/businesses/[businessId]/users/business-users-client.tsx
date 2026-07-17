"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { permissionOptions } from "@/lib/constants";
import type { AdminBusinessMember } from "../../admin-data";
import {
  createBusinessMemberAdminAction,
  saveBusinessMemberPermissionsAdminAction,
  setBusinessMemberStatusAdminAction,
  type AdminActionState,
} from "../../actions";

const initialState: AdminActionState = { ok: null, message: "" };
const roleLabels = { primary_owner: "Owner", co_owner: "Manager", staff: "Staff", sales_agent: "Sales Agent" } as const;

function ActionMessage({ state }: { state: AdminActionState }) {
  return state.message ? <p className={state.ok ? "admin-action-message success" : "admin-action-message error"} role="status">{state.message}</p> : null;
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

export default function BusinessUsersClient({ businessId, members }: { businessId: string; members: AdminBusinessMember[] }) {
  const [role, setRole] = useState("staff");
  const [state, action, pending] = useActionState(createBusinessMemberAdminAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <div className="admin-users-layout">
      <section className="admin-content-card">
        <div className="admin-section-heading">
          <p className="eyebrow">Business membership</p>
          <h2>Add user</h2>
          <p>Add a Manager, Staff member, or Sales Agent directly to this business.</p>
        </div>
        <form ref={formRef} action={action} className="admin-settings-form">
          <input type="hidden" name="business_id" value={businessId} />
          <div className="admin-form-grid">
            <label>Full name<input name="full_name" required minLength={2} /></label>
            <label>Email<input name="email" type="email" required /></label>
            <label>Business role
              <select name="role" value={role} onChange={(event) => setRole(event.target.value)}>
                <option value="co_owner">Manager</option>
                <option value="staff">Staff</option>
                <option value="sales_agent">Sales Agent</option>
              </select>
            </label>
            <label>Temporary password
              <input name="password" type="password" minLength={8} autoComplete="new-password" placeholder="Required only for a new account" />
              <span>For a new account, enter at least 8 characters. Existing accounts keep their current password.</span>
            </label>
          </div>
          {role === "staff" ? (
            <fieldset className="admin-permission-grid">
              <legend>Staff permissions</legend>
              {permissionOptions.map((permission) => <label key={permission.value}><input type="checkbox" name="permissions" value={permission.value} />{permission.label}</label>)}
            </fieldset>
          ) : null}
          <div className="admin-info-callout"><strong>Business-scoped access</strong><p>Adding or changing this membership does not alter the user&apos;s access to any other business.</p></div>
          <button className="primary-button" type="submit" disabled={pending}>{pending ? "Adding user…" : "Add user"}</button>
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
    </div>
  );
}
