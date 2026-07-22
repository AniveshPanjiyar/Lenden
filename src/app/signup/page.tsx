import { Landmark } from "lucide-react";
import { signInWithGoogleAction } from "@/app/auth/actions";
import SignupForm from "./signup-form";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand-lockup"><span className="brand-mark"><Landmark size={22} /></span><div><p className="eyebrow">Lenden</p><h1>Create your account</h1></div></div>
        <p className="muted">Your login belongs to you. Business Owners grant access separately.</p>
        <form action={signInWithGoogleAction}>
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <button className="google-auth-button" type="submit"><span aria-hidden="true">G</span> Continue with Google</button>
        </form>
        <div className="auth-divider"><span>or use email</span></div>
        <SignupForm nextPath={next} />
      </section>
    </main>
  );
}

