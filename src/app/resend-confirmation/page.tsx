import { Landmark } from "lucide-react";
import { safeNextPath } from "@/lib/auth-helpers";
import ResendConfirmationForm from "./resend-confirmation-form";

export default async function ResendConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next, "/settings?section=businesses");

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand-lockup">
          <span className="brand-mark"><Landmark size={22} /></span>
          <div><p className="eyebrow">Lenden</p><h1>Verify your email</h1></div>
        </div>
        <p className="muted">Request a fresh account-verification link. Only the newest email is needed.</p>
        <ResendConfirmationForm defaultEmail={params.email} nextPath={next} />
      </section>
    </main>
  );
}
