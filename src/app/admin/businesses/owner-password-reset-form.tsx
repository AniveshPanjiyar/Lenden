"use client";

import { useActionState } from "react";
import { resetPrimaryOwnerPasswordAction, type AdminActionState } from "./actions";
import OneTimeSecret from "./one-time-secret";

const initialState: AdminActionState = { ok: null, message: "" };

export default function OwnerPasswordResetForm({
  businessId,
  ownerName,
  profileId,
}: {
  businessId: string;
  ownerName: string;
  profileId: string;
}) {
  const [state, action, pending] = useActionState(resetPrimaryOwnerPasswordAction, initialState);

  return (
    <form
      action={action}
      className="admin-settings-form"
      onSubmit={(event) => {
        if (!window.confirm(`Generate a new temporary password for ${ownerName}? This changes their global Lenden login across every business.`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="business_id" value={businessId} />
      <input type="hidden" name="profile_id" value={profileId} />
      <div className="admin-warning-callout">
        <strong>This changes a global login</strong>
        <p>The Owner will use the new password everywhere they access Lenden and must replace it after signing in. The secret is never written to audit data, URLs, logs, or browser storage.</p>
      </div>
      <button className="danger-button" type="submit" disabled={pending}>
        {pending ? "Generating…" : "Generate temporary password"}
      </button>
      {state.message ? <p className={state.ok ? "admin-action-message success" : "admin-action-message error"} role="status">{state.message}</p> : null}
      {state.temporaryPassword ? <OneTimeSecret password={state.temporaryPassword} /> : null}
    </form>
  );
}
