import fs from "fs";
import path from "path";
import { ingest } from "@/lib/store";

// 진단용: 최근 응답의 URL과 숫자/참거짓 값(전체 개수, 다음 페이지 여부 등)을 남긴다
const LOG = path.join(process.cwd(), "data", "responses.log");
function scalars(o: unknown, prefix = "", out: Record<string, unknown> = {}, depth = 0) {
  if (!o || typeof o !== "object" || Array.isArray(o) || depth > 3) return out;
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "number" || typeof v === "boolean") out[prefix + k] = v;
    else if (Array.isArray(v)) out[prefix + k + "[]"] = v.length;
    else scalars(v, prefix + k + ".", out, depth + 1);
  }
  return out;
}

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
    try {
      fs.appendFileSync(LOG, JSON.stringify({ t: new Date().toISOString(), url: body?.url, ...result, meta: scalars(body?.data) }) + "\n");
    } catch {}
    return Response.json(result, { headers: CORS });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400, headers: CORS });
  }
}
