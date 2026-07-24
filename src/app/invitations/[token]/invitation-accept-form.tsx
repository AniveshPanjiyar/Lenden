"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { useSafeActionState as useActionState } from "@/lib/use-safe-action-state";
import {
  acceptInvitationTokenAction,
  type InvitationActionState,
} from "./actions";

const initialState: InvitationActionState = {
  ok: false,
  message: "",
};

function AcceptButton() {
  const { pending } = useFormStatus();
  return (
    <button className="primary-button" type="submit" disabled={pending}>
      {pending ? "Accepting…" : "Accept invitation"}
    </button>
  );
}

export function InvitationAcceptForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(acceptInvitationTokenAction, initialState);

  return (
    <form action={formAction} className="form-grid">
      <input type="hidden" name="token" value={token} />
      <p className="muted">Accepting adds business access without changing your password or other memberships.</p>
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
      <AcceptButton />
      <Link className="secondary-button" href="/settings?section=businesses">Review in Settings</Link>
    </form>
  );
}
