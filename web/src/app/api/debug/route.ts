import fs from "fs";
import path from "path";

// 확장 진단 로그 (로컬에서만 data/extension.log 에 남김)
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, x-ingest-token" };
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
    fs.appendFileSync(path.join(process.cwd(), "data", "extension.log"), JSON.stringify({ t: new Date().toISOString(), ...body }) + "\n");
  } catch {}
  return new Response(null, { status: 204, headers: CORS });
}
