import { redirect } from "next/navigation";
import { Landmark } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import ResetPasswordForm from "./reset-password-form";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/reset-password");
  return <main className="auth-page"><section className="auth-panel">
    <div className="brand-lockup"><span className="brand-mark"><Landmark size={22} /></span><div><p className="eyebrow">Account security</p><h1>Choose a new password</h1></div></div>
    <ResetPasswordForm />
  </section></main>;
}

