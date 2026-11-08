import fs from "fs";
import path from "path";
import { ingest } from "@/lib/store";

export const dynamic = "force-dynamic";

// 확장만 보낼 수 있도록: INGEST_TOKEN 환경변수가 있으면 같은 값을 x-ingest-token 헤더로 보내야 한다
const TOKEN = process.env.INGEST_TOKEN;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-ingest-token",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  if (TOKEN && req.headers.get("x-ingest-token") !== TOKEN) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  }
  try {
    const body = await req.json();
    const result = await ingest(body?.data ?? body);
    // 로컬 진단 기록 (Vercel에서는 파일을 쓸 수 없어 조용히 건너뜀)
    try {
      fs.appendFileSync(path.join(process.cwd(), "data", "responses.log"), JSON.stringify({ t: new Date().toISOString(), url: body?.url, ...result }) + "\n");
    } catch {}
    return Response.json(result, { headers: CORS });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400, headers: CORS });
  }
}
