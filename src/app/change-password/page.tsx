import { PasswordSetupForm } from "@/app/change-password/password-setup-form";
import { requireIdentity } from "@/lib/tenancy";

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ profile }, query] = await Promise.all([requireIdentity({ allowPasswordChange: true }), searchParams]);
  const error = typeof query.error === "string" ? query.error : null;

  return <PasswordSetupForm error={error} fullName={profile.full_name} />;
}
