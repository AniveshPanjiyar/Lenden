"use client";

import { useActionState, useState } from "react";
import type { AdminBusinessMember } from "../../admin-data";
import { transferOwnershipAdminAction, type AdminActionState } from "../../actions";

const initialState: AdminActionState = { ok: null, message: "" };

export default function OwnershipTransferForm({
  businessId,
  currentOwner,
  managers,
}: {
  businessId: string;
  currentOwner: AdminBusinessMember | null;
  managers: AdminBusinessMember[];
}) {
  const [state, action, pending] = useActionState(transferOwnershipAdminAction, initialState);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const selectedManager = managers.find((manager) => manager.profileId === selectedProfileId) ?? null;

  if (managers.length === 0) {
    return <div className="admin-empty-state compact"><h3>No active Manager available</h3><p>Add or reactivate a Manager on the Users page before assigning ownership.</p></div>;
  }

  return (
    <form
      action={action}
      className="admin-settings-form"
      onSubmit={(event) => {
        if (!selectedManager) {
          event.preventDefault();
          return;
        }
        const impact = currentOwner
          ? `Transfer ownership from ${currentOwner.profile.fullName} to ${selectedManager.profile.fullName}? The current Owner becomes Manager. Neither password changes.`
          : `Assign ${selectedManager.profile.fullName} as Owner? Their Manager role will become Owner. Their password will not change.`;
        if (!window.confirm(impact)) event.preventDefault();
      }}
    >
      <input type="hidden" name="business_id" value={businessId} />
      <label>New Owner
        <select name="profile_id" required value={selectedProfileId} onChange={(event) => setSelectedProfileId(event.target.value)}>
          <option value="">Choose an active Manager</option>
          {managers.map((manager) => <option value={manager.profileId} key={manager.id}>{manager.profile.fullName} · {manager.profile.email}</option>)}
        </select>
      </label>
      <label>Admin reason
        <textarea name="reason" required minLength={10} rows={4} placeholder="Explain why ownership is being transferred or recovered." />
        <span>This reason is written to the audit trail.</span>
      </label>
      {selectedManager ? (
        <div className="admin-role-change-preview" aria-live="polite">
          <div><span>Before</span><strong>{selectedManager.profile.fullName}: Manager</strong>{currentOwner ? <strong>{currentOwner.profile.fullName}: Owner</strong> : <strong>No active Owner</strong>}</div>
          <span aria-hidden="true">→</span>
          <div><span>After</span><strong>{selectedManager.profile.fullName}: Owner</strong>{currentOwner ? <strong>{currentOwner.profile.fullName}: Manager</strong> : null}</div>
        </div>
      ) : null}
      <div className="admin-warning-callout"><strong>Role change only</strong><p>The transfer is atomic. The selected active Manager becomes Owner; the previous Owner becomes Manager. No password is changed.</p></div>
      <button className="danger-button" type="submit" disabled={pending || !selectedManager}>{pending ? "Transferring…" : currentOwner ? "Transfer ownership" : "Assign ownership"}</button>
      {state.message ? <p className={state.ok ? "admin-action-message success" : "admin-action-message error"} role="status">{state.message}</p> : null}
      {state.fieldErrors ? <ul className="admin-field-error-list">{Object.values(state.fieldErrors).map((error) => <li key={error}>{error}</li>)}</ul> : null}
    </form>
  );
}
