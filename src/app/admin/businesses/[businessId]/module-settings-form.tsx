"use client";

import { useActionState } from "react";
import { businessLabels } from "@/lib/constants";
import type { BusinessType } from "@/lib/types";
import { saveBusinessModulesAdminAction, type AdminActionState } from "../actions";

const initialState: AdminActionState = { ok: null, message: "" };

export default function ModuleSettingsForm({ businessId, enabledModules }: { businessId: string; enabledModules: BusinessType[] }) {
  const [state, action, pending] = useActionState(saveBusinessModulesAdminAction, initialState);

  return (
    <form action={action} className="admin-settings-form">
      <input type="hidden" name="business_id" value={businessId} />
      <fieldset className="admin-module-choice-grid compact">
        <legend className="sr-only">Enabled business modules</legend>
        {(Object.entries(businessLabels) as Array<[BusinessType, string]>).map(([module, label]) => (
          <label key={module}>
            <input type="checkbox" name="modules" value={module} defaultChecked={enabledModules.includes(module)} />
            <span><strong>{label}</strong><small>{module === "library" ? "Students and subscriptions" : module === "guest_house" ? "Rooms and guests" : module === "course" ? "Courses and fees" : "General transactions"}</small></span>
          </label>
        ))}
      </fieldset>
      <button className="primary-button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save modules"}</button>
      {state.message ? <p className={state.ok ? "admin-action-message success" : "admin-action-message error"} role="status">{state.message}</p> : null}
    </form>
  );
}
