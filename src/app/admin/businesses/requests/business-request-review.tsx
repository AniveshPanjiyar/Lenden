"use client";

import { ReturnAwareLink } from "@/components/return-aware-link";
import { businessLabels } from "@/lib/constants";
import { useSafeActionState as useActionState } from "@/lib/use-safe-action-state";
import type { BusinessType } from "@/lib/types";
import type { AdminBusinessRequest } from "../admin-data";
import { approveBusinessRequestAdminAction, rejectBusinessRequestAdminAction, type AdminActionState } from "../actions";

const initialState: AdminActionState = { ok: null, message: "" };

function AdminMessage({ state }: { state: AdminActionState }) {
  if (!state.message) return null;
  return (
    <div
      className={state.ok ? state.warning ? "admin-action-message warning" : "admin-action-message success" : "admin-action-message error"}
      role={state.ok ? "status" : "alert"}
    >
      <p>
        {state.message}
        {state.warning ? ` ${state.warning}` : ""}
        {state.errorId ? ` Reference: ${state.errorId}.` : ""}
      </p>
      {state.href ? <ReturnAwareLink href={state.href}>Open business</ReturnAwareLink> : null}
    </div>
  );
}

function RequestCard({ request }: { request: AdminBusinessRequest }) {
  const [approveState, approveAction, approvePending] = useActionState(approveBusinessRequestAdminAction, initialState);
  const [rejectState, rejectAction, rejectPending] = useActionState(rejectBusinessRequestAdminAction, initialState);
  const defaultSlug = request.requestedName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return <article className="admin-content-card business-request-card">
    <header className="business-request-header"><div><p className="eyebrow">Requested {new Date(request.createdAt).toLocaleDateString()}</p><h2>{request.requestedName}</h2><p>{request.requester.fullName} · {request.requester.email}</p></div><span className="status-pill pending">pending</span></header>
    {request.note ? <div className="admin-info-callout"><strong>Requester note</strong><p>{request.note}</p></div> : null}
    <form action={approveAction} className="admin-settings-form">
      <input type="hidden" name="request_id" value={request.id} />
      <div className="admin-form-grid"><label>Final business name<input name="name" defaultValue={request.requestedName} minLength={2} required /></label><label>URL slug<input name="slug" defaultValue={defaultSlug} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label><label>Timezone<input name="timezone" defaultValue="Asia/Kolkata" required /></label><label>Currency<input name="currency" defaultValue="INR" pattern="[A-Za-z]{3}" maxLength={3} required /></label></div>
      <fieldset className="admin-module-choice-grid"><legend>Enabled modules</legend>{(["library", "guest_house", "course", "general"] as BusinessType[]).map((module) => <label key={module} className={request.requestedModules.includes(module) ? "selected" : ""}><input type="checkbox" name="modules" value={module} defaultChecked={request.requestedModules.includes(module)} /><strong>{businessLabels[module]}</strong></label>)}</fieldset>
      <AdminMessage state={approveState} />
      <button className="primary-button" type="submit" disabled={approvePending}>{approvePending ? "Approving…" : "Approve and create business"}</button>
    </form>
    <form action={rejectAction} className="admin-request-reject-form" onSubmit={(event) => { if (!window.confirm(`Reject the request for ${request.requestedName}?`)) event.preventDefault(); }}><input type="hidden" name="request_id" value={request.id} /><label>Rejection reason<textarea name="reason" minLength={3} required rows={2} /></label><button className="business-user-suspend-button" type="submit" disabled={rejectPending}>{rejectPending ? "Rejecting…" : "Reject request"}</button><AdminMessage state={rejectState} /></form>
  </article>;
}

export default function BusinessRequestReview({ requests }: { requests: AdminBusinessRequest[] }) {
  return requests.length ? <div className="business-request-list">{requests.map((request) => <RequestCard key={request.id} request={request} />)}</div> : <div className="admin-empty-state"><h2>No pending requests</h2><p>New business requests will appear here.</p></div>;
}
