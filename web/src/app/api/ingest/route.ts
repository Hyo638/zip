import { ingest } from "@/lib/store";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = ingest(body?.data ?? body);
    return Response.json(result, { headers: CORS });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400, headers: CORS });
  }
}
