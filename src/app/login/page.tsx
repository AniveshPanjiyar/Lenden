import { Landmark } from "lucide-react";
import { signInWithGoogleAction } from "@/app/auth/actions";
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
            <h1>Sign in to Lenden</h1>
          </div>
        </div>
        {params.error ? <p className="form-error">{decodeURIComponent(params.error)}</p> : null}
        <form action={signInWithGoogleAction}>
          {params.next ? <input type="hidden" name="next" value={params.next} /> : null}
          <button className="google-auth-button" type="submit"><span aria-hidden="true">G</span> Continue with Google</button>
        </form>
        <div className="auth-divider"><span>or use email</span></div>
        <LoginForm nextPath={params.next} />
      </section>
    </main>
  );
}
