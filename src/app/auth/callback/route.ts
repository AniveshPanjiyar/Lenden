import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"), "/");
  const providerError = request.nextUrl.searchParams.get("error_description")
    ?? request.nextUrl.searchParams.get("error");
  if (!code) {
    const message = providerError || "Authentication was cancelled or no code was returned.";
    if (next.startsWith("/settings")) {
      const destination = new URL(next, request.url);
      destination.searchParams.set("authError", message);
      return NextResponse.redirect(destination);
    }
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, request.url));
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    if (next.startsWith("/settings")) {
      const destination = new URL(next, request.url);
      destination.searchParams.set("authError", error.message);
      return NextResponse.redirect(destination);
    }
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url));
  }
  return NextResponse.redirect(new URL(next, request.url));
}
