import { recentEvents } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ events: await recentEvents(150) });
}
