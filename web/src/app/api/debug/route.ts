import fs from "fs";
import path from "path";

// 확장 진단 로그 (data/extension.log)
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
  fs.appendFileSync(path.join(process.cwd(), "data", "extension.log"), JSON.stringify({ t: new Date().toISOString(), ...body }) + "\n");
  return new Response(null, { status: 204, headers: CORS });
}
