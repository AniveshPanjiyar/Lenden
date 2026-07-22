"use client";

import { useActionState } from "react";
import { requestPasswordResetAction, type AuthActionState } from "@/app/auth/actions";

const initialState: AuthActionState = { ok: null, message: "" };

export default function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initialState);
  return <form action={action} className="form-grid">
    <label>Email<input name="email" type="email" autoComplete="email" required /></label>
    {state.message ? <p className={state.ok ? "form-success" : "form-error"} role="status">{state.message}</p> : null}
    <button className="primary-button" type="submit" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</button>
  </form>;
}

