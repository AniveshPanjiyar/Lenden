"use client";

import { FormEvent, useState, useTransition } from "react";
import { Landmark } from "lucide-react";
import { setupOwnerAction } from "@/app/actions";

const actionIdempotencyField = "_action_idempotency_key";

function createActionRequestKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `act_${crypto.randomUUID()}`;
  }
  return `act_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export default function SetupPage() {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<{ ok: boolean; message?: string } | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (form.dataset.submitting === "true") return;
    const formData = new FormData(form);
    const existingRequestKey = form.dataset.idempotencyKey;
    const requestKey = existingRequestKey && existingRequestKey.trim() ? existingRequestKey : createActionRequestKey();
    form.dataset.idempotencyKey = requestKey;
    formData.set(actionIdempotencyField, requestKey);
    form.dataset.submitting = "true";
    form.setAttribute("aria-busy", "true");
    setState(null);
    startTransition(async () => {
      try {
        setState(await setupOwnerAction(formData));
        delete form.dataset.idempotencyKey;
      } finally {
        form.dataset.submitting = "false";
        form.setAttribute("aria-busy", "false");
      }
    });
  }

  return (
    <main className="auth-page">
      <section className="auth-panel setup-panel">
        <div className="brand-lockup">
          <span className="brand-mark">
            <Landmark size={22} />
          </span>
          <div>
            <p className="eyebrow">First run</p>
            <h1>Create owner account</h1>
          </div>
        </div>
        <p className="muted">
          This setup works only before the first profile exists and requires
          SUPABASE_SERVICE_ROLE_KEY in the server environment.
        </p>
        {state?.message ? (
          <p className={state.ok ? "form-success" : "form-error"}>{state.message}</p>
        ) : null}
        {pending ? (
          <div className="toast-stack auth-toast-stack" aria-live="polite" aria-atomic="true">
            <div className="toast toast-info">
              <span className="toast-icon saving-dot" />
              <strong>Creating owner...</strong>
            </div>
          </div>
        ) : state?.message ? (
          <div className="toast-stack auth-toast-stack" aria-live="polite" aria-atomic="true">
            <div className={state.ok ? "toast toast-success" : "toast toast-error"}>
              <span className="toast-icon" />
              <strong>{state.message}</strong>
            </div>
          </div>
        ) : null}
        <form onSubmit={submit} className="form-grid">
          <label>
            Owner name
            <input name="full_name" required placeholder="Owner" />
          </label>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" minLength={8} required />
          </label>
          <button className="primary-button" type="submit" disabled={pending}>
            {pending ? "Creating..." : "Create owner"}
          </button>
        </form>
      </section>
    </main>
  );
}
