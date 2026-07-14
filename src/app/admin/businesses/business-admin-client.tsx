"use client";

import { useActionState } from "react";
import { createBusinessAction, type BusinessAdminState } from "./actions";

const initialState: BusinessAdminState = { ok: false, message: "" };

export function BusinessCreateForm() {
  const [state, action, pending] = useActionState(createBusinessAction, initialState);
  return (
    <form action={action} className="admin-create-form">
      <div className="admin-form-grid">
        <label>Business name<input name="name" required /></label>
        <label>URL slug<input name="slug" placeholder="generated-from-name" pattern="[a-z0-9-]+" /></label>
        <label>Timezone<input name="timezone" defaultValue="Asia/Kolkata" required /></label>
        <label>Currency<input name="currency" defaultValue="INR" maxLength={3} required /></label>
        <label>Primary owner name<input name="owner_name" required /></label>
        <label>Primary owner email<input name="owner_email" type="email" required /></label>
      </div>
      <fieldset>
        <legend>Enabled modules</legend>
        <label><input type="checkbox" name="modules" value="library" defaultChecked /> Library</label>
        <label><input type="checkbox" name="modules" value="guest_house" /> Guest House</label>
        <label><input type="checkbox" name="modules" value="course" /> Course</label>
        <label><input type="checkbox" name="modules" value="general" defaultChecked /> General</label>
      </fieldset>
      <p className="muted">Lenden generates the owner’s temporary password and shows it once after creation. No email is sent.</p>
      <button className="primary-button" type="submit" disabled={pending}>{pending ? "Creating business..." : "Create business"}</button>
      {state.message ? <p className={state.ok ? "form-success" : "form-error"} role="status">{state.message}</p> : null}
      {state.temporaryPassword ? <p className="one-time-secret"><strong>Copy now — shown once:</strong> <code>{state.temporaryPassword}</code></p> : null}
    </form>
  );
}
