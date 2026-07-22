"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { businessLabels } from "@/lib/constants";
import { createBusinessAction, type AdminActionState } from "./actions";

const initialState: AdminActionState = { ok: null, message: "" };
const steps = ["Business details", "Modules", "First Owner", "Review"];

export default function NewBusinessWizard() {
  const [step, setStep] = useState(0);
  const [state, action, pending] = useActionState(createBusinessAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState({ name: "", slug: "", timezone: "Asia/Kolkata", currency: "INR", ownerEmail: "" });
  const [modules, setModules] = useState<string[]>(["library", "general"]);
  const [stepError, setStepError] = useState("");

  if (state.ok && state.entityId) {
    return (
      <section className="admin-wizard admin-wizard-success">
        <div className="admin-success-mark" aria-hidden="true">✓</div>
        <h2>Business created</h2>
        <p>{state.message}</p>
        <div className="admin-info-callout"><strong>Registered Owner assigned</strong><p>The Owner&apos;s login and password were not changed.</p></div>
        <div className="admin-form-actions">
          <Link className="primary-button" href={state.href ?? `/admin/businesses/${state.entityId}`}>Open business</Link>
          <Link className="secondary-button" href="/admin/businesses">Back to businesses</Link>
        </div>
      </section>
    );
  }

  function validateStep() {
    setStepError("");
    if (step === 1 && modules.length === 0) {
      setStepError("Enable at least one module.");
      return false;
    }
    const section = formRef.current?.querySelector<HTMLElement>(`[data-step="${step}"]`);
    const controls = Array.from(section?.querySelectorAll<HTMLInputElement>("input[required]") ?? []);
    const invalid = controls.find((control) => !control.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return false;
    }
    return true;
  }

  return (
    <section className="admin-wizard">
      <ol className="admin-stepper" aria-label="Business creation progress">
        {steps.map((label, index) => (
          <li key={label} className={index === step ? "current" : index < step ? "complete" : ""} aria-current={index === step ? "step" : undefined}>
            <span>{index < step ? "✓" : index + 1}</span><strong>{label}</strong>
          </li>
        ))}
      </ol>

      <form ref={formRef} action={action} className="admin-wizard-form">
        <section data-step="0" hidden={step !== 0}>
          <div className="admin-section-heading"><h2>Business details</h2><p>Set the tenant identity and operating defaults.</p></div>
          <div className="admin-form-grid">
            <label>Business name<input name="name" required minLength={2} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label>URL slug<input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="generated-from-name" value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value.toLowerCase() })} /><span>Lowercase letters, numbers, and hyphens.</span></label>
            <label>Timezone<input name="timezone" required value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })} /></label>
            <label>Currency<input name="currency" required pattern="[A-Za-z]{3}" maxLength={3} value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value.toUpperCase() })} /></label>
          </div>
        </section>

        <section data-step="1" hidden={step !== 1}>
          <div className="admin-section-heading"><h2>Modules</h2><p>Choose the operational areas available inside this business.</p></div>
          <div className="admin-module-choice-grid">
            {(Object.entries(businessLabels) as Array<[string, string]>).map(([module, label]) => (
              <label key={module} className={modules.includes(module) ? "selected" : ""}>
                <input
                  type="checkbox"
                  name="modules"
                  value={module}
                  checked={modules.includes(module)}
                  onChange={(event) => setModules(event.target.checked ? [...modules, module] : modules.filter((item) => item !== module))}
                />
                <strong>{label}</strong><span>{module === "library" ? "Students, seats, and subscriptions" : module === "guest_house" ? "Rooms and guest collections" : module === "course" ? "Courses and fee collections" : "General payments and expenses"}</span>
              </label>
            ))}
          </div>
        </section>

        <section data-step="2" hidden={step !== 2}>
          <div className="admin-section-heading"><h2>First Owner</h2><p>The Owner controls this business and cannot have access suspended until ownership is transferred.</p></div>
          <div className="admin-form-grid">
            <label>Owner email<input name="owner_email" type="email" required value={draft.ownerEmail} onChange={(event) => setDraft({ ...draft, ownerEmail: event.target.value })} /></label>
          </div>
          <div className="admin-info-callout">
            <strong>Password handling</strong>
            <p>The Owner must already have an active Lenden account. Ask them to sign up first; this wizard never creates or resets passwords.</p>
          </div>
        </section>

        <section data-step="3" hidden={step !== 3}>
          <div className="admin-section-heading"><h2>Review</h2><p>Confirm exactly what will be provisioned.</p></div>
          <dl className="admin-review-list">
            <div><dt>Business</dt><dd>{draft.name}</dd></div>
            <div><dt>URL</dt><dd>/{draft.slug || draft.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}</dd></div>
            <div><dt>Defaults</dt><dd>{draft.timezone} · {draft.currency}</dd></div>
            <div><dt>Modules</dt><dd>{modules.map((module) => businessLabels[module as keyof typeof businessLabels]).join(", ")}</dd></div>
            <div><dt>First Owner</dt><dd>{draft.ownerEmail}</dd></div>
          </dl>
          <div className="admin-warning-callout"><strong>This creates live access</strong><p>The business starts Active and the registered account becomes its protected Owner.</p></div>
        </section>

        {stepError ? <p className="admin-action-message error" role="alert">{stepError}</p> : null}
        {state.message && !state.ok ? (
          <div className="admin-action-message error" role="alert">
            <strong>{state.message}</strong>
            {state.fieldErrors ? <ul>{Object.values(state.fieldErrors).map((error) => <li key={error}>{error}</li>)}</ul> : null}
          </div>
        ) : null}

        <div className="admin-form-actions split">
          <div>
            {step > 0 ? <button className="secondary-button" type="button" onClick={() => setStep((current) => current - 1)}>Back</button> : <Link className="secondary-button" href="/admin/businesses">Cancel</Link>}
          </div>
          {step < steps.length - 1 ? (
            <button className="primary-button" type="button" onClick={() => { if (validateStep()) setStep((current) => current + 1); }}>Continue</button>
          ) : (
            <button className="primary-button" type="submit" disabled={pending}>{pending ? "Creating business…" : "Create business"}</button>
          )}
        </div>
      </form>
    </section>
  );
}
