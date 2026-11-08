import { allListings, store } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ listings: allListings(), lastIngest: store.lastIngest });
}
