"use client";

import Link from "next/link";
import { signInAction, type AuthActionState } from "@/app/auth/actions";
import { showOfflineDialogEvent } from "@/lib/client-events";
import { useSafeActionState as useActionState } from "@/lib/use-safe-action-state";

const initialState: AuthActionState = { ok: null, message: "" };

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const [state, action, pending] = useActionState(signInAction, initialState);
  return (
    <form
      action={action}
      className="form-grid"
      onSubmit={(event) => {
        if (document.body.dataset.lendenNetwork !== "offline") return;
        event.preventDefault();
        window.dispatchEvent(new CustomEvent(showOfflineDialogEvent));
      }}
    >
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <div className="auth-inline-links"><Link href="/forgot-password">Forgot password?</Link></div>
      {state.message ? <p className="form-error" role="alert">{state.message}{state.errorId ? ` Reference: ${state.errorId}.` : ""}</p> : null}
      <button className="primary-button" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      <p className="auth-secondary-copy">New to Lenden? <Link href={nextPath ? `/signup?next=${encodeURIComponent(nextPath)}` : "/signup"}>Create your account</Link></p>
    </form>
  );
}
