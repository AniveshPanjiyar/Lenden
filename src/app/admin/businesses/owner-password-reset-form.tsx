"use client";

import { useActionState } from "react";
import { resetPrimaryOwnerPasswordAction, type BusinessAdminState } from "./actions";

const initialState: BusinessAdminState = { ok: false, message: "" };

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
    <form action={action} className="support-start-form">
      <input type="hidden" name="business_id" value={businessId} />
      <input type="hidden" name="profile_id" value={profileId} />
      <p className="muted">Generate a one-time password for {ownerName}. They must replace it after login.</p>
      <button className="secondary-button" type="submit" disabled={pending}>
        {pending ? "Generating password..." : "Reset owner password"}
      </button>
      {state.message ? <p className={state.ok ? "form-success" : "form-error"} role="status">{state.message}</p> : null}
      {state.temporaryPassword ? <p className="one-time-secret"><strong>Copy now — shown once:</strong> <code>{state.temporaryPassword}</code></p> : null}
    </form>
  );
}
