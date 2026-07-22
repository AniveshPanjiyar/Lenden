"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { transferPrimaryOwnershipAction } from "./actions";

function TransferOwnershipButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="ownership-transfer-button" type="submit" disabled={!ready || pending}>
      {pending ? "Transferring ownership…" : "Transfer primary ownership"}
    </button>
  );
}

export function OwnershipTransferForm({
  businessName,
  candidates,
}: {
  businessName: string;
  candidates: Array<{ profileId: string; label: string; email: string }>;
}) {
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const selected = candidates.find((candidate) => candidate.profileId === selectedProfileId);
  const ready = Boolean(selectedProfileId && confirmation === businessName);

  if (candidates.length === 0) {
    return <div className="ownership-transfer-empty">Add or reactivate a Manager before transferring primary ownership.</div>;
  }

  return (
    <form action={transferPrimaryOwnershipAction} className="ownership-transfer-form">
      <div className="ownership-transfer-warning">
        <strong>This changes who controls the business</strong>
        <span>The selected Manager receives full Owner control. Your role changes to Manager immediately, and only the new Owner can transfer ownership again.</span>
      </div>
      <label>
        New Primary Owner
        <select
          name="profile_id"
          required
          value={selectedProfileId}
          onChange={(event) => setSelectedProfileId(event.target.value)}
        >
          <option value="" disabled>Choose an active Manager</option>
          {candidates.map((candidate) => (
            <option key={candidate.profileId} value={candidate.profileId}>{candidate.label} · {candidate.email}</option>
          ))}
        </select>
      </label>
      {selected ? (
        <div className="ownership-role-preview">
          <div><span>You</span><strong>Owner → Manager</strong></div>
          <div><span>{selected.label}</span><strong>Manager → Owner</strong></div>
        </div>
      ) : null}
      <label>
        Type <strong>{businessName}</strong> to confirm
        <input
          autoComplete="off"
          name="business_name_confirmation"
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder={businessName}
          value={confirmation}
        />
      </label>
      <TransferOwnershipButton ready={ready} />
    </form>
  );
}
