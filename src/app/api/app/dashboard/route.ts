import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { message: "Use /api/businesses/[businessId]/dashboard." },
    { status: 410 },
  );
}
