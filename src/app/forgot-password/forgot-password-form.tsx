"use client";

import { requestPasswordResetAction, type AuthActionState } from "@/app/auth/actions";
import { useSafeActionState as useActionState } from "@/lib/use-safe-action-state";

const initialState: AuthActionState = { ok: null, message: "" };

export default function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initialState);
  return <form action={action} className="form-grid">
    <label>Email<input name="email" type="email" autoComplete="email" required /></label>
    {state.message ? <p className={state.ok ? state.warning ? "form-warning" : "form-success" : "form-error"} role={state.ok ? "status" : "alert"}>{state.message}{state.warning ? ` ${state.warning}` : ""}{state.errorId ? ` Reference: ${state.errorId}.` : ""}</p> : null}
    <button className="primary-button" type="submit" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</button>
  </form>;
}
