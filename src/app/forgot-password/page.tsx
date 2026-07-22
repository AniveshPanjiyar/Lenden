import Link from "next/link";
import { Landmark } from "lucide-react";
import ForgotPasswordForm from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return <main className="auth-page"><section className="auth-panel">
    <div className="brand-lockup"><span className="brand-mark"><Landmark size={22} /></span><div><p className="eyebrow">Account security</p><h1>Reset your password</h1></div></div>
    <p className="muted">We will send a private recovery link to your account email.</p>
    <ForgotPasswordForm />
    <p className="auth-secondary-copy"><Link href="/login">Back to sign in</Link></p>
  </section></main>;
}

