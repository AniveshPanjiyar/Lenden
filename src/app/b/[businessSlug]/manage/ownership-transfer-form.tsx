"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useSafeActionState as useActionState } from "@/lib/use-safe-action-state";
import {
  transferPrimaryOwnershipAction,
  type BusinessUserActionState,
} from "./actions";

const initialState: BusinessUserActionState = {
  ok: false,
  message: "",
};

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
  const router = useRouter();
  const [state, formAction] = useActionState(transferPrimaryOwnershipAction, initialState);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const selected = candidates.find((candidate) => candidate.profileId === selectedProfileId);
  const ready = Boolean(selectedProfileId && confirmation === businessName);

  useEffect(() => {
    if (state.ok) router.refresh();
    const firstInvalidField = !state.ok && state.fieldErrors
      ? Object.keys(state.fieldErrors)[0]
      : null;
    if (firstInvalidField) {
      formRef.current
        ?.querySelector<HTMLElement>(`[name="${CSS.escape(firstInvalidField)}"]`)
        ?.focus();
    }
  }, [router, state.fieldErrors, state.ok]);

  if (candidates.length === 0) {
    return <div className="ownership-transfer-empty">Add or reactivate a Manager before transferring primary ownership.</div>;
  }

  return (
    <form ref={formRef} action={formAction} className="ownership-transfer-form">
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
      {state.message ? (
        <p
          className={state.ok ? state.warning ? "form-warning" : "form-success" : "form-error"}
          role={state.ok ? "status" : "alert"}
          aria-live={state.ok ? "polite" : "assertive"}
        >
          {state.message}
          {state.warning ? ` ${state.warning}` : ""}
          {state.errorId ? ` Reference: ${state.errorId}.` : ""}
        </p>
      ) : null}
      <TransferOwnershipButton ready={ready} />
    </form>
  );
}
