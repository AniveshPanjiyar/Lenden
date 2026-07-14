export async function GET() {
  return new Response("Use /api/businesses/[businessId]/export.", { status: 410 });
}
