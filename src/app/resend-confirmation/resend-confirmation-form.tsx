"use client";

import Link from "next/link";
import { resendSignupConfirmationAction, type AuthActionState } from "@/app/auth/actions";
import { useSafeActionState as useActionState } from "@/lib/use-safe-action-state";

const initialState: AuthActionState = { ok: null, message: "" };

export default function ResendConfirmationForm({
  defaultEmail = "",
  nextPath,
  compact = false,
}: {
  defaultEmail?: string;
  nextPath?: string;
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState(resendSignupConfirmationAction, initialState);
  const email = state.email ?? defaultEmail;

  return (
    <form action={action} className={`form-grid${compact ? " auth-resend-compact" : ""}`} aria-busy={pending} noValidate>
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
      {compact ? <input type="hidden" name="email" value={email} /> : (
        <label>
          Account email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={email}
            aria-invalid={Boolean(state.fieldErrors?.email)}
          />
        </label>
      )}
      {state.message ? (
        <p className={state.ok ? state.warning ? "form-warning" : "form-success" : "form-error"} role={state.ok ? "status" : "alert"} aria-live="polite">
          {state.message}
          {state.warning ? ` ${state.warning}` : ""}
          {state.errorId ? ` Reference: ${state.errorId}.` : ""}
        </p>
      ) : null}
      <button className={compact ? "secondary-button" : "primary-button"} type="submit" disabled={pending}>
        {pending ? "Sending verification email…" : "Resend verification email"}
      </button>
      {!compact ? <p className="auth-secondary-copy"><Link href="/login">Back to sign in</Link></p> : null}
    </form>
  );
}
