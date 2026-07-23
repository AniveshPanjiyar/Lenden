import { FocusedPageHeader } from "@/components/focused-page-header";
import { safeReturnPath } from "@/lib/navigation";
import { loadUserSettings } from "@/lib/settings-data";
import type { SettingsSection } from "@/lib/types";
import SettingsClient from "./settings-client";

const settingsSections = new Set<SettingsSection>([
  "profile",
  "businesses",
  "contact",
  "preferences",
]);

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function decodeSegment(value: string | undefined) {
  try {
    return value ? decodeURIComponent(value) : "";
  } catch {
    return "";
  }
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [resolvedSearchParams, { payload, hasActiveBusiness }] = await Promise.all([
    searchParams,
    loadUserSettings(),
  ]);
  const rawSection = first(resolvedSearchParams.section);
  const activeSection = settingsSections.has(rawSection as SettingsSection)
    ? rawSection as SettingsSection
    : hasActiveBusiness ? "profile" : "businesses";
  const candidateReturnTo = safeReturnPath(first(resolvedSearchParams.returnTo), "");
  const candidateUrl = candidateReturnTo
    ? new URL(candidateReturnTo, "https://lenden.invalid")
    : null;
  const businessReturnMatch = candidateUrl?.pathname.match(/^\/b\/([^/]+)(?:\/|$)/);
  const canReturnToBusiness = !businessReturnMatch
    || payload.profile.platformRole === "platform_admin"
    || payload.accesses.some((access) => (
      access.slug === decodeSegment(businessReturnMatch[1])
      && access.status === "active"
      && access.businessStatus === "active"
    ));
  const canReturnToAdmin = !candidateUrl?.pathname.startsWith("/admin")
    || payload.profile.platformRole === "platform_admin";
  const returnTo = candidateUrl?.pathname === "/settings"
    || !canReturnToBusiness
    || !canReturnToAdmin
    ? ""
    : candidateReturnTo;
  const backHref = returnTo || (hasActiveBusiness ? "/" : null);
  const authError = first(resolvedSearchParams.authError);
  const linked = first(resolvedSearchParams.linked) === "google";

  return (
    <div className="authenticated-focused-page settings-page">
      <FocusedPageHeader
        backHref={backHref}
        eyebrow="Lenden account"
        title="Settings"
        description="Your profile, access, support, and preferences."
      />
      <SettingsClient
        payload={payload}
        activeSection={activeSection}
        returnTo={returnTo}
        flashMessage={authError || (linked ? "Google is now connected to your Lenden account." : "")}
        flashTone={authError ? "error" : "success"}
      />
    </div>
  );
}
