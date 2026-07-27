export type UserActionStateBase = {
  ok: boolean | null;
  message: string;
  fieldErrors?: Record<string, string>;
  warning?: string;
  errorId?: string;
};

export type ActionErrorContext = {
  action: string;
  fallback: string;
  businessId?: string | null;
  userId?: string | null;
};

export class UserFacingActionError extends Error {
  readonly fieldErrors?: Record<string, string>;

  constructor(message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "UserFacingActionError";
    this.fieldErrors = fieldErrors;
  }
}

type ErrorDetails = {
  code: string | null;
  message: string;
  stack: string | null;
};

export type NormalizedActionError = {
  message: string;
  fieldErrors?: Record<string, string>;
  errorId?: string;
};

function errorDetails(error: unknown): ErrorDetails {
  const errorLike = error && typeof error === "object"
    ? error as { code?: unknown; message?: unknown; stack?: unknown; cause?: unknown }
    : null;
  const causeLike = errorLike?.cause && typeof errorLike.cause === "object"
    ? errorLike.cause as { code?: unknown; message?: unknown }
    : null;
  const message = error instanceof Error
    ? error.message
    : typeof errorLike?.message === "string"
      ? errorLike.message
      : typeof causeLike?.message === "string"
        ? causeLike.message
        : "";
  const codeValue = errorLike?.code ?? causeLike?.code;
  return {
    code: typeof codeValue === "string" ? codeValue : null,
    message,
    stack: error instanceof Error
      ? error.stack ?? null
      : typeof errorLike?.stack === "string"
        ? errorLike.stack
        : null,
  };
}

function actionErrorId() {
  return crypto.randomUUID().split("-")[0].toUpperCase();
}

function isNetworkError(message: string) {
  return /fetch failed|failed to fetch|network|connection (?:closed|refused|reset)|econn|enotfound|timeout|timed out|socket/i.test(message);
}

function isBusinessContextError(message: string) {
  return /authorized business context|business context is required/i.test(message);
}

function isSchemaError(code: string | null, message: string) {
  return (
    code === "PGRST204" ||
    code === "PGRST205" ||
    code === "42703" ||
    code === "42P01" ||
    /schema cache|does not exist|could not find the (?:table|function)|database migration/i.test(message)
  );
}

function isPermissionError(code: string | null, message: string) {
  return (
    code === "42501" ||
    /row-level security|permission denied|not authorized|unauthorized|forbidden/i.test(message)
  );
}

function looksTechnical(message: string) {
  return /postgres|postgrest|supabase|sqlstate|pgrst\d+|duplicate key|foreign key|check constraint|violates|relation ["']|column ["']|rpc|jwt|stack|syntax error/i.test(message);
}

function logUnexpectedActionError(
  context: ActionErrorContext,
  details: ErrorDetails,
  errorId: string,
) {
  console.error("[lenden-action-error]", {
    errorId,
    action: context.action,
    businessId: context.businessId ?? null,
    userId: context.userId ?? null,
    code: details.code,
    message: details.message || null,
    stack: details.stack,
  });
}

export function normalizeActionError(
  error: unknown,
  context: ActionErrorContext,
): NormalizedActionError {
  if (error instanceof UserFacingActionError) {
    return {
      message: error.message,
      ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
    };
  }

  const details = errorDetails(error);
  const message = details.message.trim();

  if (isNetworkError(message)) {
    return {
      message: "Could not reach Lenden. Check your connection and try again.",
    };
  }

  if (isBusinessContextError(message)) {
    return {
      message: "Your business session could not be verified. Refresh the page and try again.",
    };
  }

  const errorId = actionErrorId();

  if (isSchemaError(details.code, message)) {
    logUnexpectedActionError(context, details, errorId);
    return {
      message: "This feature needs a database update. Contact an administrator and share the error ID.",
      errorId,
    };
  }

  if (isPermissionError(details.code, message)) {
    return {
      message: "You do not have permission to complete this action. Refresh the page or ask the Owner to review your access.",
    };
  }

  if (details.code === "23505" || /duplicate key|already exists/i.test(message)) {
    return { message: "This item already exists." };
  }

  if (details.code === "23503" || /foreign key/i.test(message)) {
    return { message: "This item is already in use and cannot be removed." };
  }

  if (details.code === "23514" || details.code === "22023" || /check constraint|invalid input/i.test(message)) {
    return { message: "Review the entered details and try again." };
  }

  if (message && message.length <= 280 && !looksTechnical(message)) {
    return { message };
  }

  logUnexpectedActionError(context, details, errorId);
  return {
    message: `${context.fallback} Try again. If it continues, share the error ID.`,
    errorId,
  };
}

export function actionFailure<T extends UserActionStateBase>(
  error: unknown,
  context: ActionErrorContext,
): T {
  return {
    ok: false,
    ...normalizeActionError(error, context),
  } as T;
}

export function actionWarning(
  error: unknown,
  context: ActionErrorContext,
  message: string,
): { warning: string; errorId?: string } {
  const normalized = normalizeActionError(error, context);
  return {
    warning: message,
    ...(normalized.errorId ? { errorId: normalized.errorId } : {}),
  };
}
