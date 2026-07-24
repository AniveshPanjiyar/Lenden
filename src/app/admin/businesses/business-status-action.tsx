"use client";

import { useSafeActionState as useActionState } from "@/lib/use-safe-action-state";
import { setBusinessStatusAction, type AdminActionState } from "./actions";

const initialState: AdminActionState = { ok: null, message: "" };

export default function BusinessStatusAction({
  businessId,
  businessName,
  status,
  compact = false,
}: {
  businessId: string;
  businessName: string;
  status: "active" | "suspended";
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState(setBusinessStatusAction, initialState);
  const nextStatus = status === "active" ? "suspended" : "active";
  const destructive = nextStatus === "suspended";

  return (
    <div className={compact ? "admin-action-stack compact" : "admin-action-stack"}>
      <form
        action={action}
        onSubmit={(event) => {
          const impact = destructive
            ? `Suspend ${businessName}? Every member will be blocked from this business, but all data and history will be preserved.`
            : `Activate ${businessName}? Members whose business access is active will be able to sign in again.`;
          if (!window.confirm(impact)) event.preventDefault();
        }}
      >
        <input type="hidden" name="business_id" value={businessId} />
        <input type="hidden" name="status" value={nextStatus} />
        <button
          className={destructive ? "danger-button" : "secondary-button"}
          type="submit"
          disabled={pending}
        >
          {pending ? "Saving…" : destructive ? "Suspend business" : "Activate business"}
        </button>
      </form>
      {state.message ? (
        <p
          className={state.ok ? state.warning ? "admin-action-message warning" : "admin-action-message success" : "admin-action-message error"}
          role={state.ok ? "status" : "alert"}
        >
          {state.message}
          {state.warning ? ` ${state.warning}` : ""}
          {state.errorId ? ` Reference: ${state.errorId}.` : ""}
        </p>
      ) : null}
    </div>
  );
}
