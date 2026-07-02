import { NextResponse } from "next/server";
import { getBootstrapData } from "@/lib/data";

export async function GET() {
  const startedAt = performance.now();
  const bootstrap = await getBootstrapData();
  console.info("[lenden-api]", {
    route: "bootstrap",
    durationMs: Math.round(performance.now() - startedAt),
    userId: bootstrap.profile.id,
  });

  return NextResponse.json(bootstrap);
}
