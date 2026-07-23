import "server-only";

import { headers } from "next/headers";
import { safeInternalPath } from "@/lib/navigation";

export function safeNextPath(value: string | null | undefined, fallback = "/") {
  return safeInternalPath(value, fallback);
}

export async function appBaseUrl() {
  const configured = process.env.APP_BASE_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (origin) return origin.replace(/\/$/, "");
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${protocol}://${host}` : "http://localhost:4000";
}
