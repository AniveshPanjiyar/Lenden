const blockedReturnPrefixes = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/change-password",
  "/auth",
];

export function safeInternalPath(
  value: string | null | undefined,
  fallback = "/",
) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;

  try {
    const parsed = new URL(value, "https://lenden.invalid");
    if (parsed.origin !== "https://lenden.invalid") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function safeReturnPath(
  value: string | null | undefined,
  fallback = "/",
) {
  const internalPath = safeInternalPath(value, "");
  if (!internalPath) return fallback;
  const pathname = new URL(internalPath, "https://lenden.invalid").pathname;
  return blockedReturnPrefixes.some((prefix) => (
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  )) ? fallback : internalPath;
}

export function withReturnTo(href: string, returnTo: string | null | undefined) {
  const safeReturnTo = safeReturnPath(returnTo, "");
  if (!safeReturnTo) return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}returnTo=${encodeURIComponent(safeReturnTo)}`;
}
