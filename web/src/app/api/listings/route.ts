import { allListings, usingRedis } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  // storage: 배포 환경에서 Redis가 연결됐는지 확인용
  return Response.json({ storage: usingRedis ? "redis" : "file", ...(await allListings()) });
}
