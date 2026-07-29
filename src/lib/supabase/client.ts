import { createBrowserClient } from "@supabase/ssr";

const authRefreshRetryDelays = [150, 400];

function isRefreshTokenRequest(input: RequestInfo | URL) {
  const url = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
  return url.includes("/auth/v1/token") && url.includes("grant_type=refresh_token");
}

const browserFetch: typeof fetch = async (input, init) => {
  const retryRefresh = isRefreshTokenRequest(input);
  const attempts = retryRefresh ? authRefreshRetryDelays.length + 1 : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(input, init);
    } catch (error) {
      const canRetry = retryRefresh
        && error instanceof TypeError
        && !init?.signal?.aborted
        && attempt < authRefreshRetryDelays.length;
      if (!canRetry) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, authRefreshRetryDelays[attempt]));
    }
  }

  throw new TypeError("Authentication service is temporarily unavailable.");
};

export function createClient(options?: { detectSessionInUrl?: boolean }) {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: {
        fetch: browserFetch,
      },
      auth: {
        detectSessionInUrl: options?.detectSessionInUrl ?? true,
      },
    },
  );
}
