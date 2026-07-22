"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPasswordAction, type AuthActionState } from "@/app/auth/actions";

const initialState: AuthActionState = { ok: null, message: "" };

export default function ResetPasswordForm() {
  const [state, action, pending] = useActionState(resetPasswordAction, initialState);
  return <form action={action} className="form-grid">
    <label>New password<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
    <label>Confirm password<input name="password_confirmation" type="password" autoComplete="new-password" minLength={8} required /></label>
    {state.message ? <p className={state.ok ? "form-success" : "form-error"} role="status">{state.message}</p> : null}
    <button className="primary-button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save password"}</button>
    {state.ok ? <Link className="secondary-button" href="/account">Continue to account</Link> : null}
  </form>;
}

