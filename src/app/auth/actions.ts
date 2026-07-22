"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { appBaseUrl, safeNextPath } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";

export type AuthActionState = {
  ok: boolean | null;
  message: string;
  fieldErrors?: Record<string, string>;
};

const emailSchema = z.email("Enter a valid email address.").transform((value) => value.trim().toLowerCase());
const passwordSchema = z.string().min(8, "Use at least 8 characters.");

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function signInAction(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const emailResult = emailSchema.safeParse(text(formData, "email"));
  const password = text(formData, "password");
  if (!emailResult.success || !password) {
    return { ok: false, message: "Enter your email and password." };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: emailResult.data, password });
  if (error) return { ok: false, message: error.message };
  redirect(safeNextPath(text(formData, "next"), "/"));
}

export async function signUpAction(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const fullName = text(formData, "full_name");
  const emailResult = emailSchema.safeParse(text(formData, "email"));
  const passwordResult = passwordSchema.safeParse(text(formData, "password"));
  const confirmation = text(formData, "password_confirmation");
  const fieldErrors: Record<string, string> = {};
  if (fullName.length < 2) fieldErrors.full_name = "Enter your full name.";
  if (!emailResult.success) fieldErrors.email = emailResult.error.issues[0]?.message ?? "Enter a valid email.";
  if (!passwordResult.success) fieldErrors.password = passwordResult.error.issues[0]?.message ?? "Use at least 8 characters.";
  if (passwordResult.success && passwordResult.data !== confirmation) fieldErrors.password_confirmation = "Passwords do not match.";
  if (Object.keys(fieldErrors).length > 0) return { ok: false, message: "Review the highlighted details.", fieldErrors };
  if (!emailResult.success || !passwordResult.success) return { ok: false, message: "Review the account details." };

  const next = safeNextPath(text(formData, "next"), "/account");
  const baseUrl = await appBaseUrl();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: emailResult.data,
    password: passwordResult.data,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${baseUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return { ok: false, message: error.message };
  if (data.session) redirect(next);
  return { ok: true, message: "Check your email to verify your account, then return to Lenden." };
}

export async function signInWithGoogleAction(formData: FormData) {
  const next = safeNextPath(text(formData, "next"), "/");
  const baseUrl = await appBaseUrl();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${baseUrl}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect(`/login?error=${encodeURIComponent(error?.message ?? "Could not start Google sign in.")}`);
  redirect(data.url);
}

export async function requestPasswordResetAction(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const emailResult = emailSchema.safeParse(text(formData, "email"));
  if (!emailResult.success) return { ok: false, message: "Enter a valid email address." };
  const baseUrl = await appBaseUrl();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(emailResult.data, {
    redirectTo: `${baseUrl}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "If an account exists for that email, a password reset link has been sent." };
}

export async function resetPasswordAction(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const passwordResult = passwordSchema.safeParse(text(formData, "password"));
  const confirmation = text(formData, "password_confirmation");
  if (!passwordResult.success) return { ok: false, message: passwordResult.error.issues[0]?.message ?? "Use at least 8 characters." };
  if (passwordResult.data !== confirmation) return { ok: false, message: "Passwords do not match." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: passwordResult.data });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Password updated. You can continue to your account." };
}
