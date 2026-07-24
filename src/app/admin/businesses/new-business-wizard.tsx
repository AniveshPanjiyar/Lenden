"use client";

import { ReturnAwareLink } from "@/components/return-aware-link";
import { useRef, useState } from "react";
import { businessLabels } from "@/lib/constants";
import { useSafeActionState as useActionState } from "@/lib/use-safe-action-state";
import { createBusinessAction, type AdminActionState } from "./actions";

const initialState: AdminActionState = { ok: null, message: "" };
const steps = ["Business details", "Modules", "First Owner", "Review"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type BusinessField = "name" | "slug" | "timezone" | "currency" | "modules" | "owner_email";
type BusinessFieldErrors = Partial<Record<BusinessField, string>>;

function normalizeBusinessSlug(input: string) {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function NewBusinessWizard() {
  const [step, setStep] = useState(0);
  const [state, action, pending] = useActionState(createBusinessAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState({ name: "", slug: "", timezone: "Asia/Kolkata", currency: "INR", ownerEmail: "" });
  const [modules, setModules] = useState<string[]>(["library", "general"]);
  const [stepError, setStepError] = useState("");
  const [clientErrors, setClientErrors] = useState<BusinessFieldErrors>({});
  const reviewedSlug = normalizeBusinessSlug(draft.slug || draft.name);
  const submitStatus = pending
    ? { tone: "status", message: "Creating the business and assigning its Owner…" }
    : state.ok === false
      ? { tone: "error", message: state.message || "Business creation failed. Review the details and try again." }
      : step === steps.length - 1
        ? { tone: "status", message: "Ready to create. You will see a confirmation or a clear error after submission." }
        : null;

  if (state.ok && state.entityId) {
    return (
      <section className="admin-wizard admin-wizard-success">
        <div className="admin-success-mark" aria-hidden="true">✓</div>
        <h2>Business created</h2>
        <p>{state.message}</p>
        {state.warning ? (
          <p className="admin-action-message warning" role="status">
            {state.warning}
            {state.errorId ? ` Reference: ${state.errorId}.` : ""}
          </p>
        ) : null}
        <div className="admin-info-callout"><strong>Registered Owner assigned</strong><p>The Owner&apos;s login and password were not changed.</p></div>
        <div className="admin-form-actions">
          <ReturnAwareLink className="primary-button" href={state.href ?? `/admin/businesses/${state.entityId}`}>Open business</ReturnAwareLink>
          <ReturnAwareLink className="secondary-button" href="/admin/businesses">Back to businesses</ReturnAwareLink>
        </div>
      </section>
    );
  }

  function getValidationErrors(): BusinessFieldErrors {
    const errors: BusinessFieldErrors = {};
    if (draft.name.trim().length < 2) errors.name = "Enter a business name with at least 2 characters.";
    if (!reviewedSlug) errors.slug = "Enter a business name or URL slug.";
    if (!draft.timezone.trim()) errors.timezone = "Enter the business timezone.";
    if (!/^[A-Z]{3}$/.test(draft.currency.trim())) errors.currency = "Enter a 3-letter currency code, such as INR.";
    if (modules.length === 0) errors.modules = "Enable at least one business module.";
    if (!EMAIL_PATTERN.test(draft.ownerEmail.trim())) errors.owner_email = "Enter a valid Owner email address.";
    return errors;
  }

  function focusFirstInvalidField(errors: BusinessFieldErrors, targetStep: number) {
    const firstField = (Object.keys(errors) as BusinessField[]).find((field) => (
      targetStep === 0
        ? ["name", "slug", "timezone", "currency"].includes(field)
        : targetStep === 1
          ? field === "modules"
          : targetStep === 2
            ? field === "owner_email"
            : false
    ));
    if (!firstField || firstField === "modules") return;
    window.requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>(`[name="${firstField}"]`)?.focus();
    });
  }

  function validateStep(targetStep = step) {
    setStepError("");
    const allErrors = getValidationErrors();
    const fieldsForStep: BusinessField[][] = [
      ["name", "slug", "timezone", "currency"],
      ["modules"],
      ["owner_email"],
      ["name", "slug", "timezone", "currency", "modules", "owner_email"],
    ];
    const errors = Object.fromEntries(
      fieldsForStep[targetStep]
        .filter((field) => allErrors[field])
        .map((field) => [field, allErrors[field]]),
    ) as BusinessFieldErrors;
    setClientErrors((current) => ({ ...current, ...errors }));
    if (Object.keys(errors).length > 0) {
      setStepError(targetStep === 3 ? "Review the highlighted details before creating the business." : "Complete the highlighted details to continue.");
      focusFirstInvalidField(errors, targetStep);
      return false;
    }
    return true;
  }

  function clearClientError(field: BusinessField) {
    setClientErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setStepError("");
  }

  function handleFinalSubmit(event: React.FormEvent<HTMLFormElement>) {
    const errors = getValidationErrors();
    if (Object.keys(errors).length === 0) {
      setStepError("");
      setClientErrors({});
      return;
    }
    event.preventDefault();
    setClientErrors(errors);
    const firstInvalidStep = errors.name || errors.slug || errors.timezone || errors.currency
      ? 0
      : errors.modules
        ? 1
        : 2;
    setStep(firstInvalidStep);
    setStepError("Review the highlighted details before creating the business.");
    focusFirstInvalidField(errors, firstInvalidStep);
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

      <form
        ref={formRef}
        action={action}
        className="admin-wizard-form"
        aria-busy={pending}
        noValidate
        onSubmit={handleFinalSubmit}
      >
        <section data-step="0" hidden={step !== 0}>
          <div className="admin-section-heading"><h2>Business details</h2><p>Set the tenant identity and operating defaults.</p></div>
          <div className="admin-form-grid">
            <label>
              Business name
              <input
                name="name"
                required
                minLength={2}
                value={draft.name}
                aria-invalid={Boolean(clientErrors.name)}
                aria-describedby={clientErrors.name ? "business-name-error" : undefined}
                onChange={(event) => {
                  clearClientError("name");
                  setDraft({ ...draft, name: event.target.value });
                }}
              />
              {clientErrors.name ? <span className="admin-inline-field-error" id="business-name-error">{clientErrors.name}</span> : null}
            </label>
            <label>
              URL slug
              <input
                name="slug"
                placeholder="generated-from-name"
                value={draft.slug}
                aria-invalid={Boolean(clientErrors.slug)}
                aria-describedby={clientErrors.slug ? "business-slug-error" : "business-slug-help"}
                onChange={(event) => {
                  clearClientError("slug");
                  setDraft({ ...draft, slug: event.target.value.toLowerCase() });
                }}
                onBlur={() => setDraft((current) => ({ ...current, slug: normalizeBusinessSlug(current.slug) }))}
              />
              {clientErrors.slug
                ? <span className="admin-inline-field-error" id="business-slug-error">{clientErrors.slug}</span>
                : <span id="business-slug-help">Spaces and symbols are converted to hyphens automatically.</span>}
            </label>
            <label>
              Timezone
              <input
                name="timezone"
                required
                value={draft.timezone}
                aria-invalid={Boolean(clientErrors.timezone)}
                aria-describedby={clientErrors.timezone ? "business-timezone-error" : undefined}
                onChange={(event) => {
                  clearClientError("timezone");
                  setDraft({ ...draft, timezone: event.target.value });
                }}
              />
              {clientErrors.timezone ? <span className="admin-inline-field-error" id="business-timezone-error">{clientErrors.timezone}</span> : null}
            </label>
            <label>
              Currency
              <input
                name="currency"
                required
                pattern="[A-Za-z]{3}"
                maxLength={3}
                value={draft.currency}
                aria-invalid={Boolean(clientErrors.currency)}
                aria-describedby={clientErrors.currency ? "business-currency-error" : undefined}
                onChange={(event) => {
                  clearClientError("currency");
                  setDraft({ ...draft, currency: event.target.value.toUpperCase() });
                }}
              />
              {clientErrors.currency ? <span className="admin-inline-field-error" id="business-currency-error">{clientErrors.currency}</span> : null}
            </label>
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
                  onChange={(event) => {
                    clearClientError("modules");
                    setModules(event.target.checked ? [...modules, module] : modules.filter((item) => item !== module));
                  }}
                />
                <strong>{label}</strong><span>{module === "library" ? "Students, seats, and subscriptions" : module === "guest_house" ? "Rooms and guest collections" : module === "course" ? "Courses and fee collections" : "General payments and expenses"}</span>
              </label>
            ))}
          </div>
          {clientErrors.modules ? <p className="admin-inline-field-error" role="alert">{clientErrors.modules}</p> : null}
        </section>

        <section data-step="2" hidden={step !== 2}>
          <div className="admin-section-heading"><h2>First Owner</h2><p>The Owner controls this business and cannot have access suspended until ownership is transferred.</p></div>
          <div className="admin-form-grid">
            <label>
              Owner email
              <input
                name="owner_email"
                type="email"
                required
                value={draft.ownerEmail}
                aria-invalid={Boolean(clientErrors.owner_email)}
                aria-describedby={clientErrors.owner_email ? "business-owner-email-error" : undefined}
                onChange={(event) => {
                  clearClientError("owner_email");
                  setDraft({ ...draft, ownerEmail: event.target.value });
                }}
              />
              {clientErrors.owner_email ? <span className="admin-inline-field-error" id="business-owner-email-error">{clientErrors.owner_email}</span> : null}
            </label>
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
            <div><dt>URL</dt><dd>/{reviewedSlug}</dd></div>
            <div><dt>Defaults</dt><dd>{draft.timezone} · {draft.currency}</dd></div>
            <div><dt>Modules</dt><dd>{modules.map((module) => businessLabels[module as keyof typeof businessLabels]).join(", ")}</dd></div>
            <div><dt>First Owner</dt><dd>{draft.ownerEmail}</dd></div>
          </dl>
          <div className="admin-warning-callout"><strong>This creates live access</strong><p>The business starts Active and the registered account becomes its protected Owner.</p></div>
        </section>

        {stepError ? <p className="admin-action-message error" role="alert" aria-live="assertive">{stepError}</p> : null}
        {submitStatus ? (
          <div
            className={`admin-action-message ${submitStatus.tone}`}
            role={submitStatus.tone === "error" ? "alert" : "status"}
            aria-live={submitStatus.tone === "error" ? "assertive" : "polite"}
          >
            <strong>{submitStatus.message}</strong>
            {submitStatus.tone === "error" && state.errorId
              ? <span>{` Reference: ${state.errorId}.`}</span>
              : null}
            {submitStatus.tone === "error" && state.fieldErrors
              ? <ul>{Object.values(state.fieldErrors).map((error) => <li key={error}>{error}</li>)}</ul>
              : null}
          </div>
        ) : null}

        <div className="admin-form-actions split">
          <div>
            {step > 0 ? <button className="secondary-button" type="button" onClick={() => setStep((current) => current - 1)}>Back</button> : <ReturnAwareLink className="secondary-button" href="/admin/businesses">Cancel</ReturnAwareLink>}
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
