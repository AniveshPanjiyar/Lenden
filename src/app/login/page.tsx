import { Landmark } from "lucide-react";
import { LoginForm } from "@/app/login/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand-lockup">
          <span className="brand-mark">
            <Landmark size={22} />
          </span>
          <div>
            <p className="eyebrow">Lenden</p>
            <h1>Payment custody login</h1>
          </div>
        </div>
        {params.error ? <p className="form-error">{decodeURIComponent(params.error)}</p> : null}
        <LoginForm nextPath={params.next} />
      </section>
    </main>
  );
}
