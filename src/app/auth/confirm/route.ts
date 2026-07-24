import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(request.nextUrl.searchParams.get("next"), "/settings?section=businesses");
  if (!tokenHash || !type) return NextResponse.redirect(new URL("/login?error=Invalid%20confirmation%20link.&confirmation=failed", request.url));
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) {
    const destination = new URL("/login", request.url);
    destination.searchParams.set("error", error.message);
    destination.searchParams.set("confirmation", "failed");
    if (next !== "/settings?section=businesses") destination.searchParams.set("next", next);
    return NextResponse.redirect(destination);
  }
  return NextResponse.redirect(new URL(next, request.url));
}
