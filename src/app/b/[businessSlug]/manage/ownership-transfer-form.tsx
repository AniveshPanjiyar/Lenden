"use client";

import type { FormEvent } from "react";
import { transferPrimaryOwnershipAction } from "./actions";

export function OwnershipTransferForm({
  businessName,
  candidates,
}: {
  businessName: string;
  candidates: Array<{ profileId: string; label: string }>;
}) {
  function confirmTransfer(event: FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const targetId = String(formData.get("profile_id") ?? "");
    const target = candidates.find((candidate) => candidate.profileId === targetId);
    const confirmed = window.confirm(
      `Transfer ownership of ${businessName} to ${target?.label ?? "this Manager"}? You will become a Manager and they will receive full Owner control.`,
    );
    if (!confirmed) event.preventDefault();
  }

  return (
    <form action={transferPrimaryOwnershipAction} className="inline-admin-form" onSubmit={confirmTransfer}>
      <select name="profile_id" required defaultValue="">
        <option value="" disabled>Choose active Manager</option>
        {candidates.map((candidate) => (
          <option key={candidate.profileId} value={candidate.profileId}>{candidate.label}</option>
        ))}
      </select>
      <button className="danger-button" type="submit">Transfer ownership</button>
    </form>
  );
}
