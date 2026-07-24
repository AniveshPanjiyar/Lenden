"use client";

import { useActionState, useCallback } from "react";
import { normalizeActionError, type UserActionStateBase } from "@/lib/action-errors";
import { actionFeedbackEvent } from "@/lib/client-events";

type StatefulServerAction<T extends UserActionStateBase> = (
  state: T,
  formData: FormData,
) => Promise<T>;

export function useSafeActionState<T extends UserActionStateBase>(
  action: StatefulServerAction<T>,
  initialState: T,
) {
  const safeAction = useCallback(async (state: T, formData: FormData): Promise<T> => {
    try {
      const result = await action(state, formData);
      if (result.message) {
        window.dispatchEvent(new CustomEvent(actionFeedbackEvent, { detail: result }));
      }
      return result;
    } catch (error) {
      const {
        warning: _warning,
        errorId: _errorId,
        fieldErrors: _fieldErrors,
        ...stableState
      } = state;
      void _warning;
      void _errorId;
      void _fieldErrors;
      const result = {
        ...stableState,
        ok: false,
        ...normalizeActionError(error, {
          action: action.name || "client-server-action",
          fallback: "Could not complete this action.",
        }),
      } as T;
      window.dispatchEvent(new CustomEvent(actionFeedbackEvent, { detail: result }));
      return result;
    }
  }, [action]);

  const [state, dispatch, pending] = useActionState<UserActionStateBase, FormData>(
    safeAction as unknown as StatefulServerAction<UserActionStateBase>,
    initialState,
  );
  return [state as T, dispatch, pending] as const;
}
