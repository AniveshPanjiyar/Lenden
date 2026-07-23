import { redirect } from "next/navigation";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  const params = new URLSearchParams({ section: "profile" });
  const returnTo = Array.isArray(resolved.returnTo) ? resolved.returnTo[0] : resolved.returnTo;
  if (returnTo) params.set("returnTo", returnTo);
  redirect(`/settings?${params.toString()}`);
}
