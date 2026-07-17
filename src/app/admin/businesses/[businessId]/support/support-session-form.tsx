"use client";

import Link from "next/link";
import { useActionState } from "react";
import { startSupportSessionAction, type AdminActionState } from "../../actions";

const initialState: AdminActionState = { ok: null, message: "" };

export default function SupportSessionForm({ businessId, businessName, disabled }: { businessId: string; businessName: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(startSupportSessionAction, initialState);

  return (
    <form
      action={action}
      className="admin-settings-form"
      onSubmit={(event) => {
        if (!window.confirm(`Start a 30-minute audited configuration session for ${businessName}?`)) event.preventDefault();
      }}
    >
      <input type="hidden" name="business_id" value={businessId} />
      <label>Support reason
        <textarea name="reason" required minLength={5} rows={4} placeholder="Customer ticket, incident, or configuration reason" disabled={disabled} />
        <span>This reason is visible in the business audit trail.</span>
      </label>
      {disabled ? <div className="admin-warning-callout"><strong>Business is suspended</strong><p>Activate the business before starting a support session.</p></div> : null}
      <button className="primary-button" type="submit" disabled={pending || disabled}>{pending ? "Starting session…" : "Start 30-minute support session"}</button>
      {state.message ? <p className={state.ok ? "admin-action-message success" : "admin-action-message error"} role="status">{state.message}</p> : null}
      {state.href ? <Link className="secondary-button" href={state.href}>Open business workspace</Link> : null}
    </form>
  );
}
