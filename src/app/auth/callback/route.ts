import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";

function authenticationErrorRedirect(
  request: NextRequest,
  next: string,
  message: string,
  flow: string | null,
) {
  if (flow === "oauth" && next.startsWith("/settings")) {
    const destination = new URL(next, request.url);
    destination.searchParams.set("authError", message);
    return NextResponse.redirect(destination);
  }
  const destination = new URL("/login", request.url);
  destination.searchParams.set("error", message);
  if (flow === "email" || flow === "recovery") destination.searchParams.set("confirmation", "failed");
  if (next !== "/") destination.searchParams.set("next", next);
  return NextResponse.redirect(destination);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const flow = request.nextUrl.searchParams.get("flow");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"), "/");
  const providerError = request.nextUrl.searchParams.get("error_description")
    ?? request.nextUrl.searchParams.get("error");
  const supabase = await createClient();

  const { error } = tokenHash && type
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    : code
      ? await supabase.auth.exchangeCodeForSession(code)
      : { error: new Error(providerError || "The verification link is incomplete or invalid.") };

  if (error) {
    return authenticationErrorRedirect(request, next, error.message, flow);
  }
  return NextResponse.redirect(new URL(next, request.url));
}
