import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { message: "Use the business-scoped library student endpoint." },
    { status: 410 },
  );
}
