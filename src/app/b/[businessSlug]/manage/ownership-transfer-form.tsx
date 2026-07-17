"use client";

import { useState, type FormEvent } from "react";
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
  candidates: Array<{ profileId: string; label: string }>;
}) {
  const [selectedProfileId, setSelectedProfileId] = useState("");

  function confirmTransfer(event: FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const targetId = String(formData.get("profile_id") ?? "");
    const target = candidates.find((candidate) => candidate.profileId === targetId);
    const confirmed = window.confirm(
      `Transfer ownership of ${businessName} to ${target?.label ?? "this Manager"}? You will become a Manager and they will receive full Owner control.`,
    );
    if (!confirmed) event.preventDefault();
  }

  if (candidates.length === 0) {
    return <div className="ownership-transfer-empty">Add or reactivate a Manager before transferring primary ownership.</div>;
  }

  return (
    <form action={transferPrimaryOwnershipAction} className="ownership-transfer-form" onSubmit={confirmTransfer}>
      <div className="ownership-transfer-warning">
        <strong>Primary Owner role swap</strong>
        <span>The selected Manager receives full Owner control. Your role changes to Manager immediately.</span>
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
            <option key={candidate.profileId} value={candidate.profileId}>{candidate.label}</option>
          ))}
        </select>
      </label>
      <TransferOwnershipButton ready={Boolean(selectedProfileId)} />
    </form>
  );
}
