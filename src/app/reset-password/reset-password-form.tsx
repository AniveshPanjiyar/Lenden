"use client";

import Link from "next/link";
import { resetPasswordAction, type AuthActionState } from "@/app/auth/actions";
import { useSafeActionState as useActionState } from "@/lib/use-safe-action-state";

const initialState: AuthActionState = { ok: null, message: "" };

export default function ResetPasswordForm() {
  const [state, action, pending] = useActionState(resetPasswordAction, initialState);
  return <form action={action} className="form-grid">
    <label>New password<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
    <label>Confirm password<input name="password_confirmation" type="password" autoComplete="new-password" minLength={8} required /></label>
    {state.message ? <p className={state.ok ? state.warning ? "form-warning" : "form-success" : "form-error"} role={state.ok ? "status" : "alert"}>{state.message}{state.warning ? ` ${state.warning}` : ""}{state.errorId ? ` Reference: ${state.errorId}.` : ""}</p> : null}
    <button className="primary-button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save password"}</button>
    {state.ok ? <Link className="secondary-button" href="/settings?section=profile">Continue to Settings</Link> : null}
  </form>;
}
