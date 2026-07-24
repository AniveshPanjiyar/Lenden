"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpAction, type AuthActionState } from "@/app/auth/actions";
import ResendConfirmationForm from "@/app/resend-confirmation/resend-confirmation-form";

const initialState: AuthActionState = { ok: null, message: "" };

export default function SignupForm({ nextPath }: { nextPath?: string }) {
  const [state, action, pending] = useActionState(signUpAction, initialState);

  if (state.ok && state.email) {
    return (
      <section className="auth-verification-sent" aria-live="polite">
        <div>
          <strong>Verification email sent</strong>
          <p>{state.message}</p>
          <span>{state.email}</span>
        </div>
        <ResendConfirmationForm defaultEmail={state.email} nextPath={state.nextPath ?? nextPath} compact />
        <p className="auth-secondary-copy">Already verified? <Link href={nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login"}>Sign in</Link></p>
      </section>
    );
  }

  return (
    <form action={action} className="form-grid" aria-busy={pending}>
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
      <label>Full name<input name="full_name" autoComplete="name" required minLength={2} /></label>
      <label>Email<input name="email" type="email" autoComplete="email" required /></label>
      <label>Password<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
      <label>Confirm password<input name="password_confirmation" type="password" autoComplete="new-password" minLength={8} required /></label>
      {state.message ? <p className={state.ok ? "form-success" : "form-error"} role={state.ok ? "status" : "alert"} aria-live="polite">{state.message}</p> : null}
      {state.fieldErrors ? <ul className="auth-field-errors">{Object.values(state.fieldErrors).map((error) => <li key={error}>{error}</li>)}</ul> : null}
      <button className="primary-button" type="submit" disabled={pending}>{pending ? "Creating account…" : "Create account"}</button>
      <p className="auth-secondary-copy">Account created but the link expired? <Link href={nextPath ? `/resend-confirmation?next=${encodeURIComponent(nextPath)}` : "/resend-confirmation"}>Resend verification email</Link></p>
      <p className="auth-secondary-copy">Already have an account? <Link href={nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login"}>Sign in</Link></p>
    </form>
  );
}
