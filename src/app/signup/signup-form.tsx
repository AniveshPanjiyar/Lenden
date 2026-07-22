"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpAction, type AuthActionState } from "@/app/auth/actions";

const initialState: AuthActionState = { ok: null, message: "" };

export default function SignupForm({ nextPath }: { nextPath?: string }) {
  const [state, action, pending] = useActionState(signUpAction, initialState);
  return (
    <form action={action} className="form-grid">
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
      <label>Full name<input name="full_name" autoComplete="name" required minLength={2} /></label>
      <label>Email<input name="email" type="email" autoComplete="email" required /></label>
      <label>Password<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
      <label>Confirm password<input name="password_confirmation" type="password" autoComplete="new-password" minLength={8} required /></label>
      {state.message ? <p className={state.ok ? "form-success" : "form-error"} role="status">{state.message}</p> : null}
      {state.fieldErrors ? <ul className="auth-field-errors">{Object.values(state.fieldErrors).map((error) => <li key={error}>{error}</li>)}</ul> : null}
      <button className="primary-button" type="submit" disabled={pending}>{pending ? "Creating account…" : "Create account"}</button>
      <p className="auth-secondary-copy">Already have an account? <Link href={nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login"}>Sign in</Link></p>
    </form>
  );
}

