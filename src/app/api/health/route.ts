export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Content-Type": "application/json; charset=utf-8",
};

export async function GET() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: noStoreHeaders,
  });
}

export async function HEAD() {
  return new Response(null, {
    status: 204,
    headers: noStoreHeaders,
  });
}
