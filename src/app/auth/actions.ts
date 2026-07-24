"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { actionFailure, type UserActionStateBase } from "@/lib/action-errors";
import { appBaseUrl, safeNextPath } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";

export type AuthActionState = UserActionStateBase & {
  fieldErrors?: Record<string, string>;
  email?: string;
  nextPath?: string;
};

const emailSchema = z.email("Enter a valid email address.").transform((value) => value.trim().toLowerCase());
const passwordSchema = z.string().min(8, "Use at least 8 characters.");

function authActionError(error: unknown, fallback: string): AuthActionState {
  return actionFailure<AuthActionState>(error, {
    action: fallback,
    fallback,
  });
}

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function signInAction(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const emailResult = emailSchema.safeParse(text(formData, "email"));
  const password = text(formData, "password");
  if (!emailResult.success || !password) {
    return {
      ok: false,
      message: "Enter your email and password.",
      fieldErrors: {
        ...(!emailResult.success ? { email: "Enter a valid email address." } : {}),
        ...(!password ? { password: "Enter your password." } : {}),
      },
    };
  }
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: emailResult.data, password });
    if (error) return authActionError(error, "Could not sign in.");
  } catch (error) {
    return authActionError(error, "Could not sign in.");
  }
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

  const next = safeNextPath(text(formData, "next"), "/settings?section=businesses");
  let hasSession = false;
  try {
    const baseUrl = await appBaseUrl();
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: emailResult.data,
      password: passwordResult.data,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${baseUrl}/auth/callback?flow=email&next=${encodeURIComponent(next)}`,
      },
    });
    if (error) return authActionError(error, "Could not create your account.");
    hasSession = Boolean(data.session);
  } catch (error) {
    return authActionError(error, "Could not create your account.");
  }
  if (hasSession) redirect(next);
  return {
    ok: true,
    message: "Open the newest email from Lenden and select Verify email. The link returns you securely to Lenden.",
    email: emailResult.data,
    nextPath: next,
  };
}

export async function resendSignupConfirmationAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const emailResult = emailSchema.safeParse(text(formData, "email"));
  const next = safeNextPath(text(formData, "next"), "/settings?section=businesses");
  if (!emailResult.success) {
    return {
      ok: false,
      message: "Enter the email address used to create the account.",
      fieldErrors: { email: emailResult.error.issues[0]?.message ?? "Enter a valid email address." },
      nextPath: next,
    };
  }

  try {
    const baseUrl = await appBaseUrl();
    const supabase = await createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: emailResult.data,
      options: {
        emailRedirectTo: `${baseUrl}/auth/callback?flow=email&next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      const rateLimited = error.status === 429 || error.code === "over_email_send_rate_limit";
      return rateLimited
        ? {
            ok: false,
            message: "A verification email was sent recently. Wait about a minute before trying again.",
            email: emailResult.data,
            nextPath: next,
          }
        : {
            ...authActionError(error, "Could not resend the verification email."),
            email: emailResult.data,
            nextPath: next,
          };
    }
  } catch (error) {
    return {
      ...authActionError(error, "Could not resend the verification email."),
      email: emailResult.data,
      nextPath: next,
    };
  }
  return {
    ok: true,
    message: "A fresh verification email was sent. Open the newest message; older links may have expired.",
    email: emailResult.data,
    nextPath: next,
  };
}

export async function signInWithGoogleAction(formData: FormData) {
  let destination: string | null = null;
  let failureMessage: string | null = null;
  try {
    const next = safeNextPath(text(formData, "next"), "/");
    const baseUrl = await appBaseUrl();
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${baseUrl}/auth/callback?flow=oauth&next=${encodeURIComponent(next)}` },
    });
    if (error || !data.url) {
      failureMessage = authActionError(
        error ?? new Error("Could not start Google sign in."),
        "Could not start Google sign in.",
      ).message;
    } else {
      destination = data.url;
    }
  } catch (error) {
    failureMessage = authActionError(error, "Could not start Google sign in.").message;
  }
  if (failureMessage || !destination) {
    redirect(`/login?error=${encodeURIComponent(failureMessage ?? "Could not start Google sign in.")}`);
  }
  redirect(destination);
}

export async function requestPasswordResetAction(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const emailResult = emailSchema.safeParse(text(formData, "email"));
  if (!emailResult.success) {
    return {
      ok: false,
      message: "Enter a valid email address.",
      fieldErrors: { email: "Enter a valid email address." },
    };
  }
  try {
    const baseUrl = await appBaseUrl();
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(emailResult.data, {
      redirectTo: `${baseUrl}/auth/callback?flow=recovery&next=${encodeURIComponent("/reset-password")}`,
    });
    if (error) return authActionError(error, "Could not send a password reset email.");
  } catch (error) {
    return authActionError(error, "Could not send a password reset email.");
  }
  return { ok: true, message: "If an account exists for that email, a password reset link has been sent." };
}

export async function resetPasswordAction(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const passwordResult = passwordSchema.safeParse(text(formData, "password"));
  const confirmation = text(formData, "password_confirmation");
  if (!passwordResult.success) {
    return {
      ok: false,
      message: passwordResult.error.issues[0]?.message ?? "Use at least 8 characters.",
      fieldErrors: { password: passwordResult.error.issues[0]?.message ?? "Use at least 8 characters." },
    };
  }
  if (passwordResult.data !== confirmation) {
    return {
      ok: false,
      message: "Passwords do not match.",
      fieldErrors: { password_confirmation: "Enter the same password again." },
    };
  }
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: passwordResult.data });
    if (error) return authActionError(error, "Could not update your password.");
  } catch (error) {
    return authActionError(error, "Could not update your password.");
  }
  return { ok: true, message: "Password updated. You can continue to your account." };
}
