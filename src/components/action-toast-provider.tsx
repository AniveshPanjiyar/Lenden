"use client";

import { useEffect, useState } from "react";
import type { UserActionStateBase } from "@/lib/action-errors";
import { actionFeedbackEvent } from "@/lib/client-events";

type ActionToast = UserActionStateBase & { id: string };

export function ActionToastProvider() {
  const [notice, setNotice] = useState<ActionToast | null>(null);

  useEffect(() => {
    function showActionFeedback(event: Event) {
      const detail = (event as CustomEvent<UserActionStateBase>).detail;
      if (!detail?.message) return;
      setNotice({ ...detail, id: crypto.randomUUID() });
    }
    window.addEventListener(actionFeedbackEvent, showActionFeedback);
    return () => window.removeEventListener(actionFeedbackEvent, showActionFeedback);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeoutId = window.setTimeout(() => setNotice(null), 7000);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  if (!notice) return null;
  const successful = notice.ok === true;
  const className = successful
    ? notice.warning ? "toast toast-warning" : "toast toast-success"
    : "toast toast-error";

  return (
    <div className="toast-stack" aria-live={successful ? "polite" : "assertive"}>
      <div className={className}>
        <span className="toast-icon" aria-hidden="true" />
        <strong>
          {notice.message}
          {notice.warning ? ` ${notice.warning}` : ""}
          {notice.errorId ? ` Reference: ${notice.errorId}.` : ""}
        </strong>
        <button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)}>×</button>
      </div>
    </div>
  );
}
