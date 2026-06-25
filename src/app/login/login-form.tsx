"use client";

import { useFormStatus } from "react-dom";
import { loginAction } from "@/app/actions";

function LoginSubmit() {
  const { pending } = useFormStatus();

  return (
    <>
      {pending ? (
        <div className="toast-stack auth-toast-stack" aria-live="polite" aria-atomic="true">
          <div className="toast toast-info">
            <span className="toast-icon saving-dot" />
            <strong>Logging in...</strong>
          </div>
        </div>
      ) : null}
      <button className="primary-button" type="submit" disabled={pending}>
        {pending ? "Logging in..." : "Login"}
      </button>
    </>
  );
}

export function LoginForm() {
  return (
    <form action={loginAction} className="form-grid">
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <LoginSubmit />
    </form>
  );
}
