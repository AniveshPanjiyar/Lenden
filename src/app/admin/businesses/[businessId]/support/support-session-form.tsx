"use client";

import { ReturnAwareLink } from "@/components/return-aware-link";
import { useSafeActionState as useActionState } from "@/lib/use-safe-action-state";
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
      {state.message ? (
        <p
          className={state.ok ? state.warning ? "admin-action-message warning" : "admin-action-message success" : "admin-action-message error"}
          role={state.ok ? "status" : "alert"}
        >
          {state.message}
          {state.warning ? ` ${state.warning}` : ""}
          {state.errorId ? ` Reference: ${state.errorId}.` : ""}
        </p>
      ) : null}
      {state.href ? <ReturnAwareLink className="secondary-button" href={state.href}>Open business workspace</ReturnAwareLink> : null}
    </form>
  );
}
