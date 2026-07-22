"use client";

import Link from "next/link";
import { useActionState } from "react";
import { businessLabels } from "@/lib/constants";
import type { BusinessCreationRequestStatus, BusinessInvitationState, BusinessRole, BusinessType, MembershipStatus } from "@/lib/types";
import {
  acceptBusinessInvitationAction,
  cancelBusinessCreationRequestAction,
  declineBusinessInvitationAction,
  requestBusinessCreationAction,
  setAccountPasswordAction,
  updateAccountProfileAction,
  type AccountActionState,
} from "./actions";

const initialState: AccountActionState = { ok: null, message: "" };

type AccessItem = { businessId: string; name: string; slug: string; role: BusinessRole; status: MembershipStatus; businessStatus: "active" | "suspended" };
type InvitationItem = { id: string; businessName: string; role: Exclude<BusinessRole, "primary_owner">; state: BusinessInvitationState; expiresAt: string };
type RequestItem = { id: string; name: string; modules: BusinessType[]; status: BusinessCreationRequestStatus; reason: string | null; createdAt: string; businessSlug: string | null };

function roleLabel(role: BusinessRole) {
  return role === "primary_owner" ? "Owner" : role === "co_owner" ? "Manager" : role === "sales_agent" ? "Sales Agent" : "Staff";
}

function ActionMessage({ state }: { state: AccountActionState }) {
  return state.message ? <p className={state.ok ? "form-success" : "form-error"} role="status">{state.message}</p> : null;
}

export default function AccountClient({ profile, signInMethods, accesses, invitations, requests }: {
  profile: { fullName: string; email: string };
  signInMethods: string[];
  accesses: AccessItem[];
  invitations: InvitationItem[];
  requests: RequestItem[];
}) {
  const [profileState, profileAction, profilePending] = useActionState(updateAccountProfileAction, initialState);
  const [passwordState, passwordAction, passwordPending] = useActionState(setAccountPasswordAction, initialState);
  const [requestState, requestAction, requestPending] = useActionState(requestBusinessCreationAction, initialState);
  const activeAccesses = accesses.filter((item) => item.status === "active" && item.businessStatus === "active");
  const unavailableAccesses = accesses.filter((item) => item.status !== "active" || item.businessStatus !== "active");

  return <div className="account-grid">
    <section className="account-card account-card-span">
      <div className="account-section-heading"><p className="eyebrow">Businesses</p><h2>Your access</h2><p>One login can belong to several businesses with a different role in each.</p></div>
      {activeAccesses.length ? <div className="account-access-list">{activeAccesses.map((item) => <article key={item.businessId}>
        <div><strong>{item.name}</strong><span>{roleLabel(item.role)}</span></div><Link className="secondary-button" href={`/b/${item.slug}`}>Open business</Link>
      </article>)}</div> : <div className="account-empty"><strong>No active business yet</strong><p>Accept an invitation or submit a business request below.</p></div>}
      {unavailableAccesses.length ? <details className="account-details"><summary>Removed or unavailable access ({unavailableAccesses.length})</summary><div className="account-access-list">{unavailableAccesses.map((item) => <article key={item.businessId}><div><strong>{item.name}</strong><span>{item.status === "suspended" ? "Access removed" : "Business unavailable"}</span></div></article>)}</div></details> : null}
    </section>

    <section className="account-card account-card-span">
      <div className="account-section-heading"><p className="eyebrow">Invitations</p><h2>Pending access</h2></div>
      {invitations.length ? <div className="account-invitation-list">{invitations.map((invitation) => <article key={invitation.id}>
        <div><strong>{invitation.businessName}</strong><span>{roleLabel(invitation.role)} · {invitation.state === "expired" ? "Expired" : `Expires ${new Date(invitation.expiresAt).toLocaleDateString()}`}</span></div>
        {invitation.state === "pending" ? <div className="account-row-actions"><form action={acceptBusinessInvitationAction}><input type="hidden" name="invitation_id" value={invitation.id} /><button className="primary-button" type="submit">Accept</button></form><form action={declineBusinessInvitationAction}><input type="hidden" name="invitation_id" value={invitation.id} /><button className="secondary-button" type="submit">Decline</button></form></div> : null}
      </article>)}</div> : <p className="muted">No pending invitations.</p>}
    </section>

    <section className="account-card">
      <div className="account-section-heading"><p className="eyebrow">Personal profile</p><h2>Your details</h2></div>
      <form action={profileAction} className="form-grid"><label>Full name<input name="full_name" defaultValue={profile.fullName} minLength={2} required /></label><label>Email<input value={profile.email} disabled /></label><ActionMessage state={profileState} /><button className="secondary-button" type="submit" disabled={profilePending}>{profilePending ? "Saving…" : "Save profile"}</button></form>
    </section>

    <section className="account-card">
      <div className="account-section-heading"><p className="eyebrow">Account security</p><h2>Sign-in methods</h2><p>{signInMethods.length ? signInMethods.join(" · ") : "Your verified email"}</p><p>You control this password. Business Owners cannot reset it.</p></div>
      <form action={passwordAction} className="form-grid"><label>New password<input name="password" type="password" minLength={8} autoComplete="new-password" required /></label><label>Confirm password<input name="password_confirmation" type="password" minLength={8} autoComplete="new-password" required /></label><ActionMessage state={passwordState} /><button className="secondary-button" type="submit" disabled={passwordPending}>{passwordPending ? "Saving…" : "Set password"}</button></form>
    </section>

    <section className="account-card account-card-span">
      <div className="account-section-heading"><p className="eyebrow">Business creation</p><h2>Request another business</h2><p>A platform administrator will review the request and finalize its operating settings.</p></div>
      <form action={requestAction} className="form-grid"><label>Business name<input name="requested_name" minLength={2} required /></label><fieldset className="account-module-grid"><legend>Requested modules</legend>{(["library", "guest_house", "course", "general"] as BusinessType[]).map((module) => <label key={module}><input name="modules" type="checkbox" value={module} />{businessLabels[module]}</label>)}</fieldset><label>Note (optional)<textarea name="note" rows={3} maxLength={1000} /></label><ActionMessage state={requestState} /><button className="primary-button" type="submit" disabled={requestPending}>{requestPending ? "Submitting…" : "Submit request"}</button></form>
      {requests.length ? <div className="account-request-list">{requests.map((request) => <article key={request.id}><div><strong>{request.name}</strong><span>{request.modules.map((module) => businessLabels[module]).join(", ")}</span><small>Requested {new Date(request.createdAt).toLocaleDateString()}</small></div><div className="account-request-status"><span className={`status-pill ${request.status}`}>{request.status}</span>{request.reason ? <p>{request.reason}</p> : null}{request.businessSlug ? <Link href={`/b/${request.businessSlug}`}>Open business</Link> : null}{request.status === "pending" ? <form action={cancelBusinessCreationRequestAction}><input type="hidden" name="request_id" value={request.id} /><button className="admin-link-button" type="submit">Cancel request</button></form> : null}</div></article>)}</div> : null}
    </section>
  </div>;
}
